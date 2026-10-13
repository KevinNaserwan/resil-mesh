'use strict';

const assert = require('assert');
const { ResilQueue } = require('../lib/queue');
const { StorageAdapter } = require('../lib/storage');

console.log('Running resil-mesh Test Suite...');

// Test 1: Lease Locking mechanism
{
  const storage = new StorageAdapter();
  const acquired1 = storage.acquireLease('job-1', 'worker-A', 1000);
  assert.strictEqual(acquired1, true, 'Worker A should acquire initial lease');

  const acquired2 = storage.acquireLease('job-1', 'worker-B', 1000);
  assert.strictEqual(acquired2, false, 'Worker B must be rejected while lease is held by Worker A');

  storage.releaseLease('job-1', 'worker-A');
  const acquired3 = storage.acquireLease('job-1', 'worker-B', 1000);
  assert.strictEqual(acquired3, true, 'Worker B can acquire lease after release');
  console.log('✔ Test 1: Distributed Lease Lock acquisition & release passed');
}

// Test 2: Queue processing, Retry & Exponential Backoff, DLQ
{
  const queue = new ResilQueue({
    name: 'test-queue',
    pollIntervalMs: 50,
    maxRetries: 2,
    backoffBaseMs: 50
  });

  let executions = 0;
  let dlqFired = false;

  queue.process(async (job) => {
    executions++;
    throw new Error('Permanent database failure');
  });

  queue.on('dead', (job) => {
    dlqFired = true;
    assert.strictEqual(job.attempts, 2, 'Job must be retried up to maxRetries');
    assert.strictEqual(job.status, 'DEAD');
    queue.stop();

    console.log('✔ Test 2: Retry & Dead-Letter Queue (DLQ) transitions passed');
    console.log('All tests passed successfully (2/2)!');
    process.exit(0);
  });

  queue.start();
  queue.add({ payload: 'critical-task' });
}
