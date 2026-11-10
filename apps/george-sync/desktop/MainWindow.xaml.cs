using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Media;

namespace GeorgeExporter
{
    public partial class MainWindow : Window
    {
        private const string PrimaryApiUrl = "http://192.168.188.92:8099/api/apps/finance-analytics/import-bank-csv";
        private const string FallbackApiUrl = "http://localhost:8099/api/apps/finance-analytics/import-bank-csv";
        private const string GeorgeUrl = "https://george.sparkasse.at/index.html#/login";

        private readonly HttpClient _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        private FileSystemWatcher? _downloadsWatcher;
        private readonly string _downloadsDir;
        private string? _lastProcessedPath;
        private DateTime _lastProcessedTime = DateTime.MinValue;

        public MainWindow()
        {
            InitializeComponent();

            _downloadsDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                "Downloads"
            );
            TxtWatchPath.Text = _downloadsDir;

            SetupDownloadsWatcher();
            Log("Bereit. Ziehe eine Export-Datei auf das Fenster oder starte den Mini-Browser.");
        }

        private void SetupDownloadsWatcher()
        {
            try
            {
                if (!Directory.Exists(_downloadsDir)) return;

                _downloadsWatcher = new FileSystemWatcher(_downloadsDir)
                {
                    NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite | NotifyFilters.Size,
                    IncludeSubdirectories = false,
                    EnableRaisingEvents = ChkAutoWatch.IsChecked == true
                };

                _downloadsWatcher.Created += OnNewDownloadDetected;
                _downloadsWatcher.Changed += OnNewDownloadDetected;
            }
            catch (Exception ex)
            {
                Log($"[Warnung] Download-Überwachung konnte nicht gestartet werden: {ex.Message}");
            }
        }

        private void OnNewDownloadDetected(object sender, FileSystemEventArgs e)
        {
            if (ChkAutoWatch.IsChecked != true) return;

            var ext = Path.GetExtension(e.FullPath).ToLowerInvariant();
            if (ext != ".zip" && ext != ".csv" && ext != ".xml" && ext != ".sta" && ext != ".mt940") return;

            var name = Path.GetFileName(e.FullPath);
            if (!Regex.IsMatch(name, @"(^AT\d{2}|^\d{12,20}\.zip$|george|sparkasse|kontoauszug|umsatz|umsaetze|export)", RegexOptions.IgnoreCase))
            {
                return;
            }

            // Debounce duplicate events
            if (e.FullPath == _lastProcessedPath && (DateTime.UtcNow - _lastProcessedTime).TotalSeconds < 5)
            {
                return;
            }

            _lastProcessedPath = e.FullPath;
            _lastProcessedTime = DateTime.UtcNow;

            Dispatcher.InvokeAsync(async () =>
            {
                Log($"[Auto-Detect] Neuer Bank-Export in Downloads erkannt: {name}");
                // Wait 400ms for browser to finish writing file
                await Task.Delay(400);
                await ProcessAndUploadFileAsync(e.FullPath);
            });
        }

