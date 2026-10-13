using System.Collections.Concurrent;

namespace ResilMesh;

public class ResilQueue<T> : IAsyncDisposable
{
    private readonly string _queueName;
    private readonly string _workerId;
    private readonly int _concurrency;
    private readonly ILeaseManager _leaseManager;
    private readonly ConcurrentDictionary<string, JobItem<T>> _jobs = new();
    private readonly SemaphoreSlim _concurrencySemaphore;
    private readonly CancellationTokenSource _cts = new();
    private Func<JobItem<T>, CancellationToken, Task>? _handler;
    private Task? _processingLoopTask;

    public event Action<JobItem<T>>? OnJobCompleted;
    public event Action<JobItem<T>, Exception, bool>? OnJobFailed;
    public event Action<JobItem<T>, Exception>? OnJobDeadLetter;

    public ResilQueue(
        string queueName = "default",
        int concurrency = 2,
        ILeaseManager? leaseManager = null)
    {
        _queueName = queueName;
        _workerId = $"worker-{Guid.NewGuid():N}"[..12];
        _concurrency = concurrency;
        _leaseManager = leaseManager ?? new MemoryLeaseManager();
        _concurrencySemaphore = new SemaphoreSlim(concurrency, concurrency);
    }

    public void RegisterHandler(Func<JobItem<T>, CancellationToken, Task> handler)
    {
        _handler = handler;
    }

    public JobItem<T> Enqueue(T data, int maxRetries = 3, TimeSpan? delay = null)
    {
        var job = new JobItem<T>
        {
            QueueName = _queueName,
            Data = data,
            MaxRetries = maxRetries,
            RunAtUtc = delay.HasValue ? DateTime.UtcNow.Add(delay.Value) : DateTime.UtcNow
        };

        _jobs[job.Id] = job;
        return job;
    }

    public void Start()
    {
        _processingLoopTask = Task.Run(ProcessingLoopAsync);
    }

    private async Task ProcessingLoopAsync()
    {
        while (!_cts.Token.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;
            var availableJob = _jobs.Values
                .Where(j => (j.Status == JobStatus.Pending || j.Status == JobStatus.Retrying) && j.RunAtUtc <= now)
                .OrderBy(j => j.RunAtUtc)
                .FirstOrDefault();

            if (availableJob != null && _handler != null)
            {
                if (_leaseManager.TryAcquireLease(availableJob.Id, _workerId, TimeSpan.FromSeconds(10)))
                {
                    await _concurrencySemaphore.WaitAsync(_cts.Token);
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await ProcessJobAsync(availableJob);
                        }
                        finally
                        {
                            _concurrencySemaphore.Release();
                        }
                    }, _cts.Token);
                }
            }

            await Task.Delay(100, _cts.Token).ConfigureAwait(false);
        }
    }

    private async Task ProcessJobAsync(JobItem<T> job)
    {
        job.Status = JobStatus.Active;
        job.Attempts++;
        job.UpdatedAtUtc = DateTime.UtcNow;

        try
        {
            if (_handler != null)
            {
                await _handler(job, _cts.Token);
            }

            job.Status = JobStatus.Completed;
            job.UpdatedAtUtc = DateTime.UtcNow;
            _leaseManager.ReleaseLease(job.Id, _workerId);
            OnJobCompleted?.Invoke(job);
        }
        catch (Exception ex)
        {
            job.LastError = ex.Message;
            job.UpdatedAtUtc = DateTime.UtcNow;

            if (job.Attempts < job.MaxRetries)
            {
                job.Status = JobStatus.Retrying;
                var backoffMs = job.BackoffBase.TotalMilliseconds * Math.Pow(2, job.Attempts - 1);
                job.RunAtUtc = DateTime.UtcNow.AddMilliseconds(backoffMs);
                _leaseManager.ReleaseLease(job.Id, _workerId);
                OnJobFailed?.Invoke(job, ex, true);
            }
            else
            {
                job.Status = JobStatus.DeadLetter;
                _leaseManager.ReleaseLease(job.Id, _workerId);
                OnJobFailed?.Invoke(job, ex, false);
                OnJobDeadLetter?.Invoke(job, ex);
            }
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_processingLoopTask != null)
        {
            try { await _processingLoopTask; } catch { }
        }
        _cts.Dispose();
        _concurrencySemaphore.Dispose();
    }
}
