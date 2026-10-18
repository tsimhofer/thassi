using System.Collections.Concurrent;
using System.Diagnostics;
using Microsoft.AspNetCore.SignalR;
using Thassi.Shared.Contracts;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://0.0.0.0:5180");

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy
            .SetIsOriginAllowed(_ => true)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = true;
    options.KeepAliveInterval = TimeSpan.FromSeconds(10);
});

builder.Services.AddSingleton<OrchestratorStateStore>();
builder.Services.AddHostedService<HeartbeatBackgroundService>();

var app = builder.Build();
app.UseCors();

app.MapGet("/healthz", (OrchestratorStateStore store) => Results.Ok(new
{
    status = "healthy",
    service = "Thassi.Orchestrator.Hub",
    activeTasks = store.GetTasks().Count,
    recentEvents = store.GetEvents().Count,
    timestamp = DateTimeOffset.UtcNow
}));

app.MapGet("/api/state", (OrchestratorStateStore store) => Results.Ok(new
{
    activeTasks = store.GetTasks(),
    recentEvents = store.GetEvents()
}));

app.MapPost("/api/events/publish", async (
    OrchestratorEventEnvelope evt,
    OrchestratorStateStore store,
    IHubContext<OrchestratorHub, IOrchestratorClient> hubContext) =>
{
    var normalized = evt with
    {
        EventId = evt.EventId == Guid.Empty ? Guid.NewGuid() : evt.EventId,
        Timestamp = evt.Timestamp == default ? DateTimeOffset.UtcNow : evt.Timestamp
    };
    store.RecordEvent(normalized);
    await hubContext.Clients.All.OnOrchestratorEvent(normalized);
    return Results.Ok(new { published = true, eventId = normalized.EventId });
});

app.MapPost("/api/tasks/submit", async (
    SubmitPromptRequest req,
    OrchestratorStateStore store,
    IHubContext<OrchestratorHub, IOrchestratorClient> hubContext) =>
{
    var task = await OrchestratorPipelineLauncher.StartPipelineAsync(req, store, hubContext);
    return Results.Ok(task);
});

app.MapHub<OrchestratorHub>("/hubs/orchestrator");

app.Run();

public class OrchestratorStateStore
{
    private readonly ConcurrentDictionary<Guid, ActiveTaskSummary> _tasks = new();
    private readonly ConcurrentQueue<OrchestratorEventEnvelope> _events = new();
    private const int MaxEvents = 150;

    public List<ActiveTaskSummary> GetTasks() =>
        _tasks.Values.OrderByDescending(t => t.StartedAt).Take(30).ToList();

    public List<OrchestratorEventEnvelope> GetEvents() =>
        _events.Reverse().Take(80).ToList();

    public void UpsertTask(ActiveTaskSummary task)
    {
        _tasks[task.TaskId] = task;
    }

    public void RecordEvent(OrchestratorEventEnvelope evt)
    {
        _events.Enqueue(evt);
        while (_events.Count > MaxEvents && _events.TryDequeue(out _)) { }

        if (evt.TaskId != Guid.Empty && _tasks.TryGetValue(evt.TaskId, out var existing))
        {
            var status = evt.EventType switch
            {
                OrchestratorEventTypes.TestsPassed => "Completed",
                OrchestratorEventTypes.TaskFailed => "Failed",
                OrchestratorEventTypes.RollbackTriggered => "RolledBack",
                _ => existing.Status
            };
            var ingressUrl = evt.Metadata != null && evt.Metadata.TryGetValue("ingressUrl", out var url)
                ? url
                : existing.IngressUrl;

            _tasks[evt.TaskId] = existing with
            {
                CurrentStage = evt.EventType,
                ProgressPercent = evt.ProgressPercent ?? existing.ProgressPercent,
                Status = status,
                AddonSlug = evt.AddonSlug ?? existing.AddonSlug,
                IngressUrl = ingressUrl,
                UpdatedAt = evt.Timestamp
            };
        }
    }
}

public class OrchestratorHub(
    OrchestratorStateStore store,
    IHubContext<OrchestratorHub, IOrchestratorClient> hubContext)
    : Hub<IOrchestratorClient>, IOrchestratorHub
{
    public override async Task OnConnectedAsync()
    {
        await Clients.Caller.OnTaskSnapshot(store.GetTasks(), store.GetEvents());
        await base.OnConnectedAsync();
    }

    public async Task<ActiveTaskSummary> SubmitPromptCommand(SubmitPromptRequest request)
    {
        return await OrchestratorPipelineLauncher.StartPipelineAsync(request, store, hubContext);
    }

    public async Task PublishEngineEvent(OrchestratorEventEnvelope evt)
    {
        var normalized = evt with
        {
            EventId = evt.EventId == Guid.Empty ? Guid.NewGuid() : evt.EventId,
            Timestamp = evt.Timestamp == default ? DateTimeOffset.UtcNow : evt.Timestamp
        };
        store.RecordEvent(normalized);
        await Clients.All.OnOrchestratorEvent(normalized);
    }

    public async Task TriggerDemoSmokePipeline(string addonName)
    {
        await OrchestratorPipelineLauncher.StartPipelineAsync(
            new SubmitPromptRequest(
                Prompt: $"Erstelle und deploye HASS Add-on: {addonName}",
                DeviceName: "MAUI Quick Trigger",
                SuggestedAddonSlug: addonName),
            store,
            hubContext);
    }
}

