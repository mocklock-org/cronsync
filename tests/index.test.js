const CronSync = require('../src/index');
const Redis = require('ioredis');

describe('CronSync', () => {
  let cronSync;

  beforeEach(() => {
    jest.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG');
    jest.spyOn(Redis.prototype, 'on').mockImplementation();
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
  });
});
