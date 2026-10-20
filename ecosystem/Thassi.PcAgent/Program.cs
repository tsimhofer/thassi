using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Net.Http.Headers;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows.Forms;
using Microsoft.Win32;

// Ensure DPI awareness so Screen.AllScreens and CopyFromScreen capture true native pixel resolution across all 3 monitors
NativeWin32.SetProcessDPIAware();

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://*:5185");

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

builder.Services.AddSingleton<PcTelemetryService>();
builder.Services.AddHostedService<HaSyncBackgroundService>();

var app = builder.Build();
app.UseCors();

// ============================================================================
// 1. HEALTH & FULL TELEMETRY STATUS
// ============================================================================
app.MapGet("/healthz", (PcTelemetryService telemetry) =>
{
    var snap = telemetry.CollectSnapshot();
    return Results.Ok(new
    {
        status = "online",
        service = "Thassi.PcAgent",
        hostname = snap.Hostname,
        username = snap.Username,
        ip = snap.IpAddress,
        mac = snap.MacAddress,
        uptimeSeconds = snap.UptimeSeconds,
        timestamp = DateTimeOffset.UtcNow
    });
});

app.MapGet("/api/status", (PcTelemetryService telemetry) =>
{
    return Results.Ok(telemetry.CollectSnapshot());
});

// ============================================================================
// 2. POWER & MONITOR CONTROL (Shutdown, Reboot, Sleep, Hibernate, Lock, DPMS)
// ============================================================================
app.MapPost("/api/power", (PowerControlRequest req) =>
{
    var action = (req.Action ?? "status").Trim().ToLowerInvariant();
    var delaySec = Math.Clamp(req.DelaySeconds ?? 3, 0, 3600);

    switch (action)
    {
        case "shutdown":
        case "poweroff":
        case "off":
            Process.Start(new ProcessStartInfo("shutdown.exe", $"/s /t {delaySec} /f")
            {
                CreateNoWindow = true,
                UseShellExecute = false
            });
            return Results.Ok(new { ok = true, action = "shutdown", message = $"Shutdown scheduled in {delaySec}s" });

        case "abort_shutdown":
        case "cancel":
            Process.Start(new ProcessStartInfo("shutdown.exe", "/a")
            {
                CreateNoWindow = true,
                UseShellExecute = false
            });
            return Results.Ok(new { ok = true, action = "abort_shutdown", message = "Pending shutdown aborted" });

        case "reboot":
        case "restart":
            Process.Start(new ProcessStartInfo("shutdown.exe", $"/r /t {delaySec} /f")
            {
                CreateNoWindow = true,
                UseShellExecute = false
            });
            return Results.Ok(new { ok = true, action = "reboot", message = $"Reboot scheduled in {delaySec}s" });

        case "sleep":
        case "standby":
        case "suspend":
            Task.Run(async () =>
            {
                await Task.Delay(400);
                NativeWin32.SetSuspendState(false, true, false);
            });
            return Results.Ok(new { ok = true, action = "sleep", message = "Entering S3 Standby / Modern Standby" });

        case "hibernate":
            Task.Run(async () =>
            {
                await Task.Delay(400);
                NativeWin32.SetSuspendState(true, true, false);
            });
            return Results.Ok(new { ok = true, action = "hibernate", message = "Entering S4 Hibernate" });

        case "lock":
            NativeWin32.LockWorkStation();
            return Results.Ok(new { ok = true, action = "lock", message = "Workstation locked" });

        case "logoff":
            NativeWin32.ExitWindowsEx(0, 0);
            return Results.Ok(new { ok = true, action = "logoff", message = "User session logging off" });

        case "monitors_off":
            NativeWin32.SendMessage(0xFFFF, 0x0112, 0xF170, 2); // WM_SYSCOMMAND, SC_MONITORPOWER, 2 (Off)
            return Results.Ok(new { ok = true, action = "monitors_off", message = "Displays powered off" });

        case "monitors_on":
        case "wake_monitors":
            NativeWin32.SendMessage(0xFFFF, 0x0112, 0xF170, -1);
            NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_MOVE, 1, 1, 0, UIntPtr.Zero);
            return Results.Ok(new { ok = true, action = "monitors_on", message = "Displays woken up" });

        default:
            return Results.BadRequest(new
            {
                ok = false,
                error = $"Unknown power action '{action}'. Supported: shutdown, abort_shutdown, reboot, sleep, hibernate, lock, logoff, monitors_off, monitors_on"
            });
    }
});

// ============================================================================
// 3. USER SESSION LOGIN / UNLOCK / WINLOGON AUTO-LOGON
// ============================================================================
app.MapPost("/api/session/login", async (SessionLoginRequest req) =>
{
    var mode = (req.Mode ?? "unlock").Trim().ToLowerInvariant();
    var username = string.IsNullOrWhiteSpace(req.Username) ? Environment.UserName : req.Username.Trim();
    var domain = string.IsNullOrWhiteSpace(req.Domain) ? Environment.MachineName : req.Domain.Trim();
    var pinOrPassword = req.PinOrPassword ?? "";

    // Always wake displays first
    NativeWin32.SendMessage(0xFFFF, 0x0112, 0xF170, -1);
    NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_MOVE, 2, 2, 0, UIntPtr.Zero);

    if (mode == "enable_autologon")
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon", writable: true);
            if (key == null)
            {
                return Results.Json(new { ok = false, error = "Requires Administrator privileges to write HKLM Winlogon." }, statusCode: 403);
            }
            key.SetValue("AutoAdminLogon", "1", RegistryValueKind.String);
            key.SetValue("DefaultUserName", username, RegistryValueKind.String);
            key.SetValue("DefaultDomainName", domain, RegistryValueKind.String);
            if (!string.IsNullOrEmpty(pinOrPassword))
            {
                key.SetValue("DefaultPassword", pinOrPassword, RegistryValueKind.String);
            }
            return Results.Ok(new
            {
                ok = true,
                mode,
                username,
                domain,
                message = $"Windows Winlogon AutoAdminLogon enabled for {domain}\\{username}"
            });
        }
        catch (Exception ex)
        {
            return Results.Json(new { ok = false, error = ex.Message }, statusCode: 500);
        }
    }

    if (mode == "disable_autologon")
    {
        try
        {
            using var key = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon", writable: true);
            if (key != null)
            {
                key.SetValue("AutoAdminLogon", "0", RegistryValueKind.String);
                key.DeleteValue("DefaultPassword", throwOnMissingValue: false);
            }
            return Results.Ok(new { ok = true, mode, message = "Windows AutoAdminLogon disabled and DefaultPassword cleared." });
        }
        catch (Exception ex)
        {
            return Results.Json(new { ok = false, error = ex.Message }, statusCode: 500);
        }
    }

    if (mode == "tscon")
    {
        // Reattach active/disconnected session to physical console
        var sessionId = Process.GetCurrentProcess().SessionId;
        var psi = new ProcessStartInfo("tscon.exe", $"{sessionId} /dest:console")
        {
            CreateNoWindow = true,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        using var proc = Process.Start(psi);
        if (proc != null) await proc.WaitForExitAsync();
        return Results.Ok(new { ok = true, mode, sessionId, message = $"Reattached session {sessionId} to physical console" });
    }

    // Default mode: "unlock" — wakes monitors, dismisses lock screen curtain (Space/Escape), types PIN/Password + Enter if provided
    NativeWin32.SendVirtualKey(0x20); // VK_SPACE to lift Windows 11 lock screen curtain
    await Task.Delay(450);

    if (!string.IsNullOrEmpty(pinOrPassword))
    {
        SendKeys.SendWait(pinOrPassword);
        await Task.Delay(120);
        NativeWin32.SendVirtualKey(0x0D); // VK_RETURN
    }

    return Results.Ok(new
    {
        ok = true,
        mode = "unlock",
        username,
        sessionLocked = NativeWin32.IsWorkstationLocked(),
        message = string.IsNullOrEmpty(pinOrPassword)
            ? "Woke displays and lifted lock curtain."
            : $"Dispatched unlock credentials for {username}."
    });
});