public static class OrchestratorPipelineLauncher
{
    public static async Task<ActiveTaskSummary> StartPipelineAsync(
        SubmitPromptRequest request,
        OrchestratorStateStore store,
        IHubContext<OrchestratorHub, IOrchestratorClient> hubContext)
    {
        var taskId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        var slug = !string.IsNullOrWhiteSpace(request.SuggestedAddonSlug)
            ? SanitizeSlug(request.SuggestedAddonSlug)
            : InferSlugFromPrompt(request.Prompt);

        var summary = new ActiveTaskSummary(
            TaskId: taskId,
            Prompt: request.Prompt,
            RequestedBy: request.DeviceName,
            CurrentStage: OrchestratorEventTypes.TaskStarted,
            ProgressPercent: 5,
            Status: "Running",
            AddonSlug: slug,
            IngressUrl: null,
            StartedAt: now,
            UpdatedAt: now
        );

        store.UpsertTask(summary);

        var voiceEvt = new OrchestratorEventEnvelope(
            EventId: Guid.NewGuid(),
            TaskId: taskId,
            EventType: OrchestratorEventTypes.VoiceCommandReceived,
            Severity: EventSeverities.Info,
            Title: $"Befehl von {request.DeviceName}",
            Message: $"\"{request.Prompt}\"",
            ProgressPercent: 2,
            AddonSlug: slug,
            CommitSha: null,
            Timestamp: now,
            Metadata: new Dictionary<string, string>
            {
                ["deviceName"] = request.DeviceName,
                ["rawTranscript"] = request.Prompt
            });

        store.RecordEvent(voiceEvt);
        await hubContext.Clients.All.OnOrchestratorEvent(voiceEvt);

        var startEvt = new OrchestratorEventEnvelope(
            EventId: Guid.NewGuid(),
            TaskId: taskId,
            EventType: OrchestratorEventTypes.TaskStarted,
            Severity: EventSeverities.Progress,
            Title: "Antigravity Pipeline gestartet",
            Message: $"Starte Add-on-Erstellung & Hass-PC Deployment für '{slug}'...",
            ProgressPercent: 8,
            AddonSlug: slug,
            CommitSha: null,
            Timestamp: DateTimeOffset.UtcNow,
            Metadata: new Dictionary<string, string>
            {
                ["prompt"] = request.Prompt,
                ["addonSlug"] = slug
            });

        store.RecordEvent(startEvt);
        await hubContext.Clients.All.OnOrchestratorEvent(startEvt);

        // Launch the Node/TSX Phase 2 + Phase 3 Add-on Scaffolding & Hass OS Deployment pipeline asynchronously
        _ = Task.Run(async () =>
        {
            try
            {
                var repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
                if (!Directory.Exists(Path.Combine(repoRoot, "packages", "cli")))
                {
                    repoRoot = @"c:\Users\thoma\source\repos\thassi";
                }

                var psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = $"/c npx.cmd tsx packages/cli/src/addon-pipeline.ts \"{taskId}\" \"{slug}\" \"{request.Prompt.Replace("\"", "'")}\"",
                    WorkingDirectory = repoRoot,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using var proc = Process.Start(psi);
                if (proc != null)
                {
                    await proc.WaitForExitAsync();
                }
            }
            catch (Exception ex)
            {
                var failEvt = new OrchestratorEventEnvelope(
                    EventId: Guid.NewGuid(),
                    TaskId: taskId,
                    EventType: OrchestratorEventTypes.TaskFailed,
                    Severity: EventSeverities.Critical,
                    Title: "Pipeline-Prozessfehler",
                    Message: ex.Message,
                    ProgressPercent: 100,
                    AddonSlug: slug,
                    CommitSha: null,
                    Timestamp: DateTimeOffset.UtcNow);
                store.RecordEvent(failEvt);
                await hubContext.Clients.All.OnOrchestratorEvent(failEvt);
            }
        });

        return summary;
    }

    private static string SanitizeSlug(string raw)
    {
        var clean = new string(raw.ToLowerInvariant().Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray()).Trim('_');
        while (clean.Contains("__")) clean = clean.Replace("__", "_");
        if (!clean.StartsWith("thassi_")) clean = "thassi_" + clean;
        return clean;
    }

    private static string InferSlugFromPrompt(string prompt)
    {
        var words = prompt
            .ToLowerInvariant()
            .Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue").Replace("ß", "ss")
            .Split([' ', '-', '_', '.', ',', ':', ';', '!', '?'], StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 2 && !new[] { "und", "fuer", "ein", "eine", "erstelle", "baue", "bitte", "addon", "add", "das", "die", "der", "mit", "auf", "hass" }.Contains(w))
            .Take(2)
            .ToArray();

        var suffix = words.Length > 0 ? string.Join("_", words) : "custom_module";
        return SanitizeSlug(suffix);
    }
}

public class HeartbeatBackgroundService(
    OrchestratorStateStore store,
    IHubContext<OrchestratorHub, IOrchestratorClient> hubContext) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromSeconds(15), stoppingToken);
            var hb = new OrchestratorEventEnvelope(
                EventId: Guid.NewGuid(),
                TaskId: Guid.Empty,
                EventType: OrchestratorEventTypes.SystemHeartbeat,
                Severity: EventSeverities.Info,
                Title: "System Heartbeat",
                Message: "Dev-PC (192.168.188.46) <-> Hass-PC (192.168.188.92) Online",
                ProgressPercent: null,
                AddonSlug: null,
                CommitSha: null,
                Timestamp: DateTimeOffset.UtcNow,
                Metadata: new Dictionary<string, string>
                {
                    ["hassOnline"] = "true",
                    ["workerOnline"] = "true",
                    ["activeTasks"] = store.GetTasks().Count.ToString()
                });
            await hubContext.Clients.All.OnOrchestratorEvent(hb);
        }
    }
}
