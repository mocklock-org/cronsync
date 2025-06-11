const request = require('supertest');
jest.mock('../src/index', () => {
  return jest.fn().mockImplementation(() => ({
    schedule: jest.fn().mockResolvedValue('mock-job-id'),
    getJobs: jest.fn().mockReturnValue([
      { id: 'job-1', name: 'test-job-1', cronPattern: '*/5 * * * *' },
      { id: 'job-2', name: 'test-job-2', cronPattern: '0 */1 * * *' }
    ]),
    disconnect: jest.fn(),
    stopJob: jest.fn().mockResolvedValue(true),
    stopAll: jest.fn().mockResolvedValue(true),
    getJobStats: jest.fn().mockResolvedValue({
      lastRun: '2024-03-20T10:00:00Z',
      totalRuns: 42,
      successCount: 40,
      failureCount: 2
    })
  }));
});
const app = require('../src/server');

describe('Server API Tests', () => {
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('POST /jobs', () => {
    it('should create a new job with valid input', async () => {
      const jobData = {
        name: 'test-job',
        cronPattern: '*/5 * * * *',
        script: 'console.log("Hello World");',
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
      expect(response.body).toHaveProperty('name', jobData.name);
      expect(response.body).toHaveProperty('cronPattern', jobData.cronPattern);
    });

    it('should reject invalid job data', async () => {
      const invalidJobData = {
        name: 'test-job-@invalid#',  // invalid name pattern
        cronPattern: 'invalid cron',
        script: '',  // empty script
        options: {
          timeout: 50  // too low timeout
        }
      };

      const response = await request(app)
        .post('/jobs')
        .send(invalidJobData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /jobs/:jobId', () => {
    it('should successfully delete an existing job', async () => {
      const jobId = 'mock-job-id';

      const response = await request(app)
        .delete(`/jobs/${jobId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Job stopped successfully');
    });
  });

  describe('GET /jobs', () => {
    it('should return list of all jobs', async () => {
      const response = await request(app)
        .get('/jobs')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(Array.isArray(response.body.jobs)).toBe(true);
      expect(response.body.jobs).toHaveLength(2);
      expect(response.body.jobs[0]).toHaveProperty('id', 'job-1');
      expect(response.body.jobs[1]).toHaveProperty('name', 'test-job-2');
    });
  });

  describe('GET /jobs/:jobName/stats', () => {
    it('should return job statistics', async () => {
      const jobName = 'test-job-1';
      
      const response = await request(app)
        .get(`/jobs/${jobName}/stats`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats).toHaveProperty('lastRun');
      expect(response.body.stats).toHaveProperty('totalRuns', 42);
      expect(response.body.stats).toHaveProperty('successCount', 40);
      expect(response.body.stats).toHaveProperty('failureCount', 2);
    });
  });

  describe('POST /jobs/stop-all', () => {
    it('should stop all running jobs', async () => {
      const response = await request(app)
        .post('/jobs/stop-all')
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('message', 'All jobs stopped successfully');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      // Make 101 requests (exceeding the 100 request limit)
      const requests = Array(101).fill().map(() => 
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      
      expect(rateLimitedCount).toBeGreaterThan(0);
      
      expect(responses[0].status).toBe(200);
    });
  });
});
