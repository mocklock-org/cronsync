#!/usr/bin/env node

const { Command } = require('commander');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const program = new Command();
const API_BASE = process.env.CRONSYNC_API || 'http://localhost:5500';

program
  .name('cronsync')
  .description('CLI for CronSync - Distributed cron jobs for Node.js')
  .version('1.0.0');

program
  .command('schedule')
  .description('Schedule a new cron job')
  .requiredOption('-n, --name <name>', 'Job name')
  .requiredOption('-c, --cron <pattern>', 'Cron pattern')
  .requiredOption('-s, --script <script>', 'Script to execute')
  .action(async (options) => {
    try {
      const response = await axios.post(`${API_BASE}/jobs`, {
        name: options.name,
        cronPattern: options.cron,
        script: options.script
      });
      
      console.log('✅ Job scheduled successfully');
      console.log(`Job ID: ${response.data.jobId}`);
      console.log(`Name: ${response.data.name}`);
      console.log(`Pattern: ${response.data.cronPattern}`);
    } catch (error) {
      console.error('❌ Failed to schedule job:', error.response?.data?.error || error.message);
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List all scheduled jobs')
  .action(async () => {
    try {
      const response = await axios.get(`${API_BASE}/jobs`);
      const jobs = response.data.jobs;
      
      if (jobs.length === 0) {
        console.log('No jobs scheduled');
        return;
      }
      
      console.log('\n📋 Scheduled Jobs:');
      console.log('─'.repeat(80));
      
      jobs.forEach(job => {
        console.log(`Name: ${job.name}`);
        console.log(`ID: ${job.id}`);
        console.log(`Pattern: ${job.pattern}`);
        console.log(`Status: ${job.isRunning ? '🟢 Running' : '🔴 Stopped'}`);
        console.log(`Created: ${new Date(job.createdAt).toLocaleString()}`);
        console.log(`Last Run: ${job.lastRun ? new Date(job.lastRun).toLocaleString() : 'Never'}`);
        console.log(`Run Count: ${job.runCount}`);
        console.log('─'.repeat(80));
      });
    } catch (error) {
      console.error('❌ Failed to list jobs:', error.response?.data?.error || error.message);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop a specific job')
  .requiredOption('-i, --id <jobId>', 'Job ID to stop')
  .action(async (options) => {
    try {
      await axios.delete(`${API_BASE}/jobs/${options.id}`);
      console.log('✅ Job stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop job:', error.response?.data?.error || error.message);
      process.exit(1);
    }
  });

program
  .command('stop-all')
  .description('Stop all jobs')
  .action(async () => {
    try {
      await axios.post(`${API_BASE}/jobs/stop-all`);
      console.log('✅ All jobs stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop all jobs:', error.response?.data?.error || error.message);
      process.exit(1);
    }
  });

program
  .command('stats')
  .description('Show job statistics')
  .requiredOption('-n, --name <name>', 'Job name')
  .action(async (options) => {
    try {
      const response = await axios.get(`${API_BASE}/jobs/${options.name}/stats`);
      const stats = response.data.stats;
      
      console.log(`\n📊 Stats for job: ${options.name}`);
      console.log('─'.repeat(40));
      console.log(`Last Run: ${stats.lastRun || 'Never'}`);
      console.log(`Duration: ${stats.duration || 'N/A'}ms`);
      console.log(`Status: ${stats.status || 'Unknown'}`);
      console.log(`Instance: ${stats.instanceId || 'Unknown'}`);
      
      if (stats.error) {
        console.log(`❌ Last Error: ${stats.error}`);
      }
    } catch (error) {
      console.error('❌ Failed to get stats:', error.response?.data?.error || error.message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize CronSync configuration')
  .action(() => {
    const configTemplate = {
      'redisUrl': 'redis://localhost:6379',
      'port': 3000,
      'logLevel': 'info',
      'jobs': []
    };
    
    const configPath = path.join(process.cwd(), 'cronsync.config.json');
    
    if (fs.existsSync(configPath)) {
      console.log('❌ Configuration file already exists');
      return;
    }
    
    fs.writeFileSync(configPath, JSON.stringify(configTemplate, null, 2));
    console.log('✅ Configuration file created: cronsync.config.json');
    console.log('Edit this file to customize your CronSync setup');
  });

program.parse();

if (!fs.existsSync(path.join(__dirname, '../package.json'))) {
  console.error('❌ Package.json not found. Make sure you\'re in the project root.');
  process.exit(1);
}