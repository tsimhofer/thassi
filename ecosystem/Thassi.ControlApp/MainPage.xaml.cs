using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR.Client;
using Thassi.Shared.Contracts;

namespace Thassi.ControlApp;

public partial class MainPage : ContentPage
{
    private HubConnection? _hubConnection;
    private readonly HttpClient _httpClient = new() { Timeout = TimeSpan.FromSeconds(8) };
    private readonly List<OrchestratorEventEnvelope> _events = new();
    private List<ProjectDetailDto> _projects = new();
    private ProjectDetailDto? _selectedProject;
    private string _activeApiBaseUrl = "http://192.168.188.46:5180";
    private bool _usingRelayFallback;
    private string _lastProjectsSignature = string.Empty;
    private bool _isPipelineActive;
    private const double AutoSendSilenceSeconds = 6.5;

    private static readonly string[] CandidateHubBases =
    [
        "http://192.168.188.46:5180",
        "http://127.0.0.1:5180",
        "http://homeassistant.tail5e1682.ts.net:8099/api/orchestrator",
        "http://192.168.188.92:8099/api/orchestrator"
    ];

    public MainPage()
    {
        InitializeComponent();
        SeedDefaultProjects();
        HookAndroidSpeechCallbacks();
        _ = InitializeConnectionAsync();
    }

    private void HookAndroidSpeechCallbacks()
    {
#if ANDROID
        Dispatcher.StartTimer(TimeSpan.FromMilliseconds(250), () =>
        {
            var activity = MainActivity.Instance;
            if (activity != null)
            {
                activity.OnLiveTranscriptChanged -= HandleLiveTranscriptChanged;
                activity.OnLiveTranscriptChanged += HandleLiveTranscriptChanged;

                activity.OnListeningStateChanged -= HandleListeningStateChanged;
                activity.OnListeningStateChanged += HandleListeningStateChanged;

                activity.OnWidgetVoiceRequested -= HandleWidgetVoiceRequested;
                activity.OnWidgetVoiceRequested += HandleWidgetVoiceRequested;

                if (activity.IsContinuousListening)
                {
                    var silenceSec = activity.GetSecondsSinceLastSpeech();
                    var currentText = RecognizedTextEditor.Text?.Trim() ?? string.Empty;

                    if (!string.IsNullOrWhiteSpace(currentText))
                    {
                        var remaining = Math.Max(0, AutoSendSilenceSeconds - silenceSec);
                        SilenceStatusLabel.Text = "Auto-Send nach Sprechpause...";
                        SilenceTimerLabel.Text = $"{remaining:0.0}s";
                        SilenceProgressBar.Progress = Math.Clamp(remaining / AutoSendSilenceSeconds, 0, 1);

                        if (remaining <= 0.05)
                        {
                            var finalSpoken = activity.StopContinuousListening();
                            var toSend = !string.IsNullOrWhiteSpace(finalSpoken) ? finalSpoken : currentText;
                            _ = SubmitPromptToOrchestratorAsync(toSend, _selectedProject?.Id);
                        }
                    }
                    else
                    {
                        SilenceStatusLabel.Text = "Hört kontinuierlich zu (sprich deinen Befehl)...";
                        SilenceTimerLabel.Text = "aktiv";
                        SilenceProgressBar.Progress = 1.0;
                    }
                }
            }
            return true;
        });
#endif
    }

