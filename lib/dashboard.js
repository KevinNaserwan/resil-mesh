'use strict';

const http = require('http');

function startDashboard(storage, port = 4200, cb) {
  const server = http.createServer((req, res) => {
    if (req.url === '/api/stats') {
      const allJobs = Array.from(storage.memoryJobs.values());
      const stats = {
        total: allJobs.length,
        pending: allJobs.filter(j => j.status === 'PENDING').length,
        active: allJobs.filter(j => j.status === 'ACTIVE').length,
        retrying: allJobs.filter(j => j.status === 'RETRYING').length,
        completed: allJobs.filter(j => j.status === 'COMPLETED').length,
        dead: allJobs.filter(j => j.status === 'DEAD').length,
        jobs: allJobs.slice(-50).reverse()
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats, null, 2));
      return;
    }

    // Visual Web UI
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>ResilMesh Dashboard</title>
  <style>
    body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f8fafc; padding: 24px; }
    h1 { color: #38bdf8; }
    .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 24px; }
    .card { background: #1e293b; padding: 16px; border-radius: 8px; border: 1px solid #334155; text-align: center; }
    .card h3 { margin: 0; font-size: 14px; color: #94a3b8; }
    .card p { margin: 8px 0 0; font-size: 28px; font-weight: bold; }
    table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; font-size: 14px; }
    th { background: #0f172a; color: #94a3b8; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; }
    .badge-COMPLETED { background: #10b981; color: white; }
    .badge-ACTIVE { background: #3b82f6; color: white; }
    .badge-RETRYING { background: #f59e0b; color: white; }
    .badge-DEAD { background: #ef4444; color: white; }
    .badge-PENDING { background: #6b7280; color: white; }
  </style>
</head>
<body>
  <h1>⚡ ResilMesh: Distributed Job Dashboard</h1>
  <div class="grid" id="metrics">
    <div class="card"><h3>PENDING</h3><p id="cnt-pending">-</p></div>
    <div class="card"><h3>ACTIVE</h3><p id="cnt-active" style="color:#38bdf8;">-</p></div>
    <div class="card"><h3>RETRYING</h3><p id="cnt-retrying" style="color:#fbbf24;">-</p></div>
    <div class="card"><h3>COMPLETED</h3><p id="cnt-completed" style="color:#34d399;">-</p></div>
    <div class="card"><h3>DEAD LETTER</h3><p id="cnt-dead" style="color:#f87171;">-</p></div>
  </div>
  <h2>Recent Execution Stream</h2>
  <table>
    <thead>
      <tr><th>Job ID</th><th>Queue</th><th>Status</th><th>Attempts</th><th>Payload</th><th>Last Updated</th></tr>
    </thead>
    <tbody id="job-rows"></tbody>
  </table>
  <script>
    async function refresh() {
      const res = await fetch('/api/stats');
      const data = await res.json();
      document.getElementById('cnt-pending').innerText = data.pending;
      document.getElementById('cnt-active').innerText = data.active;
      document.getElementById('cnt-retrying').innerText = data.retrying;
      document.getElementById('cnt-completed').innerText = data.completed;
      document.getElementById('cnt-dead').innerText = data.dead;
      const tbody = document.getElementById('job-rows');
      tbody.innerHTML = data.jobs.map(j => '<tr><td><code>' + j.id + '</code></td><td>' + j.queue + '</td><td><span class="badge badge-' + j.status + '">' + j.status + '</span></td><td>' + j.attempts + '/' + j.maxRetries + '</td><td><pre style="margin:0;max-width:250px;overflow:hidden;text-overflow:ellipsis;">' + JSON.stringify(j.data) + '</pre></td><td>' + new Date(j.updatedAt).toLocaleTimeString() + '</td></tr>').join('');
    }
    setInterval(refresh, 1000);
    refresh();
  </script>
</body>
</html>`);
  });

  server.listen(port, () => {
    if (cb) cb(port);
  });
  return server;
}

module.exports = { startDashboard };
