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

describe('executeWithLock', () => {
  let cronSync;

  beforeEach(() => {
    jest.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG');
    jest.spyOn(Redis.prototype, 'on').mockImplementation();
    jest.spyOn(Redis.prototype, 'set').mockResolvedValue('OK');
    jest.spyOn(Redis.prototype, 'eval').mockResolvedValue(1);
    
    // Create hSet method if it doesn't exist and mock it
    Redis.prototype.hSet = jest.fn().mockResolvedValue(1);
  });

  afterEach(async () => {
    if (cronSync) {
      await cronSync.disconnect();
    }
    // Clean up the added method
    delete Redis.prototype.hSet;
    jest.restoreAllMocks();
  });

  it('should execute task when lock is acquired and update job statistics', async () => {
    // Setup
    const mockTaskFunction = jest.fn().mockResolvedValue('task completed');
    const jobName = 'test-job';
    
    cronSync = new CronSync();
    
    // Add a job entry to the jobs Map to track statistics with proper job object
    const jobId = 'test-job-id';
    const mockJob = {
      stop: jest.fn(),
      start: jest.fn(),
      getStatus: jest.fn().mockReturnValue('scheduled')
    };
    
    cronSync.jobs.set(jobId, {
      job: mockJob,
      name: jobName,
      pattern: '*/5 * * * *',
      task: mockTaskFunction,
      lastRun: null,
      runCount: 0
    });
    
    // Execute
    const result = await cronSync.executeWithLock(jobName, mockTaskFunction);
    
    // Verify task execution
    expect(mockTaskFunction).toHaveBeenCalledTimes(1);
    expect(result).toBe('task completed');
    
    // Verify lock acquisition
    expect(Redis.prototype.set).toHaveBeenCalledWith(
      `cronsync:lock:${jobName}`,
      cronSync.instanceId,
      { PX: cronSync.lockTimeout, NX: true }
    );
    
    // Verify job statistics were updated
    const jobEntry = cronSync.jobs.get(jobId);
    expect(jobEntry.runCount).toBe(1);
    expect(jobEntry.lastRun).toBeInstanceOf(Date);
    
    // Verify Redis stats were recorded
    expect(Redis.prototype.hSet).toHaveBeenCalledWith(
      `cronsync:stats:${jobName}`,
      expect.objectContaining({
        lastRun: expect.any(String),
        duration: expect.any(String),
        status: 'success',
        instanceId: cronSync.instanceId
      })
    );
    
    // Verify lock was released
    expect(Redis.prototype.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("get", KEYS[1])'),
      {
        keys: [`cronsync:lock:${jobName}`],
        arguments: [cronSync.instanceId]
      }
    );
  });
});

describe('stopJob', () => {
  let cronSync;

  beforeEach(() => {
    jest.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG');
    jest.spyOn(Redis.prototype, 'on').mockImplementation();
    jest.spyOn(Redis.prototype, 'set').mockResolvedValue('OK');
    jest.spyOn(Redis.prototype, 'eval').mockResolvedValue(1);
  });

  afterEach(async () => {
    if (cronSync) {
      await cronSync.disconnect();
    }
    jest.restoreAllMocks();
  });

  it('should stop a job and remove it from the jobs map', async () => {
    cronSync = new CronSync();
    
    // Schedule a job first
    const cronPattern = '*/5 * * * *';
    const jobName = 'test-stop-job';
    const taskFunction = jest.fn().mockResolvedValue('success');
    
    const jobId = await cronSync.schedule(cronPattern, jobName, taskFunction);
    
    // Verify job exists
    expect(cronSync.jobs.has(jobId)).toBe(true);
    const jobEntry = cronSync.jobs.get(jobId);
    const stopSpy = jest.spyOn(jobEntry.job, 'stop');
    
    // Stop the job
    await cronSync.stopJob(jobId);
    
    // Verify job was stopped and removed
    expect(stopSpy).toHaveBeenCalled();
    expect(cronSync.jobs.has(jobId)).toBe(false);
  });

  it('should throw error when trying to stop non-existent job', async () => {
    cronSync = new CronSync();
    const nonExistentJobId = 'non-existent-job-id';
    
    await expect(cronSync.stopJob(nonExistentJobId)).rejects.toThrow(
      `Job not found: ${nonExistentJobId}`
    );
  });
});

