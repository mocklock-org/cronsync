# CronSync

> Distributed cron jobs for Node.js with Redis coordination

CronSync ensures your scheduled jobs run exactly once across multiple server instances. Perfect for microservices, Kubernetes deployments, and any distributed Node.js application.

## 🚀 Quick Start

```bash
npm install cronsync
```

### Basic Usage

```javascript
const CronSync = require('cronsync');

const cronSync = new CronSync({
  redisUrl: 'redis://localhost:6379'
});

// This job runs exactly once across all your instances
cronSync.schedule('0 2 * * *', 'daily-backup', async () => {
  console.log('Running daily backup...');
  // Your backup logic here
});
```

### With Express API

```bash
npm start
# Server runs on http://localhost:5500
```

### Using CLI

```bash
# Schedule a job
cronsync schedule --name "backup" --cron "0 2 * * *" --script "scripts/backup.js"

# List all jobs
cronsync list

# Stop a job
cronsync stop --id "job-id-here"

# View job stats
cronsync stats --name "backup"
```

## 🎯 Problem Solved

**Without CronSync:**
- Deploy your app to 3 servers
- Your daily backup job runs 3 times
- Data corruption and wasted resources

**With CronSync:**
- Same 3 servers
- Daily backup runs exactly once
- Redis coordinates which server executes

## 🔧 Installation

### Local Development

```bash
# Clone the repository
git clone https://github.com/mocklock-org/cronsync.git
cd cronsync

# Install dependencies
npm install

# Start Redis (required)
docker run -d -p 6379:6379 redis:alpine

# Start the server
npm run dev
```

### Docker Deployment

```bash
# Using docker-compose
docker-compose up -d

# Or build and run manually
docker build -t cronsync .
docker run -p 3000:3000 -e REDIS_URL=redis://your-redis:6379 cronsync
```

## 📡 API Endpoints

### Schedule Job
```bash
POST /jobs
{
  "name": "backup",
  "cronPattern": "0 2 * * *",
  "script": "scripts/backup.js"
}
```

### List Jobs
```bash
GET /jobs
```

### Stop Job
```bash
DELETE /jobs/:jobId
```

### Job Statistics
```bash
GET /jobs/:jobName/stats
```

## 🛠️ Configuration

### Environment Variables

```bash
PORT=3000                           # API server port
REDIS_URL=redis://localhost:6379    # Redis connection
LOG_LEVEL=info                      # Logging level
```

### Programmatic Configuration

```javascript
const cronSync = new CronSync({
  redisUrl: 'redis://localhost:6379',
  instanceId: 'custom-instance-id',   // Auto-generated if not provided
  lockTimeout: 300000,               // Lock timeout in ms (5 min default)
  logLevel: 'info'                   // winston log level
});
```

## 📊 Monitoring & Logging

CronSync provides built-in monitoring:

- **Execution logs**: All job runs are logged with timestamps and duration
- **Job statistics**: Success/failure rates, last run times
- **Distributed coordination**: Track which instance executed each job
- **Error handling**: Automatic lock release on failures

## 🔒 How Distributed Locking Works

1. **Job Trigger**: Cron pattern triggers on all instances
2. **Lock Attempt**: Each instance tries to acquire Redis lock
3. **Winner Executes**: Only one instance gets the lock and runs the job
4. **Automatic Cleanup**: Lock is released after job completion or timeout

## 🎯 Use Cases

- **Database backups** across multiple app instances
- **Report generation** in distributed systems
- **Cache warming** for load-balanced applications
- **Cleanup tasks** in microservice architectures
- **Batch processing** in cloud deployments

## 🚦 Production Considerations

### Redis High Availability
```javascript
const cronSync = new CronSync({
  redisUrl: 'redis://primary:6379,redis://secondary:6379'
});
```

### Kubernetes Deployment
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cronsync
spec:
  replicas: 3  # Multiple instances, jobs still run once
  template:
    spec:
      containers:
      - name: cronsync
        image: your-registry/cronsync:latest
        env:
        - name: REDIS_URL
          value: "redis://redis-service:6379"
```

## 📈 Performance

- **Minimal overhead**: Only Redis calls added to job execution
- **Fast coordination**: Lock acquisition typically < 1ms
- **Scalable**: Tested with 100+ concurrent instances
- **Reliable**: Automatic failover if instance dies during job execution

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📜 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/mocklock-org/cronsync/issues)
- **Discussions**: [GitHub Discussions](https://github.com/mocklock-org/cronsync/discussions)
- **Documentation**: [Wiki](https://github.com/mocklock-org/cronsync/wiki)

---

**CronSync** - Because your scheduled jobs should run once, not once per server.