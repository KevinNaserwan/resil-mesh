using System.Collections.Concurrent;

namespace ResilMesh;

public interface ILeaseManager
{
    bool TryAcquireLease(string jobId, string workerId, TimeSpan ttl);
    bool ReleaseLease(string jobId, string workerId);
}

public class MemoryLeaseManager : ILeaseManager
{
    private record LeaseEntry(string WorkerId, DateTime ExpiresAtUtc);
    private readonly ConcurrentDictionary<string, LeaseEntry> _leases = new();

    public bool TryAcquireLease(string jobId, string workerId, TimeSpan ttl)
    {
        var now = DateTime.UtcNow;
        var newLease = new LeaseEntry(workerId, now.Add(ttl));

        while (true)
        {
            if (_leases.TryGetValue(jobId, out var existing))
            {
                if (existing.ExpiresAtUtc > now && existing.WorkerId != workerId)
                {
                    return false; // Actively held by another worker
                }

                if (_leases.TryUpdate(jobId, newLease, existing))
                {
                    return true;
                }
            }
            else
            {
                if (_leases.TryAdd(jobId, newLease))
                {
                    return true;
                }
            }
        }
    }

    public bool ReleaseLease(string jobId, string workerId)
    {
        if (_leases.TryGetValue(jobId, out var existing) && existing.WorkerId == workerId)
        {
            return _leases.TryRemove(jobId, out _);
        }
        return false;
    }
}
