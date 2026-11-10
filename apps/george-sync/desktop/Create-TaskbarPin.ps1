# Thassi George Exporter — Taskbar & Desktop Shortcut Installer
$WshShell = New-Object -ComObject WScript.Shell

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExePath = Join-Path $ScriptDir "dist\GeorgeExporter.exe"

if (-not (Test-Path $ExePath)) {
    $ExePath = Join-Path $ScriptDir "bin\Release\net10.0-windows\GeorgeExporter.exe"
}

if (-not (Test-Path $ExePath)) {
    Write-Host "[!] GeorgeExporter.exe wurde nicht gefunden. Führe erst 'dotnet publish' aus." -ForegroundColor Red
    exit 1
}

# 1. Desktop Shortcut
$DesktopPath = [Environment]::GetFolderPath('Desktop')
$DesktopLink = Join-Path $DesktopPath "Erste Bank Exporter.lnk"
$Shortcut = $WshShell.CreateShortcut($DesktopLink)
$Shortcut.TargetPath = $ExePath
$Shortcut.WorkingDirectory = Split-Path -Parent $ExePath
$Shortcut.Description = "Erste Bank George Fast-Export & Sync Bridge für Thassi"
$Shortcut.Save()

# 2. Start Menu Programs Shortcut
$ProgramsPath = [Environment]::GetFolderPath('Programs')
$ProgramsLink = Join-Path $ProgramsPath "Erste Bank Exporter.lnk"
$Shortcut2 = $WshShell.CreateShortcut($ProgramsLink)
$Shortcut2.TargetPath = $ExePath
$Shortcut2.WorkingDirectory = Split-Path -Parent $ExePath
$Shortcut2.Description = "Erste Bank George Fast-Export & Sync Bridge für Thassi"
$Shortcut2.Save()

Write-Host "[OK] Verknüpfung erfolgreich erstellt auf dem Desktop:" -ForegroundColor Green
Write-Host "     $DesktopLink" -ForegroundColor Cyan
Write-Host ""
Write-Host "SO PINNST DU ES AN DIE TASKLEISTE:" -ForegroundColor Yellow
Write-Host "1. Klicke mit der rechten Maustaste auf das Desktop-Icon 'Erste Bank Exporter'"
Write-Host "2. Wähle 'An Taskleiste anheften' (oder 'Weitere Optionen anzeigen' -> 'An Taskleiste anheften')"
Write-Host "3. Fertig! Die Mini-App sitzt nun dauerhaft in deiner Taskleiste." -ForegroundColor Green