// ============================================================================
// 4. POWERSHELL REMOTE EXECUTION ENGINE
// ============================================================================
app.MapPost("/api/powershell/exec", async (PowerShellExecRequest req) =>
{
    var command = (req.Command ?? "").Trim();
    if (string.IsNullOrEmpty(command))
    {
        return Results.BadRequest(new { ok = false, error = "Missing PowerShell 'command'" });
    }

    var workDir = string.IsNullOrWhiteSpace(req.WorkingDirectory)
        ? @"c:\Users\thoma\source\repos\thassi"
        : req.WorkingDirectory.Trim();
    if (!Directory.Exists(workDir))
    {
        workDir = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
    }

    var timeoutSec = Math.Clamp(req.TimeoutSeconds ?? 30, 1, 300);
    var sw = Stopwatch.StartNew();

    var encodedCmd = Convert.ToBase64String(Encoding.Unicode.GetBytes(command));
    var psi = new ProcessStartInfo
    {
        FileName = "powershell.exe",
        Arguments = $"-NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand {encodedCmd}",
        WorkingDirectory = workDir,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        UseShellExecute = false,
        CreateNoWindow = true,
        StandardOutputEncoding = Encoding.UTF8,
        StandardErrorEncoding = Encoding.UTF8
    };

    using var proc = new Process { StartInfo = psi };
    var stdoutBuilder = new StringBuilder();
    var stderrBuilder = new StringBuilder();

    proc.OutputDataReceived += (_, e) => { if (e.Data != null) stdoutBuilder.AppendLine(e.Data); };
    proc.ErrorDataReceived += (_, e) => { if (e.Data != null) stderrBuilder.AppendLine(e.Data); };

    proc.Start();
    proc.BeginOutputReadLine();
    proc.BeginErrorReadLine();

    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(timeoutSec));
    var timedOut = false;
    try
    {
        await proc.WaitForExitAsync(cts.Token);
    }
    catch (OperationCanceledException)
    {
        timedOut = true;
        try { proc.Kill(entireProcessTree: true); } catch { }
    }

    sw.Stop();
    var stdout = stdoutBuilder.ToString().TrimEnd();
    var stderr = stderrBuilder.ToString().TrimEnd();
    var exitCode = timedOut ? -1 : proc.ExitCode;

    return Results.Ok(new
    {
        ok = !timedOut && exitCode == 0,
        timedOut,
        exitCode,
        durationMs = sw.ElapsedMilliseconds,
        workingDirectory = workDir,
        command,
        stdout,
        stderr
    });
});

// ============================================================================
// 5. MEDIA PLAYBACK & MASTER AUDIO VOLUME CONTROL
// ============================================================================
app.MapGet("/api/media/status", (PcTelemetryService telemetry) =>
{
    return Results.Ok(telemetry.GetMediaStatus());
});

app.MapPost("/api/media/control", async (MediaControlRequest req, PcTelemetryService telemetry) =>
{
    var action = (req.Action ?? "play_pause").Trim().ToLowerInvariant();

    switch (action)
    {
        case "play_pause":
        case "toggle":
            NativeWin32.SendVirtualKey(0xB3); // VK_MEDIA_PLAY_PAUSE
            await Task.Delay(180);
            break;
        case "next":
        case "next_track":
            NativeWin32.SendVirtualKey(0xB0); // VK_MEDIA_NEXT_TRACK
            await Task.Delay(180);
            break;
        case "prev":
        case "previous":
        case "previous_track":
            NativeWin32.SendVirtualKey(0xB1); // VK_MEDIA_PREV_TRACK
            await Task.Delay(180);
            break;
        case "stop":
            NativeWin32.SendVirtualKey(0xB2); // VK_MEDIA_STOP
            await Task.Delay(120);
            break;
        case "mute":
        case "toggle_mute":
            CoreAudioVolume.ToggleMute();
            break;
        case "vol_up":
        case "volume_up":
            CoreAudioVolume.StepVolume(5);
            break;
        case "vol_down":
        case "volume_down":
            CoreAudioVolume.StepVolume(-5);
            break;
        case "set_volume":
            if (req.VolumePercent.HasValue)
            {
                CoreAudioVolume.SetMasterVolume(Math.Clamp(req.VolumePercent.Value, 0, 100));
            }
            break;
        default:
            return Results.BadRequest(new
            {
                ok = false,
                error = $"Unknown media action '{action}'. Supported: play_pause, next, prev, stop, mute, vol_up, vol_down, set_volume"
            });
    }

    if (req.VolumePercent.HasValue && action != "set_volume")
    {
        CoreAudioVolume.SetMasterVolume(Math.Clamp(req.VolumePercent.Value, 0, 100));
    }

    var status = telemetry.GetMediaStatus();
    return Results.Ok(new
    {
        ok = true,
        action,
        media = status
    });
});

// ============================================================================
// 6. MULTI-MONITOR SCREEN MIRRORING & WEB-VNC / REMOTE KVM
// ============================================================================
app.MapGet("/api/screen/monitors", () =>
{
    var screens = Screen.AllScreens;
    var list = screens.Select((s, idx) => new
    {
        index = idx,
        deviceName = s.DeviceName,
        primary = s.Primary,
        x = s.Bounds.X,
        y = s.Bounds.Y,
        width = s.Bounds.Width,
        height = s.Bounds.Height
    }).ToList();

    var vBounds = SystemInformation.VirtualScreen;
    return Results.Ok(new
    {
        count = list.Count,
        virtualScreen = new { x = vBounds.X, y = vBounds.Y, width = vBounds.Width, height = vBounds.Height },
        monitors = list
    });
});

app.MapGet("/api/screen/frame", (HttpContext ctx) =>
{
    var monitorParam = ctx.Request.Query["monitor"].FirstOrDefault() ?? "0";
    var scale = Math.Clamp(double.TryParse(ctx.Request.Query["scale"].FirstOrDefault(), System.Globalization.CultureInfo.InvariantCulture, out var s) ? s : 0.65, 0.2, 1.0);
    var quality = Math.Clamp(long.TryParse(ctx.Request.Query["quality"].FirstOrDefault(), out var q) ? q : 68L, 20L, 95L);

    var jpegBytes = ScreenCaptureEngine.CaptureJpeg(monitorParam, scale, quality, out var bounds);
    ctx.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
    ctx.Response.Headers["X-Monitor-Bounds"] = $"{bounds.X},{bounds.Y},{bounds.Width},{bounds.Height}";
    return Results.Bytes(jpegBytes, "image/jpeg");
});

