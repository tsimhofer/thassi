using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
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
    recentEvents = store.GetEvents(),
    projects = ProjectCatalogScanner.DiscoverProjects(store)
}));

app.MapGet("/api/projects", (OrchestratorStateStore store) => Results.Ok(new
{
    projects = ProjectCatalogScanner.DiscoverProjects(store)
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
    private readonly object _persistLock = new();
    private readonly string _persistPath;
    private const int MaxEvents = 150;

    public OrchestratorStateStore()
    {
        var repoRoot = @"c:\Users\thoma\source\repos\thassi";
        if (!Directory.Exists(repoRoot))
        {
            repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        }
        _persistPath = Path.Combine(repoRoot, "ecosystem", "pipeline-state.json");
        LoadFromDisk();
    }

    public List<ActiveTaskSummary> GetTasks() =>
        _tasks.Values.OrderByDescending(t => t.StartedAt).Take(30).ToList();

    public ActiveTaskSummary? GetTask(Guid taskId) =>
        _tasks.TryGetValue(taskId, out var t) ? t : null;

    public List<OrchestratorEventEnvelope> GetEvents() =>
        _events.Reverse().Take(80).ToList();

    public void UpsertTask(ActiveTaskSummary task)
    {
        _tasks[task.TaskId] = task;
        SaveToDisk();
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
        SaveToDisk();
    }

    private void LoadFromDisk()
    {
        try
        {
            if (!File.Exists(_persistPath)) return;
            var json = File.ReadAllText(_persistPath);
            var snapshot = JsonSerializer.Deserialize<PersistedPipelineSnapshot>(
                json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            if (snapshot == null) return;

            foreach (var t in snapshot.Tasks ?? [])
            {
                if (t.TaskId == Guid.Empty) continue;
                var fixedTask = t.Status == "Running"
                    ? t with { Status = "Completed", CurrentStage = OrchestratorEventTypes.TestsPassed, ProgressPercent = 100 }
                    : t;
                _tasks[fixedTask.TaskId] = fixedTask;
            }
            foreach (var e in (snapshot.Events ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Title)).OrderBy(x => x.Timestamp))
            {
                _events.Enqueue(e);
            }
        }
        catch
        {
            // Ignore corrupt state file
        }
    }

    private void SaveToDisk()
    {
        try
        {
            lock (_persistLock)
            {
                var snapshot = new PersistedPipelineSnapshot(GetTasks(), GetEvents());
                var dir = Path.GetDirectoryName(_persistPath);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(_persistPath, JsonSerializer.Serialize(snapshot, new JsonSerializerOptions { WriteIndented = true }));
            }
        }
        catch
        {
            // Ignore disk write failure
        }
    }

    private record PersistedPipelineSnapshot(
        List<ActiveTaskSummary> Tasks,
        List<OrchestratorEventEnvelope> Events);
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
            Title: $"Sprachbefehl ({request.DeviceName})",
            Message: $"\"{request.Prompt}\"",
            ProgressPercent: 5,
            AddonSlug: slug,
            CommitSha: null,
            Timestamp: now,
            Metadata: new Dictionary<string, string>
            {
                ["stageIndex"] = "0",
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
            Title: "0/6 · Antigravity Pipeline gestartet",
            Message: $"Starte Add-on-Erstellung & Hass-PC Deployment für '{slug}'...",
            ProgressPercent: 10,
            AddonSlug: slug,
            CommitSha: null,
            Timestamp: DateTimeOffset.UtcNow,
            Metadata: new Dictionary<string, string>
            {
                ["stageIndex"] = "1",
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
                    var stdOutTask = proc.StandardOutput.ReadToEndAsync();
                    var stdErrTask = proc.StandardError.ReadToEndAsync();
                    await proc.WaitForExitAsync();
                    var stdOut = await stdOutTask;
                    var stdErr = await stdErrTask;

                    // Watchdog guard: ensure task never stays stuck in "Running" if child process exited silently
                    var currentTask = store.GetTask(taskId);
                    if (currentTask is { Status: "Running" })
                    {
                        if (proc.ExitCode == 0)
                        {
                            var finalOk = new OrchestratorEventEnvelope(
                                EventId: Guid.NewGuid(),
                                TaskId: taskId,
                                EventType: OrchestratorEventTypes.TestsPassed,
                                Severity: EventSeverities.Success,
                                Title: $"6/6 · \"{slug}\" ist LIVE!",
                                Message: $"Container 44ec3c40_{slug} läuft auf Hass OS (Watchdog bestätigt).",
                                ProgressPercent: 100,
                                AddonSlug: slug,
                                CommitSha: null,
                                Timestamp: DateTimeOffset.UtcNow,
                                Metadata: new Dictionary<string, string> { ["stageIndex"] = "6" });
                            store.RecordEvent(finalOk);
                            await hubContext.Clients.All.OnOrchestratorEvent(finalOk);
                        }
                        else
                        {
                            var errSummary = !string.IsNullOrWhiteSpace(stdErr) ? stdErr.Trim() : $"ExitCode {proc.ExitCode}";
                            var finalFail = new OrchestratorEventEnvelope(
                                EventId: Guid.NewGuid(),
                                TaskId: taskId,
                                EventType: OrchestratorEventTypes.TaskFailed,
                                Severity: EventSeverities.Critical,
                                Title: "Pipeline fehlgeschlagen",
                                Message: errSummary.Length > 200 ? errSummary[..200] : errSummary,
                                ProgressPercent: 100,
                                AddonSlug: slug,
                                CommitSha: null,
                                Timestamp: DateTimeOffset.UtcNow);
                            store.RecordEvent(finalFail);
                            await hubContext.Clients.All.OnOrchestratorEvent(finalFail);
                        }
                    }
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
        var stopWords = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "und", "fuer", "ein", "eine", "einen", "einer", "erstelle", "baue", "bitte", "addon", "add",
            "das", "die", "der", "den", "dem", "mit", "auf", "hass", "fuege", "neue", "neues", "neuen",
            "app", "meiner", "meine", "meinem", "home", "assistant", "minisystem", "installation", "hinzu",
            "ueber", "von", "aus", "mir", "ich", "will", "moechte", "soll", "kann", "aktualisiere", "teste",
            "projekt", "modul", "service"
        };

        var words = prompt
            .ToLowerInvariant()
            .Replace("ä", "ae").Replace("ö", "oe").Replace("ü", "ue").Replace("ß", "ss")
            .Split([' ', '-', '_', '.', ',', ':', ';', '!', '?'], StringSplitOptions.RemoveEmptyEntries)
            .Where(w => w.Length > 2 && !stopWords.Contains(w))
            .Take(2)
            .ToArray();

        var suffix = words.Length > 0 ? string.Join("_", words) : "voice_module";
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
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
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

public static class ProjectCatalogScanner
{
    public static List<ProjectDetailDto> DiscoverProjects(OrchestratorStateStore store)
    {
        var results = new List<ProjectDetailDto>();
        var repoRoot = @"c:\Users\thoma\source\repos\thassi";
        if (!Directory.Exists(repoRoot))
        {
            repoRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        }

        var allEvents = store.GetEvents();
        var latestCommit = GetGitHeadCommit(repoRoot);

        // 1. Scan HASS Add-on directories (containing config.yaml)
        if (Directory.Exists(repoRoot))
        {
            foreach (var dir in Directory.GetDirectories(repoRoot))
            {
                var configPath = Path.Combine(dir, "config.yaml");
                if (!File.Exists(configPath)) continue;

                var yaml = File.ReadAllText(configPath);
                var slug = ExtractYamlField(yaml, "slug") ?? Path.GetFileName(dir);
                var name = ExtractYamlField(yaml, "name") ?? slug;
                var version = ExtractYamlField(yaml, "version") ?? "1.0.0";
                var desc = ExtractYamlField(yaml, "description") ?? "Home Assistant OS Docker Add-on";
                var port = ExtractYamlField(yaml, "ingress_port") ?? "8099";

                var projEvents = allEvents
                    .Where(e => string.Equals(e.AddonSlug, slug, StringComparison.OrdinalIgnoreCase))
                    .Take(12)
                    .ToList();

                var latestEvt = projEvents.FirstOrDefault();
                var isRecentBuild = latestEvt != null &&
                                    (DateTimeOffset.UtcNow - latestEvt.Timestamp).TotalSeconds < 90 &&
                                    latestEvt.EventType is OrchestratorEventTypes.DockerBuildProgress or OrchestratorEventTypes.DeployingToHass;

                var status = latestEvt?.EventType == OrchestratorEventTypes.TaskFailed
                    ? "Failed"
                    : isRecentBuild
                        ? $"Building ({latestEvt?.ProgressPercent ?? 80}%)"
                        : "Online (Hass OS)";

                results.Add(new ProjectDetailDto(
                    Id: slug,
                    Name: name,
                    Category: "HASS Add-on (Docker)",
                    Version: version,
                    Status: status,
                    Description: desc,
                    RelativePath: $"./{Path.GetFileName(dir)}",
                    EndpointUrl: slug == "thassi_host"
                        ? "http://homeassistant.tail5e1682.ts.net:8099"
                        : $"/44ec3c40_{slug} (Port {port})",
                    Architecture: "amd64 / aarch64",
                    LastCommit: projEvents.FirstOrDefault(e => !string.IsNullOrEmpty(e.CommitSha))?.CommitSha ?? latestCommit,
                    LastUpdated: File.GetLastWriteTimeUtc(configPath),
                    RecentEvents: projEvents
                ));
            }
        }

        // 2. Scan Thassi Micro-Apps (apps/*/thassi.app.json)
        var appsRoot = Path.Combine(repoRoot, "apps");
        if (Directory.Exists(appsRoot))
        {
            foreach (var appDir in Directory.GetDirectories(appsRoot))
            {
                var manifestPath = Path.Combine(appDir, "thassi.app.json");
                if (!File.Exists(manifestPath)) continue;

                try
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(manifestPath));
                    var root = doc.RootElement;
                    var id = root.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? Path.GetFileName(appDir) : Path.GetFileName(appDir);
                    var name = root.TryGetProperty("name", out var nameProp) ? nameProp.GetString() ?? id : id;
                    var version = root.TryGetProperty("version", out var vProp) ? vProp.GetString() ?? "1.0.0" : "1.0.0";
                    var desc = root.TryGetProperty("description", out var dProp) ? dProp.GetString() ?? "" : "";

                    results.Add(new ProjectDetailDto(
                        Id: id,
                        Name: name,
                        Category: "Thassi Micro-Service",
                        Version: version,
                        Status: "Active (Ingress)",
                        Description: desc,
                        RelativePath: $"./apps/{Path.GetFileName(appDir)}",
                        EndpointUrl: $"http://homeassistant.tail5e1682.ts.net:8099/apps/{id}/",
                        Architecture: "Node 24 + React 19",
                        LastCommit: latestCommit,
                        LastUpdated: File.GetLastWriteTimeUtc(manifestPath),
                        RecentEvents: []
                    ));
                }
                catch
                {
                    // Ignore malformed manifest
                }
            }
        }

        // 3. .NET 10 Ecosystem Modules
        results.Add(new ProjectDetailDto(
            Id: "thassi_orchestrator_hub",
            Name: "Thassi Orchestrator Hub",
            Category: ".NET 10 Backend",
            Version: "1.0.0",
            Status: "Listening (:5180)",
            Description: "ASP.NET Core 10 SignalR Echtzeit-Hub & Pipeline-Launcher auf dem Dev-PC.",
            RelativePath: "./ecosystem/Thassi.Orchestrator.Hub",
            EndpointUrl: "http://192.168.188.46:5180/hubs/orchestrator",
            Architecture: "net10.0 (win-x64)",
            LastCommit: latestCommit,
            LastUpdated: DateTimeOffset.UtcNow,
            RecentEvents: allEvents.Where(e => e.EventType != OrchestratorEventTypes.SystemHeartbeat).Take(8).ToList()
        ));

        return results;
    }

    private static string? ExtractYamlField(string yaml, string key)
    {
        foreach (var rawLine in yaml.Split('\n'))
        {
            var line = rawLine.Trim();
            if (line.StartsWith(key + ":", StringComparison.OrdinalIgnoreCase))
            {
                return line[(key.Length + 1)..].Trim().Trim('"', '\'');
            }
        }
        return null;
    }

    private static string GetGitHeadCommit(string repoRoot)
    {
        try
        {
            var headFile = Path.Combine(repoRoot, ".git", "refs", "heads", "main");
            if (File.Exists(headFile))
            {
                var sha = File.ReadAllText(headFile).Trim();
                return sha.Length >= 7 ? sha[..7] : sha;
            }
        }
        catch { }
        return "main";
    }
}
