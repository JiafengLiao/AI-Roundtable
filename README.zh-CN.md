# AI小圆桌

AI小圆桌是一个本地桌面 AI 周度热点圆桌内容生产工作台。用户可见的中文产品名是 **AI小圆桌**，内部包名和可执行文件名统一为 `ai-roundtable`。

它帮助编辑从 RSS 和手动输入收集 AI 热点信号，让中控规划 agent 设计讨论结构，然后生成、审阅并导出可编辑的中文圆桌稿。它是面向 AI 从业者和内容编辑的生产工具，不是公共阅读网站、云 CMS，也不是“真实采访”产品。

## 它能做什么

- 从预置 RSS 源和手动输入收集 AI 热点候选。
- 按日期范围、来源数量、来源类别和匹配信号筛选候选热点。
- 先生成中控 agent 圆桌议程，再生成正文草稿。
- 用模拟角色生成中文圆桌稿：主持人、热点参与者、投资人、技术专家。
- 为草稿保留来源链接、事实核查风险、结论要点和 agent trace。
- 本地保存草稿历史。
- 从前端导出文本/PDF 类产物，并通过支持的 TTS 厂商导出 MP3 录音。

所有圆桌嘉宾都是模拟角色，不能被包装成真实受访者。发布前应回到原始来源核查关键事实，并保留不确定性提示。

## 技术栈

- 桌面端：Tauri v2
- 前端：React、TypeScript、Vite
- 后端壳层：Rust Tauri commands
- Agent 运行时：原生 Rust Tauri commands；`agent-backend/` 仅保留为实验归档
- 存储：Tauri app data 目录下的本地 JSON
- LLM：OpenAI-compatible 厂商，外加显式选择的本地 mock/rule 生成器
- TTS：OpenAI TTS 和 DashScope TTS 适配器
- 打包：Windows NSIS 安装包；macOS 用户可在本机自助构建未签名 `.app` / `.dmg`

## 环境要求

Windows：

- Node.js 和 npm
- Rust stable toolchain
- 用于 Tauri 构建的 Microsoft Visual Studio Build Tools C++ 工具链

macOS：

- Node.js 和 npm
- Rust stable toolchain
- Xcode Command Line Tools

PowerShell 可能会拦截 `npm.ps1`，所以 Windows 下请使用 `npm.cmd`。macOS/Linux 使用普通 `npm`。

## Windows 快速启动

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run tauri:dev
```

构建命令：

```powershell
npm.cmd run build
npm.cmd run tauri:build
```

预期 Windows 输出：

```text
src-tauri\target\release\ai-roundtable.exe
src-tauri\target\release\bundle\nsis\AI小圆桌_0.1.0_x64-setup.exe
```

## macOS 快速启动

macOS app bundle 和 DMG 必须在 Mac 上构建，因为它们依赖 Apple 本地工具链。

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm install
npm run tauri:dev
```

构建未签名的本地 app 和 DMG：

```bash
npm run tauri:build:mac
```

预期输出：

```text
src-tauri/target/release/bundle/macos/AI小圆桌.app
src-tauri/target/release/bundle/dmg/AI小圆桌_0.1.0_*.dmg
```

