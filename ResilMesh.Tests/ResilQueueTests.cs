using ResilMesh;

namespace ResilMesh.Tests;

public class ResilQueueTests
{
    [Fact]
    public void MemoryLeaseManager_EnforcesExclusiveLease()
    {
        var manager = new MemoryLeaseManager();
        var acquiredA = manager.TryAcquireLease("job-101", "worker-A", TimeSpan.FromSeconds(5));
        var acquiredB = manager.TryAcquireLease("job-101", "worker-B", TimeSpan.FromSeconds(5));

        Assert.True(acquiredA);
        Assert.False(acquiredB);

        manager.ReleaseLease("job-101", "worker-A");
        var acquiredBAfterRelease = manager.TryAcquireLease("job-101", "worker-B", TimeSpan.FromSeconds(5));
        Assert.True(acquiredBAfterRelease);
    }

    [Fact]
    public async Task ResilQueue_RetriesAndDeadLetters_OnFailure()
    {
        await using var queue = new ResilQueue<string>("test-queue", concurrency: 1);
        var deadLetterTcs = new TaskCompletionSource<bool>();

        queue.RegisterHandler((job, ct) =>
        {
            throw new InvalidOperationException("Simulated enterprise system outage");
        });

        queue.OnJobDeadLetter += (job, ex) =>
        {
            if (job.Attempts == 2 && job.Status == JobStatus.DeadLetter)
            {
                deadLetterTcs.TrySetResult(true);
            }
        };

        queue.Start();
        queue.Enqueue("critical-payload", maxRetries: 2);

        var completed = await Task.WhenAny(deadLetterTcs.Task, Task.Delay(3000));
        Assert.Equal(deadLetterTcs.Task, completed);
    }
}
