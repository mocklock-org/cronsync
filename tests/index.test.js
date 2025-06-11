const CronSync = require('../src/index');
const Redis = require('ioredis');

describe('CronSync', () => {
  let cronSync;

  beforeEach(() => {
    jest.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG');
    jest.spyOn(Redis.prototype, 'on').mockImplementation();
    // Mock Redis set for lock acquisition
    jest.spyOn(Redis.prototype, 'set').mockResolvedValue('OK');
    // Mock Redis eval for lock release
    jest.spyOn(Redis.prototype, 'eval').mockResolvedValue(1);
  });

  afterEach(async () => {
    if (cronSync) {
      await cronSync.disconnect();
    }
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      cronSync = new CronSync();
      
      expect(cronSync.redisUrl).toBe('redis://localhost:6379');
      expect(cronSync.lockTimeout).toBe(300000);
      expect(cronSync.logLevel).toBe('info');
      expect(typeof cronSync.instanceId).toBe('string');
      expect(cronSync.jobs).toBeInstanceOf(Map);
      expect(cronSync.jobs.size).toBe(0);
    });

    it('should initialize with custom options', () => {
      const customOptions = {
        instanceId: 'test-instance',
        redisUrl: 'redis://custom:6380',
        lockTimeout: 60000,
        logLevel: 'debug'
      };
      
      cronSync = new CronSync(customOptions);
      
      expect(cronSync.instanceId).toBe('test-instance');
      expect(cronSync.redisUrl).toBe('redis://custom:6380');
      expect(cronSync.lockTimeout).toBe(60000);
      expect(cronSync.logLevel).toBe('debug');
      expect(cronSync.jobs).toBeInstanceOf(Map);
      expect(cronSync.jobs.size).toBe(0);
    });
  });

  describe('schedule', () => {
    it('should successfully schedule a job', async () => {
      cronSync = new CronSync();
      const cronPattern = '*/5 * * * *';  // every 5 minutes
      const jobName = 'test-job';
      const taskFunction = jest.fn().mockResolvedValue('success');
      
      const jobId = await cronSync.schedule(cronPattern, jobName, taskFunction);
      
      // Verify job was added to the jobs Map
      expect(cronSync.jobs.has(jobId)).toBe(true);
      const jobEntry = cronSync.jobs.get(jobId);
      
      // Verify job properties
      expect(jobEntry.name).toBe(jobName);
      expect(jobEntry.pattern).toBe(cronPattern);
      expect(jobEntry.task).toBe(taskFunction);
      expect(jobEntry.runCount).toBe(0);
      expect(jobEntry.lastRun).toBeNull();
      expect(jobEntry.createdAt).toBeInstanceOf(Date);
      
      // Trigger the job manually to verify execution
      await jobEntry.job.now();
      
      // Verify task was executed
      expect(taskFunction).toHaveBeenCalled();
    });
  });
});
