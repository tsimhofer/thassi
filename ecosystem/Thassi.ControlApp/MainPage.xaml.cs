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
    private string _activeApiBaseUrl = "http://192.168.188.46:5180";
    private bool _usingRelayFallback;

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
        DeviceBadgeLabel.Text = $"{DeviceInfo.Current.Model} ({DeviceInfo.Current.Platform})";
        HorizonWebView.Source = "http://homeassistant.tail5e1682.ts.net:8099";
        _ = InitializeConnectionAsync();
    }

    private async Task InitializeConnectionAsync()
    {
        UpdateConnectionBadge("Suche SignalR Hub (LAN / Tailscale)...", "#F59E0B");

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
                // Continue probing next endpoint
            }
        }

        if (!_usingRelayFallback)
        {
            await ConnectSignalRAsync(_activeApiBaseUrl);
        }
        else
        {
            UpdateConnectionBadge($"Verbunden via Tailscale/Hass-Relay ({_activeApiBaseUrl})", "#10B981");
        }

        await FetchInitialStateAsync();
        StartBackgroundSyncTimer();
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
                        AddOrUpdateEvent(ev, renderImmediately: false);
                    }
                    RenderEventsList();
                });
            });

            _hubConnection.Reconnecting += _ =>
            {
                MainThread.BeginInvokeOnMainThread(() =>
                    UpdateConnectionBadge("SignalR verbindet neu...", "#F59E0B"));
                return Task.CompletedTask;
            };

            _hubConnection.Reconnected += _ =>
            {
                MainThread.BeginInvokeOnMainThread(() =>
                    UpdateConnectionBadge($"Live verbunden ({baseUrl})", "#10B981"));
                return Task.CompletedTask;
            };

            await _hubConnection.StartAsync();
            UpdateConnectionBadge($"SignalR Live ({baseUrl})", "#10B981");
        }
        catch (Exception ex)
        {
            _usingRelayFallback = true;
            _activeApiBaseUrl = "http://homeassistant.tail5e1682.ts.net:8099/api/orchestrator";
            UpdateConnectionBadge($"Tailscale Relay aktiv ({ex.GetType().Name})", "#38BDF8");
        }
    }

    private void StartBackgroundSyncTimer()
    {
        Dispatcher.StartTimer(TimeSpan.FromSeconds(3), () =>
        {
            _ = FetchInitialStateAsync();
            return true;
        });
    }

    private async Task FetchInitialStateAsync()
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
            if (doc.RootElement.TryGetProperty("recentEvents", out var eventsProp) &&
                eventsProp.ValueKind == JsonValueKind.Array)
            {
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var list = JsonSerializer.Deserialize<List<OrchestratorEventEnvelope>>(eventsProp.GetRawText(), options);
                if (list != null)
                {
                    MainThread.BeginInvokeOnMainThread(() =>
                    {
                        foreach (var ev in Enumerable.Reverse(list))
                        {
                            AddOrUpdateEvent(ev, renderImmediately: false);
                        }
                        RenderEventsList();
                    });
                }
            }
        }
        catch
        {
            // Ignore transient polling failures
        }
    }

    private void AddOrUpdateEvent(OrchestratorEventEnvelope envelope, bool renderImmediately = true)
    {
        if (_events.Any(e => e.EventId == envelope.EventId))
            return;

        _events.Insert(0, envelope);
        if (_events.Count > 50)
            _events.RemoveAt(_events.Count - 1);

        UpdatePipelineStepper(envelope);
        if (renderImmediately)
        {
            RenderEventsList();
        }
    }

    private void UpdatePipelineStepper(OrchestratorEventEnvelope ev)
    {
        ActiveTaskTitleLabel.Text = string.IsNullOrWhiteSpace(ev.AddonSlug)
            ? $"TASK {ev.TaskId.ToString()[..8]}"
            : $"ADD-ON: {ev.AddonSlug.ToUpperInvariant()}";

        var pct = Math.Clamp(ev.ProgressPercent ?? 0, 0, 100);
        TaskProgressBar.Progress = pct / 100.0;
        ProgressPercentLabel.Text = $"{pct}% · {ev.EventType}";
        CurrentStageDetailLabel.Text = $"{ev.Title}: {ev.Message}";

        SetStageColor(Stage1Box, pct >= 10, ev.Severity);
        SetStageColor(Stage2Box, pct >= 25, ev.Severity);
        SetStageColor(Stage3Box, pct >= 50, ev.Severity);
        SetStageColor(Stage4Box, pct >= 70, ev.Severity);
        SetStageColor(Stage5Box, pct >= 90, ev.Severity);
    }

    private static void SetStageColor(Border box, bool active, string severity)
    {
        if (!active)
        {
            box.BackgroundColor = Color.FromArgb("#1E293B");
            return;
        }

        box.BackgroundColor = severity.ToLowerInvariant() switch
        {
            "critical" or "error" => Color.FromArgb("#991B1B"),
            "warning" or "warn" => Color.FromArgb("#92400E"),
            "success" => Color.FromArgb("#065F46"),
            _ => Color.FromArgb("#0284C7")
        };
    }

    private void RenderEventsList()
    {
        EventsStackLayout.Children.Clear();
        if (_events.Count == 0)
        {
            EventsStackLayout.Children.Add(new Label
            {
                Text = "Noch keine Pipeline-Events empfangen. Starte einen Befehl oben!",
                FontSize = 12,
                TextColor = Color.FromArgb("#64748B")
            });
            return;
        }

        foreach (var ev in _events.Take(20))
        {
            var badgeColor = ev.Severity.ToLowerInvariant() switch
            {
                "success" => "#10B981",
                "warning" or "warn" => "#F59E0B",
                "critical" or "error" => "#EF4444",
                _ => "#38BDF8"
            };

            var card = new Border
            {
                BackgroundColor = Color.FromArgb("#162032"),
                Stroke = Color.FromArgb("#1E293B"),
                StrokeThickness = 1,
                Padding = new Thickness(10, 8),
                StrokeShape = new Microsoft.Maui.Controls.Shapes.RoundRectangle { CornerRadius = 8 }
            };

            var stack = new VerticalStackLayout { Spacing = 3 };
            var headerGrid = new Grid
            {
                ColumnDefinitions =
                {
                    new ColumnDefinition { Width = GridLength.Auto },
                    new ColumnDefinition { Width = GridLength.Star },
                    new ColumnDefinition { Width = GridLength.Auto }
                },
                ColumnSpacing = 6
            };

            var typeLabel = new Label
            {
                Text = ev.EventType,
                FontSize = 11,
                FontAttributes = FontAttributes.Bold,
                TextColor = Color.FromArgb(badgeColor)
            };
            var slugLabel = new Label
            {
                Text = string.IsNullOrEmpty(ev.AddonSlug) ? ev.Title : $"[{ev.AddonSlug}] {ev.Title}",
                FontSize = 11,
                TextColor = Color.FromArgb("#94A3B8")
            };
            var timeLabel = new Label
            {
                Text = ev.Timestamp.ToLocalTime().ToString("HH:mm:ss"),
                FontSize = 10,
                TextColor = Color.FromArgb("#64748B")
            };

            headerGrid.Add(typeLabel, 0, 0);
            headerGrid.Add(slugLabel, 1, 0);
            headerGrid.Add(timeLabel, 2, 0);

            var msgLabel = new Label
            {
                Text = ev.Message,
                FontSize = 12,
                TextColor = Color.FromArgb("#F1F5F9")
            };

            stack.Children.Add(headerGrid);
            stack.Children.Add(msgLabel);

            if (!string.IsNullOrWhiteSpace(ev.CommitSha))
            {
                stack.Children.Add(new Label
                {
                    Text = $"Git Commit: {ev.CommitSha}",
                    FontSize = 10,
                    TextColor = Color.FromArgb("#94A3B8")
                });
            }

            card.Content = stack;
            EventsStackLayout.Children.Add(card);
        }
    }

    private void UpdateConnectionBadge(string text, string hexColor)
    {
        ConnectionStatusLabel.Text = text;
        ConnectionDot.Color = Color.FromArgb(hexColor);
    }

    private async void OnVoiceButtonClicked(object? sender, EventArgs e)
    {
#if ANDROID
        var spoken = await (MainActivity.Instance?.RecognizeSpeechAsync() ?? Task.FromResult<string?>(null));
        if (!string.IsNullOrWhiteSpace(spoken))
        {
            PromptEntry.Text = spoken;
            await SubmitPromptToOrchestratorAsync(spoken);
            return;
        }
#endif
        PromptEntry.Focus();
    }

    private async void OnDeployClicked(object? sender, EventArgs e)
    {
        var prompt = PromptEntry.Text?.Trim();
        if (string.IsNullOrWhiteSpace(prompt))
        {
            prompt = "Erstelle und deploye ein neues HASS Add-on thassi_system_monitor mit Live Healthcheck";
            PromptEntry.Text = prompt;
        }

        await SubmitPromptToOrchestratorAsync(prompt);
    }

    private async void OnPresetSystemMonitorClicked(object? sender, EventArgs e)
    {
        const string prompt = "Erstelle und deploye das HASS Add-on thassi_system_monitor mit CPU/RAM Telemetrie auf Hass OS";
        PromptEntry.Text = prompt;
        await SubmitPromptToOrchestratorAsync(prompt);
    }

    private async void OnPresetEnergyPulseClicked(object? sender, EventArgs e)
    {
        const string prompt = "Erstelle und deploye das HASS Add-on thassi_energy_pulse für Echtzeit-Stromverbrauch auf Hass OS";
        PromptEntry.Text = prompt;
        await SubmitPromptToOrchestratorAsync(prompt);
    }

    private async void OnPresetSmokeTestClicked(object? sender, EventArgs e)
    {
        const string prompt = "Synchronisiere GitHub Repository, aktualisiere thassi_system_monitor und führe Smoke-Tests auf 192.168.188.92 aus";
        PromptEntry.Text = prompt;
        await SubmitPromptToOrchestratorAsync(prompt);
    }

    private async Task SubmitPromptToOrchestratorAsync(string prompt)
    {
        try
        {
            DeployBtn.IsEnabled = false;
            DeployBtn.Text = "⏳ Läuft...";
            CurrentStageDetailLabel.Text = $"Sende Auftrag: \"{prompt}\"...";

            var req = new SubmitPromptRequest(
                Prompt: prompt,
                DeviceName: $"{DeviceInfo.Current.Model} ({DeviceInfo.Current.Platform})");

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

            await FetchInitialStateAsync();
        }
        catch (Exception ex)
        {
            CurrentStageDetailLabel.Text = $"Fehler beim Senden: {ex.Message}";
        }
        finally
        {
            DeployBtn.IsEnabled = true;
            DeployBtn.Text = "🚀 Start";
        }
    }

    private async void OnRefreshClicked(object? sender, EventArgs e)
    {
        await FetchInitialStateAsync();
    }

    private void OnShowPipelineClicked(object? sender, EventArgs e)
    {
        PipelineScrollView.IsVisible = true;
        HorizonContainer.IsVisible = false;
        TabPipelineBtn.BackgroundColor = Color.FromArgb("#0284C7");
        TabPipelineBtn.TextColor = Colors.White;
        TabHorizonBtn.BackgroundColor = Color.FromArgb("#1E293B");
        TabHorizonBtn.TextColor = Color.FromArgb("#94A3B8");
    }

    private void OnShowHorizonClicked(object? sender, EventArgs e)
    {
        PipelineScrollView.IsVisible = false;
        HorizonContainer.IsVisible = true;
        TabHorizonBtn.BackgroundColor = Color.FromArgb("#0284C7");
        TabHorizonBtn.TextColor = Colors.White;
        TabPipelineBtn.BackgroundColor = Color.FromArgb("#1E293B");
        TabPipelineBtn.TextColor = Color.FromArgb("#94A3B8");
    }
}
