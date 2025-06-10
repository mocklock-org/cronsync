const cron = require('node-cron');
const { createClient } = require('redis');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');

class CronSync {
  constructor(options = {}) {
    this.instanceId = options.instanceId || uuidv4();
    this.redisUrl = options.redisUrl || 'redis://localhost:6379';
    this.lockTimeout = options.lockTimeout || 300000;
    this.jobs = new Map();
    this.redis = null;
    this.logger = this.setupLogger(options.logLevel || 'info');
    
    this.init();
  }

  setupLogger(level) {
    return winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/cronsync.log' })
      ]
    });
  }

  async init() {
    try {
      this.redis = createClient({ url: this.redisUrl });
      await this.redis.connect();
      this.logger.info(`CronSync initialized with instance ID: ${this.instanceId}`);
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async schedule(cronPattern, jobName, taskFunction, options = {}) {
    const jobId = `${jobName}_${uuidv4()}`;
    
    if (!cron.validate(cronPattern)) {
      throw new Error(`Invalid cron pattern: ${cronPattern}`);
    }

    const job = cron.schedule(cronPattern, async () => {
      await this.executeWithLock(jobName, taskFunction, options);
    }, {
      scheduled: false,
      ...options
    });

    this.jobs.set(jobId, {
      job,
      name: jobName,
      pattern: cronPattern,
      task: taskFunction,
      options,
      createdAt: new Date(),
      lastRun: null,
      runCount: 0
    });

    job.start();
    this.logger.info(`Job scheduled: ${jobName} (${cronPattern})`);
    
    return jobId;
  }

  async executeWithLock(jobName, taskFunction, options = {}) {
    const lockKey = `cronsync:lock:${jobName}`;
    const lockValue = this.instanceId;
    const lockExpiry = Math.floor(Date.now() / 1000) + Math.floor(this.lockTimeout / 1000);

    try {
      const acquired = await this.redis.set(lockKey, lockValue, {
        PX: this.lockTimeout,
        NX: true
      });

      if (!acquired) {
        this.logger.debug(`Lock not acquired for job: ${jobName}`);
        return;
      }

      this.logger.info(`Executing job: ${jobName} on instance: ${this.instanceId}`);
      
      const startTime = Date.now();
      const result = await taskFunction();
      const duration = Date.now() - startTime;

      const jobEntry = Array.from(this.jobs.values()).find(j => j.name === jobName);
      if (jobEntry) {
        jobEntry.lastRun = new Date();
        jobEntry.runCount++;
      }

      await this.redis.hSet(`cronsync:stats:${jobName}`, {
        lastRun: new Date().toISOString(),
        duration: duration.toString(),
        status: 'success',
        instanceId: this.instanceId
      });

      this.logger.info(`Job completed: ${jobName} (${duration}ms)`);
      return result;

    } catch (error) {
      this.logger.error(`Job failed: ${jobName}`, error);
      
      await this.redis.hSet(`cronsync:stats:${jobName}`, {
        lastRun: new Date().toISOString(),
        status: 'error',
        error: error.message,
        instanceId: this.instanceId
      });
      
      throw error;
    } finally {
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      await this.redis.eval(script, {
        keys: [lockKey],
        arguments: [lockValue]
      });
    }
  }

  async stopJob(jobId) {
    const jobEntry = this.jobs.get(jobId);
    if (!jobEntry) {
      throw new Error(`Job not found: ${jobId}`);
    }

    jobEntry.job.stop();
    this.jobs.delete(jobId);
    this.logger.info(`Job stopped: ${jobEntry.name}`);
  }

  async stopAll() {
    for (const [jobId, jobEntry] of this.jobs) {
      jobEntry.job.stop();
      this.logger.info(`Job stopped: ${jobEntry.name}`);
    }
    this.jobs.clear();
  }

  getJobs() {
    const jobs = [];
    for (const [jobId, jobEntry] of this.jobs) {
      jobs.push({
        id: jobId,
        name: jobEntry.name,
        pattern: jobEntry.pattern,
        createdAt: jobEntry.createdAt,
        lastRun: jobEntry.lastRun,
        runCount: jobEntry.runCount,
        isRunning: jobEntry.job.getStatus() === 'scheduled'
      });
    }
    return jobs;
  }

  async getJobStats(jobName) {
    const stats = await this.redis.hGetAll(`cronsync:stats:${jobName}`);
    return stats;
  }

  async disconnect() {
    await this.stopAll();
    if (this.redis) {
      await this.redis.disconnect();
    }
    this.logger.info('CronSync disconnected');
  }
}

module.exports = CronSync;