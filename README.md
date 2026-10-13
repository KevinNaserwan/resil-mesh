# resil-mesh ⚡

> **Zero-dependency distributed background job queue & worker runtime with lease-locking, exponential backoff, and dead-letter queues.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js CI](https://img.shields.io/badge/Node.js-%3E%3D16.0.0-green.svg)](https://nodejs.org/)
[![Status](https://img.shields.io/badge/Release-v1.0.0-blue.svg)](https://github.com/KevinNaserwan/resil-mesh)

---

## 📌 Background & Motivation
Modern web applications and APIs frequently require offloading heavy or asynchronous tasks (sending emails, webhook retries, report generation, video transcoding, and third-party API synchronization) to background queues. 

While solutions like **BullMQ** or **Celery** exist, they enforce heavy infrastructure prerequisites (such as mandatory dedicated Redis instances or brokers) and lack lightweight embedded monitoring.

**`resil-mesh`** provides a **zero-dependency, fault-tolerant background queue engine** that runs smoothly on single instances or multi-worker clusters. It incorporates production-grade distributed systems patterns: **atomic lease-locking**, **exponential backoff**, **poison pill isolation**, and an **embedded real-time web dashboard**.

---

## ✨ Features

* **🔒 Distributed Lease-Locking:** Employs atomic worker leases ($TTL$) to ensure exactly-once execution per lease window and prevent duplicate job processing across clustered instances.
* **🔁 Exponential Backoff & Jitter:** Automatically calculates exponential backoff intervals ($\text{Base} \times 2^{\text{attempts}-1}$) to protect downstream systems from stampedes during temporary outages.
* **☠️ Dead-Letter Queue (DLQ):** Automatically isolates persistent failing tasks into a dedicated DLQ state to prevent poison pills from blocking the processing pipeline.
* **🖥️ Zero-Dependency Embedded Web Dashboard:** Ships with a built-in real-time monitoring web dashboard (SSE/Polling) showing active, retrying, completed, and dead-letter jobs.
* **📦 Pluggable Storage:** Operates natively in-memory or persists automatically to disk with atomic flush semantics.

---

## 🚀 Quick Start Example

```javascript
const { ResilQueue } = require('resil-mesh');

// 1. Initialize queue with concurrency & retry rules
const queue = new ResilQueue({
  name: 'order-processing',
  concurrency: 4,
  maxRetries: 3,
  backoffBaseMs: 500
});

// 2. Define your asynchronous worker logic
queue.process(async (job) => {
  console.log(`Processing Order #${job.data.orderId}...`);
  // Perform API call or DB transaction
  return { processed: true };
});

// 3. Attach lifecycle event listeners
queue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed successfully!`);
});

queue.on('dead', (job, err) => {
  console.error(`Job ${job.id} moved to DLQ: ${err.message}`);
});

// 4. Start processing jobs
queue.start();

// 5. Enqueue tasks anywhere in your app
queue.add({ orderId: 4092, amount: 250000 });
```

---

## 📊 Embedded Live Web Dashboard

Spin up the embedded monitoring dashboard alongside your queue with one line of code:

```javascript
const { startDashboard } = require('resil-mesh/lib/dashboard');

startDashboard(queue.storage, 4800, (port) => {
  console.log(`Monitoring dashboard open at: http://localhost:${port}`);
});
```

---

## 🧪 Testing & Verification

Run the test suite:
```bash
npm test
```

Run the live worker simulation demo:
```bash
npm run demo
```

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).

Authored with ❤️ by [Kevin Naserwan](https://github.com/KevinNaserwan).
