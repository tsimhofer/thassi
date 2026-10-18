using Android.App;
using Android.Appwidget;
using Android.Content;
using Android.Views;
using Android.Widget;

namespace Thassi.ControlApp;

[BroadcastReceiver(
    Name = "com.companyname.thassi.controlapp.ThassiWidgetProvider",
    Label = "Thassi Voice & Pipeline",
    Exported = true)]
[IntentFilter(new[]
{
    AppWidgetManager.ActionAppwidgetUpdate,
    ActionToggleExpand
})]
[MetaData("android.appwidget.provider", Resource = "@xml/thassi_widget_info")]
public class ThassiWidgetProvider : AppWidgetProvider
{
    public const string ActionToggleExpand = "com.companyname.thassi.controlapp.ACTION_TOGGLE_EXPAND";
    public const string ActionStartVoiceFromWidget = "com.companyname.thassi.controlapp.ACTION_START_VOICE";

    private static bool _isExpanded = true;
    private static string _lastRecognizedText = "Bereit für Sprachbefehl.";
    private static string _lastStageTitle = "● THASSI BEREIT";
    private static string _lastPipelineDetail = "Pipeline: 1.Check · 2.Repo · 3.Code · 4.Git · 5.Docker · 6.Live";
    private static int _lastProgress = 100;

    public override void OnUpdate(Context? context, AppWidgetManager? appWidgetManager, int[]? appWidgetIds)
    {
        if (context == null || appWidgetManager == null || appWidgetIds == null) return;
        foreach (var widgetId in appWidgetIds)
        {
            RenderWidget(context, appWidgetManager, widgetId);
        }
    }

    public override void OnReceive(Context? context, Intent? intent)
    {
        base.OnReceive(context, intent);
        if (context == null || intent == null) return;

        if (intent.Action == ActionToggleExpand)
        {
            _isExpanded = !_isExpanded;
            RefreshAll(context);
        }
    }

    public static void UpdateWidgetState(
        Context context,
        string? recognizedText = null,
        string? stageTitle = null,
        string? pipelineDetail = null,
        int? progressPercent = null,
        bool? forceExpanded = null)
    {
        if (!string.IsNullOrWhiteSpace(recognizedText))
            _lastRecognizedText = recognizedText;
        if (!string.IsNullOrWhiteSpace(stageTitle))
            _lastStageTitle = stageTitle;
        if (!string.IsNullOrWhiteSpace(pipelineDetail))
            _lastPipelineDetail = pipelineDetail;
        if (progressPercent.HasValue)
            _lastProgress = Math.Clamp(progressPercent.Value, 0, 100);
        if (forceExpanded.HasValue)
            _isExpanded = forceExpanded.Value;

        RefreshAll(context);
    }

    private static void RefreshAll(Context context)
    {
        try
        {
            var mgr = AppWidgetManager.GetInstance(context);
            if (mgr == null) return;
            var cn = new ComponentName(context, Java.Lang.Class.FromType(typeof(ThassiWidgetProvider)));
            var ids = mgr.GetAppWidgetIds(cn);
            if (ids == null || ids.Length == 0) return;

            foreach (var id in ids)
            {
                RenderWidget(context, mgr, id);
            }
        }
        catch
        {
            // Ignore widget update error if launcher doesn't support it
        }
    }

    private static void RenderWidget(Context context, AppWidgetManager mgr, int widgetId)
    {
        var views = new RemoteViews(context.PackageName, Resource.Layout.thassi_widget);

        var expandGlyph = _isExpanded ? "▾" : "▸";
        views.SetTextViewText(Resource.Id.widget_stage_title, $"{_lastStageTitle}  {expandGlyph}");
        views.SetTextViewText(Resource.Id.widget_recognized_preview, $"\"{_lastRecognizedText}\"");
        views.SetTextViewText(Resource.Id.widget_recognized_full, $"Erkannter Text: \"{_lastRecognizedText}\"");
        views.SetTextViewText(Resource.Id.widget_pipeline_detail, _lastPipelineDetail);
        views.SetProgressBar(Resource.Id.widget_progress_bar, 100, _lastProgress, false);

        views.SetViewVisibility(
            Resource.Id.widget_expanded_section,
            _isExpanded ? ViewStates.Visible : ViewStates.Gone);

        // Tap on header toggles expand/collapse right on the Home Screen
        var toggleIntent = new Intent(context, typeof(ThassiWidgetProvider));
        toggleIntent.SetAction(ActionToggleExpand);
        var togglePending = PendingIntent.GetBroadcast(
            context,
            101,
            toggleIntent,
            PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable);
        views.SetOnClickPendingIntent(Resource.Id.widget_header_area, togglePending);

        // Tap on "🎤 Sprechen" launches MainActivity directly into expanded continuous listening mode
        var voiceIntent = new Intent(context, typeof(MainActivity));
        voiceIntent.SetAction(ActionStartVoiceFromWidget);
        voiceIntent.SetFlags(ActivityFlags.NewTask | ActivityFlags.SingleTop | ActivityFlags.ClearTop);
        var voicePending = PendingIntent.GetActivity(
            context,
            102,
            voiceIntent,
            PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable);
        views.SetOnClickPendingIntent(Resource.Id.widget_mic_button, voicePending);

        // Tap on expanded body opens MainActivity
        var openIntent = new Intent(context, typeof(MainActivity));
        openIntent.SetFlags(ActivityFlags.NewTask | ActivityFlags.SingleTop);
        var openPending = PendingIntent.GetActivity(
            context,
            103,
            openIntent,
            PendingIntentFlags.UpdateCurrent | PendingIntentFlags.Immutable);
        views.SetOnClickPendingIntent(Resource.Id.widget_expanded_section, openPending);

        mgr.UpdateAppWidget(widgetId, views);
    }
}
