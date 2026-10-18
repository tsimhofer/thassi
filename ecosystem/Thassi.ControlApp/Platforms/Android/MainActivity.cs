using Android;
using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Runtime;
using Android.Speech;
using AndroidX.Core.App;
using AndroidX.Core.Content;

namespace Thassi.ControlApp;

[Activity(
    Theme = "@style/Maui.SplashTheme",
    MainLauncher = true,
    LaunchMode = LaunchMode.SingleTop,
    ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity, IRecognitionListener
{
    private const int SpeechRequestCode = 9042;
    private const int RecordAudioPermCode = 9043;
    public static MainActivity? Instance { get; private set; }

    private SpeechRecognizer? _speechRecognizer;
    private Intent? _recognizerIntent;
    private bool _isContinuousListening;
    private string _accumulatedTranscript = string.Empty;
    private string _currentPartial = string.Empty;
    private DateTimeOffset _lastSpeechActivityUtc = DateTimeOffset.UtcNow;

    public event Action<string, bool>? OnLiveTranscriptChanged;
    public event Action<bool>? OnListeningStateChanged;
    public event Action? OnWidgetVoiceRequested;

    public bool IsContinuousListening => _isContinuousListening;

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        Instance = this;
        SupportActionBar?.Hide();

        if (Window != null)
        {
            var bg = Android.Graphics.Color.ParseColor("#05070D");
            Window.SetStatusBarColor(bg);
            Window.SetNavigationBarColor(bg);
        }

        // Remove default Android underline from Entry & Editor controls for pure minimalism
        Microsoft.Maui.Handlers.EntryHandler.Mapper.AppendToMapping("MinimalEntry", (handler, _) =>
        {
            handler.PlatformView.BackgroundTintList = Android.Content.Res.ColorStateList.ValueOf(Android.Graphics.Color.Transparent);
            handler.PlatformView.SetBackgroundColor(Android.Graphics.Color.Transparent);
        });
        Microsoft.Maui.Handlers.EditorHandler.Mapper.AppendToMapping("MinimalEditor", (handler, _) =>
        {
            handler.PlatformView.BackgroundTintList = Android.Content.Res.ColorStateList.ValueOf(Android.Graphics.Color.Transparent);
            handler.PlatformView.SetBackgroundColor(Android.Graphics.Color.Transparent);
        });

        CheckWidgetIntent(Intent);
    }

    protected override void OnNewIntent(Intent? intent)
    {
        base.OnNewIntent(intent);
        CheckWidgetIntent(intent);
    }

    private void CheckWidgetIntent(Intent? intent)
    {
        if (intent?.Action == ThassiWidgetProvider.ActionStartVoiceFromWidget)
        {
            MainThread.BeginInvokeOnMainThread(async () =>
            {
                await Task.Delay(350);
                OnWidgetVoiceRequested?.Invoke();
            });
        }
    }

    public void StartContinuousListening(string initialText = "")
    {
        RunOnUiThread(() =>
        {
            if (ContextCompat.CheckSelfPermission(this, Manifest.Permission.RecordAudio) != Permission.Granted)
            {
                ActivityCompat.RequestPermissions(this, new[] { Manifest.Permission.RecordAudio }, RecordAudioPermCode);
                return;
            }

            _accumulatedTranscript = initialText?.Trim() ?? string.Empty;
            _currentPartial = string.Empty;
            _isContinuousListening = true;
            _lastSpeechActivityUtc = DateTimeOffset.UtcNow;

            OnListeningStateChanged?.Invoke(true);
            BroadcastTranscriptUpdate();

            StartRecognizerSegment();
        });
    }

    public string StopContinuousListening()
    {
        var finalResult = GetCombinedTranscript();
        RunOnUiThread(() =>
        {
            _isContinuousListening = false;
            try
            {
                _speechRecognizer?.StopListening();
                _speechRecognizer?.Cancel();
                _speechRecognizer?.Destroy();
                _speechRecognizer = null;
            }
            catch { }

            OnListeningStateChanged?.Invoke(false);
        });
        return finalResult;
    }

    public double GetSecondsSinceLastSpeech() =>
        (DateTimeOffset.UtcNow - _lastSpeechActivityUtc).TotalSeconds;

    public string GetCombinedTranscript() =>
        string.Join(" ", new[] { _accumulatedTranscript, _currentPartial }.Where(s => !string.IsNullOrWhiteSpace(s))).Trim();

    private void StartRecognizerSegment()
    {
        if (!_isContinuousListening) return;

        try
        {
            if (_speechRecognizer == null)
            {
                _speechRecognizer = SpeechRecognizer.CreateSpeechRecognizer(this);
                _speechRecognizer?.SetRecognitionListener(this);
            }

            _recognizerIntent = new Intent(RecognizerIntent.ActionRecognizeSpeech);
            _recognizerIntent.PutExtra(RecognizerIntent.ExtraLanguageModel, RecognizerIntent.LanguageModelFreeForm);
            _recognizerIntent.PutExtra(RecognizerIntent.ExtraLanguage, "de-DE");
            _recognizerIntent.PutExtra(RecognizerIntent.ExtraPartialResults, true);
            _recognizerIntent.PutExtra(RecognizerIntent.ExtraMaxResults, 3);
            // Extended silence thresholds so pauses never cut off sentences prematurely
            _recognizerIntent.PutExtra(RecognizerIntent.ExtraSpeechInputCompleteSilenceLengthMillis, 8000L);
            _recognizerIntent.PutExtra(RecognizerIntent.ExtraSpeechInputPossiblyCompleteSilenceLengthMillis, 6000L);
            _recognizerIntent.PutExtra(RecognizerIntent.ExtraSpeechInputMinimumLengthMillis, 25000L);

            _speechRecognizer?.StartListening(_recognizerIntent);
        }
        catch
        {
            // Fallback to system dialog with extended timeout if direct SpeechRecognizer fails
            FallbackDialogSpeech();
        }
    }

    private void FallbackDialogSpeech()
    {
        try
        {
            var intent = new Intent(RecognizerIntent.ActionRecognizeSpeech);
            intent.PutExtra(RecognizerIntent.ExtraLanguageModel, RecognizerIntent.LanguageModelFreeForm);
            intent.PutExtra(RecognizerIntent.ExtraLanguage, "de-DE");
            intent.PutExtra(RecognizerIntent.ExtraSpeechInputCompleteSilenceLengthMillis, 8000L);
            intent.PutExtra(RecognizerIntent.ExtraSpeechInputPossiblyCompleteSilenceLengthMillis, 6000L);
            intent.PutExtra(RecognizerIntent.ExtraSpeechInputMinimumLengthMillis, 20000L);
            intent.PutExtra(RecognizerIntent.ExtraPrompt, "Thassi hört zu (lange Sprechdauer aktiv)...");
            StartActivityForResult(intent, SpeechRequestCode);
        }
        catch
        {
            StopContinuousListening();
        }
    }

    private void BroadcastTranscriptUpdate()
    {
        var text = GetCombinedTranscript();
        OnLiveTranscriptChanged?.Invoke(text, _isContinuousListening);

        if (!string.IsNullOrWhiteSpace(text))
        {
            ThassiWidgetProvider.UpdateWidgetState(
                this,
                recognizedText: text,
                stageTitle: _isContinuousListening ? "🔴 HÖRT ZU..." : "● ERKANNTER BEFEHL",
                forceExpanded: true);
        }
    }

    // --- IRecognitionListener implementation for continuous multi-segment listening ---
    public void OnReadyForSpeech(Bundle? @params) { }

    public void OnBeginningOfSpeech()
    {
        _lastSpeechActivityUtc = DateTimeOffset.UtcNow;
    }

    public void OnRmsChanged(float rmsdB) { }

    public void OnBufferReceived(byte[]? buffer) { }

    public void OnEndOfSpeech() { }

    public void OnPartialResults(Bundle? partialResults)
    {
        var matches = partialResults?.GetStringArrayList(SpeechRecognizer.ResultsRecognition);
        var partial = matches != null && matches.Count > 0 ? matches[0]?.Trim() : null;
        if (!string.IsNullOrWhiteSpace(partial))
        {
            _currentPartial = partial;
            _lastSpeechActivityUtc = DateTimeOffset.UtcNow;
            BroadcastTranscriptUpdate();
        }
    }

    public void OnResults(Bundle? results)
    {
        var matches = results?.GetStringArrayList(SpeechRecognizer.ResultsRecognition);
        var segment = matches != null && matches.Count > 0 ? matches[0]?.Trim() : null;

        if (!string.IsNullOrWhiteSpace(segment))
        {
            _accumulatedTranscript = string.IsNullOrWhiteSpace(_accumulatedTranscript)
                ? segment
                : $"{_accumulatedTranscript} {segment}";
            _currentPartial = string.Empty;
            _lastSpeechActivityUtc = DateTimeOffset.UtcNow;
            BroadcastTranscriptUpdate();
        }

        // Automatically chain the next listening segment if continuous listening is still active!
        if (_isContinuousListening)
        {
            var handler = new Handler(Looper.MainLooper!);
            handler.PostDelayed(() =>
            {
                if (_isContinuousListening)
                {
                    StartRecognizerSegment();
                }
            }, 180);
        }
    }

    public void OnError([GeneratedEnum] SpeechRecognizerError error)
    {
        if (!string.IsNullOrWhiteSpace(_currentPartial))
        {
            _accumulatedTranscript = string.IsNullOrWhiteSpace(_accumulatedTranscript)
                ? _currentPartial
                : $"{_accumulatedTranscript} {_currentPartial}";
            _currentPartial = string.Empty;
            BroadcastTranscriptUpdate();
        }

        // Keep listening across pauses (NoMatch / SpeechTimeout / Client) while continuous mode is active
        if (_isContinuousListening)
        {
            try
            {
                _speechRecognizer?.Destroy();
                _speechRecognizer = null;
            }
            catch { }

            var handler = new Handler(Looper.MainLooper!);
            handler.PostDelayed(() =>
            {
                if (_isContinuousListening)
                {
                    StartRecognizerSegment();
                }
            }, 250);
        }
    }

    public void OnEvent(int eventType, Bundle? @params) { }

    public override void OnRequestPermissionsResult(int requestCode, string[] permissions, [GeneratedEnum] Permission[] grantResults)
    {
        base.OnRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == RecordAudioPermCode && grantResults.Length > 0 && grantResults[0] == Permission.Granted)
        {
            StartContinuousListening(_accumulatedTranscript);
        }
    }

    protected override void OnActivityResult(int requestCode, Result resultCode, Intent? data)
    {
        base.OnActivityResult(requestCode, resultCode, data);
        if (requestCode == SpeechRequestCode)
        {
            if (resultCode == Result.Ok && data != null)
            {
                var matches = data.GetStringArrayListExtra(RecognizerIntent.ExtraResults);
                var spokenText = matches != null && matches.Count > 0 ? matches[0] : null;
                if (!string.IsNullOrWhiteSpace(spokenText))
                {
                    _accumulatedTranscript = string.IsNullOrWhiteSpace(_accumulatedTranscript)
                        ? spokenText
                        : $"{_accumulatedTranscript} {spokenText}";
                    _currentPartial = string.Empty;
                    _lastSpeechActivityUtc = DateTimeOffset.UtcNow;
                    BroadcastTranscriptUpdate();
                }
            }
            StopContinuousListening();
        }
    }

    public bool RequestPinHomeWidget()
    {
        try
        {
            if (Build.VERSION.SdkInt >= BuildVersionCodes.O)
            {
                var mgr = AppWidgetManager.GetInstance(this);
                var cn = new ComponentName(this, Java.Lang.Class.FromType(typeof(ThassiWidgetProvider)));
                if (mgr != null && mgr.IsRequestPinAppWidgetSupported)
                {
                    return mgr.RequestPinAppWidget(cn, null, null);
                }
            }
        }
        catch { }
        return false;
    }
}
