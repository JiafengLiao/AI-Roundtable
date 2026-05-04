# AI小圆桌

AI小圆桌是一个本地桌面 AI 周度热点圆桌内容生产工具。用户可见的中文产品名是 **AI小圆桌**，内部包名和可执行文件名统一为 `ai-roundtable`。

它会从 RSS 和手动输入收集 AI 热点信号，让中控规划 agent 设计圆桌议程，然后生成可编辑的中文圆桌稿。圆桌角色都是模拟角色：

- 主持人：解释热点，让讨论更容易读。
- 热点参与者：提供行业直觉，但不冒充真实受访者。
- 投资人：分析商业影响、竞争格局和资本效率。
- 技术专家：分析模型、工程、数据、安全和可行性问题。

这个 MVP 面向编辑和 AI 从业者，不是公共阅读产品、音频产品或云 CMS。

## 技术栈

- 桌面端：Tauri v2
- 前端：React、TypeScript、Vite
- 存储：本地 JSON 文件
- LLM：OpenAI-compatible 厂商；只有明确选择本地规则生成器时才走本地 fallback
- 打包：Windows NSIS 安装包；macOS 用户可以在本机自助构建未签名的 `.app` / `.dmg`

## Windows 本地启动

PowerShell 可能会拦截 `npm.ps1`，所以使用 `npm.cmd`。

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

## macOS 本地构建

macOS 安装包必须在 Mac 上构建，因为 Apple app bundle、代码签名、公证和 DMG 打包依赖 Apple 本地工具链。

安装 Xcode Command Line Tools：

```bash
xcode-select --install
```

安装 Rust 和项目依赖：

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
npm install
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

未签名的本地构建适合自己使用。如果要公开分发给其他 Mac 用户，需要 Apple Developer 账号、代码签名、公证和 stapling；否则 Gatekeeper 可能会拦截或弹出风险提示。

## MVP 工作流

1. 打开 AI小圆桌。
2. 选择目标日期范围。
3. 抓取 RSS 候选热点。
4. 必要时手动添加遗漏热点。
5. 选择一个热点。
6. 生成中控 agent 圆桌议程。
7. 生成圆桌稿。
8. 检查来源和事实核查风险。
9. 本地编辑并导出稿件。

## 当前状态

仓库里已经有可运行的本地 MVP：React 通过 `invoke` 调用 Tauri 命令，Rust 侧读写本地 JSON、抓取真实 RSS、支持手动热点输入、通过 OpenAI-compatible 厂商生成圆桌议程和稿件，并把稿件保存到本地。选择真实 LLM 厂商时，应用会在保存设置和生成前检查连接；LLM 调用失败不会再静默 fallback 到本地生成。

内置 LLM prompt 和嘉宾 persona 按职责拆分：

```text
config/prompts/personas.json
config/prompts/style-guide.json
config/prompts/tasks/
config/prompts/schemas/
config/prompts/fallbacks.json
```

首次运行时，应用会把这些文件组合成可写的 `llm-prompts.json`。

默认 app data 目录：

- Windows：`%APPDATA%\com.ai.roundtable`
- macOS：`~/Library/Application Support/com.ai.roundtable`

Version 3 prompt 配置支持一次性生成完整稿件，也支持多 agent 生成：中控 agent 先规划轮次，再分别调用每个模拟嘉宾生成发言。