        private void BtnLaunchBrowser_Click(object sender, RoutedEventArgs e)
        {
            Log("Starte George Mini-Browser...");

            string[] candidateEdgePaths = {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
            };

            string? edgeExe = null;
            foreach (var path in candidateEdgePaths)
            {
                if (File.Exists(path))
                {
                    edgeExe = path;
                    break;
                }
            }

            try
            {
                if (edgeExe != null)
                {
                    // Launch Edge in chromeless application mode
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = edgeExe,
                        Arguments = $"--app=\"{GeorgeUrl}\" --window-size=1180,820",
                        UseShellExecute = false
                    });
                    Log("George Mini-Browser geöffnet. Exportiere CSV/CAMT.053 und ziehe die Datei hierher.");
                }
                else
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = GeorgeUrl,
                        UseShellExecute = true
                    });
                    Log("George im Standardbrowser geöffnet.");
                }
            }
            catch (Exception ex)
            {
                Log($"[Fehler] Browser konnte nicht gestartet werden: {ex.Message}");
            }
        }

        private void Window_DragEnter(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effects = DragDropEffects.Copy;
                HighlightDropZone(true);
            }
            else
            {
                e.Effects = DragDropEffects.None;
            }
            e.Handled = true;
        }

        private void Window_DragOver(object sender, DragEventArgs e)
        {
            if (e.Data.GetDataPresent(DataFormats.FileDrop))
            {
                e.Effects = DragDropEffects.Copy;
                HighlightDropZone(true);
            }
            else
            {
                e.Effects = DragDropEffects.None;
            }
            e.Handled = true;
        }

        private void Window_DragLeave(object sender, DragEventArgs e)
        {
            HighlightDropZone(false);
            e.Handled = true;
        }

        private async void Window_Drop(object sender, DragEventArgs e)
        {
            HighlightDropZone(false);
            if (!e.Data.GetDataPresent(DataFormats.FileDrop)) return;

            var files = (string[])e.Data.GetData(DataFormats.FileDrop);
            if (files != null && files.Length > 0)
            {
                var filePath = files[0];
                Log($"[Drop] Datei erhalten: {Path.GetFileName(filePath)}");
                await ProcessAndUploadFileAsync(filePath);
            }
            e.Handled = true;
        }

        private void DropZone_Click(object sender, System.Windows.Input.MouseButtonEventArgs e)
        {
            OpenFilePicker();
        }

        private void BtnManualFilePicker_Click(object sender, RoutedEventArgs e)
        {
            OpenFilePicker();
        }

        private async void OpenFilePicker()
        {
            var dialog = new Microsoft.Win32.OpenFileDialog
            {
                Title = "Bank-Export auswählen (George ZIP, CSV, CAMT.053, MT940)",
                Filter = "Bank-Exporte (*.zip;*.csv;*.xml;*.sta;*.mt940)|*.zip;*.csv;*.xml;*.sta;*.mt940|Alle Dateien (*.*)|*.*",
                InitialDirectory = Directory.Exists(_downloadsDir) ? _downloadsDir : Environment.GetFolderPath(Environment.SpecialFolder.UserProfile)
            };

            if (dialog.ShowDialog() == true)
            {
                Log($"[Picker] Datei ausgewählt: {dialog.SafeFileName}");
                await ProcessAndUploadFileAsync(dialog.FileName);
            }
        }

        private async Task ProcessAndUploadFileAsync(string filePath)
        {
            if (!File.Exists(filePath))
            {
                Log($"[Fehler] Datei nicht gefunden: {filePath}");
                return;
            }

            try
            {
                SetStatus("Importiere...", "#38bdf8", isBusy: true);

                var fileName = Path.GetFileName(filePath);
                byte[] fileBytes;

                // Read with retry in case browser still holds lock
                int attempts = 0;
                while (true)
                {
                    try
                    {
                        using var fs = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
                        using var ms = new MemoryStream();
                        await fs.CopyToAsync(ms);
                        fileBytes = ms.ToArray();
                        break;
                    }
                    catch (IOException)
                    {
                        attempts++;
                        if (attempts > 6) throw;
                        await Task.Delay(250);
                    }
                }

                if (fileBytes.Length == 0)
                {
                    Log($"[Fehler] Datei {fileName} ist leer (0 Bytes).");
                    SetStatus("Leere Datei", "#ef4444");
                    return;
                }

                var base64 = Convert.ToBase64String(fileBytes);
                var payload = new
                {
                    fileName,
                    base64Content = base64
                };

                var jsonString = JsonSerializer.Serialize(payload);
                var content = new StringContent(jsonString, Encoding.UTF8, "application/json");

                HttpResponseMessage response;
                try
                {
                    response = await _httpClient.PostAsync(PrimaryApiUrl, content);
                }
                catch (Exception)
                {
                    Log("[Hinweis] Primärer Host nicht erreichbar, versuche localhost:8099...");
                    var fallbackContent = new StringContent(jsonString, Encoding.UTF8, "application/json");
                    response = await _httpClient.PostAsync(FallbackApiUrl, fallbackContent);
                }

                var responseBody = await response.Content.ReadAsStringAsync();
                if (!response.IsSuccessStatusCode)
                {
                    Log($"[API-Fehler {response.StatusCode}] {responseBody}");
                    SetStatus("Fehler bei Übertragung", "#ef4444");
                    return;
                }

                using var doc = JsonDocument.Parse(responseBody);
                var root = doc.RootElement;

                int imported = root.TryGetProperty("importedCount", out var pImp) ? pImp.GetInt32() : 0;
                int skipped = root.TryGetProperty("skippedDuplicates", out var pSkip) ? pSkip.GetInt32() : 0;
                int total = root.TryGetProperty("totalParsed", out var pTot) ? pTot.GetInt32() : 0;
                string format = root.TryGetProperty("format", out var pFmt) ? pFmt.GetString() ?? "CSV" : "CSV";

                double? balance = null;
                if (root.TryGetProperty("kpis", out var kpis) && kpis.TryGetProperty("currentBalance", out var pBal))
                {
                    balance = pBal.GetDouble();
                }

                var nowStr = DateTime.Now.ToString("HH:mm:ss");
                TxtLastImport.Text = nowStr;

                if (balance.HasValue)
                {
                    TxtBalance.Text = $"€ {balance.Value:N2}";
                }

                SetStatus("Erfolgreich synchronisiert", "#10b981");
                Log($"[Erfolg] {imported} neu importiert, {skipped} Duplikate (Format: {format}) um {nowStr}.");

                try
                {
                    System.Media.SystemSounds.Asterisk.Play();
                }
                catch { }
            }
            catch (Exception ex)
            {
                Log($"[Ausnahme] {ex.Message}");
                SetStatus("Fehler", "#ef4444");
            }
        }

        private void HighlightDropZone(bool highlight)
        {
            if (highlight)
            {
                DropZoneBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#182234"));
                DropZoneBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8"));
                DropZoneTitle.Text = "Jetzt loslassen zum Importieren!";
                DropZoneTitle.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#38bdf8"));
            }
            else
            {
                DropZoneBorder.Background = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#111113"));
                DropZoneBorder.BorderBrush = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#3f3f46"));
                DropZoneTitle.Text = "Kontoauszug hierher ziehen";
                DropZoneTitle.Foreground = new SolidColorBrush((Color)ColorConverter.ConvertFromString("#fafafa"));
            }
        }

        private void SetStatus(string status, string hexColor, bool isBusy = false)
        {
            TxtStatus.Text = status;
            var color = (Color)ColorConverter.ConvertFromString(hexColor);
            TxtStatus.Foreground = new SolidColorBrush(color);
            StatusDot.Fill = new SolidColorBrush(color);
        }

        private void Log(string message)
        {
            var line = $"[{DateTime.Now:HH:mm:ss}] {message}";
            TxtLog.Text = line + Environment.NewLine + TxtLog.Text;
        }

        private void ChkAutoWatch_Toggled(object sender, RoutedEventArgs e)
        {
            if (_downloadsWatcher != null)
            {
                _downloadsWatcher.EnableRaisingEvents = ChkAutoWatch.IsChecked == true;
                Log(ChkAutoWatch.IsChecked == true
                    ? "Downloads-Überwachung aktiviert."
                    : "Downloads-Überwachung pausiert.");
            }
        }

        private void BtnPinShortcut_Click(object sender, RoutedEventArgs e)
        {
            try
            {
                var exePath = Process.GetCurrentProcess().MainModule?.FileName;
                if (string.IsNullOrEmpty(exePath))
                {
                    exePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "GeorgeExporter.exe");
                }

                var desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                var programsDir = Environment.GetFolderPath(Environment.SpecialFolder.Programs);

                var desktopLink = Path.Combine(desktopDir, "Erste Bank Exporter.lnk");
                var programsLink = Path.Combine(programsDir, "Erste Bank Exporter.lnk");

                CreateShortcut(desktopLink, exePath, "Erste Bank George Exporter für Thassi");
                CreateShortcut(programsLink, exePath, "Erste Bank George Exporter für Thassi");

                Log($"[Verknüpfung] Auf Desktop und im Startmenü erstellt. Rechtsklick auf Desktop-Icon -> 'An Taskleiste anheften'!");
                MessageBox.Show(
                    "Verknüpfung wurde auf dem Desktop und im Startmenü erstellt!\n\nKlicke nun mit der rechten Maustaste auf das Desktop-Icon und wähle:\n'An Taskleiste anheften'.\n\nDanach sitzt die Mini-App direkt in deiner Taskleiste!",
                    "Taskleiste anheften",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information
                );
            }
            catch (Exception ex)
            {
                Log($"[Fehler] Shortcut konnte nicht automatisch erstellt werden: {ex.Message}");
            }
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string description)
        {
            // Use PowerShell to create Windows Shell Link without COM interop dependencies
            var psScript = $@"
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut('{shortcutPath.Replace("'", "''")}')
$Shortcut.TargetPath = '{targetPath.Replace("'", "''")}'
$Shortcut.WorkingDirectory = '{Path.GetDirectoryName(targetPath)?.Replace("'", "''")}'
$Shortcut.Description = '{description.Replace("'", "''")}'
$Shortcut.Save()
";
            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -NonInteractive -Command \"{psScript.Replace("\r\n", " ").Replace("\"", "\\\"")}\"",
                CreateNoWindow = true,
                UseShellExecute = false
            };
            using var p = Process.Start(psi);
            p?.WaitForExit(3000);
        }
    }
}
