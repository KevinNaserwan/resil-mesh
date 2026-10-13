namespace ResilMesh;

public enum JobStatus
{
    Pending,
    Active,
    Retrying,
    Completed,
    DeadLetter
}

public class JobItem<T>
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string QueueName { get; set; } = "default";
    public T Data { get; set; } = default!;
    public int Attempts { get; set; } = 0;
    public int MaxRetries { get; set; } = 3;
    public TimeSpan BackoffBase { get; set; } = TimeSpan.FromMilliseconds(500);
    public DateTime RunAtUtc { get; set; } = DateTime.UtcNow;
    public JobStatus Status { get; set; } = JobStatus.Pending;
    public string? LastError { get; set; }
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
