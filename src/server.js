const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const Joi = require('joi');
const CronSync = require('./index');

const app = express();
const PORT = process.env.PORT || 5500;

app.use(helmet());
app.use(cors());
app.use(express.json());

const cronSync = new CronSync({
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  logLevel: process.env.LOG_LEVEL || 'info'
});

const scheduleJobSchema = Joi.object({
  name: Joi.string().required(),
  cronPattern: Joi.string().required(),
  script: Joi.string().required(),
  options: Joi.object().default({})
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/jobs', (req, res) => {
  try {
    const jobs = cronSync.getJobs();
    res.json({ jobs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/jobs', async (req, res) => {
  try {
    const { error, value } = scheduleJobSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    const { name, cronPattern, script, options } = value;

    // Create task function from script path
    const taskFunction = async () => {
      // In production, you'd want to securely execute scripts
      // For now, we'll simulate task execution
      console.log(`Executing script: ${script}`);
      return { success: true, script };
    };

    const jobId = await cronSync.schedule(cronPattern, name, taskFunction, options);
    
    res.status(201).json({
      message: 'Job scheduled successfully',
      jobId,
      name,
      cronPattern
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/jobs/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    await cronSync.stopJob(jobId);
    res.json({ message: 'Job stopped successfully' });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.get('/jobs/:jobName/stats', async (req, res) => {
  try {
    const { jobName } = req.params;
    const stats = await cronSync.getJobStats(jobName);
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/jobs/stop-all', async (req, res) => {
  try {
    await cronSync.stopAll();
    res.json({ message: 'All jobs stopped successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  await cronSync.disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  await cronSync.disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`CronSync server running on port ${PORT}`);
});

module.exports = app;