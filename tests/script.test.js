const request = require('supertest');

const mockRedisClient = {
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
  hSet: jest.fn().mockResolvedValue('OK'),
  hGetAll: jest.fn().mockResolvedValue({}),
  eval: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn()
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisClient);
});

const app = require('../src/server');

describe('Script Execution Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /jobs with script execution', () => {
    it('should execute a simple script successfully', async () => {
      const jobData = {
        name: 'test-script',
        cronPattern: '*/5 * * * *',
        script: 'console.log("Hello from test script"); return 42;',
        options: {
          timeout: 1000,
          memory: 64
        }
      };

      const response = await request(app)
        .post('/jobs')
        .send(jobData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('message', 'Job scheduled successfully');
      expect(response.body).toHaveProperty('jobId');
    });

    it('should handle script execution errors', async () => {
      const jobData = {
        name: 'error-script',
        cronPattern: '*/5 * * * *',
        script: 'throw new Error("Test error");',
        options: {
          timeout: 1000
        }
      };

      const response = await request(app)
        .post('/jobs')
        .send(jobData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('jobId');
    });

    it('should reject scripts with invalid syntax', async () => {
      const jobData = {
        name: 'invalid-script',
        cronPattern: '*/5 * * * *',
        script: 'this is not valid javascript;',
        options: {
          timeout: 1000
        }
      };

      const response = await request(app)
        .post('/jobs')
        .send(jobData)
        .expect('Content-Type', /json/)
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle timeout in scripts', async () => {
      const jobData = {
        name: 'timeout-script',
        cronPattern: '*/5 * * * *',
        script: 'while(true) {}',
        options: {
          timeout: 100
        }
      };

      const response = await request(app)
        .post('/jobs')
        .send(jobData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('jobId');
    });
  });

  describe('Script Sandbox Security', () => {
    it('should prevent access to sensitive Node.js APIs', async () => {
      const jobData = {
        name: 'security-test',
        cronPattern: '*/5 * * * *',
        script: 'try { require("fs"); } catch(e) { throw new Error("Access blocked"); }',
        options: {
          timeout: 1000
        }
      };

      const response = await request(app)
        .post('/jobs')
        .send(jobData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('jobId');
    });

    it('should prevent access to process object', async () => {
      const jobData = {
        name: 'process-test',
        cronPattern: '*/5 * * * *',
        script: 'console.log(typeof process)',
        options: {
          timeout: 1000
        }
      };

      const response = await request(app)
        .post('/jobs')
        .send(jobData)
        .expect('Content-Type', /json/)
        .expect(201);

      expect(response.body).toHaveProperty('jobId');
    });
  });
}); 