    private void HandleLiveTranscriptChanged(string transcript, bool isListening)
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            VoiceWidgetExpandedBody.IsVisible = true;
            VoiceWidgetChevron.Text = "▾";
            if (!string.IsNullOrWhiteSpace(transcript))
            {
                RecognizedTextEditor.Text = transcript;
            }
        });
    }

    private void HandleListeningStateChanged(bool isListening)
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            SilenceCountdownSection.IsVisible = isListening;
            if (isListening)
            {
                VoiceWidgetExpandedBody.IsVisible = true;
                VoiceWidgetChevron.Text = "▾";
                VoiceOrbBorder.Stroke = Color.FromArgb("#38BDF8");
                VoiceOrbBorder.BackgroundColor = Color.FromArgb("#0F172A");
                VoiceBtn.Text = "⏹";
                VoiceHintLabel.Text = "Hört zu · Tippe ⏹ oder warte 6.5s zum Senden";
                VoiceHintLabel.TextColor = Color.FromArgb("#38BDF8");
                ListeningPulseDot.BackgroundColor = Color.FromArgb("#EF4444");
                VoiceWidgetTitleLabel.Text = "🔴 LIVE SPRACHERKENNUNG AKTIV";
                VoiceWidgetTitleLabel.TextColor = Color.FromArgb("#38BDF8");
                ToggleContinuousMicBtn.Text = "⏹ Stopp";
            }
            else
            {
                VoiceOrbBorder.Stroke = Color.FromArgb("#1E293B");
                VoiceOrbBorder.BackgroundColor = Color.FromArgb("#0B0F19");
                VoiceBtn.Text = "🎤";
                VoiceHintLabel.Text = "Tippen für Langzeit-Sprachsteuerung";
                VoiceHintLabel.TextColor = Color.FromArgb("#64748B");
                ListeningPulseDot.BackgroundColor = Color.FromArgb("#38BDF8");
                VoiceWidgetTitleLabel.Text = "SPRACH-WIDGET · ERKANNTER TEXT";
                VoiceWidgetTitleLabel.TextColor = Color.FromArgb("#94A3B8");
                ToggleContinuousMicBtn.Text = "🎤 Weiter";
            }
        });
    }

    private void HandleWidgetVoiceRequested()
    {
        MainThread.BeginInvokeOnMainThread(() =>
        {
            _selectedProject = null;
            ProjectDetailView.IsVisible = false;
            MinimalHomeView.IsVisible = true;
            VoiceWidgetExpandedBody.IsVisible = true;
            VoiceWidgetChevron.Text = "▾";
#if ANDROID
            MainActivity.Instance?.StartContinuousListening(RecognizedTextEditor.Text ?? string.Empty);
#endif
        });
    }

    private void SeedDefaultProjects()
    {
        _projects =
        [
            new ProjectDetailDto("thassi_host", "Thassi Main Dashboard", "HASS Add-on (Docker)", "1.0.6", "Online (Hass OS)",
                "Fullscreen Calendar-Centric Main Dashboard & Unified Hub", "./thassi_host", "http://homeassistant.tail5e1682.ts.net:8099", "amd64 / aarch64", "469457e", DateTimeOffset.UtcNow, []),
            new ProjectDetailDto("thassi_fuege_neue", "Thassi Fuege Neue", "HASS Add-on (Docker)", "1.0.0", "Online (Hass OS)",
                "Google Notizen Integration auf Home Assistant OS", "./thassi_fuege_neue", "/44ec3c40_thassi_fuege_neue", "amd64 / aarch64", "4150427", DateTimeOffset.UtcNow, []),
            new ProjectDetailDto("thassi_system_monitor", "Thassi System Monitor", "HASS Add-on (Docker)", "1.0.0", "Online (Hass OS)",
                "Live CPU/RAM Telemetrie & Healthcheck Add-on auf Hass OS", "./thassi_system_monitor", "/44ec3c40_thassi_system_monitor", "amd64 / aarch64", "0c0a2b1", DateTimeOffset.UtcNow, []),
            new ProjectDetailDto("google-calendar", "Google Calendar & Timeline", "Thassi Micro-Service", "1.0.0", "Active (Ingress)",
                "Bidirektionale Google Calendar Synchronisation & Zeitleiste", "./apps/google-calendar", "http://homeassistant.tail5e1682.ts.net:8099/apps/google-calendar/", "Node 24 + React 19", "469457e", DateTimeOffset.UtcNow, []),
            new ProjectDetailDto("google-health", "Google Health & Readiness", "Thassi Micro-Service", "1.0.0", "Active (Ingress)",
                "Pixel 10 Schritte, Herzfrequenz, Schlaf & Readiness Score", "./apps/google-health", "http://homeassistant.tail5e1682.ts.net:8099/apps/google-health/", "Node 24 + React 19", "469457e", DateTimeOffset.UtcNow, []),
            new ProjectDetailDto("finance-analytics", "Finance & Budget", "Thassi Micro-Service", "1.0.0", "Active (Ingress)",
                "Sparkasse George CSV-Analyse, Cashflow & Kategorien", "./apps/finance-analytics", "http://homeassistant.tail5e1682.ts.net:8099/apps/finance-analytics/", "Node 24 + React 19", "469457e", DateTimeOffset.UtcNow, []),
            new ProjectDetailDto("meal-planner", "Meal Planner", "Thassi Micro-Service", "1.0.0", "Active (Ingress)",
                "Tages-Ernährungsplan & Kalorien-Tracking", "./apps/meal-planner", "http://homeassistant.tail5e1682.ts.net:8099/apps/meal-planner/", "Node 24 + React 19", "469457e", DateTimeOffset.UtcNow, []),
            new ProjectDetailDto("smart-canvas", "Smart Control Canvas", "Thassi Micro-Service", "1.0.0", "Active (Ingress)",
                "Direkte Licht- und Szenensteuerung für Home Assistant", "./apps/smart-canvas", "http://homeassistant.tail5e1682.ts.net:8099/apps/smart-canvas/", "Node 24 + React 19", "469457e", DateTimeOffset.UtcNow, [])
        ];
        RenderProjectsMenu(force: true);
    }

    private async Task InitializeConnectionAsync()
    {
        UpdateConnectionBadge("verbinde...", "#F59E0B");

        foreach (var candidate in CandidateHubBases)
        {
            try
            {
                var probeUrl = candidate.EndsWith("/api/orchestrator", StringComparison.OrdinalIgnoreCase)
                    ? $"{candidate}/state"
                    : $"{candidate}/healthz";

                using var response = await _httpClient.GetAsync(probeUrl);
                if (response.IsSuccessStatusCode)
                {
                    _activeApiBaseUrl = candidate;
                    _usingRelayFallback = candidate.EndsWith("/api/orchestrator", StringComparison.OrdinalIgnoreCase);
                    break;
                }
            }
            catch
            {
                // Continue probing
            }
        }

        if (!_usingRelayFallback)
        {
            await ConnectSignalRAsync(_activeApiBaseUrl);
        }
        else
        {
            UpdateConnectionBadge("tailscale", "#10B981");
        }

        await FetchStateAndProjectsAsync();

        // Fast 2-second status sync loop so pipeline state is 100% reliable even across network hops
        Dispatcher.StartTimer(TimeSpan.FromSeconds(2), () =>
        {
            _ = FetchStateAndProjectsAsync();
            return true;
        });
    }

    private async Task ConnectSignalRAsync(string baseUrl)
    {
        try
        {
            _hubConnection = new HubConnectionBuilder()
                .WithUrl($"{baseUrl}/hubs/orchestrator")
                .WithAutomaticReconnect()
                .Build();

            _hubConnection.On<OrchestratorEventEnvelope>("OnOrchestratorEvent", envelope =>
            {
                MainThread.BeginInvokeOnMainThread(() => AddOrUpdateEvent(envelope));
            });

            _hubConnection.On<List<ActiveTaskSummary>, List<OrchestratorEventEnvelope>>("OnTaskSnapshot", (_, recentEvents) =>
            {
                MainThread.BeginInvokeOnMainThread(() =>
                {
                    foreach (var ev in Enumerable.Reverse(recentEvents))
                    {
                        AddOrUpdateEvent(ev, refreshDetail: false);
                    }
                    if (_selectedProject != null) RenderProjectDetail(_selectedProject);
                });
            });

            await _hubConnection.StartAsync();
            UpdateConnectionBadge("live", "#10B981");
        }
        catch
        {
            _usingRelayFallback = true;
            _activeApiBaseUrl = "http://homeassistant.tail5e1682.ts.net:8099/api/orchestrator";
            UpdateConnectionBadge("relay", "#38BDF8");
        }
    }

    private async Task FetchStateAndProjectsAsync()
    {
        try
        {
            var stateUrl = _usingRelayFallback
                ? $"{_activeApiBaseUrl}/state"
                : $"{_activeApiBaseUrl}/api/state";

            using var resp = await _httpClient.GetAsync(stateUrl);
            if (!resp.IsSuccessStatusCode) return;

            var json = await resp.Content.ReadAsStringAsync();
            using var doc = JsonDocument.Parse(json);
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

            if (doc.RootElement.TryGetProperty("projects", out var projProp) &&
                projProp.ValueKind == JsonValueKind.Array)
            {
                var discovered = JsonSerializer.Deserialize<List<ProjectDetailDto>>(projProp.GetRawText(), options);
                if (discovered is { Count: > 0 })
                {
                    MainThread.BeginInvokeOnMainThread(() =>
                    {
                        _projects = discovered;
                        RenderProjectsMenu(force: false);
                        if (_selectedProject != null)
                        {
                            var updated = _projects.FirstOrDefault(p => p.Id == _selectedProject.Id);
                            if (updated != null) RenderProjectDetail(updated);
                        }
                    });
                }
            }

            if (doc.RootElement.TryGetProperty("recentEvents", out var eventsProp) &&
                eventsProp.ValueKind == JsonValueKind.Array)
            {
                var list = JsonSerializer.Deserialize<List<OrchestratorEventEnvelope>>(eventsProp.GetRawText(), options);
                if (list != null)
                {
                    MainThread.BeginInvokeOnMainThread(() =>
                    {
                        foreach (var ev in Enumerable.Reverse(list))
                        {
                            AddOrUpdateEvent(ev, refreshDetail: false);
                        }
                        if (_selectedProject != null) RenderProjectDetail(_selectedProject);
                    });
                }
            }
        }
        catch
        {
            // Ignore transient polling failures
        }
    }

    private void AddOrUpdateEvent(OrchestratorEventEnvelope ev, bool refreshDetail = true)
    {
        if (ev.EventType == OrchestratorEventTypes.SystemHeartbeat)
            return;

        if (_events.Any(e => e.EventId == ev.EventId))
            return;

        _events.Insert(0, ev);
        if (_events.Count > 60)
            _events.RemoveAt(_events.Count - 1);

        // If this event carries a raw voice transcript and the editor is empty, populate it!
        if (ev.EventType == OrchestratorEventTypes.VoiceCommandReceived &&
            string.IsNullOrWhiteSpace(RecognizedTextEditor.Text) &&
            ev.Metadata != null &&
            ev.Metadata.TryGetValue("rawTranscript", out var rawTranscript))
        {
            RecognizedTextEditor.Text = rawTranscript;
        }

        UpdateStatusPipelineUI(ev);

        if (refreshDetail && _selectedProject != null)
        {
            RenderProjectDetail(_selectedProject);
        }
    }

    private void UpdateStatusPipelineUI(OrchestratorEventEnvelope ev)
    {
        var pct = Math.Clamp(ev.ProgressPercent ?? 100, 0, 100);
        var isFailed = ev.EventType is OrchestratorEventTypes.TaskFailed or OrchestratorEventTypes.RollbackTriggered;
        var isCompleted = ev.EventType == OrchestratorEventTypes.TestsPassed || pct >= 100;
        _isPipelineActive = !isCompleted && !isFailed;

        MinimalProgressBar.Progress = pct / 100.0;
        MinimalProgressBar.ProgressColor = isFailed
            ? Color.FromArgb("#EF4444")
            : isCompleted
                ? Color.FromArgb("#10B981")
                : Color.FromArgb("#38BDF8");

        PipelinePercentBadge.Text = isFailed
            ? "FEHLER"
            : isCompleted
                ? $"100% · LIVE ({ev.AddonSlug ?? "OK"})"
                : $"{pct}% · AKTIV ({ev.AddonSlug ?? "Pipeline"})";
        PipelinePercentBadge.TextColor = isFailed
            ? Color.FromArgb("#EF4444")
            : isCompleted
                ? Color.FromArgb("#10B981")
                : Color.FromArgb("#38BDF8");

        PrimaryStateLabel.Text = ev.Title;
        SecondarySubLabel.Text = ev.Message;

        var activeStage = ev.EventType switch
        {
            OrchestratorEventTypes.VoiceCommandReceived or OrchestratorEventTypes.TaskStarted or OrchestratorEventTypes.PreflightChecked => 1,
            OrchestratorEventTypes.RepoCreated => 2,
            OrchestratorEventTypes.CodeGenProgress => 3,
            OrchestratorEventTypes.CodePushed => 4,
            OrchestratorEventTypes.DeployingToHass or OrchestratorEventTypes.DockerBuildProgress => 5,
            OrchestratorEventTypes.SmokeTestRunning or OrchestratorEventTypes.TestsPassed => 6,
            _ => isCompleted ? 6 : 1
        };

        var bars = new[] { StageBar1, StageBar2, StageBar3, StageBar4, StageBar5, StageBar6 };
        var lbls = new[] { StageLbl1, StageLbl2, StageLbl3, StageLbl4, StageLbl5, StageLbl6 };

        for (int i = 0; i < 6; i++)
        {
            int stageNum = i + 1;
            if (isFailed && stageNum == activeStage)
            {
                bars[i].BackgroundColor = Color.FromArgb("#EF4444");
                lbls[i].TextColor = Color.FromArgb("#EF4444");
            }
            else if (isCompleted || stageNum < activeStage)
            {
                bars[i].BackgroundColor = Color.FromArgb("#10B981");
                lbls[i].TextColor = Color.FromArgb("#10B981");
            }
            else if (stageNum == activeStage)
            {
                bars[i].BackgroundColor = Color.FromArgb("#38BDF8");
                lbls[i].TextColor = Color.FromArgb("#38BDF8");
            }
            else
            {
                bars[i].BackgroundColor = Color.FromArgb("#1E293B");
                lbls[i].TextColor = Color.FromArgb("#475569");
            }
        }

        // Render latest 3 pipeline steps with timestamps for crystal-clear feedback
        LivePipelineFeedStack.Children.Clear();
        foreach (var recent in _events.Take(3))
        {
            var color = recent.EventType == OrchestratorEventTypes.TaskFailed
                ? "#EF4444"
                : recent.EventType == OrchestratorEventTypes.TestsPassed
                    ? "#10B981"
                    : "#94A3B8";

            LivePipelineFeedStack.Children.Add(new Label
            {
                Text = $"{recent.Timestamp.ToLocalTime():HH:mm:ss} · {recent.Title} ({recent.ProgressPercent ?? 100}%)",
                FontSize = 10,
                TextColor = Color.FromArgb(color),
                LineBreakMode = LineBreakMode.TailTruncation
            });
        }

#if ANDROID
        if (MainActivity.Instance != null)
        {
            ThassiWidgetProvider.UpdateWidgetState(
                MainActivity.Instance,
                recognizedText: RecognizedTextEditor.Text,
                stageTitle: isFailed ? $"⚠️ {ev.Title}" : isCompleted ? $"● {ev.Title}" : $"⚡ {ev.Title} ({pct}%)",
                pipelineDetail: ev.Message,
                progressPercent: pct);
        }
#endif
    }

    private void RenderProjectsMenu(bool force)
    {
        var sig = string.Join("|", _projects.Select(p => $"{p.Id}:{p.Version}:{p.Status}"));
        if (!force && sig == _lastProjectsSignature)
            return;
        _lastProjectsSignature = sig;

        ProjectsMenuStack.Children.Clear();
        string? lastCategory = null;

        foreach (var proj in _projects)
        {
            if (proj.Category != lastCategory)
            {
                lastCategory = proj.Category;
                ProjectsMenuStack.Children.Add(new Label
                {
                    Text = proj.Category.ToUpperInvariant(),
                    FontSize = 9,
                    CharacterSpacing = 1.2,
                    TextColor = Color.FromArgb("#475569"),
                    Margin = new Thickness(0, 12, 0, 4)
                });
            }

            var itemContainer = new Border
            {
                BackgroundColor = Color.FromArgb("#080C17"),
                StrokeThickness = 0,
                Padding = new Thickness(10, 8),
                StrokeShape = new Microsoft.Maui.Controls.Shapes.RoundRectangle { CornerRadius = 8 }
            };

            var row = new Grid
            {
                ColumnDefinitions =
                {
                    new ColumnDefinition { Width = GridLength.Star },
                    new ColumnDefinition { Width = GridLength.Auto }
                }
            };

            var titleStack = new VerticalStackLayout { Spacing = 2, InputTransparent = true };
            titleStack.Children.Add(new Label
            {
                Text = proj.Name,
                FontSize = 13,
                TextColor = Color.FromArgb("#F1F5F9"),
                InputTransparent = true
            });
            titleStack.Children.Add(new Label
            {
                Text = $"{proj.Id} · v{proj.Version}",
                FontSize = 10,
                TextColor = Color.FromArgb("#64748B"),
                InputTransparent = true
            });

            var dot = new Border
            {
                WidthRequest = 7,
                HeightRequest = 7,
                StrokeThickness = 0,
                StrokeShape = new Microsoft.Maui.Controls.Shapes.RoundRectangle { CornerRadius = 3.5f },
                VerticalOptions = LayoutOptions.Center,
                InputTransparent = true,
                BackgroundColor = proj.Status.Contains("Fail", StringComparison.OrdinalIgnoreCase)
                    ? Color.FromArgb("#EF4444")
                    : proj.Status.Contains("Build", StringComparison.OrdinalIgnoreCase)
                        ? Color.FromArgb("#38BDF8")
                        : Color.FromArgb("#10B981")
            };

            var hitButton = new Button
            {
                BackgroundColor = Colors.Transparent,
                BorderWidth = 0,
                Padding = Thickness.Zero,
                Margin = Thickness.Zero,
                HorizontalOptions = LayoutOptions.Fill,
                VerticalOptions = LayoutOptions.Fill
            };
            var captured = proj;
            hitButton.Clicked += (_, _) =>
            {
                ProjectsMenuOverlay.IsVisible = false;
                RenderProjectDetail(captured);
            };

            row.Add(titleStack, 0, 0);
            row.Add(dot, 1, 0);
            row.Add(hitButton, 0, 0);
            Grid.SetColumnSpan(hitButton, 2);
            itemContainer.Content = row;

            ProjectsMenuStack.Children.Add(itemContainer);
        }
    }

    private void RenderProjectDetail(ProjectDetailDto proj)
    {
        _selectedProject = proj;
        MinimalHomeView.IsVisible = false;
        ProjectDetailView.IsVisible = true;

        DetailNameLabel.Text = proj.Name;
        DetailVersionBadge.Text = $"v{proj.Version}";
        DetailDescriptionLabel.Text = proj.Description;
        DetailStatusLabel.Text = proj.Status;
        DetailCategoryLabel.Text = proj.Category;
        DetailArchLabel.Text = proj.Architecture;
        DetailPathCommitLabel.Text = $"{proj.RelativePath}  ·  commit {proj.LastCommit}";
        DetailEndpointLabel.Text = proj.EndpointUrl;

        DetailEventsStack.Children.Clear();
        var matchingEvents = _events
            .Where(e => string.Equals(e.AddonSlug, proj.Id, StringComparison.OrdinalIgnoreCase))
            .Concat(proj.RecentEvents)
            .DistinctBy(e => e.EventId)
            .OrderByDescending(e => e.Timestamp)
            .Take(10)
            .ToList();

        if (matchingEvents.Count == 0)
        {
            DetailEventsStack.Children.Add(new Label
            {
                Text = "Keine aktuellen Pipeline-Events für dieses Projekt.",
                FontSize = 12,
                TextColor = Color.FromArgb("#475569")
            });
            return;
        }

        foreach (var ev in matchingEvents)
        {
            var row = new VerticalStackLayout { Spacing = 2 };
            row.Children.Add(new Label
            {
                Text = $"{ev.Timestamp.ToLocalTime():HH:mm:ss}  ·  {ev.EventType} ({ev.ProgressPercent ?? 100}%)",
                FontSize = 10,
                TextColor = Color.FromArgb("#38BDF8")
            });
            row.Children.Add(new Label
            {
                Text = ev.Message,
                FontSize = 12,
                TextColor = Color.FromArgb("#CBD5E1")
            });
            DetailEventsStack.Children.Add(row);
        }
    }

    private void OnToggleVoiceWidgetExpand(object? sender, TappedEventArgs e)
    {
        VoiceWidgetExpandedBody.IsVisible = !VoiceWidgetExpandedBody.IsVisible;
        VoiceWidgetChevron.Text = VoiceWidgetExpandedBody.IsVisible ? "▾" : "▸";
    }

    private void OnToggleMenuClicked(object? sender, EventArgs e)
    {
        ProjectsMenuOverlay.IsVisible = !ProjectsMenuOverlay.IsVisible;
    }

    private void OnCloseProjectDetailClicked(object? sender, EventArgs e)
    {
        _selectedProject = null;
        ProjectDetailView.IsVisible = false;
        MinimalHomeView.IsVisible = true;
    }

    private async void OnDetailRedeployClicked(object? sender, EventArgs e)
    {
        if (_selectedProject == null) return;
        await SubmitPromptToOrchestratorAsync(
            $"Aktualisiere, baue und teste das Projekt {_selectedProject.Id} auf Hass OS",
            _selectedProject.Id);
    }

    private async void OnDetailOpenEndpointClicked(object? sender, EventArgs e)
    {
        if (_selectedProject == null) return;
        var url = _selectedProject.EndpointUrl.StartsWith("http", StringComparison.OrdinalIgnoreCase)
            ? _selectedProject.EndpointUrl
            : "http://homeassistant.tail5e1682.ts.net:8099";
        try
        {
            await Launcher.Default.OpenAsync(url);
        }
        catch { }
    }

    private void UpdateConnectionBadge(string text, string hexColor)
    {
        ConnectionStatusLabel.Text = text;
        ConnectionDot.BackgroundColor = Color.FromArgb(hexColor);
    }

    private void OnVoiceButtonClicked(object? sender, EventArgs e)
    {
        VoiceWidgetExpandedBody.IsVisible = true;
        VoiceWidgetChevron.Text = "▾";

#if ANDROID
        var activity = MainActivity.Instance;
        if (activity != null)
        {
            if (activity.IsContinuousListening)
            {
                activity.StopContinuousListening();
            }
            else
            {
                activity.StartContinuousListening(RecognizedTextEditor.Text ?? string.Empty);
            }
            return;
        }
#endif
        RecognizedTextEditor.Focus();
    }

    private async void OnSendRecognizedClicked(object? sender, EventArgs e)
    {
#if ANDROID
        MainActivity.Instance?.StopContinuousListening();
#endif
        var spoken = RecognizedTextEditor.Text?.Trim();
        if (string.IsNullOrWhiteSpace(spoken))
        {
            RecognizedTextEditor.Focus();
            return;
        }
        await SubmitPromptToOrchestratorAsync(spoken, _selectedProject?.Id);
    }

    private void OnClearRecognizedClicked(object? sender, EventArgs e)
    {
#if ANDROID
        MainActivity.Instance?.StopContinuousListening();
#endif
        RecognizedTextEditor.Text = string.Empty;
    }

    private void OnPinWidgetClicked(object? sender, EventArgs e)
    {
        ProjectsMenuOverlay.IsVisible = false;
#if ANDROID
        var pinned = MainActivity.Instance?.RequestPinHomeWidget() ?? false;
        if (!pinned)
        {
            PrimaryStateLabel.Text = "Home-Screen Widget bereit";
            SecondarySubLabel.Text = "Halte auf dem Pixel 10 Startbildschirm gedrückt → Widgets → Thassi wählen.";
        }
#endif
    }

    private async void OnDeployClicked(object? sender, EventArgs e)
    {
        var prompt = PromptEntry.Text?.Trim();
        if (string.IsNullOrWhiteSpace(prompt)) return;
        PromptEntry.Text = string.Empty;
        RecognizedTextEditor.Text = prompt;
        await SubmitPromptToOrchestratorAsync(prompt, _selectedProject?.Id);
    }

    private async Task SubmitPromptToOrchestratorAsync(string prompt, string? suggestedSlug = null)
    {
        try
        {
            DeployBtn.IsEnabled = false;
            SendRecognizedBtn.IsEnabled = false;
            PrimaryStateLabel.Text = "0/6 · Starte Antigravity Pipeline...";
            SecondarySubLabel.Text = $"\"{prompt}\"";
            PipelinePercentBadge.Text = "5% · START";
            PipelinePercentBadge.TextColor = Color.FromArgb("#38BDF8");
            MinimalProgressBar.Progress = 0.05;
            MinimalProgressBar.ProgressColor = Color.FromArgb("#38BDF8");

            var req = new SubmitPromptRequest(
                Prompt: prompt,
                DeviceName: DeviceInfo.Current.Model,
                SuggestedAddonSlug: suggestedSlug);

            if (_hubConnection is { State: HubConnectionState.Connected })
            {
                await _hubConnection.InvokeAsync<ActiveTaskSummary>("SubmitPromptCommand", req);
            }
            else
            {
                var submitUrl = _usingRelayFallback
                    ? $"{_activeApiBaseUrl}/submit"
                    : $"{_activeApiBaseUrl}/api/tasks/submit";
                await _httpClient.PostAsJsonAsync(submitUrl, req);
            }

            await FetchStateAndProjectsAsync();
        }
        catch (Exception ex)
        {
            PrimaryStateLabel.Text = "Verbindungsfehler";
            SecondarySubLabel.Text = ex.Message;
        }
        finally
        {
            DeployBtn.IsEnabled = true;
            SendRecognizedBtn.IsEnabled = true;
        }
    }

    private async void OnRefreshClicked(object? sender, EventArgs e)
    {
        await FetchStateAndProjectsAsync();
        RenderProjectsMenu(force: true);
    }
}
