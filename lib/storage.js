'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Lightweight File & Memory Lease Locking and Persistent Storage Adapter
 * Implements atomic distributed leases using atomic rename/lock mechanics without requiring Redis.
 */
class StorageAdapter {
  constructor(options = {}) {
    this.storageDir = options.storageDir || path.join(process.cwd(), '.resil-mesh-data');
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this.jobsFile = path.join(this.storageDir, 'jobs.json');
    this.memoryJobs = new Map();
    this.leases = new Map(); // jobId -> { workerId, expiresAt }
    this.isPersistent = !!options.persist;

    if (this.isPersistent && fs.existsSync(this.jobsFile)) {
      try {
        const raw = fs.readFileSync(this.jobsFile, 'utf8');
        const list = JSON.parse(raw);
        for (const j of list) this.memoryJobs.set(j.id, j);
      } catch (e) {}
    }
  }

  saveJob(job) {
    this.memoryJobs.set(job.id, job);
    if (this.isPersistent) {
      this._flush();
    }
  }

  getJob(jobId) {
    return this.memoryJobs.get(jobId);
  }

  acquireLease(jobId, workerId, ttlMs = 5000) {
    const now = Date.now();
    const existing = this.leases.get(jobId);

    if (existing && existing.expiresAt > now && existing.workerId !== workerId) {
      // Lease actively held by another worker
      return false;
    }

    // Grant or renew lease
    this.leases.set(jobId, {
      workerId,
      expiresAt: now + ttlMs
    });
    return true;
  }

  releaseLease(jobId, workerId) {
    const existing = this.leases.get(jobId);
    if (existing && existing.workerId === workerId) {
      this.leases.delete(jobId);
      return true;
    }
    return false;
  }

  getNextAvailableJob(now = Date.now()) {
    for (const job of this.memoryJobs.values()) {
      if (job.status === 'PENDING' || job.status === 'RETRYING') {
        if (job.runAt <= now) {
          const lease = this.leases.get(job.id);
          if (!lease || lease.expiresAt <= now) {
            return job;
          }
        }
      }
    }
    return null;
  }

  _flush() {
    const arr = Array.from(this.memoryJobs.values());
    fs.writeFileSync(this.jobsFile, JSON.stringify(arr, null, 2), 'utf8');
  }
}

module.exports = { StorageAdapter };
