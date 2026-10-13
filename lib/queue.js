'use strict';

const EventEmitter = require('events');
const { StorageAdapter } = require('./storage');

class ResilQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'default';
    this.workerId = options.workerId || `worker-${Math.random().toString(36).substr(2, 6)}`;
    this.concurrency = options.concurrency || 2;
    this.pollIntervalMs = options.pollIntervalMs || 200;
    this.defaultMaxRetries = options.maxRetries || 3;
    this.defaultBackoffBaseMs = options.backoffBaseMs || 500;

    this.storage = options.storage || new StorageAdapter({ persist: options.persist });
    this.handlers = new Map();
    this.activeWorkers = 0;
    this.isPolling = false;
    this.pollTimer = null;
  }

  process(handler) {
    this.handler = handler;
  }

  add(data, opts = {}) {
    const id = opts.id || `job-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const job = {
      id,
      queue: this.name,
      data,
      attempts: 0,
      maxRetries: opts.maxRetries || this.defaultMaxRetries,
      backoffBaseMs: opts.backoffBaseMs || this.defaultBackoffBaseMs,
      runAt: opts.delay ? Date.now() + opts.delay : Date.now(),
      status: 'PENDING',
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.storage.saveJob(job);
    this.emit('added', job);
    return job;
  }

  start() {
    if (this.isPolling) return;
    this.isPolling = true;
    this._pollLoop();
  }

  stop() {
    this.isPolling = false;
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  async _pollLoop() {
    if (!this.isPolling) return;

    while (this.activeWorkers < this.concurrency) {
      const job = this.storage.getNextAvailableJob();
      if (!job) break;

      const acquired = this.storage.acquireLease(job.id, this.workerId, 10000);
      if (!acquired) break;

      this.activeWorkers++;
      this._executeJob(job).finally(() => {
        this.activeWorkers--;
      });
    }

    this.pollTimer = setTimeout(() => this._pollLoop(), this.pollIntervalMs);
  }

  async _executeJob(job) {
    if (!this.handler) {
      this.storage.releaseLease(job.id, this.workerId);
      return;
    }

    job.status = 'ACTIVE';
    job.attempts++;
    job.updatedAt = Date.now();
    this.storage.saveJob(job);
    this.emit('active', job);

    try {
      const result = await this.handler(job);
      job.status = 'COMPLETED';
      job.result = result;
      job.updatedAt = Date.now();
      this.storage.saveJob(job);
      this.storage.releaseLease(job.id, this.workerId);
      this.emit('completed', job, result);
    } catch (err) {
      job.error = err.message || String(err);
      job.updatedAt = Date.now();

      if (job.attempts < job.maxRetries) {
        // Exponential backoff: backoffBaseMs * 2^(attempts - 1)
        const delay = job.backoffBaseMs * Math.pow(2, job.attempts - 1);
        job.status = 'RETRYING';
        job.runAt = Date.now() + delay;
        this.storage.saveJob(job);
        this.storage.releaseLease(job.id, this.workerId);
        this.emit('failed', job, err, true); // true = will retry
      } else {
        // Move to Dead-Letter Queue (DLQ)
        job.status = 'DEAD';
        this.storage.saveJob(job);
        this.storage.releaseLease(job.id, this.workerId);
        this.emit('failed', job, err, false); // false = dead
        this.emit('dead', job, err);
      }
    }
  }
}

module.exports = { ResilQueue };