如果需要同时兼容 Apple Silicon 和 Intel Mac：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run tauri:build:mac:universal
```

未签名本地构建适合自己使用。如果要公开分发给其他 Mac 用户，需要 Apple Developer 账号、代码签名、公证和 stapling；否则 Gatekeeper 可能会拦截或弹出风险提示。

## 产品工作流

1. 打开 AI小圆桌。
2. 选择目标日期范围。
3. 抓取 RSS 候选热点。
4. 必要时手动补充遗漏热点。
5. 选择一个或多个候选热点。
6. 生成中控 agent 圆桌议程。
7. 检查议程、角色设置、讨论张力和来源风险。
8. 生成圆桌稿。
9. 检查来源、事实核查风险、角色质量和结论要点。
10. 本地编辑、保存并导出。

## 模型配置

在应用内打开 **设置** 来配置文本生成和 TTS。

文本生成当前主要支持 OpenAI-compatible chat completion API：

- OpenAI
- DeepSeek
- Qwen / DashScope compatible mode
- Mock/local rule generator，用于无 API Key 测试

真实厂商需要配置 Base URL、API Key 和模型。应用会在保存设置和生成前检查连接。如果真实厂商调用失败，应用会返回错误，不会静默 fallback 到 mock 结果。

草稿生成模式：

- `single`：一次结构化模型调用生成完整草稿。
- `multi_agent`：中控 agent 先规划轮次，再分别调用每个模拟嘉宾生成发言。
- `autonomous_agent`：可选 agent runtime 路径，用于更深的分步生成。

## 原生强自治 Agent

`autonomous_agent` 草稿生成模式现在由 Tauri/Rust 原生承载。运行时会把热点、来源和补充资料构建成本地记忆片段，按 `discussionDepth` 控制轮次范围，逐轮执行 `memory.search`，在配置 Search API Base URL 时可选调用通用 JSON Web Search API，并在最终 `EpisodeDraft` 中保留 `agentTrace`。

`agent-backend/` 下旧的 Python FastAPI/LangGraph 后台仅作为实验归档保留，不再是产品运行路径，也不会打包进桌面发布产物。

## TTS 与 MP3 导出

MP3 导出使用设置页里的 TTS 配置。当前支持：

- OpenAI TTS：最快上手路径。现有 persona 音色使用 `alloy`、`coral`、`onyx`、`sage` 这类 OpenAI 风格名称。
- DashScope TTS：Rust 适配器支持 `MiniMax/speech-2.8-hd` 和 `cosyvoice-v3.5-plus`。

DashScope 注意事项：

- `MiniMax/speech-2.8-hd` 需要先在阿里云百炼为当前 API Key 开通模型权限。
- `cosyvoice-v3.5-plus` 通常需要在百炼里创建声音复刻或声音设计音色 ID。类似 `longanlang` 的内置音色值可能因为音色和模型不匹配而失败。
- 每个角色的音色映射在 `config/prompts/personas.json` 的 `tts` 字段里。

## 本地数据

应用运行数据保存在 Tauri app data 目录，不在项目根目录。

默认位置：

- Windows：`%APPDATA%\com.ai.roundtable`
- macOS：`~/Library/Application Support/com.ai.roundtable`

常见文件和目录：

```text
feeds.json
provider-settings.json
tts-settings.json
llm-prompts.json
drafts/
```

API Key 当前保存在本地 app-data JSON 中。请保护该目录，不要把复制出来的设置文件提交到仓库。

## Prompt 配置

内置 prompt 和 persona 文件位于：

```text
config/prompts/personas.json
config/prompts/style-guide.json
config/prompts/tasks/
config/prompts/schemas/
config/prompts/fallbacks.json
```

首次运行时，应用会把这些文件组合成 app data 下可写的 `llm-prompts.json`。本地调 prompt 可以改 app data 副本；要修改随包默认值，则改 `config/prompts/`。

Version 3 prompt 配置支持一次性生成完整稿件，也支持多 agent 草稿生成。

## 验证命令

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

macOS/Linux：

```bash
npm run typecheck
npm run lint
npm run build
```

桌面集成测试使用 `npm.cmd run tauri:dev`。Tauri 的 `invoke(...)` 调用不会出现在浏览器 Network 面板中；调试时请看 Tauri 窗口控制台和 app data 下的本地 JSON。

## 常见问题

- `npm.ps1 cannot be loaded`：在 PowerShell 中使用 `npm.cmd`。
- Tauri 构建找不到 Rust/Cargo：把 `%USERPROFILE%\.cargo\bin` 加到当前 shell 的 `PATH`。
- Windows 打包出现 C++ 工具链错误：安装 Visual Studio Build Tools，并包含 `Microsoft.VisualStudio.Workload.VCTools`。
- 真实 LLM 生成失败：检查厂商、Base URL、API Key、选中模型和模型权限。
- 强自治 Agent 生成失败：检查模型厂商、Base URL、API Key、选中模型、Search API 配置和补充资料内容；未配置 Search API 时会自动跳过外部搜索。
- TTS 返回空音频或 HTTP 400：确认 TTS 模型已开通，并且当前音色 ID 对该模型有效。
- UI 设置看起来没有更新：检查 app data 目录；运行时设置从那里的本地 JSON 读取。

## 仓库结构

```text
src/                         React 前端
src-tauri/                   Tauri Rust 后端和打包配置
agent-backend/               实验归档：旧 Python agent 后端参考实现
config/prompts/              内置 prompt、persona、schema 和 fallback 配置
docs/                        产品、技术、UX、打包和工作流文档
dev_readme.md                英文开发命令和发布流程
dev_readme.zh-CN.md          中文开发命令和发布流程
README.md                    英文项目 README
```

## 文档索引

- `docs/PRODUCT_REQUIREMENTS.md`：产品范围和成功标准。
- `docs/TECHNICAL_PLAN.md`：架构和数据流。
- `docs/FRONTEND_UX_REQUIREMENTS.md`：UI 和视觉质量要求。
- `docs/PACKAGING_RELEASE_PIPELINE.md`：Windows 打包和发布流程。
- `docs/CODEX_WORKFLOW.md`：Codex 实现和验证工作流。
- `docs/CONTENT_WORKFLOW.md`：编辑生产工作流。
- `docs/LLM_AGENT_DESIGN.md`：中控 agent 和模拟角色设计。
