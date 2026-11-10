using System;
using System.IO;
using System.Windows;
using System.Windows.Threading;

namespace GeorgeExporter;

public partial class App : Application
{
    private static readonly string LogFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "GeorgeExporter",
        "debug.log"
    );

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        AppDomain.CurrentDomain.UnhandledException += (s, args) =>
        {
            LogCrash("AppDomain UnhandledException", args.ExceptionObject as Exception);
        };

        DispatcherUnhandledException += (s, args) =>
        {
            LogCrash("Dispatcher UnhandledException", args.Exception);
            args.Handled = false;
        };

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogFile)!);
            File.AppendAllText(LogFile, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] Starting MainWindow...\n");

            var mainWindow = new MainWindow();
            this.MainWindow = mainWindow;
            mainWindow.Show();

            File.AppendAllText(LogFile, $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] MainWindow Shown successfully.\n");
        }
        catch (Exception ex)
        {
            LogCrash("Startup Exception", ex);
        }
    }

    private static void LogCrash(string context, Exception? ex)
    {
        try
        {
            var msg = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] FATAL {context}: {ex?.ToString()}\n";
            File.AppendAllText(LogFile, msg);
            MessageBox.Show(
                $"Fehler beim Starten von George Exporter:\n\n{ex?.Message}\n\nDetails siehe:\n{LogFile}",
                "George Exporter Fehler",
                MessageBoxButton.OK,
                MessageBoxImage.Error
            );
        }
        catch { }
    }
}
