const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const Joi = require('joi');
const { VM } = require('vm2');
const CronSync = require('./index');

const app = express();
const PORT = process.env.PORT || 5500;

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
  methods: ['GET', 'POST', 'DELETE']
}));
app.use(express.json({ limit: '50kb' }));

const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

const cronSync = new CronSync({
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  logLevel: process.env.LOG_LEVEL || 'info'
});

const scheduleJobSchema = Joi.object({
  name: Joi.string()
    .required()
    .pattern(/^[a-zA-Z0-9_-]+$/)
    .min(1)
    .max(50),
  cronPattern: Joi.string()
    .required()
    .pattern(/^[0-9*,/-\s]+$/)
    .max(100),
  script: Joi.string()
    .required()
    .min(1)
    .max(10000),
  options: Joi.object({
    timeout: Joi.number().min(100).max(30000).default(5000),
    memory: Joi.number().min(1).max(512).default(64)
  }).default({})
});

async function executeScript (script, options) {
  try {
    new Function(script);
  } catch (error) {
    throw new Error(`Invalid script syntax: ${error.message}`);
  }

  const vm = new VM({
    timeout: options.timeout || 5000,
    sandbox: {
      console: {
        log: (...args) => console.log('[Script]', ...args),
        error: (...args) => console.error('[Script]', ...args),
        warn: (...args) => console.warn('[Script]', ...args)
      },
      setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5000)),
      clearTimeout,
      Date,
      Math,
      Buffer: {
        from: Buffer.from,
        isBuffer: Buffer.isBuffer
      }
    },
    eval: false,
    wasm: false,
    fixAsync: true,
    compiler: 'javascript',
    require: {
      external: false,
      builtin: ['crypto', 'util', 'path'].filter(Boolean),
      root: './',
      mock: {
        fs: {
          readFileSync: () => { throw new Error('File system access not allowed'); },
          writeFileSync: () => { throw new Error('File system access not allowed'); }
        }
      }
    }
  });

  try {
    const wrappedScript = `
      (async function() {
        try {
          ${script}
        } catch (error) {
          console.error('Script execution error:', error.message);
          throw error;
        }
      })()
    `;

    const result = await vm.run(wrappedScript);
    return { success: true, result };
  } catch (error) {
    throw new Error(`Script execution failed: ${error.message}`);
  }
}

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

    try {
      new Function(script);
    } catch (error) {
      return res.status(500).json({ error: `Invalid script syntax: ${error.message}` });
    }

    const taskFunction = async () => {
      return await executeScript(script, options);
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

app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
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

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`CronSync server running on port ${PORT}`);
  });
}