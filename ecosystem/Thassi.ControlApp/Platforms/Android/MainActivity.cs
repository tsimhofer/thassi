using Android.App;
using Android.Content;
using Android.Content.PM;
using Android.OS;
using Android.Speech;

namespace Thassi.ControlApp;

[Activity(
    Theme = "@style/Maui.SplashTheme",
    MainLauncher = true,
    LaunchMode = LaunchMode.SingleTop,
    ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
    private const int SpeechRequestCode = 9042;
    public static MainActivity? Instance { get; private set; }
    private TaskCompletionSource<string?>? _speechTcs;

    protected override void OnCreate(Bundle? savedInstanceState)
    {
        base.OnCreate(savedInstanceState);
        Instance = this;
    }

    public Task<string?> RecognizeSpeechAsync()
    {
        _speechTcs?.TrySetCanceled();
        _speechTcs = new TaskCompletionSource<string?>();

        try
        {
            var intent = new Intent(RecognizerIntent.ActionRecognizeSpeech);
            intent.PutExtra(RecognizerIntent.ExtraLanguageModel, RecognizerIntent.LanguageModelFreeForm);
            intent.PutExtra(RecognizerIntent.ExtraLanguage, "de-DE");
            intent.PutExtra(RecognizerIntent.ExtraPrompt, "Thassi Sprachbefehl sprechen (z.B. 'Erstelle Add-on System Monitor')...");
            StartActivityForResult(intent, SpeechRequestCode);
        }
        catch (Exception)
        {
            _speechTcs.TrySetResult(null);
        }

        return _speechTcs.Task;
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
                _speechTcs?.TrySetResult(spokenText);
            }
            else
            {
                _speechTcs?.TrySetResult(null);
            }
        }
    }
}