app.MapGet("/api/screen/stream", async (HttpContext ctx) =>
{
    var monitorParam = ctx.Request.Query["monitor"].FirstOrDefault() ?? "0";
    var fps = Math.Clamp(int.TryParse(ctx.Request.Query["fps"].FirstOrDefault(), out var f) ? f : 8, 1, 25);
    var scale = Math.Clamp(double.TryParse(ctx.Request.Query["scale"].FirstOrDefault(), System.Globalization.CultureInfo.InvariantCulture, out var s) ? s : 0.6, 0.2, 1.0);
    var quality = Math.Clamp(long.TryParse(ctx.Request.Query["quality"].FirstOrDefault(), out var q) ? q : 62L, 20L, 90L);

    ctx.Response.ContentType = "multipart/x-mixed-replace; boundary=--thassiframe";
    ctx.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";

    var delayMs = Math.Max(40, 1000 / fps);
    var newline = Encoding.ASCII.GetBytes("\r\n");

    try
    {
        while (!ctx.RequestAborted.IsCancellationRequested)
        {
            var frameBytes = ScreenCaptureEngine.CaptureJpeg(monitorParam, scale, quality, out _);
            var header = $"--thassiframe\r\nContent-Type: image/jpeg\r\nContent-Length: {frameBytes.Length}\r\n\r\n";
            var headerBytes = Encoding.ASCII.GetBytes(header);

            await ctx.Response.Body.WriteAsync(headerBytes, ctx.RequestAborted);
            await ctx.Response.Body.WriteAsync(frameBytes, ctx.RequestAborted);
            await ctx.Response.Body.WriteAsync(newline, ctx.RequestAborted);
            await ctx.Response.Body.FlushAsync(ctx.RequestAborted);

            await Task.Delay(delayMs, ctx.RequestAborted);
        }
    }
    catch (OperationCanceledException) { }
});

app.MapPost("/api/screen/input", (ScreenInputRequest req) =>
{
    var bounds = ScreenCaptureEngine.ResolveMonitorBounds(req.Monitor ?? "0");
    var type = (req.Type ?? "").Trim().ToLowerInvariant();

    if (req.NormalizedX.HasValue && req.NormalizedY.HasValue)
    {
        var targetX = bounds.X + (int)Math.Round(Math.Clamp(req.NormalizedX.Value, 0.0, 1.0) * bounds.Width);
        var targetY = bounds.Y + (int)Math.Round(Math.Clamp(req.NormalizedY.Value, 0.0, 1.0) * bounds.Height);
        NativeWin32.SetCursorPos(targetX, targetY);
    }

    switch (type)
    {
        case "move":
            break;
        case "click":
        case "left_click":
            NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_LEFTDOWN | NativeWin32.MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            break;
        case "dblclick":
        case "double_click":
            NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_LEFTDOWN | NativeWin32.MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            Thread.Sleep(40);
            NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_LEFTDOWN | NativeWin32.MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            break;
        case "right_click":
        case "contextmenu":
            NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_RIGHTDOWN | NativeWin32.MOUSEEVENTF_RIGHTUP, 0, 0, 0, UIntPtr.Zero);
            break;
        case "mousedown":
            NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_LEFTDOWN, 0, 0, 0, UIntPtr.Zero);
            break;
        case "mouseup":
            NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_LEFTUP, 0, 0, 0, UIntPtr.Zero);
            break;
        case "wheel":
            var delta = req.DeltaY ?? -120;
            NativeWin32.mouse_event(NativeWin32.MOUSEEVENTF_WHEEL, 0, 0, unchecked((uint)delta), UIntPtr.Zero);
            break;
        case "text":
            if (!string.IsNullOrEmpty(req.Text))
            {
                SendKeys.SendWait(req.Text);
            }
            break;
        case "key":
            ScreenCaptureEngine.SendKeyName(req.Key ?? "");
            break;
        default:
            return Results.BadRequest(new { ok = false, error = $"Unknown input type '{type}'" });
    }

    return Results.Ok(new { ok = true, type });
});

app.MapGet("/api/google/authorize", async () =>
{
    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
    var jsonStr = await http.GetStringAsync("http://192.168.188.92:8099/api/apps/workflows/google-oauth/url?redirectUri=http://localhost:5185/api/google/callback");
    using var doc = JsonDocument.Parse(jsonStr);
    var authUrl = doc.RootElement.GetProperty("authUrl").GetString() ?? "https://accounts.google.com";
    return Results.Redirect(authUrl);
});

