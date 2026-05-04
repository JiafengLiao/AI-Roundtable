# AI小圆桌开发 README

这个文件整理 **AI小圆桌** 的本地开发、验证、打包和发布命令。项目内部名统一为 `ai-roundtable`。

项目根目录：

```powershell
cd C:\Users\ThinkPad\Desktop\vibe_coding_projects\APD
```

Windows PowerShell 下优先使用 `npm.cmd`。macOS 和 Linux 使用普通 `npm`。

## 打开应用

运行打包后的安装器：

```powershell
& "C:\Users\ThinkPad\Desktop\vibe_coding_projects\APD\src-tauri\target\release\bundle\nsis\AI小圆桌_0.1.0_x64-setup.exe"
```

安装后，从 Windows 开始菜单打开 **AI小圆桌**。

直接运行构建出的桌面程序：

```powershell
& "C:\Users\ThinkPad\Desktop\vibe_coding_projects\APD\src-tauri\target\release\ai-roundtable.exe"
```

## 安装依赖

Windows：

```powershell
npm.cmd install
```

macOS：

```bash
npm install
```

## 前端开发

启动 Vite 开发服务器：

```powershell
npm.cmd run dev
```

macOS：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:1420
```

预览生产前端构建：

```powershell
npm.cmd run build
npm.cmd run preview
```

macOS：

```bash
npm run build
npm run preview
```

## Tauri 开发

确保当前 PowerShell 会话能访问 Cargo：

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo --version
```

启动 Tauri 桌面开发窗口：

```powershell
npm.cmd run tauri:dev
```

macOS 先安装 Xcode Command Line Tools：

```bash
xcode-select --install
npm run tauri:dev
```

Tauri 后端调用使用 `invoke(...)`，不是 HTTP，所以不会出现在浏览器 Network 面板里。调试时看 Tauri 桌面窗口、DevTools Console，以及 app data 目录下的本地 JSON 输出。

## LLM Prompt 配置

内置 prompt 和 persona 配置：

```text
config\prompts\personas.json
config\prompts\style-guide.json
config\prompts\tasks\plan.json
config\prompts\tasks\draft-single.json
config\prompts\tasks\draft-turn-planner.json
config\prompts\tasks\draft-guest-turn.json
config\prompts\schemas\*.schema.json
config\prompts\fallbacks.json
```

首次运行时，应用会把配置种子写入 Tauri app data 目录：

```text
%APPDATA%\com.ai.roundtable\llm-prompts.json
```

macOS app data 路径：

```text
~/Library/Application Support/com.ai.roundtable/llm-prompts.json
```

运行时会优先读取 version 3 或更新版本的 app data 配置。想做本地 prompt 调优，可以改 app data 文件；想改内置默认值，可以改 `config\prompts\` 下的文件。

## 验证

运行 TypeScript 检查：

```powershell
npm.cmd run typecheck
```

macOS：

```bash
npm run typecheck
```

运行 lint：

```powershell
npm.cmd run lint
```

macOS：

```bash
npm run lint
```

运行前端生产构建：

```powershell
npm.cmd run build
```

macOS：

```bash
npm run build
```

推荐提交前验证：

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

macOS：

```bash
npm run typecheck
npm run lint
npm run build
```

## 打包 Windows 安装器

基础命令：

```powershell
npm.cmd run tauri:build
```

如果是在普通 PowerShell 会话里，下面这组命令更稳：

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

预期输出：

```text
src-tauri\target\release\ai-roundtable.exe
src-tauri\target\release\bundle\nsis\AI小圆桌_0.1.0_x64-setup.exe
```

## 本地打包 macOS App

macOS 包必须在 Mac 上构建。先安装 Xcode Command Line Tools 和 Rust：

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm install
```

构建当前 Mac 架构的未签名 app 和 DMG：

```bash
npm run tauri:build:mac
```

预期输出：

```text
src-tauri/target/release/bundle/macos/AI小圆桌.app
src-tauri/target/release/bundle/dmg/AI小圆桌_0.1.0_*.dmg
```

构建同时兼容 Apple Silicon 和 Intel 的 universal app：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri:build:mac:universal
```

个人使用可以运行本地未签名 app。要公开分发给其他 Mac 用户，需要 Apple Developer 代码签名和公证；没有签名/公证时，Gatekeeper 可能会拦截或提示风险。

## Rust 和构建工具

检查 Rust：

```powershell
$env:PATH="$env:USERPROFILE\.cargo\bin;$env:PATH"
rustc --version
cargo --version
rustup show
```

必要时手动安装 Rust：

```powershell
$installer = Join-Path $env:TEMP "rustup-init.exe"
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $installer
& $installer -y --default-toolchain stable --profile default
```

必要时手动安装 Visual Studio Build Tools：

```powershell
$installer = Join-Path $env:TEMP "vs_BuildTools.exe"
Invoke-WebRequest -Uri "https://aka.ms/vs/17/release/vs_BuildTools.exe" -OutFile $installer
Start-Process -FilePath $installer -ArgumentList "--quiet","--wait","--norestart","--nocache","--add","Microsoft.VisualStudio.Workload.VCTools","--includeRecommended" -Wait
```

## GitHub CI

PR workflow 在 `.github\workflows\ci.yml`，会执行依赖安装、typecheck、lint、前端构建和 Windows Tauri 构建 smoke test。macOS 用户可以按上面的本地构建命令自行打包。

## GitHub Release

推送 app tag 创建 release：

```powershell
git tag app-v0.1.0
git push origin app-v0.1.0
```

workflow 会创建 draft GitHub release，并上传 Windows 安装器。macOS 公开发布产物建议等签名和公证配置完成后再加入。

## 常用清理

下面的命令会删除生成物和依赖，使用时要确认清楚。

```powershell
Remove-Item -Recurse -Force dist
Remove-Item -Recurse -Force src-tauri\target
Remove-Item -Recurse -Force node_modules
npm.cmd install
```
