'use strict';

const { ResilQueue } = require('../lib/queue');
const { startDashboard } = require('../lib/dashboard');

console.log('Starting ResilMesh Worker Demo...');

const queue = new ResilQueue({
  name: 'email-notifications',
  concurrency: 2,
  maxRetries: 3,
  backoffBaseMs: 300
});

queue.process(async (job) => {
  console.log(`[Worker] Executing Job ${job.id}: Sending email to ${job.data.to}`);
  // Simulate occasional transient error on attempt 1
  if (job.attempts === 1 && job.data.shouldFailOnce) {
    throw new Error('SMTP Connection Timeout (Simulated Transient Error)');
  }
  // Simulate complete success
  return { delivered: true, timestamp: Date.now() };
});

queue.on('completed', (job) => console.log(`[Success] Job ${job.id} completed.`));
queue.on('failed', (job, err, willRetry) => {
  console.log(`[Failed] Job ${job.id} failed: ${err.message}. Will retry: ${willRetry}`);
});
queue.on('dead', (job) => console.log(`[DLQ] Job ${job.id} permanently moved to Dead-Letter Queue.`));

// Start processing
queue.start();

// Seed initial jobs
queue.add({ to: 'user1@ptba.co.id', subject: 'Report Ready' });
queue.add({ to: 'user2@ptba.co.id', subject: 'Password Reset', shouldFailOnce: true });
queue.add({ to: 'user3@ptba.co.id', subject: 'Monthly Summary' });

// Start embedded dashboard
startDashboard(queue.storage, 4800, (port) => {
  console.log(`\n✔ Live Monitoring Dashboard available at: http://localhost:${port}\n`);
  setTimeout(() => {
    console.log('Demo finished. Exiting worker cleanly.');
    queue.stop();
    process.exit(0);
  }, 2500);
});