app.MapGet("/api/google/callback", async (HttpContext ctx) =>
{
    var code = ctx.Request.Query["code"].FirstOrDefault();
    var error = ctx.Request.Query["error"].FirstOrDefault();
    if (!string.IsNullOrEmpty(error) || string.IsNullOrEmpty(code))
    {
        return Results.Content($"<html><body style='background:#09090b;color:#ef4444;font-family:sans-serif;padding:40px'><h2>Google OAuth Error: {error ?? "Missing code"}</h2></body></html>", "text/html");
    }

    using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
    var payload = JsonSerializer.Serialize(new
    {
        code,
        redirectUri = "http://localhost:5185/api/google/callback"
    });
    var res = await http.PostAsync(
        "http://192.168.188.92:8099/api/apps/workflows/google-oauth/exchange",
        new StringContent(payload, Encoding.UTF8, "application/json")
    );
    var body = await res.Content.ReadAsStringAsync();

    return Results.Content($@"<!DOCTYPE html>
<html>
<head><meta charset='utf-8'><title>Thassi Google OAuth Authorized</title></head>
<body style='background:#09090b;color:#fafafa;font-family:Inter,sans-serif;padding:48px;max-width:680px;margin:0 auto;'>
  <div style='display:flex;align-items:center;gap:10px;margin-bottom:16px;'>
    <span style='width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;'></span>
    <h2 style='margin:0;font-weight:500;'>Google OAuth2 erfolgreich verbunden</h2>
  </div>
  <p style='color:#a1a1aa;font-size:14px;line-height:1.6;'>
    Alle Scopes (Calendar, Fitness, Gmail, Drive, YouTube) wurden an deinen Home-Assistant-Server (192.168.188.92:8099) übertragen und gespeichert.
  </p>
  <pre style='background:#111113;border:1px solid rgba(255,255,255,0.08);padding:12px;border-radius:4px;color:#a1a1aa;font-size:12px;overflow:auto;'>{System.Net.WebUtility.HtmlEncode(body)}</pre>
</body>
</html>", "text/html");
});

app.MapGet("/kvm", () => Results.Content(WebKvmUi.Html, "text/html; charset=utf-8"));
app.MapGet("/", () => Results.Redirect("/kvm"));

app.Run();

// ============================================================================
// REQUEST DTOS
// ============================================================================
public record PowerControlRequest(string? Action, int? DelaySeconds);
public record SessionLoginRequest(string? Mode, string? Username, string? Domain, string? PinOrPassword);
public record PowerShellExecRequest(string? Command, string? WorkingDirectory, int? TimeoutSeconds);
public record MediaControlRequest(string? Action, int? VolumePercent);
public record ScreenInputRequest(string? Type, string? Monitor, double? NormalizedX, double? NormalizedY, int? DeltaY, string? Text, string? Key);

public record PcStatusSnapshot(
    string Hostname,
    string Username,
    string IpAddress,
    string MacAddress,
    long UptimeSeconds,
    double CpuUsagePercent,
    double MemoryUsagePercent,
    double MemoryUsedGb,
    double MemoryTotalGb,
    bool SessionLocked,
    string ActiveWindowTitle,
    string ActiveProcessName,
    int DisplayCount,
    List<MonitorInfoDto> Displays,
    MediaStatusDto Media,
    string KvmUrl,
    string MjpegStreamUrl
);

public record MonitorInfoDto(int Index, string DeviceName, bool Primary, int Width, int Height, int X, int Y);
public record MediaStatusDto(string State, string Title, string AppName, int VolumePercent, bool Muted);

// ============================================================================
// TELEMETRY & MEDIA SERVICE
// ============================================================================
public class PcTelemetryService
{
    private TimeSpan _lastTotalProcessorTime = TimeSpan.Zero;
    private DateTime _lastCpuSampleTime = DateTime.MinValue;
    private double _cachedCpuPct = 4.0;

    public PcStatusSnapshot CollectSnapshot()
    {
        var (ip, mac) = GetPrimaryLanIdentity();
        var cpuPct = SampleCpuUsage();
        var (memPct, usedGb, totalGb) = GetMemoryUsage();
        var (winTitle, procName) = NativeWin32.GetForegroundWindowDetails();
        var screens = Screen.AllScreens.Select((s, idx) =>
            new MonitorInfoDto(idx, s.DeviceName, s.Primary, s.Bounds.Width, s.Bounds.Height, s.Bounds.X, s.Bounds.Y)).ToList();

        return new PcStatusSnapshot(
            Hostname: Environment.MachineName,
            Username: Environment.UserName,
            IpAddress: ip,
            MacAddress: mac,
            UptimeSeconds: Environment.TickCount64 / 1000,
            CpuUsagePercent: Math.Round(cpuPct, 1),
            MemoryUsagePercent: Math.Round(memPct, 1),
            MemoryUsedGb: Math.Round(usedGb, 2),
            MemoryTotalGb: Math.Round(totalGb, 2),
            SessionLocked: NativeWin32.IsWorkstationLocked(),
            ActiveWindowTitle: winTitle,
            ActiveProcessName: procName,
            DisplayCount: screens.Count,
            Displays: screens,
            Media: GetMediaStatus(),
            KvmUrl: $"http://{ip}:5185/kvm",
            MjpegStreamUrl: $"http://{ip}:5185/api/screen/stream?monitor=0&fps=8"
        );
    }

    public MediaStatusDto GetMediaStatus()
    {
        var (volPct, muted) = CoreAudioVolume.GetMasterVolume();
        var isAudioActive = CoreAudioVolume.IsAudioPlaying();
        var (mediaTitle, mediaApp) = NativeWin32.FindActiveMediaWindow();

        string state;
        if (isAudioActive)
        {
            state = "playing";
        }
        else if (!string.IsNullOrEmpty(mediaTitle))
        {
            state = "paused";
        }
        else
        {
            state = "idle";
        }

        var displayTitle = !string.IsNullOrEmpty(mediaTitle)
            ? mediaTitle
            : isAudioActive
                ? "Audio Output Active"
                : "Paused / Idle";

        return new MediaStatusDto(state, displayTitle, mediaApp, volPct, muted);
    }

    private double SampleCpuUsage()
    {
        try
        {
            if (NativeWin32.GetSystemTimes(out var idleTime, out var kernelTime, out var userTime))
            {
                ulong idle = NativeWin32.FileTimeToUlong(idleTime);
                ulong kernel = NativeWin32.FileTimeToUlong(kernelTime);
                ulong user = NativeWin32.FileTimeToUlong(userTime);
                ulong total = kernel + user;

                if (_lastCpuSampleTime != DateTime.MinValue)
                {
                    ulong prevIdle = (ulong)_lastTotalProcessorTime.Ticks;
                    ulong prevTotal = (ulong)_lastCpuSampleTime.Ticks;
                    ulong diffIdle = idle - prevIdle;
                    ulong diffTotal = total - prevTotal;
                    if (diffTotal > 0)
                    {
                        _cachedCpuPct = Math.Clamp((1.0 - (double)diffIdle / diffTotal) * 100.0, 0.0, 100.0);
                    }
                }
                _lastTotalProcessorTime = TimeSpan.FromTicks((long)idle);
                _lastCpuSampleTime = new DateTime((long)total);
            }
        }
        catch { }
        return _cachedCpuPct;
    }

    private static (double pct, double usedGb, double totalGb) GetMemoryUsage()
    {
        var mem = new NativeWin32.MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<NativeWin32.MEMORYSTATUSEX>() };
        if (NativeWin32.GlobalMemoryStatusEx(ref mem) && mem.ullTotalPhys > 0)
        {
            var totalGb = mem.ullTotalPhys / (1024.0 * 1024.0 * 1024.0);
            var availGb = mem.ullAvailPhys / (1024.0 * 1024.0 * 1024.0);
            var usedGb = totalGb - availGb;
            return ((usedGb / totalGb) * 100.0, usedGb, totalGb);
        }
        return (0, 0, 0);
    }

    private static (string ip, string mac) GetPrimaryLanIdentity()
    {
        foreach (var ni in NetworkInterface.GetAllNetworkInterfaces())
        {
            if (ni.OperationalStatus != OperationalStatus.Up || ni.NetworkInterfaceType == NetworkInterfaceType.Loopback)
                continue;

            var props = ni.GetIPProperties();
            foreach (var ua in props.UnicastAddresses)
            {
                if (ua.Address.AddressFamily == AddressFamily.InterNetwork)
                {
                    var ipStr = ua.Address.ToString();
                    if (ipStr.StartsWith("192.168."))
                    {
                        var macBytes = ni.GetPhysicalAddress().GetAddressBytes();
                        var macStr = string.Join(":", macBytes.Select(b => b.ToString("X2")));
                        return (ipStr, macStr);
                    }
                }
            }
        }
        return ("192.168.188.46", "30:9C:23:E1:03:96");
    }
}