describe('stopJob', () => {
  let cronSync;

  beforeEach(() => {
    jest.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG');
    jest.spyOn(Redis.prototype, 'on').mockImplementation();
    jest.spyOn(Redis.prototype, 'set').mockResolvedValue('OK');
    jest.spyOn(Redis.prototype, 'eval').mockResolvedValue(1);
  });

  afterEach(async () => {
    if (cronSync) {
      await cronSync.disconnect();
    }
    jest.restoreAllMocks();
  });

  it('should stop a job and remove it from the jobs map', async () => {
    cronSync = new CronSync();
    
    // Schedule a job first
    const cronPattern = '*/5 * * * *';
    const jobName = 'test-stop-job';
    const taskFunction = jest.fn().mockResolvedValue('success');
    
    const jobId = await cronSync.schedule(cronPattern, jobName, taskFunction);
    
    // Verify job exists
    expect(cronSync.jobs.has(jobId)).toBe(true);
    const jobEntry = cronSync.jobs.get(jobId);
    const stopSpy = jest.spyOn(jobEntry.job, 'stop');
    
    // Stop the job
    await cronSync.stopJob(jobId);
    
    // Verify job was stopped and removed
    expect(stopSpy).toHaveBeenCalled();
    expect(cronSync.jobs.has(jobId)).toBe(false);
  });

  it('should throw error when trying to stop non-existent job', async () => {
    cronSync = new CronSync();
    const nonExistentJobId = 'non-existent-job-id';
    
    await expect(cronSync.stopJob(nonExistentJobId)).rejects.toThrow(
      `Job not found: ${nonExistentJobId}`
    );
  });
});

describe('getJobs', () => {
  let cronSync;

  beforeEach(() => {
    jest.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG');
    jest.spyOn(Redis.prototype, 'on').mockImplementation();
    jest.spyOn(Redis.prototype, 'set').mockResolvedValue('OK');
    jest.spyOn(Redis.prototype, 'eval').mockResolvedValue(1);
  });

  afterEach(async () => {
    if (cronSync) {
      await cronSync.disconnect();
    }
    jest.restoreAllMocks();
  });

  it('should return empty array when no jobs are scheduled', () => {
    cronSync = new CronSync();
    
    const jobs = cronSync.getJobs();
    
    expect(jobs).toEqual([]);
    expect(Array.isArray(jobs)).toBe(true);
  });

  it('should return correct job information for scheduled jobs', async () => {
    cronSync = new CronSync();
    
    // Mock the cron.schedule function to return a job with getStatus method
    const mockJob = {
      start: jest.fn(),
      stop: jest.fn(),
      getStatus: jest.fn().mockReturnValue('scheduled')
    };
    
    const cron = require('node-cron');
    jest.spyOn(cron, 'schedule').mockReturnValue(mockJob);
    
    // Schedule multiple jobs
    const job1Pattern = '*/5 * * * *';
    const job1Name = 'daily-backup';
    const job1Function = jest.fn();
    
    const job2Pattern = '0 0 * * *';
    const job2Name = 'weekly-report';
    const job2Function = jest.fn();
    
    const jobId1 = await cronSync.schedule(job1Pattern, job1Name, job1Function);
    const jobId2 = await cronSync.schedule(job2Pattern, job2Name, job2Function);
    
    // Get jobs info
    const jobs = cronSync.getJobs();
    
    // Verify structure and content
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toEqual({
      id: jobId1,
      name: job1Name,
      pattern: job1Pattern,
      createdAt: expect.any(Date),
      lastRun: null,
      runCount: 0,
      isRunning: true
    });
    
    expect(jobs[1]).toEqual({
      id: jobId2,
      name: job2Name,  
      pattern: job2Pattern,
      createdAt: expect.any(Date),
      lastRun: null,
      runCount: 0,
      isRunning: true
    });
  });
});