namespace Thassi.Shared.Contracts;

/// <summary>
/// Standardized SignalR Event Types defined in the Architecture Matrix.
/// </summary>
public static class OrchestratorEventTypes
{
    public const string VoiceCommandReceived = nameof(VoiceCommandReceived);
    public const string TaskStarted = nameof(TaskStarted);
    public const string PreflightChecked = nameof(PreflightChecked);
    public const string RepoCreated = nameof(RepoCreated);
    public const string CodeGenProgress = nameof(CodeGenProgress);
    public const string DockerBuildProgress = nameof(DockerBuildProgress);
    public const string CodePushed = nameof(CodePushed);
    public const string DeployingToHass = nameof(DeployingToHass);
    public const string SmokeTestRunning = nameof(SmokeTestRunning);
    public const string TestsPassed = nameof(TestsPassed);
    public const string RollbackTriggered = nameof(RollbackTriggered);
    public const string TaskFailed = nameof(TaskFailed);
    public const string SystemHeartbeat = nameof(SystemHeartbeat);
}

public static class EventSeverities
{
    public const string Info = "Info";
    public const string Progress = "Progress";
    public const string Success = "Success";
    public const string Warning = "Warning";
    public const string Critical = "Critical";
}

/// <summary>
/// Unified real-time event payload streamed via SignalR between Antigravity Engine, Hub, and .NET MAUI Clients.
/// </summary>
public record OrchestratorEventEnvelope(
    Guid EventId,
    Guid TaskId,
    string EventType,
    string Severity,
    string Title,
    string Message,
    int? ProgressPercent,
    string? AddonSlug,
    string? CommitSha,
    DateTimeOffset Timestamp,
    Dictionary<string, string>? Metadata = null
);

/// <summary>
/// Command DTO sent from the .NET MAUI Client (Voice-to-Text or Text Input) to the SignalR Hub.
/// </summary>
public record SubmitPromptRequest(
    string Prompt,
    string DeviceName,
    string? SuggestedAddonSlug = null,
    bool CreateStandaloneRepo = false
);

public record ActiveTaskSummary(
    Guid TaskId,
    string Prompt,
    string RequestedBy,
    string CurrentStage,
    int ProgressPercent,
    string Status,
    string? AddonSlug,
    string? IngressUrl,
    DateTimeOffset StartedAt,
    DateTimeOffset UpdatedAt
);

public interface IOrchestratorClient
{
    Task OnOrchestratorEvent(OrchestratorEventEnvelope evt);
    Task OnTaskSnapshot(List<ActiveTaskSummary> activeTasks, List<OrchestratorEventEnvelope> recentEvents);
}

public interface IOrchestratorHub
{
    Task<ActiveTaskSummary> SubmitPromptCommand(SubmitPromptRequest request);
    Task PublishEngineEvent(OrchestratorEventEnvelope evt);
    Task TriggerDemoSmokePipeline(string addonName);
}