// ============================================================================
// HOME ASSISTANT PERIODIC TELEMETRY & REVERSE BRIDGE PUSH SERVICE
// ============================================================================
public class HaSyncBackgroundService : BackgroundService
{
    private readonly PcTelemetryService _telemetry;
    private readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(15) };
    private readonly string _haUrl;
    private readonly string _haToken;
    private readonly string _thassiHostUrl = "http://192.168.188.92:8099";
    private string _activeMonitor = "primary";

    public HaSyncBackgroundService(PcTelemetryService telemetry)
    {
        _telemetry = telemetry;
        var (url, token) = ResolveHaCredentials();
        _haUrl = url.TrimEnd('/');
        _haToken = token;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var haLoop = RunHaSensorLoopAsync(stoppingToken);
        var bridgeLoop = RunReverseBridgeLoopAsync(stoppingToken);
        return Task.WhenAll(haLoop, bridgeLoop);
    }

    private async Task RunReverseBridgeLoopAsync(CancellationToken stoppingToken)
    {
        var jsonOpts = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var snap = _telemetry.CollectSnapshot();
                var jpegBytes = ScreenCaptureEngine.CaptureJpeg(_activeMonitor, 0.52, 58L, out _);
                var syncPayload = new
                {
                    status = snap,
                    monitor = _activeMonitor,
                    frameBase64 = Convert.ToBase64String(jpegBytes)
                };

                using var syncReq = new HttpRequestMessage(HttpMethod.Post, $"{_thassiHostUrl}/api/apps/workflows/pc-bridge/sync")
                {
                    Content = new StringContent(JsonSerializer.Serialize(syncPayload, jsonOpts), Encoding.UTF8, "application/json")
                };
                using var syncRes = await _http.SendAsync(syncReq, stoppingToken);
                if (syncRes.IsSuccessStatusCode)
                {
                    var bodyStr = await syncRes.Content.ReadAsStringAsync(stoppingToken);
                    using var doc = JsonDocument.Parse(bodyStr);
                    if (doc.RootElement.TryGetProperty("requestedMonitor", out var reqMon) && reqMon.ValueKind == JsonValueKind.String)
                    {
                        var m = reqMon.GetString();
                        if (!string.IsNullOrEmpty(m)) _activeMonitor = m;
                    }

                    if (doc.RootElement.TryGetProperty("commands", out var cmdsEl) && cmdsEl.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var cmdEl in cmdsEl.EnumerateArray())
                        {
                            var cmdId = cmdEl.GetProperty("id").GetString() ?? "";
                            var endpoint = cmdEl.GetProperty("endpoint").GetString() ?? "";
                            var payloadRaw = cmdEl.GetProperty("payload").GetRawText();

                            _ = Task.Run(async () =>
                            {
                                try
                                {
                                    using var localReq = new HttpRequestMessage(HttpMethod.Post, $"http://127.0.0.1:5185{endpoint}")
                                    {
                                        Content = new StringContent(payloadRaw, Encoding.UTF8, "application/json")
                                    };
                                    using var localRes = await _http.SendAsync(localReq, stoppingToken);
                                    var localBody = await localRes.Content.ReadAsStringAsync(stoppingToken);
                                    object? parsedResult = null;
                                    try { parsedResult = JsonSerializer.Deserialize<JsonElement>(localBody); } catch { parsedResult = new { raw = localBody }; }

                                    var reportPayload = new
                                    {
                                        id = cmdId,
                                        result = parsedResult,
                                        error = localRes.IsSuccessStatusCode ? null : $"HTTP {(int)localRes.StatusCode}: {localBody}"
                                    };
                                    using var repReq = new HttpRequestMessage(HttpMethod.Post, $"{_thassiHostUrl}/api/apps/workflows/pc-bridge/result")
                                    {
                                        Content = new StringContent(JsonSerializer.Serialize(reportPayload, jsonOpts), Encoding.UTF8, "application/json")
                                    };
                                    await _http.SendAsync(repReq, stoppingToken);
                                }
                                catch (Exception ex)
                                {
                                    var errPayload = new { id = cmdId, error = ex.Message };
                                    using var repReq = new HttpRequestMessage(HttpMethod.Post, $"{_thassiHostUrl}/api/apps/workflows/pc-bridge/result")
                                    {
                                        Content = new StringContent(JsonSerializer.Serialize(errPayload, jsonOpts), Encoding.UTF8, "application/json")
                                    };
                                    try { await _http.SendAsync(repReq, stoppingToken); } catch { }
                                }
                            }, stoppingToken);
                        }
                    }
                }
            }
            catch { }

            await Task.Delay(300, stoppingToken);
        }
    }

    private async Task RunHaSensorLoopAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                if (!string.IsNullOrEmpty(_haToken))
                {
                    var snap = _telemetry.CollectSnapshot();
                    await PublishEntityAsync("sensor.thassi_pc_status", snap.SessionLocked ? "locked" : "online", new
                    {
                        friendly_name = $"{snap.Hostname} Status",
                        icon = "mdi:desktop-tower-monitor",
                        hostname = snap.Hostname,
                        username = snap.Username,
                        ip_address = snap.IpAddress,
                        mac_address = snap.MacAddress,
                        cpu_pct = snap.CpuUsagePercent,
                        ram_pct = snap.MemoryUsagePercent,
                        ram_used_gb = snap.MemoryUsedGb,
                        ram_total_gb = snap.MemoryTotalGb,
                        active_window = snap.ActiveWindowTitle,
                        active_process = snap.ActiveProcessName,
                        display_count = snap.DisplayCount,
                        media_title = snap.Media.Title,
                        volume_pct = snap.Media.VolumePercent,
                        kvm_url = snap.KvmUrl,
                        stream_url = snap.MjpegStreamUrl
                    }, stoppingToken);

                    await PublishEntityAsync("sensor.thassi_pc_cpu_usage", snap.CpuUsagePercent.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture), new
                    {
                        friendly_name = $"{snap.Hostname} CPU Load",
                        unit_of_measurement = "%",
                        icon = "mdi:cpu-64-bit"
                    }, stoppingToken);

                    await PublishEntityAsync("sensor.thassi_pc_memory_usage", snap.MemoryUsagePercent.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture), new
                    {
                        friendly_name = $"{snap.Hostname} RAM Usage",
                        unit_of_measurement = "%",
                        used_gb = snap.MemoryUsedGb,
                        total_gb = snap.MemoryTotalGb,
                        icon = "mdi:memory"
                    }, stoppingToken);

                    await PublishEntityAsync("sensor.thassi_pc_media", snap.Media.Title, new
                    {
                        friendly_name = $"{snap.Hostname} Now Playing",
                        state_mode = snap.Media.State,
                        app_name = snap.Media.AppName,
                        volume_pct = snap.Media.VolumePercent,
                        muted = snap.Media.Muted,
                        icon = "mdi:multimedia"
                    }, stoppingToken);
                }
            }
            catch { }

            await Task.Delay(TimeSpan.FromSeconds(12), stoppingToken);
        }
    }

    private async Task PublishEntityAsync(string entityId, string state, object attributes, CancellationToken ct)
    {
        using var req = new HttpRequestMessage(HttpMethod.Post, $"{_haUrl}/api/states/{entityId}");
        req.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _haToken);
        var json = JsonSerializer.Serialize(new { state, attributes });
        req.Content = new StringContent(json, Encoding.UTF8, "application/json");
        using var _ = await _http.SendAsync(req, ct);
    }

    private static (string url, string token) ResolveHaCredentials()
    {
        var url = Environment.GetEnvironmentVariable("HA_URL") ?? "http://192.168.188.92:8123";
        var token = Environment.GetEnvironmentVariable("HA_TOKEN") ?? "";

        var envPath = @"c:\Users\thoma\source\repos\thassi\.env";
        if (File.Exists(envPath))
        {
            foreach (var line in File.ReadAllLines(envPath))
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith("HA_URL=", StringComparison.OrdinalIgnoreCase))
                    url = trimmed["HA_URL=".Length..].Trim().Trim('"', '\'');
                else if (trimmed.StartsWith("HA_TOKEN=", StringComparison.OrdinalIgnoreCase))
                    token = trimmed["HA_TOKEN=".Length..].Trim().Trim('"', '\'');
            }
        }
        return (url, token);
    }
}

