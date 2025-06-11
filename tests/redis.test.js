const CronSync = require('../src/index');

jest.mock('ioredis', () => {
  const mockRedis = {
    ping: jest.fn().mockResolvedValue('PONG'),
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    hSet: jest.fn().mockResolvedValue('OK'),
    eval: jest.fn().mockResolvedValue(1),
    disconnect: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined)
  };
  return jest.fn(() => mockRedis);
});

jest.mock('node-cron', () => ({
  validate: jest.fn().mockReturnValue(true),
  schedule: jest.fn().mockImplementation((_, fn) => ({
    start: jest.fn(() => fn()),
    stop: jest.fn()
  }))
}));

describe('CronSync', () => {
  let cronSync;
  let Redis;
  let redis;

  beforeEach(async () => {
    jest.clearAllMocks();
    Redis = require('ioredis');
    redis = new Redis();
    
    cronSync = new CronSync({
      redisUrl: 'redis://localhost:6379',
      logLevel: 'error'
    });

    await cronSync.connect();
  });

  afterEach(async () => {
    if (cronSync) {
      await cronSync.disconnect();
    }
  });

  it('should execute a job when scheduled', async () => {
    const jobName = 'test-job';
    const task = jest.fn().mockResolvedValue('success');

    redis.set.mockResolvedValueOnce('OK');
    redis.hSet.mockResolvedValue('OK');

    await cronSync.schedule('*/5 * * * *', jobName, task);

    expect(redis.set).toHaveBeenCalledWith(
      'cronsync:lock:test-job',
      expect.any(String),
      expect.objectContaining({
        PX: expect.any(Number),
        NX: true
      })
    );

    expect(task).toHaveBeenCalled();
  });
});
