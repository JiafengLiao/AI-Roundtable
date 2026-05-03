# APD Development README

This file collects the Windows commands for opening, developing, verifying, packaging, and releasing APD.

Project root:

```powershell
cd C:\Users\ThinkPad\Desktop\vibe_coding_projects\APD
```

PowerShell on this machine may block `npm.ps1`, so prefer `npm.cmd`.

## Open The App

Run the packaged installer:

```powershell
& "C:\Users\ThinkPad\Desktop\vibe_coding_projects\APD\src-tauri\target\release\bundle\nsis\APD AI Roundtable Workbench_0.1.0_x64-setup.exe"
```

After installation, open **APD AI Roundtable Workbench** from the Windows Start menu.

Run the built desktop executable directly:

```powershell
& "C:\Users\ThinkPad\Desktop\vibe_coding_projects\APD\src-tauri\target\release\apd-ai-roundtable-workbench.exe"
```

## Install Dependencies

```powershell
npm.cmd install
```

## Frontend Development

Start the Vite dev server:

```powershell
npm.cmd run dev
```

Open:

```text
http://127.0.0.1:1420
```

Preview a production frontend build:

```powershell
npm.cmd run build
npm.cmd run preview
```

## Tauri Development

Ensure Cargo is available in the current PowerShell session:

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo --version
```

Start the Tauri desktop dev window:

```powershell
npm.cmd run tauri:dev
```

Tauri backend calls use `invoke(...)`, not HTTP. They will not appear in the browser Network panel. Use the Tauri desktop window, check the DevTools Console for frontend errors, and check local JSON output under the app data directory for saved drafts.

If MSVC linker variables are missing, load the Visual Studio Build Tools environment first:

```powershell
$vcvars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
$envLines = cmd.exe /c "call `"$vcvars`" >nul && set"
foreach ($line in $envLines) {
  if ($line -match "^(.*?)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
  }
}
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
npm.cmd run tauri:dev
```

## Verify

Run TypeScript checks:

```powershell
npm.cmd run typecheck
```

Run lint:

```powershell
npm.cmd run lint
```

Run frontend production build:

```powershell
npm.cmd run build
```

Recommended pre-commit verification:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

## Package Windows Installer

Basic command:

```powershell
npm.cmd run tauri:build
```

More reliable command when running from a plain PowerShell session:

```powershell
$vcvars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
$envLines = cmd.exe /c "call `"$vcvars`" >nul && set"
foreach ($line in $envLines) {
  if ($line -match "^(.*?)=(.*)$") {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
  }
}
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
npm.cmd run tauri:build
```

Expected outputs:

```text
src-tauri\target\release\apd-ai-roundtable-workbench.exe
src-tauri\target\release\bundle\nsis\APD AI Roundtable Workbench_0.1.0_x64-setup.exe
```

## Rust And Build Tools

Check Rust:

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
rustc --version
cargo --version
rustup show
```

Install Rust manually if needed:

```powershell
$installer = Join-Path $env:TEMP "rustup-init.exe"
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $installer
& $installer -y --default-toolchain stable --profile default
```

Install Visual Studio Build Tools manually if needed:

```powershell
$installer = Join-Path $env:TEMP "vs_BuildTools.exe"
Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_BuildTools.exe" -OutFile $installer
Start-Process -FilePath $installer -ArgumentList "--quiet","--wait","--norestart","--nocache","--add","Microsoft.VisualStudio.Workload.VCTools","--includeRecommended" -Wait
```

Check MSVC tools:

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
Get-ChildItem "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC" -Recurse -Filter link.exe | Select-Object -First 5 FullName
```

## GitHub CI

The PR workflow is defined at:

```text
.github\workflows\ci.yml
```

It runs:

```powershell
npm.cmd install
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
npm.cmd run tauri:build
```

## GitHub Release

The release workflow is defined at:

```text
.github\workflows\release.yml
```

Create a release by pushing an app tag:

```powershell
git tag app-v0.1.0
git push origin app-v0.1.0
```

The workflow creates a draft GitHub release and uploads the Windows installer artifact.

## Useful Cleanup

Remove frontend build output:

```powershell
Remove-Item -Recurse -Force dist
```

Remove Rust/Tauri build output:

```powershell
Remove-Item -Recurse -Force src-tauri\target
```

Remove dependencies and reinstall:

```powershell
Remove-Item -Recurse -Force node_modules
npm.cmd install
```

Use cleanup commands carefully; they delete generated files and dependencies.