// ============================================================================
// SCREEN CAPTURE & INPUT ENGINE
// ============================================================================
public static class ScreenCaptureEngine
{
    private static readonly ImageCodecInfo JpegEncoder =
        ImageCodecInfo.GetImageDecoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);

    public static Rectangle ResolveMonitorBounds(string monitorParam)
    {
        var screens = Screen.AllScreens;
        if (string.Equals(monitorParam, "all", StringComparison.OrdinalIgnoreCase))
        {
            return SystemInformation.VirtualScreen;
        }
        if (int.TryParse(monitorParam, out var idx) && idx >= 0 && idx < screens.Length)
        {
            return screens[idx].Bounds;
        }
        return (screens.FirstOrDefault(s => s.Primary) ?? screens[0]).Bounds;
    }

    public static byte[] CaptureJpeg(string monitorParam, double scale, long quality, out Rectangle bounds)
    {
        bounds = ResolveMonitorBounds(monitorParam);
        var outW = Math.Max(320, (int)Math.Round(bounds.Width * scale));
        var outH = Math.Max(180, (int)Math.Round(bounds.Height * scale));

        using var rawBmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb);
        using (var g = Graphics.FromImage(rawBmp))
        {
            try
            {
                g.CopyFromScreen(bounds.X, bounds.Y, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);
                // Draw cursor indicator
                if (NativeWin32.GetCursorPos(out var pt))
                {
                    int cx = pt.X - bounds.X;
                    int cy = pt.Y - bounds.Y;
                    if (cx >= 0 && cx < bounds.Width && cy >= 0 && cy < bounds.Height)
                    {
                        using var pen = new Pen(Color.FromArgb(220, 16, 185, 129), 3f);
                        g.DrawEllipse(pen, cx - 7, cy - 7, 14, 14);
                    }
                }
            }
            catch
            {
                g.Clear(Color.FromArgb(9, 9, 11));
            }
        }

        using var ms = new MemoryStream();
        using var encParams = new EncoderParameters(1);
        encParams.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, quality);

        if (Math.Abs(scale - 1.0) < 0.02)
        {
            rawBmp.Save(ms, JpegEncoder, encParams);
        }
        else
        {
            using var scaledBmp = new Bitmap(outW, outH, PixelFormat.Format24bppRgb);
            using (var sg = Graphics.FromImage(scaledBmp))
            {
                sg.InterpolationMode = InterpolationMode.Bilinear;
                sg.CompositingQuality = CompositingQuality.HighSpeed;
                sg.SmoothingMode = SmoothingMode.HighSpeed;
                sg.DrawImage(rawBmp, 0, 0, outW, outH);
            }
            scaledBmp.Save(ms, JpegEncoder, encParams);
        }

        return ms.ToArray();
    }

    public static void SendKeyName(string key)
    {
        switch (key.Trim())
        {
            case "Enter": NativeWin32.SendVirtualKey(0x0D); break;
            case "Backspace": NativeWin32.SendVirtualKey(0x08); break;
            case "Tab": NativeWin32.SendVirtualKey(0x09); break;
            case "Escape": NativeWin32.SendVirtualKey(0x1B); break;
            case "Space": NativeWin32.SendVirtualKey(0x20); break;
            case "ArrowUp": NativeWin32.SendVirtualKey(0x26); break;
            case "ArrowDown": NativeWin32.SendVirtualKey(0x28); break;
            case "ArrowLeft": NativeWin32.SendVirtualKey(0x25); break;
            case "ArrowRight": NativeWin32.SendVirtualKey(0x27); break;
            case "Delete": NativeWin32.SendVirtualKey(0x2E); break;
            case "Win": NativeWin32.SendVirtualKey(0x5B); break;
            default:
                if (key.Length == 1)
                {
                    SendKeys.SendWait(key);
                }
                break;
        }
    }
}

// ============================================================================
// CORE AUDIO COM INTEROP FOR EXACT WINDOWS MASTER VOLUME
// ============================================================================
public static class CoreAudioVolume
{
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    private class MMDeviceEnumeratorComObject { }

    [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDeviceEnumerator
    {
        int NotImpl1();
        [PreserveSig]
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
    }

    [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IMMDevice
    {
        [PreserveSig]
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
    }

    [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioEndpointVolume
    {
        int RegisterControlChangeNotify(IntPtr pNotify);
        int UnregisterControlChangeNotify(IntPtr pNotify);
        int GetChannelCount(out int pnChannelCount);
        int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
        int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
        int GetMasterVolumeLevel(out float pfLevelDB);
        int GetMasterVolumeLevelScalar(out float pfLevel);
        int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
        int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
        int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
        int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
        int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
        int GetMute(out bool pbMute);
    }

    [Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IAudioMeterInformation
    {
        int GetPeakValue(out float pfPeak);
    }

    private static IAudioEndpointVolume? GetVolumeInterface()
    {
        try
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            enumerator.GetDefaultAudioEndpoint(0, 1, out var device);
            if (device == null) return null;
            var iid = typeof(IAudioEndpointVolume).GUID;
            device.Activate(ref iid, 23, IntPtr.Zero, out var volObj);
            return volObj as IAudioEndpointVolume;
        }
        catch
        {
            return null;
        }
    }

    public static bool IsAudioPlaying()
    {
        try
        {
            var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumeratorComObject();
            enumerator.GetDefaultAudioEndpoint(0, 1, out var device);
            if (device == null) return false;
            var iid = typeof(IAudioMeterInformation).GUID;
            device.Activate(ref iid, 23, IntPtr.Zero, out var meterObj);
            if (meterObj is IAudioMeterInformation meter)
            {
                meter.GetPeakValue(out var peak);
                return peak > 0.0004f;
            }
        }
        catch { }
        return false;
    }

    public static (int volumePct, bool muted) GetMasterVolume()
    {
        var vol = GetVolumeInterface();
        if (vol == null) return (50, false);
        vol.GetMasterVolumeLevelScalar(out var level);
        vol.GetMute(out var muted);
        return ((int)Math.Round(level * 100), muted);
    }

    public static void SetMasterVolume(int pct)
    {
        var vol = GetVolumeInterface();
        if (vol == null) return;
        var ctx = Guid.Empty;
        vol.SetMasterVolumeLevelScalar(Math.Clamp(pct / 100f, 0f, 1f), ref ctx);
        if (pct > 0)
        {
            vol.SetMute(false, ref ctx);
        }
    }

    public static void StepVolume(int deltaPct)
    {
        var (cur, _) = GetMasterVolume();
        SetMasterVolume(Math.Clamp(cur + deltaPct, 0, 100));
    }

    public static void ToggleMute()
    {
        var vol = GetVolumeInterface();
        if (vol == null) return;
        vol.GetMute(out var muted);
        var ctx = Guid.Empty;
        vol.SetMute(!muted, ref ctx);
    }
}

// ============================================================================
// NATIVE WIN32 P/INVOKE
// ============================================================================
public static class NativeWin32
{
    public const uint MOUSEEVENTF_MOVE = 0x0001;
    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct FILETIME { public uint dwLowDateTime; public uint dwHighDateTime; }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    public struct MEMORYSTATUSEX
    {
        public uint dwLength;
        public uint dwMemoryLoad;
        public ulong ullTotalPhys;
        public ulong ullAvailPhys;
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern bool LockWorkStation();
    [DllImport("user32.dll")] public static extern bool ExitWindowsEx(uint uFlags, uint dwReason);
    [DllImport("user32.dll")] public static extern IntPtr SendMessage(int hWnd, int Msg, int wParam, int lParam);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT lpPoint);
    [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, int dx, int dy, uint dwData, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
    [DllImport("user32.dll")] public static extern IntPtr OpenInputDesktop(uint dwFlags, bool fInherit, uint dwDesiredAccess);
    [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr hDesktop);
    [DllImport("powrprof.dll", SetLastError = true)] public static extern bool SetSuspendState(bool hibernate, bool forceCritical, bool disableWakeEvent);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);
    [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetSystemTimes(out FILETIME lpIdleTime, out FILETIME lpKernelTime, out FILETIME lpUserTime);

    public static ulong FileTimeToUlong(FILETIME ft) => ((ulong)ft.dwHighDateTime << 32) | ft.dwLowDateTime;

    public static void SendVirtualKey(byte vk)
    {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }

    public static bool IsWorkstationLocked()
    {
        IntPtr hDesktop = OpenInputDesktop(0, false, 0x0100);
        if (hDesktop == IntPtr.Zero) return true;
        CloseDesktop(hDesktop);
        return false;
    }

    public static (string title, string processName) GetForegroundWindowDetails()
    {
        try
        {
            var hwnd = GetForegroundWindow();
            if (hwnd == IntPtr.Zero) return ("Desktop", "explorer");
            var sb = new StringBuilder(512);
            GetWindowText(hwnd, sb, sb.Capacity);
            GetWindowThreadProcessId(hwnd, out var pid);
            var procName = "";
            if (pid > 0)
            {
                try { procName = Process.GetProcessById((int)pid).ProcessName; } catch { }
            }
            return (sb.ToString(), procName);
        }
        catch
        {
            return ("", "");
        }
    }

    public static (string title, string app) FindActiveMediaWindow()
    {
        string foundTitle = "";
        string foundApp = "";
        try
        {
            EnumWindows((hWnd, _) =>
            {
                if (!IsWindowVisible(hWnd)) return true;
                var sb = new StringBuilder(512);
                if (GetWindowText(hWnd, sb, sb.Capacity) <= 0) return true;
                var title = sb.ToString().Trim();
                if (string.IsNullOrEmpty(title)) return true;

                if (title.Contains("YouTube", StringComparison.OrdinalIgnoreCase) ||
                    title.Contains("Spotify", StringComparison.OrdinalIgnoreCase) ||
                    title.Contains("Twitch", StringComparison.OrdinalIgnoreCase) ||
                    title.Contains("Netflix", StringComparison.OrdinalIgnoreCase) ||
                    title.Contains("VLC", StringComparison.OrdinalIgnoreCase) ||
                    title.Contains("SoundCloud", StringComparison.OrdinalIgnoreCase))
                {
                    // Clean up browser suffixes
                    var clean = title
                        .Replace(" - Google Chrome", "", StringComparison.OrdinalIgnoreCase)
                        .Replace(" - Microsoft\u200B Edge", "", StringComparison.OrdinalIgnoreCase)
                        .Replace(" - Mozilla Firefox", "", StringComparison.OrdinalIgnoreCase)
                        .Trim();
                    foundTitle = clean;
                    foundApp = title.Contains("Spotify", StringComparison.OrdinalIgnoreCase) ? "Spotify" : "Browser/Media";
                    return false;
                }
                return true;
            }, IntPtr.Zero);
        }
        catch { }
        return (foundTitle, foundApp);
    }
}

// ============================================================================
// MINIMALIST WEB-KVM / BROWSER VNC UI (FOLLOWING DESIGN.md)
// ============================================================================
public static class WebKvmUi
{
    public const string Html = @"<!DOCTYPE html>
<html lang=""de"">
<head>
  <meta charset=""UTF-8"" />
  <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"" />
  <title>DESKTOP-M8TJERB · Web-KVM</title>
  <style>
    :root {
      --bg-canvas: #09090b;
      --bg-elevated: #111113;
      --bg-input: #141417;
      --line: rgba(255,255,255,0.06);
      --line-focus: rgba(255,255,255,0.22);
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-muted: #52525b;
      --dot-ok: #10b981;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg-canvas);
      color: var(--text-primary);
      font-family: var(--font-sans);
      font-size: 13px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      height: 44px;
      border-bottom: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      gap: 12px;
      flex-wrap: wrap;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--dot-ok);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    button, select, input {
      background: var(--bg-input);
      color: var(--text-primary);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 4px 10px;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
    }
    button:hover, select:hover { border-color: var(--line-focus); }
    button.active { background: var(--text-primary); color: var(--bg-canvas); font-weight: 500; }
    .workspace {
      display: grid;
      grid-template-columns: 1fr 310px;
      flex: 1;
      min-height: calc(100vh - 44px);
    }
    .stage {
      display: flex;
      align-items: center;
      justify-content: center;
      background: #050506;
      overflow: auto;
      padding: 12px;
      position: relative;
    }
    #kvmScreen {
      max-width: 100%;
      max-height: calc(100vh - 72px);
      border: 1px solid var(--line);
      cursor: crosshair;
      user-select: none;
      display: block;
    }
    aside {
      border-left: 1px solid var(--line);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 18px;
      background: var(--bg-canvas);
    }
    .sec-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--text-muted);
      margin-bottom: 8px;
      font-weight: 600;
    }
    .kv-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      border-bottom: 1px solid var(--line);
      font-variant-numeric: tabular-nums;
    }
    .kv-row span:first-child { color: var(--text-secondary); }
    .kv-row span:last-child { font-family: var(--font-mono); font-size: 12px; }
    .btn-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    }
    textarea {
      width: 100%;
      background: var(--bg-input);
      color: var(--text-primary);
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 8px;
      font-family: var(--font-mono);
      font-size: 12px;
      resize: vertical;
    }
    pre {
      background: var(--bg-elevated);
      border: 1px solid var(--line);
      padding: 8px;
      font-family: var(--font-mono);
      font-size: 11px;
      max-height: 160px;
      overflow: auto;
      white-space: pre-wrap;
      color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <header>
    <div class=""brand"">
      <span class=""dot""></span>
      <span>DESKTOP-M8TJERB · Web-VNC & Workstation Control</span>
      <span id=""metaLabel"" style=""color:var(--text-muted);font-family:var(--font-mono);font-size:12px;"">192.168.188.46:5185</span>
    </div>
    <div class=""toolbar"">
      <button class=""mon-btn active"" onclick=""setMonitor('0', this)"">DISPLAY 1</button>
      <button class=""mon-btn"" onclick=""setMonitor('1', this)"">DISPLAY 2</button>
      <button class=""mon-btn"" onclick=""setMonitor('2', this)"">DISPLAY 3</button>
      <button class=""mon-btn"" onclick=""setMonitor('all', this)"">ALL DISPLAYS</button>
      <input id=""typeBox"" type=""text"" placeholder=""Text / PIN an PC senden + Enter..."" style=""width:210px;cursor:text"" onkeydown=""if(event.key==='Enter'){sendText();event.preventDefault();}"" />
      <button onclick=""sendKey('Enter')"">Enter</button>
      <button onclick=""sendKey('Escape')"">Esc</button>
      <button onclick=""sendKey('Backspace')"">⌫</button>
      <button onclick=""sendKey('Win')"">Win</button>
    </div>
  </header>
  <div class=""workspace"">
    <div class=""stage"">
      <img id=""kvmScreen"" src=""/api/screen/stream?monitor=0&fps=8&scale=0.65"" alt=""Live PC Screen"" />
    </div>
    <aside>
      <div>
        <div class=""sec-title"">System Telemetry</div>
        <div class=""kv-row""><span>CPU / RAM</span><span id=""statCpuRam"">—</span></div>
        <div class=""kv-row""><span>Session</span><span id=""statSession"">—</span></div>
        <div class=""kv-row""><span>Active Window</span><span id=""statWindow"" style=""max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"">—</span></div>
        <div class=""kv-row""><span>Audio Volume</span><span id=""statVolume"">—</span></div>
      </div>

      <div>
        <div class=""sec-title"">Power & Session Login</div>
        <div class=""btn-grid"">
          <button onclick=""apiPost('/api/session/login',{mode:'unlock'})"">Wake & Unlock</button>
          <button onclick=""apiPost('/api/power',{action:'lock'})"">Sperren (Lock)</button>
          <button onclick=""apiPost('/api/power',{action:'monitors_off'})"">Monitore Aus</button>
          <button onclick=""apiPost('/api/power',{action:'monitors_on'})"">Monitore Ein</button>
          <button onclick=""apiPost('/api/power',{action:'sleep'})"">Standby (Sleep)</button>
          <button onclick=""if(confirm('PC wirklich herunterfahren?')) apiPost('/api/power',{action:'shutdown',delaySeconds:5})"">Shutdown</button>
        </div>
      </div>

      <div>
        <div class=""sec-title"">Media & Master Volume</div>
        <div class=""btn-grid"" style=""grid-template-columns:repeat(4,1fr);"">
          <button onclick=""apiPost('/api/media/control',{action:'prev'})"">⏮</button>
          <button onclick=""apiPost('/api/media/control',{action:'play_pause'})"">⏯</button>
          <button onclick=""apiPost('/api/media/control',{action:'next'})"">⏭</button>
          <button onclick=""apiPost('/api/media/control',{action:'mute'})"">🔇</button>
        </div>
        <input type=""range"" min=""0"" max=""100"" value=""50"" id=""volSlider"" style=""width:100%;margin-top:8px;"" onchange=""apiPost('/api/media/control',{action:'set_volume',volumePercent:Number(this.value)})"" />
      </div>

      <div>
        <div class=""sec-title"">PowerShell Direct Console</div>
        <textarea id=""psInput"" rows=""3"">Get-Process | Sort-Object CPU -Descending | Select-Object -First 8 Name, CPU, WorkingSet64</textarea>
        <button onclick=""runPs()"" style=""width:100%;margin-top:6px;background:var(--text-primary);color:var(--bg-canvas);font-weight:500;"">Execute PowerShell</button>
        <pre id=""psOutput"" style=""margin-top:6px;"">Ready.</pre>
      </div>
    </aside>
  </div>

  <script>
    let currentMonitor = '0';
    const img = document.getElementById('kvmScreen');

    function setMonitor(m, btn) {
      currentMonitor = m;
      document.querySelectorAll('.mon-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      img.src = `/api/screen/stream?monitor=${encodeURIComponent(m)}&fps=8&scale=0.65&t=${Date.now()}`;
    }

    function getNormCoords(e) {
      const rect = img.getBoundingClientRect();
      return {
        normalizedX: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        normalizedY: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
      };
    }

    img.addEventListener('click', e => {
      const c = getNormCoords(e);
      apiPost('/api/screen/input', { type: 'click', monitor: currentMonitor, ...c });
    });

    img.addEventListener('dblclick', e => {
      const c = getNormCoords(e);
      apiPost('/api/screen/input', { type: 'dblclick', monitor: currentMonitor, ...c });
    });

    img.addEventListener('contextmenu', e => {
      e.preventDefault();
      const c = getNormCoords(e);
      apiPost('/api/screen/input', { type: 'right_click', monitor: currentMonitor, ...c });
    });

    img.addEventListener('wheel', e => {
      e.preventDefault();
      const c = getNormCoords(e);
      apiPost('/api/screen/input', { type: 'wheel', monitor: currentMonitor, deltaY: e.deltaY < 0 ? 120 : -120, ...c });
    });

    function sendText() {
      const box = document.getElementById('typeBox');
      if (!box.value) return;
      apiPost('/api/screen/input', { type: 'text', monitor: currentMonitor, text: box.value });
      box.value = '';
    }

    function sendKey(k) {
      apiPost('/api/screen/input', { type: 'key', monitor: currentMonitor, key: k });
    }

    async function apiPost(path, body) {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      refreshStatus();
      return res.json();
    }

    async function runPs() {
      const cmd = document.getElementById('psInput').value;
      const out = document.getElementById('psOutput');
      out.textContent = 'Running...';
      const res = await apiPost('/api/powershell/exec', { command: cmd });
      out.textContent = (res.stdout || res.stderr || JSON.stringify(res, null, 2));
    }

    async function refreshStatus() {
      try {
        const r = await fetch('/api/status');
        const s = await r.json();
        document.getElementById('statCpuRam').textContent = `${s.cpuUsagePercent}% · ${s.memoryUsedGb}/${s.memoryTotalGb} GB`;
        document.getElementById('statSession').textContent = `${s.username} (${s.sessionLocked ? 'LOCKED' : 'ACTIVE'})`;
        document.getElementById('statWindow').textContent = s.activeWindowTitle || s.activeProcessName || '—';
        document.getElementById('statVolume').textContent = `${s.media.volumePercent}% ${s.media.muted ? '(MUTE)' : ''}`;
        document.getElementById('volSlider').value = s.media.volumePercent;
      } catch {}
    }

    setInterval(refreshStatus, 3000);
    refreshStatus();
  </script>
</body>
</html>";
}
