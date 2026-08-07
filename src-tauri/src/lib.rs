use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue};
use rss::Channel;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::{hash_map::DefaultHasher, HashMap},
    fs,
    hash::{Hash, Hasher},
    io::{Cursor, Read},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{Emitter, Manager, PhysicalSize, Size, WindowEvent};

// #region agent log
fn agent_debug_log(hypothesis_id: &str, message: &str, data: serde_json::Value) {
    use std::io::Write;
    let line = json!({
        "sessionId": "0bc2c7",
        "hypothesisId": hypothesis_id,
        "location": "lib.rs:run",
        "message": message,
        "data": data,
        "timestamp": chrono::Utc::now().timestamp_millis()
    });
    if let Ok(s) = serde_json::to_string(&line) {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../debug-0bc2c7.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(f, "{s}");
        } else {
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("debug-0bc2c7.log"))
                .and_then(|mut f| writeln!(f, "{s}"));
        }
        let _ = reqwest::blocking::Client::new()
            .post("http://127.0.0.1:7392/ingest/1d8fd106-54ad-46ee-b534-fd4175ab8428")
            .header("Content-Type", "application/json")
            .header("X-Debug-Session-Id", "0bc2c7")
            .body(s)
            .send();
    }
}
// #endregion

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Source {
    id: String,
    title: String,
    url: String,
    publisher: String,
    #[serde(rename = "publishedAt")]
    published_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct HotspotCandidate {
    id: String,
    title: String,
    summary: String,
    category: String,
    status: String,
    #[serde(rename = "sourceCount")]
    source_count: u16,
    sources: Vec<Source>,
    #[serde(rename = "matchedSignals")]
    matched_signals: Vec<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    note: Option<String>,
    #[serde(rename = "displayCategory", skip_serializing_if = "Option::is_none")]
    display_category: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FeedSource {
    id: String,
    name: String,
    url: String,
    category: String,
    enabled: bool,
    #[serde(rename = "lastFetchedAt")]
    last_fetched_at: Option<String>,
    #[serde(rename = "lastStatus")]
    last_status: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GuestPersona {
    id: String,
    label: String,
    role: String,
    stance: String,
    #[serde(rename = "speakingStyle")]
    speaking_style: String,
    tts: Option<TtsPersonaConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TtsPersonaConfig {
    voice: String,
    #[serde(rename = "dashscopeVoice")]
    dashscope_voice: Option<String>,
    #[serde(rename = "minimaxVoice")]
    minimax_voice: Option<String>,
    #[serde(rename = "cosyVoice")]
    cosy_voice: Option<String>,
    #[serde(rename = "qwenVoice")]
    qwen_voice: Option<String>,
    instructions: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RoundtablePlan {
    id: String,
    #[serde(rename = "hotspotId")]
    hotspot_id: String,
    #[serde(rename = "topicTitle", skip_serializing_if = "Option::is_none")]
    topic_title: Option<String>,
    #[serde(rename = "topicSummary", skip_serializing_if = "Option::is_none")]
    topic_summary: Option<String>,
    objective: String,
    #[serde(rename = "audiencePromise")]
    audience_promise: String,
    guests: Vec<GuestPersona>,
    agenda: Vec<String>,
    #[serde(rename = "tensionPoints")]
    tension_points: Vec<String>,
    #[serde(rename = "speakingOrder")]
    speaking_order: Vec<String>,
    #[serde(rename = "sourceRisks")]
    source_risks: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct DialogueTurn {
    #[serde(rename = "speakerId")]
    speaker_id: String,
    intent: String,
    text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(default, skip_serializing_if = "is_false")]
    interrupted: bool,
    #[serde(rename = "createdAt", default, skip_serializing_if = "Option::is_none")]
    created_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct EpisodeDraft {
    id: String,
    title: String,
    summary: String,
    status: String,
    #[serde(rename = "planId")]
    plan_id: String,
    #[serde(rename = "hotspotId")]
    hotspot_id: String,
    sources: Vec<Source>,
    guests: Vec<GuestPersona>,
    dialogue: Vec<DialogueTurn>,
    takeaways: Vec<String>,
    #[serde(rename = "factChecks")]
    fact_checks: Vec<String>,
    #[serde(rename = "agentTrace", default, skip_serializing_if = "Vec::is_empty")]
    agent_trace: Vec<AgentTraceRecord>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AgentTraceRecord {
    id: String,
    level: String,
    #[serde(rename = "agentId")]
    agent_id: String,
    #[serde(rename = "agentLabel")]
    agent_label: String,
    phase: String,
    message: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    sources: Vec<Source>,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ManualHotspotInput {
    title: String,
    summary: String,
    url: String,
    publisher: Option<String>,
    category: Option<String>,
    content: Option<String>,
    #[serde(rename = "sourceFilePath")]
    source_file_path: Option<String>,
    #[serde(rename = "sourceFileName")]
    source_file_name: Option<String>,
}

#[derive(Debug, Serialize)]
struct ManualAttachmentImportResult {
    #[serde(rename = "originalName")]
    original_name: String,
    #[serde(rename = "storedPath")]
    stored_path: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ModelProvider {
    id: String,
    name: String,
    #[serde(rename = "baseUrl")]
    base_url: String,
    models: Vec<String>,
    #[serde(rename = "requiresApiKey")]
    requires_api_key: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ProviderSettings {
    #[serde(rename = "providerId")]
    provider_id: String,
    #[serde(rename = "baseUrl")]
    base_url: String,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    #[serde(rename = "selectedModel")]
    selected_model: Option<String>,
    #[serde(rename = "draftGenerationMode")]
    draft_generation_mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TtsSettings {
    #[serde(rename = "providerId")]
    provider_id: String,
    #[serde(rename = "baseUrl")]
    base_url: String,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    #[serde(rename = "selectedModel")]
    selected_model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AsrSettings {
    #[serde(rename = "providerId")]
    provider_id: String,
    #[serde(rename = "baseUrl")]
    base_url: String,
    #[serde(rename = "apiKey")]
    api_key: Option<String>,
    #[serde(rename = "selectedModel")]
    selected_model: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AgentRuntimeSettings {
    #[serde(rename = "generationEngine")]
    generation_engine: String,
    #[serde(rename = "pythonAgentBaseUrl")]
    python_agent_base_url: String,
    #[serde(rename = "discussionDepth")]
    discussion_depth: String,
    #[serde(rename = "searchBaseUrl")]
    search_base_url: String,
    #[serde(rename = "searchApiKey")]
    search_api_key: Option<String>,
    #[serde(rename = "searchLanguage")]
    search_language: String,
    #[serde(rename = "searchMaxResults")]
    search_max_results: usize,
    #[serde(rename = "searchRecencyDays")]
    search_recency_days: Option<u16>,
    #[serde(rename = "debugTraceEnabled")]
    debug_trace_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SupplementalDocument {
    id: String,
    name: String,
    path: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AutonomousDraftOptions {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "discussionDepth")]
    discussion_depth: String,
    #[serde(rename = "supplementalDocuments")]
    supplemental_documents: Vec<SupplementalDocument>,
}

#[derive(Debug, Deserialize)]
struct DashScopeUrlTtsResponse {
    output: Option<DashScopeUrlTtsOutput>,
    message: Option<String>,
    code: Option<String>,
}

#[derive(Debug, Deserialize)]
struct DashScopeUrlTtsOutput {
    audio: Option<DashScopeUrlTtsAudio>,
}

#[derive(Debug, Deserialize)]
struct DashScopeUrlTtsAudio {
    data: Option<String>,
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MiniMaxTtsResponse {
    data: Option<MiniMaxAudioData>,
    output: Option<MiniMaxTtsOutput>,
    #[serde(rename = "base_resp")]
    base_resp: Option<MiniMaxBaseResp>,
    message: Option<String>,
    code: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct MiniMaxTtsOutput {
    data: Option<MiniMaxAudioData>,
    #[serde(rename = "base_resp")]
    base_resp: Option<MiniMaxBaseResp>,
}

#[derive(Debug, Deserialize)]
struct MiniMaxAudioData {
    audio: Option<String>,
}

#[derive(Debug, Deserialize)]
struct MiniMaxBaseResp {
    #[serde(rename = "status_code")]
    status_code: Option<i32>,
    #[serde(rename = "status_msg")]
    status_msg: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LlmPromptConfig {
    version: Option<u16>,
    personas: serde_json::Map<String, serde_json::Value>,
    #[serde(rename = "styleGuide")]
    style_guide: StyleGuide,
    tasks: PromptTasks,
    schemas: PromptSchemas,
    fallbacks: PromptFallbacks,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct StyleGuide {
    #[serde(rename = "conversationGoal")]
    conversation_goal: String,
    tone: Vec<String>,
    #[serde(rename = "conversationDevices")]
    conversation_devices: Vec<String>,
    #[serde(rename = "safetyRules")]
    safety_rules: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PromptTasks {
    plan: PromptTask,
    draft: PromptTask,
    #[serde(rename = "draftTurnPlanner")]
    draft_turn_planner: PromptTask,
    #[serde(rename = "draftGuestTurn")]
    draft_guest_turn: PromptTask,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PromptTask {
    #[serde(rename = "systemPrompt")]
    system_prompt: String,
    #[serde(rename = "userTemplate")]
    user_template: String,
    temperature: f32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PromptSchemas {
    plan: JsonSchemaSpec,
    draft: JsonSchemaSpec,
    #[serde(rename = "turnPlan")]
    turn_plan: JsonSchemaSpec,
    #[serde(rename = "guestTurn")]
    guest_turn: JsonSchemaSpec,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct JsonSchemaSpec {
    name: String,
    strict: bool,
    schema: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct PromptFallbacks {
    agenda: Vec<String>,
    #[serde(rename = "tensionPoints")]
    tension_points: Vec<String>,
    #[serde(rename = "sourceRisks")]
    source_risks: Vec<String>,
    takeaways: Vec<String>,
    #[serde(rename = "factChecks")]
    fact_checks: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelList {
    data: Vec<OpenAiModelItem>,
}

#[derive(Debug, Deserialize)]
struct OpenAiModelItem {
    id: String,
}

#[derive(Debug, Deserialize)]
struct TurnPlanResponse {
    title: String,
    summary: String,
    turns: Vec<TurnPlanItem>,
    takeaways: Vec<String>,
    #[serde(rename = "factChecks")]
    fact_checks: Vec<String>,
}

#[derive(Debug, Deserialize, Clone)]
struct TurnPlanItem {
    #[serde(rename = "speakerId")]
    speaker_id: String,
    intent: String,
    instruction: String,
    #[serde(rename = "toolQueries", default)]
    tool_queries: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct GuestTurnResponse {
    text: String,
}

#[derive(Debug, Deserialize)]
struct AnthropicModelList {
    data: Vec<AnthropicModelItem>,
}

#[derive(Debug, Deserialize)]
struct AnthropicModelItem {
    id: String,
}

#[derive(Debug, Deserialize)]
struct GeminiModelList {
    models: Vec<GeminiModelItem>,
}

#[derive(Debug, Deserialize)]
struct GeminiModelItem {
    name: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionStreamResponse {
    choices: Vec<ChatStreamChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatStreamChoice {
    delta: ChatStreamDelta,
}

#[derive(Debug, Deserialize)]
struct ChatStreamDelta {
    content: Option<String>,
}

enum StreamTextOutcome {
    Completed(String),
    Cancelled(String),
}

#[derive(Debug, Serialize, Clone)]
struct DraftDeltaEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    turn: Option<DialogueTurn>,
    #[serde(rename = "textDelta", skip_serializing_if = "Option::is_none")]
    text_delta: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
struct InteractiveSessionEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    status: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    draft: Option<EpisodeDraft>,
    #[serde(rename = "activeSpeakerId", skip_serializing_if = "Option::is_none")]
    active_speaker_id: Option<String>,
}

#[derive(Debug, Clone)]
struct InteractiveRoundtableSession {
    plan: RoundtablePlan,
    hotspot: HotspotCandidate,
    settings: Option<ProviderSettings>,
    prompt_config: LlmPromptConfig,
    draft: EpisodeDraft,
    cancel_current_turn: Arc<AtomicBool>,
    status: String,
    active_speaker_id: Option<String>,
    next_run_id: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AgentProgressEvent {
    #[serde(rename = "sessionId")]
    session_id: String,
    #[serde(rename = "agentId")]
    agent_id: String,
    #[serde(rename = "agentLabel")]
    agent_label: String,
    phase: String,
    status: String,
    progress: u8,
    message: String,
    severity: String,
    #[serde(rename = "turnIndex", skip_serializing_if = "Option::is_none")]
    turn_index: Option<usize>,
}

#[derive(Debug, Clone)]
struct AutonomousMemoryChunk {
    id: String,
    title: String,
    text: String,
    source: Option<Source>,
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    data_dir(&app).map(|path| path.to_string_lossy().to_string())
}

fn manual_attachments_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("manual-attachments");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn safe_file_name(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_control() || matches!(ch, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '-'
            } else {
                ch
            }
        })
        .collect();
    let trimmed = sanitized
        .trim_matches(|ch| ch == '.' || ch == ' ' || ch == '-')
        .to_string();
    let safe = if trimmed.is_empty() {
        "attachment".into()
    } else {
        trimmed
    };
    safe.chars().take(160).collect()
}

fn read_text_file_lossy(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).to_string())
}

fn decode_basic_xml_entities(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#xA;", "\n")
        .replace("&#10;", "\n")
        .replace("&#13;", "\n")
}

fn strip_xml_tags(value: &str) -> String {
    let mut text = String::with_capacity(value.len());
    let mut in_tag = false;
    for ch in value.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(ch),
            _ => {}
        }
    }
    text
}

fn extract_docx_text(path: &Path) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| format!("DOCX 读取失败: {error}"))?;
    let mut document = archive
        .by_name("word/document.xml")
        .map_err(|error| format!("DOCX 正文读取失败: {error}"))?;
    let mut xml = String::new();
    document
        .read_to_string(&mut xml)
        .map_err(|error| format!("DOCX 正文解析失败: {error}"))?;
    let with_breaks = xml
        .replace("</w:p>", "\n")
        .replace("<w:br/>", "\n")
        .replace("<w:br />", "\n")
        .replace("<w:tab/>", "\t")
        .replace("<w:tab />", "\t");
    Ok(decode_basic_xml_entities(&strip_xml_tags(&with_breaks)))
}

fn normalize_imported_text(value: String) -> String {
    value
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn extract_attachment_text(path: &Path, extension: &str) -> Result<String, String> {
    let raw = match extension {
        "txt" | "text" | "md" | "markdown" => read_text_file_lossy(path)?,
        "pdf" => pdf_extract::extract_text(path).map_err(|error| format!("PDF 解析失败: {error}"))?,
        "docx" => extract_docx_text(path)?,
        "doc" => return Err("暂不支持旧版 .doc 二进制格式，请另存为 DOCX、PDF、MD 或 TXT 后再导入".into()),
        other => return Err(format!("暂不支持 .{other} 文件，请上传 PDF、DOCX、MD 或 TXT")),
    };
    let content = normalize_imported_text(raw);
    if content.is_empty() {
        Err("附件没有解析出可用文本".into())
    } else {
        Ok(content)
    }
}

fn read_json<T>(path: PathBuf) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    serde_json::from_str(&content).map_err(|error| error.to_string())
}

fn write_json<T>(path: PathBuf, value: &T) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let content = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, content).map_err(|error| error.to_string())
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn stable_id(prefix: &str, value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{prefix}-{:x}", hasher.finish())
}

fn user_dialogue_turn(text: &str) -> DialogueTurn {
    DialogueTurn {
        speaker_id: "user".into(),
        intent: "user_input".into(),
        text: text.trim().to_string(),
        source: Some("user".into()),
        interrupted: false,
        created_at: Some(now()),
    }
}

fn ai_dialogue_turn(speaker_id: &str, intent: &str, text: &str) -> DialogueTurn {
    DialogueTurn {
        speaker_id: speaker_id.into(),
        intent: intent.into(),
        text: text.trim().to_string(),
        source: Some("ai".into()),
        interrupted: false,
        created_at: Some(now()),
    }
}

fn interrupted_ai_turn(speaker_id: &str, intent: &str, text: &str) -> DialogueTurn {
    DialogueTurn {
        interrupted: true,
        ..ai_dialogue_turn(speaker_id, intent, text)
    }
}

fn is_ai_guest_speaker(speaker_id: &str) -> bool {
    matches!(speaker_id, "host" | "participant" | "investor" | "expert")
}

fn interactive_sessions() -> &'static Mutex<HashMap<String, InteractiveRoundtableSession>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, InteractiveRoundtableSession>>> =
        OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn strip_html(value: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for char in value.chars() {
        match char {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(char),
            _ => {}
        }
    }
    out.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn truncate(value: &str, max_chars: usize) -> String {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() <= max_chars {
        value.to_string()
    } else {
        format!("{}...", chars[..max_chars].iter().collect::<String>())
    }
}

fn keyword_signals(text: &str) -> Vec<String> {
    let lower = text.to_lowercase();
    let keywords = [
        ("agent", "agent"),
        ("model", "model"),
        ("llm", "llm"),
        ("multimodal", "multimodal"),
        ("open source", "open-source"),
        ("inference", "inference"),
        ("safety", "safety"),
        ("benchmark", "benchmark"),
        ("api", "api"),
        ("chip", "chip"),
        ("regulation", "policy"),
        ("funding", "funding"),
        ("模型", "模型"),
        ("智能体", "智能体"),
        ("开源", "开源"),
        ("推理", "推理"),
        ("安全", "安全"),
        ("融资", "融资"),
    ];

    let mut signals = Vec::new();
    for (needle, label) in keywords {
        if lower.contains(needle) && !signals.iter().any(|item| item == label) {
            signals.push(label.to_string());
        }
    }
    signals
}

fn default_feeds() -> Vec<FeedSource> {
    vec![
        FeedSource {
            id: "sspai".into(),
            name: "少数派".into(),
            url: "https://sspai.com/feed".into(),
            category: "developer".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "36kr".into(),
            name: "36氪".into(),
            url: "https://36kr.com/feed".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "leiphone".into(),
            name: "雷峰网".into(),
            url: "https://www.leiphone.com/feed".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "ithome".into(),
            name: "IT之家".into(),
            url: "https://www.ithome.com/rss/".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "geekpark".into(),
            name: "极客公园".into(),
            url: "https://www.geekpark.net/rss".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "qbitai".into(),
            name: "量子位".into(),
            url: "https://www.qbitai.com/feed".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "the-decoder".into(),
            name: "The Decoder".into(),
            url: "https://the-decoder.com/feed/".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "techcrunch-ai".into(),
            name: "TechCrunch AI".into(),
            url: "https://techcrunch.com/category/artificial-intelligence/feed/".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "nvidia-ai-blog".into(),
            name: "NVIDIA AI Blog".into(),
            url: "https://blogs.nvidia.com/blog/category/deep-learning/feed/".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "venturebeat-ai".into(),
            name: "VentureBeat AI".into(),
            url: "https://venturebeat.com/category/ai/feed/".into(),
            category: "market".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "microsoft-ai-blog".into(),
            name: "Microsoft AI Blog".into(),
            url: "https://blogs.microsoft.com/ai/feed/".into(),
            category: "company".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "mit-news-ai".into(),
            name: "MIT News AI".into(),
            url: "https://news.mit.edu/topic/artificial-intelligence2-rss.xml".into(),
            category: "research".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "google-ai-blog".into(),
            name: "Google AI Blog".into(),
            url: "https://blog.google/technology/ai/rss/".into(),
            category: "company".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "openai-blog".into(),
            name: "OpenAI Blog".into(),
            url: "https://openai.com/news/rss.xml".into(),
            category: "company".into(),
            enabled: false,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "anthropic-news".into(),
            name: "Anthropic News".into(),
            url: "https://www.anthropic.com/news/rss.xml".into(),
            category: "company".into(),
            enabled: false,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "huggingface-blog".into(),
            name: "Hugging Face Blog".into(),
            url: "https://huggingface.co/blog/feed.xml".into(),
            category: "developer".into(),
            enabled: false,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "arxiv-ai".into(),
            name: "arXiv AI".into(),
            url: "https://export.arxiv.org/rss/cs.AI".into(),
            category: "research".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "github-blog-ai".into(),
            name: "GitHub Blog AI".into(),
            url: "https://github.blog/ai-and-ml/feed/".into(),
            category: "developer".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
    ]
}

fn feeds_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("feeds.json"))
}

fn candidates_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("candidates.json"))
}

fn provider_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("provider-settings.json"))
}

fn tts_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("tts-settings.json"))
}

fn asr_settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("asr-settings.json"))
}

fn llm_logs_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = data_dir(app)?.join("llm-logs");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn prompt_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("llm-prompts.json"))
}

fn parse_bundled_json<T: DeserializeOwned>(name: &str, content: &str) -> Result<T, String> {
    serde_json::from_str(content)
        .map_err(|error| format!("invalid bundled prompt file {name}: {error}"))
}

const PROMPT_CONFIG_VERSION: u16 = 5;

fn bundled_prompt_config() -> Result<LlmPromptConfig, String> {
    Ok(LlmPromptConfig {
        version: Some(PROMPT_CONFIG_VERSION),
        personas: parse_bundled_json(
            "personas.json",
            include_str!("../../config/prompts/personas.json"),
        )?,
        style_guide: parse_bundled_json(
            "style-guide.json",
            include_str!("../../config/prompts/style-guide.json"),
        )?,
        tasks: PromptTasks {
            plan: parse_bundled_json(
                "tasks/plan.json",
                include_str!("../../config/prompts/tasks/plan.json"),
            )?,
            draft: parse_bundled_json(
                "tasks/draft-single.json",
                include_str!("../../config/prompts/tasks/draft-single.json"),
            )?,
            draft_turn_planner: parse_bundled_json(
                "tasks/draft-turn-planner.json",
                include_str!("../../config/prompts/tasks/draft-turn-planner.json"),
            )?,
            draft_guest_turn: parse_bundled_json(
                "tasks/draft-guest-turn.json",
                include_str!("../../config/prompts/tasks/draft-guest-turn.json"),
            )?,
        },
        schemas: PromptSchemas {
            plan: parse_bundled_json(
                "schemas/plan.schema.json",
                include_str!("../../config/prompts/schemas/plan.schema.json"),
            )?,
            draft: parse_bundled_json(
                "schemas/draft.schema.json",
                include_str!("../../config/prompts/schemas/draft.schema.json"),
            )?,
            turn_plan: parse_bundled_json(
                "schemas/turn-plan.schema.json",
                include_str!("../../config/prompts/schemas/turn-plan.schema.json"),
            )?,
            guest_turn: parse_bundled_json(
                "schemas/guest-turn.schema.json",
                include_str!("../../config/prompts/schemas/guest-turn.schema.json"),
            )?,
        },
        fallbacks: parse_bundled_json(
            "fallbacks.json",
            include_str!("../../config/prompts/fallbacks.json"),
        )?,
    })
}

fn get_or_seed_prompt_config(app: Option<&tauri::AppHandle>) -> Result<LlmPromptConfig, String> {
    if let Some(app) = app {
        let path = prompt_config_path(app)?;
        if path.exists() {
            match read_json::<LlmPromptConfig>(path.clone()) {
                Ok(config) if config.version.unwrap_or_default() >= PROMPT_CONFIG_VERSION => {
                    Ok(config)
                }
                _ => {
                    let config = bundled_prompt_config()?;
                    write_json(path, &config)?;
                    Ok(config)
                }
            }
        } else {
            let config = bundled_prompt_config()?;
            write_json(path, &config)?;
            Ok(config)
        }
    } else {
        bundled_prompt_config()
    }
}

fn render_template(template: &str, replacements: &[(&str, String)]) -> String {
    let mut rendered = template.to_string();
    for (key, value) in replacements {
        rendered = rendered.replace(&format!("{{{{{key}}}}}"), value);
    }
    rendered
}

fn guest_personas(prompt_config: &LlmPromptConfig) -> Vec<GuestPersona> {
    ["host", "participant", "investor", "expert"]
        .iter()
        .filter_map(|id| prompt_config.personas.get(*id))
        .filter_map(|value| serde_json::from_value::<GuestPersona>(value.clone()).ok())
        .collect()
}

fn style_replacements(prompt_config: &LlmPromptConfig) -> Vec<(&'static str, String)> {
    vec![
        (
            "conversationGoal",
            prompt_config.style_guide.conversation_goal.clone(),
        ),
        ("toneRules", prompt_config.style_guide.tone.join("\n- ")),
        (
            "conversationDevices",
            prompt_config.style_guide.conversation_devices.join("\n- "),
        ),
        (
            "safetyRules",
            prompt_config.style_guide.safety_rules.join("\n- "),
        ),
    ]
}

fn sanitize_for_deepseek_plan_prompt(value: &str) -> String {
    value
        .replace("杀手级", "爆款级")
        .replace("打断", "插话")
        .replace("真实的人", "自然的嘉宾")
        .replace("像四个真实的", "像四位自然的")
}

fn maybe_sanitize_deepseek_plan_value(provider_id: &str, value: String) -> String {
    if provider_id == "deepseek" {
        sanitize_for_deepseek_plan_prompt(&value)
    } else {
        value
    }
}

fn style_replacements_for_provider(
    prompt_config: &LlmPromptConfig,
    provider_id: &str,
    task: &str,
) -> Vec<(&'static str, String)> {
    let replacements = style_replacements(prompt_config);
    if provider_id != "deepseek" || task != "plan" {
        return replacements;
    }

    replacements
        .into_iter()
        .map(|(key, value)| (key, sanitize_for_deepseek_plan_prompt(&value)))
        .collect()
}

fn response_format(schema: &JsonSchemaSpec) -> serde_json::Value {
    json!({
        "type": "json_schema",
        "json_schema": {
            "name": schema.name,
            "strict": schema.strict,
            "schema": schema.schema
        }
    })
}

fn response_format_for_provider(provider_id: &str, schema: &JsonSchemaSpec) -> serde_json::Value {
    if provider_id == "deepseek" || provider_id == "qwen" {
        json!({ "type": "json_object" })
    } else {
        response_format(schema)
    }
}

fn prompt_for_provider(provider_id: &str, prompt: String, schema: &JsonSchemaSpec) -> String {
    if provider_id != "deepseek" && provider_id != "qwen" {
        return prompt;
    }

    let schema_json = serde_json::to_string(&schema.schema).unwrap_or_default();
    format!(
        "{prompt}\n\nJSON Output 要求：请只输出一个合法 JSON 对象，不要 markdown，不要解释文字。JSON 对象必须匹配这个 schema 的字段结构：\n{schema_json}"
    )
}

fn write_llm_log(
    log_dir: Option<&Path>,
    task: &str,
    provider_id: &str,
    model: &str,
    request: &serde_json::Value,
    response: Option<&serde_json::Value>,
    raw_content: Option<&str>,
    error: Option<&str>,
) {
    let Some(log_dir) = log_dir else {
        return;
    };
    let created_at = now();
    let log = json!({
        "createdAt": created_at,
        "task": task,
        "providerId": provider_id,
        "model": model,
        "request": request,
        "response": response,
        "rawContent": raw_content,
        "error": error
    });
    let file_id = stable_id("llm-log", &format!("{created_at}-{task}-{model}"));
    let filename = format!("{created_at}-{file_id}.json").replace(':', "-");
    let _ = write_json(log_dir.join(filename), &log);
}

fn write_llm_debug_log(
    log_dir: Option<&Path>,
    task: &str,
    provider_id: &str,
    model: &str,
    event: &str,
    data: serde_json::Value,
) {
    if provider_id != "qwen" {
        return;
    }
    let log = json!({
        "createdAt": now(),
        "task": task,
        "providerId": provider_id,
        "model": model,
        "event": event,
        "data": data
    });
    println!("[LLM debug] {provider_id}/{model} {task} {event}: {data}", data = log["data"]);
    agent_debug_log("qwen-llm", event, log.clone());
    if let Some(log_dir) = log_dir {
        if let Ok(line) = serde_json::to_string(&log) {
            use std::io::Write;
            if let Ok(mut file) = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(log_dir.join("llm-debug.jsonl"))
            {
                let _ = writeln!(file, "{line}");
            }
        }
    }
}

fn llm_body_debug_summary(url: &str, body: &serde_json::Value) -> serde_json::Value {
    let message_summaries = body
        .get("messages")
        .and_then(|value| value.as_array())
        .map(|messages| {
            messages
                .iter()
                .map(|message| {
                    let content = message.get("content").and_then(|value| value.as_str()).unwrap_or("");
                    json!({
                        "role": message.get("role").and_then(|value| value.as_str()).unwrap_or(""),
                        "chars": content.chars().count(),
                        "bytes": content.len()
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    json!({
        "url": url,
        "temperature": body.get("temperature"),
        "responseFormat": body.get("response_format"),
        "enableThinking": body.get("enable_thinking"),
        "messages": message_summaries
    })
}

fn json_value_string(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key).and_then(|item| item.as_str()).map(ToString::to_string)
}

fn response_id_summary(value: &serde_json::Value) -> serde_json::Value {
    json!({
        "id": json_value_string(value, "id"),
        "requestId": json_value_string(value, "request_id"),
        "model": json_value_string(value, "model"),
        "usage": value.get("usage")
    })
}

fn snippet(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn parse_model_json_content(content: &str, task: &str) -> Result<serde_json::Value, String> {
    let candidate = extract_json_candidate(content);
    match serde_json::from_str::<serde_json::Value>(&candidate) {
        Ok(value) => return Ok(value),
        Err(first_error) => {
            let sanitized = remove_json_control_chars(&candidate);
            match serde_json::from_str::<serde_json::Value>(&sanitized) {
                Ok(value) => Ok(value),
                Err(second_error) => {
                    if task == "draft_guest_turn" {
                        if let Some(text) = extract_text_field_lossy(&candidate) {
                            return Ok(json!({ "text": text }));
                        }
                    }
                    Err(format!(
                        "{first_error}; sanitized retry failed: {second_error}; content prefix: {}",
                        snippet(content, 260)
                    ))
                }
            }
        }
    }
}

fn extract_json_candidate(content: &str) -> String {
    let trimmed = content.trim();
    if let Some(start) = trimmed.find("```") {
        if let Some(end) = trimmed[start + 3..].find("```") {
            let block = &trimmed[start + 3..start + 3 + end];
            return block
                .trim()
                .strip_prefix("json")
                .unwrap_or(block.trim())
                .trim()
                .to_string();
        }
    }
    if let (Some(start), Some(end)) = (trimmed.find('{'), trimmed.rfind('}')) {
        if start < end {
            return trimmed[start..=end].to_string();
        }
    }
    trimmed.to_string()
}

fn remove_json_control_chars(value: &str) -> String {
    value
        .chars()
        .map(|ch| if (ch as u32) < 0x20 { ' ' } else { ch })
        .collect()
}

fn extract_text_field_lossy(content: &str) -> Option<String> {
    let key_index = content.find("\"text\"")?;
    let after_key = &content[key_index + "\"text\"".len()..];
    let colon_index = after_key.find(':')?;
    let after_colon = after_key[colon_index + 1..].trim_start();
    let mut chars = after_colon.chars();
    if chars.next()? != '"' {
        return None;
    }

    let mut text = String::new();
    let mut escaped = false;
    for ch in chars {
        if escaped {
            match ch {
                '"' => text.push('"'),
                '\\' => text.push('\\'),
                '/' => text.push('/'),
                'n' | 'r' | 't' => text.push(' '),
                'u' => {}
                other => text.push(other),
            }
            escaped = false;
            continue;
        }
        match ch {
            '\\' => escaped = true,
            '"' => break,
            _ if ch.is_control() => text.push(' '),
            _ => text.push(ch),
        }
    }

    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

fn llm_request_timeout(_provider_id: &str, _default_secs: u64) -> Duration {
    Duration::from_secs(200)
}

fn openai_chat_json(
    client: &Client,
    url: &str,
    provider_id: &str,
    log_dir: Option<&Path>,
    task: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: String,
    temperature: f32,
    schema: &JsonSchemaSpec,
) -> Result<serde_json::Value, String> {
    let mut body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "response_format": response_format_for_provider(provider_id, schema)
    });
    if provider_id == "qwen" {
        body["enable_thinking"] = json!(true);
    }

    write_llm_debug_log(
        log_dir,
        task,
        provider_id,
        model,
        "request_start",
        llm_body_debug_summary(url, &body),
    );
    let started_at = Instant::now();
    let response = match client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
    {
        Ok(response) => response,
        Err(error) => {
            let message = error.to_string();
            write_llm_debug_log(
                log_dir,
                task,
                provider_id,
                model,
                "request_error",
                json!({ "elapsedMs": started_at.elapsed().as_millis(), "error": message }),
            );
            write_llm_log(log_dir, task, provider_id, model, &body, None, None, Some(&message));
            return Err(message);
        }
    };
    let status = response.status();
    let response_text = match response.text() {
        Ok(text) => text,
        Err(error) => {
            let message = error.to_string();
            write_llm_debug_log(
                log_dir,
                task,
                provider_id,
                model,
                "response_read_error",
                json!({ "elapsedMs": started_at.elapsed().as_millis(), "status": status.as_u16(), "error": message }),
            );
            write_llm_log(log_dir, task, provider_id, model, &body, None, None, Some(&message));
            return Err(message);
        }
    };
    let response_value = serde_json::from_str::<serde_json::Value>(&response_text).ok();
    write_llm_debug_log(
        log_dir,
        task,
        provider_id,
        model,
        if status.is_success() { "http_success" } else { "http_error" },
        json!({
            "elapsedMs": started_at.elapsed().as_millis(),
            "status": status.as_u16(),
            "response": response_value.as_ref().map(response_id_summary),
            "bodySnippet": if status.is_success() { None } else { Some(snippet(&response_text, 1200)) }
        }),
    );
    if !status.is_success() {
        let message = format!("HTTP {status}: {}", snippet(&response_text, 1200));
        write_llm_log(log_dir, task, provider_id, model, &body, response_value.as_ref(), None, Some(&message));
        return Err(message);
    }
    let response = match serde_json::from_str::<ChatCompletionResponse>(&response_text) {
        Ok(response) => response,
        Err(error) => {
            let message = error.to_string();
            write_llm_debug_log(
                log_dir,
                task,
                provider_id,
                model,
                "response_json_parse_error",
                json!({ "elapsedMs": started_at.elapsed().as_millis(), "error": message, "bodySnippet": snippet(&response_text, 1200) }),
            );
            write_llm_log(log_dir, task, provider_id, model, &body, response_value.as_ref(), None, Some(&message));
            return Err(message);
        }
    };

    let content = response
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .ok_or_else(|| "模型没有返回内容".to_string())?;
    write_llm_debug_log(
        log_dir,
        task,
        provider_id,
        model,
        "content_received",
        json!({
            "elapsedMs": started_at.elapsed().as_millis(),
            "contentChars": content.chars().count(),
            "contentBytes": content.len(),
            "contentPrefix": snippet(&content, 260)
        }),
    );
    let parsed = parse_model_json_content(&content, task);
    match &parsed {
        Ok(value) => {
            write_llm_debug_log(
                log_dir,
                task,
                provider_id,
                model,
                "content_json_parse_ok",
                json!({ "elapsedMs": started_at.elapsed().as_millis() }),
            );
            write_llm_log(log_dir, task, provider_id, model, &body, Some(value), Some(&content), None);
        }
        Err(error) => {
            write_llm_debug_log(
                log_dir,
                task,
                provider_id,
                model,
                "content_json_parse_error",
                json!({ "elapsedMs": started_at.elapsed().as_millis(), "error": error }),
            );
            write_llm_log(log_dir, task, provider_id, model, &body, None, Some(&content), Some(error));
        }
    }
    parsed
}

fn openai_chat_text_stream(
    client: &Client,
    url: &str,
    provider_id: &str,
    log_dir: Option<&Path>,
    task: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: String,
    temperature: f32,
    mut on_delta: impl FnMut(&str),
) -> Result<String, String> {
    match openai_chat_text_stream_until_cancelled(
        client,
        url,
        provider_id,
        log_dir,
        task,
        api_key,
        model,
        system_prompt,
        user_prompt,
        temperature,
        |delta| on_delta(delta),
        || false,
    )? {
        StreamTextOutcome::Completed(text) | StreamTextOutcome::Cancelled(text) => Ok(text),
    }
}

fn openai_chat_text_stream_until_cancelled(
    client: &Client,
    url: &str,
    provider_id: &str,
    log_dir: Option<&Path>,
    task: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: String,
    temperature: f32,
    mut on_delta: impl FnMut(&str),
    mut should_cancel: impl FnMut() -> bool,
) -> Result<StreamTextOutcome, String> {
    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "stream": true
    });
    write_llm_debug_log(log_dir, task, provider_id, model, "stream_request_start", llm_body_debug_summary(url, &body));
    let mut response = client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        let response_text = response.text().unwrap_or_else(|error| error.to_string());
        let message = format!("HTTP {status}: {}", snippet(&response_text, 1200));
        write_llm_log(log_dir, task, provider_id, model, &body, None, None, Some(&message));
        return Err(message);
    }

    let mut buffer = [0_u8; 8192];
    let mut pending = String::new();
    let mut content = String::new();
    loop {
        if should_cancel() {
            write_llm_log(log_dir, task, provider_id, model, &body, None, Some(&content), Some("stream_cancelled_by_user"));
            return Ok(StreamTextOutcome::Cancelled(content));
        }
        let read = response.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        pending.push_str(&String::from_utf8_lossy(&buffer[..read]));
        while let Some(line_end) = pending.find('\n') {
            let raw_line = pending[..line_end].trim_end_matches('\r').to_string();
            pending.replace_range(..=line_end, "");
            let Some(data) = raw_line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                write_llm_log(log_dir, task, provider_id, model, &body, None, Some(&content), None);
                return Ok(StreamTextOutcome::Completed(content));
            }
            if let Ok(chunk) = serde_json::from_str::<ChatCompletionStreamResponse>(data) {
                for choice in chunk.choices {
                    if let Some(delta) = choice.delta.content {
                        if !delta.is_empty() {
                            on_delta(&delta);
                            content.push_str(&delta);
                            if should_cancel() {
                                write_llm_log(log_dir, task, provider_id, model, &body, None, Some(&content), Some("stream_cancelled_by_user"));
                                return Ok(StreamTextOutcome::Cancelled(content));
                            }
                        }
                    }
                }
            }
        }
    }
    write_llm_log(log_dir, task, provider_id, model, &body, None, Some(&content), None);
    Ok(StreamTextOutcome::Completed(content))
}

fn get_or_seed_feeds(app: &tauri::AppHandle) -> Result<Vec<FeedSource>, String> {
    let path = feeds_path(app)?;
    if path.exists() {
        read_json(path)
    } else {
        let feeds = default_feeds();
        write_json(path, &feeds)?;
        Ok(feeds)
    }
}

#[tauri::command]
fn get_feeds(app: tauri::AppHandle) -> Result<Vec<FeedSource>, String> {
    get_or_seed_feeds(&app)
}

#[tauri::command]
fn save_feeds(app: tauri::AppHandle, feeds: Vec<FeedSource>) -> Result<Vec<FeedSource>, String> {
    write_json(feeds_path(&app)?, &feeds)?;
    Ok(feeds)
}

#[tauri::command]
fn get_hotspot_candidates(app: tauri::AppHandle) -> Result<Vec<HotspotCandidate>, String> {
    let path = candidates_path(&app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    read_json(path)
}

#[tauri::command]
fn save_hotspot_candidates(
    app: tauri::AppHandle,
    candidates: Vec<HotspotCandidate>,
) -> Result<Vec<HotspotCandidate>, String> {
    write_json(candidates_path(&app)?, &candidates)?;
    Ok(candidates)
}

#[tauri::command]
async fn search_hotspots(app: tauri::AppHandle) -> Result<Vec<HotspotCandidate>, String> {
    tauri::async_runtime::spawn_blocking(move || search_hotspots_impl(app))
        .await
        .map_err(|error| error.to_string())?
}

fn search_hotspots_impl(app: tauri::AppHandle) -> Result<Vec<HotspotCandidate>, String> {
    let mut feeds = get_or_seed_feeds(&app)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let mut candidates = Vec::new();

    for feed in feeds.iter_mut().filter(|feed| feed.enabled) {
        let fetch_result = client
            .get(&feed.url)
            .send()
            .and_then(|response| response.error_for_status())
            .and_then(|response| response.bytes());

        match fetch_result {
            Ok(bytes) => {
                let channel = match Channel::read_from(Cursor::new(bytes)) {
                    Ok(channel) => channel,
                    Err(error) => {
                        feed.last_fetched_at = Some(now());
                        feed.last_status = Some(format!("failed: invalid rss xml: {error}"));
                        continue;
                    }
                };
                for item in channel.items().iter().take(12) {
                    let title = item
                        .title()
                        .unwrap_or("Untitled AI update")
                        .trim()
                        .to_string();
                    let link = item.link().unwrap_or(&feed.url).trim().to_string();
                    let raw_summary = item
                        .description()
                        .or_else(|| item.content())
                        .unwrap_or("来源未提供摘要，请打开链接查看原文。");
                    let summary = truncate(&strip_html(raw_summary), 220);
                    let signals = keyword_signals(&format!("{title} {summary}"));
                    let source = Source {
                        id: stable_id("src", &link),
                        title: title.clone(),
                        url: link.clone(),
                        publisher: feed.name.clone(),
                        published_at: item.pub_date().map(|date| date.to_string()),
                    };

                    candidates.push(HotspotCandidate {
                        id: stable_id("hotspot", &format!("{}{}", title, link)),
                        title,
                        summary,
                        category: feed.category.clone(),
                        status: "new".into(),
                        source_count: 1,
                        sources: vec![source],
                        matched_signals: if signals.is_empty() {
                            vec![feed.category.clone()]
                        } else {
                            signals
                        },
                        created_at: now(),
                        note: None,
                        display_category: None,
                    });
                }
                feed.last_fetched_at = Some(now());
                feed.last_status = Some("success".into());
            }
            Err(error) => {
                feed.last_fetched_at = Some(now());
                feed.last_status = Some(format!("failed: {error}"));
            }
        }
    }

    candidates.sort_by(|a, b| {
        let a_key = a
            .sources
            .first()
            .and_then(|source| source.published_at.as_deref())
            .unwrap_or(a.created_at.as_str());
        let b_key = b
            .sources
            .first()
            .and_then(|source| source.published_at.as_deref())
            .unwrap_or(b.created_at.as_str());
        b_key.cmp(a_key)
    });
    candidates.truncate(30);
    write_json(feeds_path(&app)?, &feeds)?;
    write_json(candidates_path(&app)?, &candidates)?;
    Ok(candidates)
}

#[tauri::command]
fn import_manual_attachment(
    app: tauri::AppHandle,
    path: String,
) -> Result<ManualAttachmentImportResult, String> {
    let source_path = PathBuf::from(path);
    if !source_path.exists() {
        return Err("附件文件不存在".into());
    }
    if !source_path.is_file() {
        return Err("请选择一个文件，而不是文件夹".into());
    }

    let original_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("attachment")
        .to_string();
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let stored_name = format!(
        "{}-{}",
        Utc::now().format("%Y%m%d%H%M%S%3f"),
        safe_file_name(&original_name)
    );
    let content = extract_attachment_text(&source_path, &extension)?;
    let stored_path = manual_attachments_dir(&app)?.join(stored_name);
    fs::copy(&source_path, &stored_path).map_err(|error| format!("保存附件失败: {error}"))?;

    Ok(ManualAttachmentImportResult {
        original_name,
        stored_path: stored_path.to_string_lossy().to_string(),
        content,
    })
}

#[tauri::command]
fn add_manual_hotspot(
    app: tauri::AppHandle,
    input: ManualHotspotInput,
) -> Result<HotspotCandidate, String> {
    if input.title.trim().is_empty() {
        return Err("热点标题不能为空".into());
    }
    let source_file_path = input
        .source_file_path
        .clone()
        .filter(|value| !value.trim().is_empty());
    let source_file_name = input
        .source_file_name
        .clone()
        .filter(|value| !value.trim().is_empty());
    let explicit_url = input.url.trim().to_string();
    let source_url = if let Some(path) = source_file_path.clone() {
        path
    } else if !explicit_url.is_empty() {
        explicit_url
    } else {
        return Err("来源文件或来源链接不能为空".into());
    };

    let publisher = input
        .publisher
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| source_file_name.clone())
        .unwrap_or_else(|| "Manual Source".into());
    let source_title = source_file_name.clone().unwrap_or_else(|| input.title.clone());
    let content = input.content.clone().unwrap_or_default();
    let summary = if input.summary.trim().is_empty() {
        if content.trim().is_empty() {
            "手动补充热点，等待编辑补充背景说明。".into()
        } else {
            truncate(&content.split_whitespace().collect::<Vec<_>>().join(" "), 260)
        }
    } else {
        input.summary.clone()
    };
    let note = if content.trim().is_empty() {
        Some("用户手动补充".into())
    } else {
        Some(content)
    };

    if source_file_path.is_some() && !Path::new(&source_url).exists() {
        return Err("来源文件保存位置不存在，请重新上传附件".into());
    }

    let category = input.category.unwrap_or_else(|| "other".into());
    let source = Source {
        id: stable_id("src", &source_url),
        title: source_title,
        url: source_url.clone(),
        publisher,
        published_at: Some(now()),
    };
    let candidate = HotspotCandidate {
        id: stable_id("manual", &format!("{}{}", input.title, source_url)),
        title: input.title,
        summary,
        category,
        status: "shortlisted".into(),
        source_count: 1,
        sources: vec![source],
        matched_signals: vec!["manual".into()],
        created_at: now(),
        note,
        display_category: None,
    };

    let path = candidates_path(&app)?;
    let mut candidates: Vec<HotspotCandidate> = if path.exists() {
        read_json(path.clone())?
    } else {
        Vec::new()
    };
    candidates.retain(|item| item.id != candidate.id);
    candidates.insert(0, candidate.clone());
    write_json(path, &candidates)?;
    Ok(candidate)
}

#[tauri::command]
fn generate_roundtable_plan(
    app: tauri::AppHandle,
    hotspot: HotspotCandidate,
    settings: Option<ProviderSettings>,
) -> Result<RoundtablePlan, String> {
    let prompt_config = get_or_seed_prompt_config(Some(&app))?;
    let log_dir = llm_logs_dir(&app)?;
    if let Some(settings) = settings {
        if settings.provider_id == "mock" {
            return Err("圆桌议程的主题和摘要必须由真实模型生成，请先在设置中选择可用模型并配置 API Key。".into());
        }

        ensure_generation_provider_ready(&settings)?;
        let api_key = required_api_key(&settings)?;
        let model = required_selected_model(&settings)?;
        return generate_plan_with_openai_compatible(
            &hotspot,
            &settings.provider_id,
            Some(log_dir.as_path()),
            &settings.base_url,
            &api_key,
            &model,
            &prompt_config,
        )
        .map_err(|error| format!("LLM 生成计划失败，已停止本地 fallback：{error}"));
    }

    Err("圆桌议程的主题和摘要必须由真实模型生成，请先在设置中选择可用模型并配置 API Key。".into())
}

fn emit_draft_token(app: &tauri::AppHandle, session_id: &str, turn: &DialogueTurn, text_delta: &str) {
    if session_id.is_empty() || text_delta.is_empty() {
        return;
    }
    let _ = app.emit(
        "roundtable://draft-delta",
        DraftDeltaEvent {
            session_id: session_id.into(),
            kind: "token".into(),
            turn: Some(DialogueTurn {
                speaker_id: turn.speaker_id.clone(),
                intent: turn.intent.clone(),
                text: String::new(),
                source: turn.source.clone(),
                interrupted: turn.interrupted,
                created_at: turn.created_at.clone(),
            }),
            text_delta: Some(text_delta.into()),
        },
    );
}

fn emit_draft_turn(app: &tauri::AppHandle, session_id: &str, turn: DialogueTurn) {
    if session_id.is_empty() {
        return;
    }
    let _ = app.emit(
        "roundtable://draft-delta",
        DraftDeltaEvent {
            session_id: session_id.into(),
            kind: "turn".into(),
            turn: Some(turn),
            text_delta: None,
        },
    );
}

#[allow(clippy::too_many_arguments)]
fn emit_agent_progress(
    app: &tauri::AppHandle,
    session_id: &str,
    agent_id: &str,
    agent_label: &str,
    phase: &str,
    status: &str,
    progress: u8,
    message: &str,
    severity: &str,
    turn_index: Option<usize>,
) {
    if session_id.is_empty() {
        return;
    }
    let _ = app.emit(
        "roundtable://agent-progress",
        AgentProgressEvent {
            session_id: session_id.into(),
            agent_id: agent_id.into(),
            agent_label: agent_label.into(),
            phase: phase.into(),
            status: status.into(),
            progress: progress.min(100),
            message: message.into(),
            severity: severity.into(),
            turn_index,
        },
    );
}

fn generate_rule_based_plan(
    hotspot: HotspotCandidate,
    prompt_config: &LlmPromptConfig,
) -> RoundtablePlan {
    let signals = if hotspot.matched_signals.is_empty() {
        "来源信号有限".to_string()
    } else {
        hotspot.matched_signals.join("、")
    };
    RoundtablePlan {
        id: stable_id("plan", &hotspot.id),
        hotspot_id: hotspot.id,
        topic_title: None,
        topic_summary: None,
        objective: format!(
            "围绕「{}」建立事实背景、行业直觉、商业判断和技术判断。",
            hotspot.title
        ),
        audience_promise: "让 AI 从业者快速判断这个热点是否值得投入产品、研发或投资注意力。".into(),
        guests: guest_personas(prompt_config),
        agenda: prompt_config
            .fallbacks
            .agenda
            .iter()
            .map(|item| render_template(item, &[("signals", signals.clone())]))
            .collect(),
        tension_points: prompt_config.fallbacks.tension_points.clone(),
        speaking_order: vec![
            "host".into(),
            "participant".into(),
            "expert".into(),
            "investor".into(),
            "host".into(),
        ],
        source_risks: prompt_config
            .fallbacks
            .source_risks
            .iter()
            .map(|item| render_template(item, &[("sourceCount", hotspot.source_count.to_string())]))
            .collect(),
    }
}

fn generate_plan_with_openai_compatible(
    hotspot: &HotspotCandidate,
    provider_id: &str,
    log_dir: Option<&Path>,
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt_config: &LlmPromptConfig,
) -> Result<RoundtablePlan, String> {
    let client = Client::builder()
        .timeout(llm_request_timeout(provider_id, 45))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let sources = serde_json::to_string(&hotspot.sources).map_err(|error| error.to_string())?;
    let guests =
        serde_json::to_string(&guest_personas(prompt_config)).map_err(|error| error.to_string())?;
    let mut replacements = style_replacements_for_provider(prompt_config, provider_id, "plan");
    replacements.extend([
        (
            "hotspotTitle",
            maybe_sanitize_deepseek_plan_value(provider_id, hotspot.title.clone()),
        ),
        (
            "hotspotSummary",
            maybe_sanitize_deepseek_plan_value(provider_id, hotspot.summary.clone()),
        ),
        (
            "sourcesJson",
            maybe_sanitize_deepseek_plan_value(provider_id, sources),
        ),
        (
            "guestPersonasJson",
            maybe_sanitize_deepseek_plan_value(provider_id, guests),
        ),
    ]);
    let prompt = prompt_for_provider(
        provider_id,
        render_template(&prompt_config.tasks.plan.user_template, &replacements),
        &prompt_config.schemas.plan,
    );

    let value = openai_chat_json(
        &client,
        &url,
        provider_id,
        log_dir,
        "roundtable_plan",
        api_key,
        model,
        &prompt_config.tasks.plan.system_prompt,
        prompt,
        prompt_config.tasks.plan.temperature,
        &prompt_config.schemas.plan,
    )?;
    let mut plan = generate_rule_based_plan(hotspot.clone(), prompt_config);
    if let Some(topic_title) = value.get("topicTitle").and_then(|item| item.as_str()) {
        plan.topic_title = Some(topic_title.to_string());
    }
    if let Some(topic_summary) = value.get("topicSummary").and_then(|item| item.as_str()) {
        plan.topic_summary = Some(topic_summary.to_string());
    }
    if let Some(objective) = value.get("objective").and_then(|item| item.as_str()) {
        plan.objective = objective.to_string();
    }
    if let Some(audience_promise) = value.get("audiencePromise").and_then(|item| item.as_str()) {
        plan.audience_promise = audience_promise.to_string();
    }
    if let Some(agenda) = string_array(&value, "agenda") {
        plan.agenda = agenda;
    }
    if let Some(tension_points) = string_array(&value, "tensionPoints") {
        plan.tension_points = tension_points;
    }
    if let Some(source_risks) = string_array(&value, "sourceRisks") {
        plan.source_risks = source_risks;
    }
    require_model_topic_metadata(plan)
}

fn require_model_topic_metadata(plan: RoundtablePlan) -> Result<RoundtablePlan, String> {
    let has_title = plan
        .topic_title
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);
    let has_summary = plan
        .topic_summary
        .as_deref()
        .map(|value| !value.trim().is_empty())
        .unwrap_or(false);

    if has_title && has_summary {
        Ok(plan)
    } else {
        Err("模型未返回圆桌议程主题和摘要，已停止生成。请重试或更换真实模型。".into())
    }
}

fn string_array(value: &serde_json::Value, key: &str) -> Option<Vec<String>> {
    let items = value.get(key)?.as_array()?;
    let strings = items
        .iter()
        .filter_map(|item| item.as_str().map(ToString::to_string))
        .collect::<Vec<_>>();
    if strings.is_empty() {
        None
    } else {
        Some(strings)
    }
}

#[tauri::command]
async fn generate_episode_draft(
    app: tauri::AppHandle,
    plan: RoundtablePlan,
    hotspot: HotspotCandidate,
    settings: Option<ProviderSettings>,
    session_id: Option<String>,
) -> Result<EpisodeDraft, String> {
    tauri::async_runtime::spawn_blocking(move || {
        generate_episode_draft_impl(app, plan, hotspot, settings, session_id)
    })
    .await
    .map_err(|error| error.to_string())?
}

fn generate_episode_draft_impl(
    app: tauri::AppHandle,
    plan: RoundtablePlan,
    hotspot: HotspotCandidate,
    settings: Option<ProviderSettings>,
    session_id: Option<String>,
) -> Result<EpisodeDraft, String> {
    let prompt_config = get_or_seed_prompt_config(Some(&app))?;
    let log_dir = llm_logs_dir(&app)?;
    if let Some(settings) = settings {
        if settings.provider_id == "mock" {
            let draft = generate_rule_based_draft(plan, hotspot, &prompt_config);
            if let Some(session_id) = session_id.as_deref() {
                for turn in draft.dialogue.iter().cloned() {
                    emit_draft_turn(&app, session_id, turn);
                }
            }
            return Ok(draft);
        }

        ensure_generation_provider_ready(&settings)?;
        let api_key = required_api_key(&settings)?;
        let model = required_selected_model(&settings)?;
        let mode = settings
            .draft_generation_mode
            .as_deref()
            .unwrap_or("single");
        let started_at = Instant::now();
        let result = if mode == "multi_agent" {
            println!("[AI timing] generate_multi_agent_draft start");
            generate_multi_agent_draft_with_openai_compatible(
                &plan,
                &hotspot,
                &settings.provider_id,
                Some(log_dir.as_path()),
                &settings.base_url,
                &api_key,
                &model,
                &prompt_config,
                Some((&app, session_id.as_deref().unwrap_or(""))),
            )
        } else {
            println!("[AI timing] generate_single_draft start");
            generate_draft_with_openai_compatible(
                &plan,
                &hotspot,
                &settings.provider_id,
                Some(log_dir.as_path()),
                &settings.base_url,
                &api_key,
                &model,
                &prompt_config,
            )
        };
        println!(
            "[AI timing] generate_episode_draft backend {}ms",
            started_at.elapsed().as_millis()
        );
        return result.map_err(|error| format!("LLM 生成稿件失败，已停止本地 fallback：{error}"));
    }

    Ok(generate_rule_based_draft(plan, hotspot, &prompt_config))
}

#[tauri::command]
fn start_interactive_roundtable(
    app: tauri::AppHandle,
    plan: RoundtablePlan,
    hotspot: HotspotCandidate,
    settings: Option<ProviderSettings>,
    session_id: String,
) -> Result<EpisodeDraft, String> {
    let prompt_config = get_or_seed_prompt_config(Some(&app))?;
    let session_id = if session_id.trim().is_empty() {
        stable_id("interactive", &format!("{}{}{}", plan.id, hotspot.id, now()))
    } else {
        session_id
    };
    let draft = create_interactive_draft_shell(&session_id, &plan, &hotspot, &prompt_config);
    let cancel_current_turn = Arc::new(AtomicBool::new(false));
    let session = InteractiveRoundtableSession {
        plan,
        hotspot,
        settings,
        prompt_config,
        draft: draft.clone(),
        cancel_current_turn,
        status: "running".into(),
        active_speaker_id: None,
        next_run_id: 1,
    };

    interactive_sessions()
        .lock()
        .map_err(|_| "互动圆桌会话状态已损坏".to_string())?
        .insert(session_id.clone(), session);
    emit_interactive_state(
        &app,
        &session_id,
        "running",
        "互动圆桌已启动，AI 嘉宾正在准备第一轮发言。",
        Some(draft.clone()),
        None,
    );
    spawn_interactive_generation(app, session_id);
    Ok(draft)
}

#[tauri::command]
fn interrupt_interactive_roundtable(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<(), String> {
    let (draft, active_speaker_id) = {
        let mut sessions = interactive_sessions()
            .lock()
            .map_err(|_| "互动圆桌会话状态已损坏".to_string())?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| "找不到当前互动圆桌会话".to_string())?;
        session.cancel_current_turn.store(true, Ordering::SeqCst);
        session.status = "interrupted".into();
        (session.draft.clone(), session.active_speaker_id.clone())
    };
    emit_interactive_state(
        &app,
        &session_id,
        "interrupted",
        "正在停止当前 AI 发言，稍后可输入你的观点。",
        Some(draft),
        active_speaker_id,
    );
    Ok(())
}

#[tauri::command]
fn submit_interactive_user_turn(
    app: tauri::AppHandle,
    session_id: String,
    text: String,
) -> Result<EpisodeDraft, String> {
    let text = text.trim();
    if text.is_empty() {
        return Err("用户发言不能为空".into());
    }
    let draft = {
        let mut sessions = interactive_sessions()
            .lock()
            .map_err(|_| "互动圆桌会话状态已损坏".to_string())?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| "找不到当前互动圆桌会话".to_string())?;
        session.cancel_current_turn.store(false, Ordering::SeqCst);
        session.draft.dialogue.push(user_dialogue_turn(text));
        session.draft.updated_at = now();
        session.status = "running".into();
        session.active_speaker_id = None;
        session.next_run_id = session.next_run_id.saturating_add(1);
        session.draft.clone()
    };
    emit_interactive_state(
        &app,
        &session_id,
        "running",
        "已插入你的发言，中控 agent 正在重排后续嘉宾回应。",
        Some(draft.clone()),
        None,
    );
    spawn_interactive_generation(app, session_id);
    Ok(draft)
}

#[tauri::command]
fn finish_interactive_roundtable(
    app: tauri::AppHandle,
    session_id: String,
) -> Result<EpisodeDraft, String> {
    let draft = {
        let mut sessions = interactive_sessions()
            .lock()
            .map_err(|_| "互动圆桌会话状态已损坏".to_string())?;
        let session = sessions
            .get_mut(&session_id)
            .ok_or_else(|| "找不到当前互动圆桌会话".to_string())?;
        session.cancel_current_turn.store(true, Ordering::SeqCst);
        session.status = "finished".into();
        session.active_speaker_id = None;
        finalize_interactive_draft(&mut session.draft, &session.prompt_config, &session.plan);
        session.draft.clone()
    };
    emit_interactive_state(
        &app,
        &session_id,
        "finished",
        "互动圆桌已收束，可以保存草稿。",
        Some(draft.clone()),
        None,
    );
    Ok(draft)
}

fn create_interactive_draft_shell(
    session_id: &str,
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    prompt_config: &LlmPromptConfig,
) -> EpisodeDraft {
    let current_time = now();
    EpisodeDraft {
        id: format!("interactive-{session_id}"),
        title: format!("互动圆桌：{}", hotspot.title),
        summary: "互动圆桌正在生成。用户可在 AI 嘉宾发言时打断，并以真实用户发言继续推进讨论。".into(),
        status: "draft".into(),
        plan_id: plan.id.clone(),
        hotspot_id: hotspot.id.clone(),
        sources: hotspot.sources.clone(),
        guests: plan.guests.clone(),
        dialogue: Vec::new(),
        takeaways: prompt_config.fallbacks.takeaways.clone(),
        fact_checks: plan.source_risks.clone(),
        agent_trace: Vec::new(),
        created_at: current_time.clone(),
        updated_at: current_time,
    }
}

fn finalize_interactive_draft(
    draft: &mut EpisodeDraft,
    prompt_config: &LlmPromptConfig,
    plan: &RoundtablePlan,
) {
    if draft.takeaways.is_empty() {
        draft.takeaways = prompt_config.fallbacks.takeaways.clone();
    }
    if draft.fact_checks.is_empty() {
        draft.fact_checks = if plan.source_risks.is_empty() {
            prompt_config.fallbacks.fact_checks.clone()
        } else {
            plan.source_risks.clone()
        };
    }
    draft.summary = format!(
        "本期互动圆桌共记录 {} 轮发言，其中用户发言 {} 轮。发布前请复核来源、事实风险和被打断发言的上下文。",
        draft.dialogue.len(),
        draft
            .dialogue
            .iter()
            .filter(|turn| turn.source.as_deref() == Some("user") || turn.speaker_id == "user")
            .count()
    );
    draft.updated_at = now();
}

fn spawn_interactive_generation(app: tauri::AppHandle, session_id: String) {
    tauri::async_runtime::spawn_blocking(move || {
        if let Err(error) = run_interactive_generation_loop(app.clone(), session_id.clone()) {
            let draft = interactive_sessions()
                .lock()
                .ok()
                .and_then(|sessions| sessions.get(&session_id).map(|session| session.draft.clone()));
            emit_interactive_state(
                &app,
                &session_id,
                "failed",
                &format!("互动圆桌生成失败：{error}"),
                draft,
                None,
            );
        }
    });
}

fn run_interactive_generation_loop(app: tauri::AppHandle, session_id: String) -> Result<(), String> {
    loop {
        let snapshot = {
            let mut sessions = interactive_sessions()
                .lock()
                .map_err(|_| "互动圆桌会话状态已损坏".to_string())?;
            let session = sessions
                .get_mut(&session_id)
                .ok_or_else(|| "找不到当前互动圆桌会话".to_string())?;
            if session.status == "finished" || session.status == "awaiting_user" || session.status == "interrupted" {
                return Ok(());
            }
            let ai_turns = session
                .draft
                .dialogue
                .iter()
                .filter(|turn| turn.source.as_deref() != Some("user") && turn.speaker_id != "user")
                .count();
            if ai_turns >= 12 {
                session.status = "finished".into();
                finalize_interactive_draft(&mut session.draft, &session.prompt_config, &session.plan);
                let draft = session.draft.clone();
                drop(sessions);
                emit_interactive_state(
                    &app,
                    &session_id,
                    "finished",
                    "互动圆桌已达到本轮建议长度，可以保存或继续编辑。",
                    Some(draft),
                    None,
                );
                return Ok(());
            }
            session.cancel_current_turn.store(false, Ordering::SeqCst);
            (
                session.plan.clone(),
                session.hotspot.clone(),
                session.settings.clone(),
                session.prompt_config.clone(),
                session.draft.clone(),
                Arc::clone(&session.cancel_current_turn),
            )
        };

        let (plan, hotspot, settings, prompt_config, draft, cancel_current_turn) = snapshot;
        let turn_plan = plan_next_interactive_turn(&plan, &hotspot, &settings, &prompt_config, &draft);
        let speaker = plan
            .guests
            .iter()
            .find(|guest| guest.id == turn_plan.speaker_id)
            .or_else(|| plan.guests.first())
            .ok_or_else(|| "圆桌计划没有可用 AI 嘉宾".to_string())?
            .clone();
        {
            let mut sessions = interactive_sessions()
                .lock()
                .map_err(|_| "互动圆桌会话状态已损坏".to_string())?;
            if let Some(session) = sessions.get_mut(&session_id) {
                session.active_speaker_id = Some(speaker.id.clone());
                session.status = "running".into();
            }
        }
        emit_interactive_state(
            &app,
            &session_id,
            "running",
            &format!("{} 正在发言，可随时打断。", speaker.label),
            None,
            Some(speaker.id.clone()),
        );
        let outcome = stream_interactive_ai_turn(
            &app,
            &session_id,
            &plan,
            &hotspot,
            &settings,
            &prompt_config,
            &draft,
            &speaker,
            &turn_plan,
            cancel_current_turn,
        )?;
        let should_pause = matches!(outcome, StreamTextOutcome::Cancelled(_));
        let text = match outcome {
            StreamTextOutcome::Completed(text) | StreamTextOutcome::Cancelled(text) => text.trim().to_string(),
        };
        let maybe_turn = if text.is_empty() {
            None
        } else if should_pause {
            Some(interrupted_ai_turn(&speaker.id, &turn_plan.intent, &text))
        } else {
            Some(ai_dialogue_turn(&speaker.id, &turn_plan.intent, &text))
        };
        let (draft, active_speaker_id, status, message) = {
            let mut sessions = interactive_sessions()
                .lock()
                .map_err(|_| "互动圆桌会话状态已损坏".to_string())?;
            let session = sessions
                .get_mut(&session_id)
                .ok_or_else(|| "找不到当前互动圆桌会话".to_string())?;
            if session.status == "finished" {
                return Ok(());
            }
            if let Some(turn) = maybe_turn.clone() {
                session.draft.dialogue.push(turn);
            }
            session.draft.updated_at = now();
            session.active_speaker_id = None;
            if should_pause {
                session.status = "awaiting_user".into();
                (
                    session.draft.clone(),
                    Some(speaker.id.clone()),
                    "awaiting_user".to_string(),
                    "AI 发言已被打断，请输入你的观点。".to_string(),
                )
            } else {
                (
                    session.draft.clone(),
                    None,
                    "running".to_string(),
                    "本轮发言已写入，继续生成下一轮。".to_string(),
                )
            }
        };
        if let Some(turn) = maybe_turn {
            emit_draft_turn(&app, &session_id, turn);
        }
        emit_interactive_state(
            &app,
            &session_id,
            &status,
            &message,
            Some(draft),
            active_speaker_id,
        );
        if should_pause {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(180));
    }
}

fn plan_next_interactive_turn(
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    settings: &Option<ProviderSettings>,
    prompt_config: &LlmPromptConfig,
    draft: &EpisodeDraft,
) -> TurnPlanItem {
    if let Some(settings) = settings {
        if !should_use_mock_provider(settings) {
            if let Ok(turn) = plan_next_interactive_turn_with_model(plan, hotspot, settings, prompt_config, draft) {
                return turn;
            }
        }
    }
    fallback_next_interactive_turn(plan, hotspot, draft)
}

fn plan_next_interactive_turn_with_model(
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    settings: &ProviderSettings,
    prompt_config: &LlmPromptConfig,
    draft: &EpisodeDraft,
) -> Result<TurnPlanItem, String> {
    ensure_generation_provider_ready(settings)?;
    let api_key = required_api_key(settings)?;
    let model = required_selected_model(settings)?;
    let client = Client::builder()
        .timeout(llm_request_timeout(&settings.provider_id, 60))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("{}/chat/completions", settings.base_url.trim_end_matches('/'));
    let transcript = render_transcript(&draft.dialogue, &plan.guests);
    let prompt = json!({
        "hotspot": {"title": hotspot.title, "summary": hotspot.summary},
        "objective": plan.objective,
        "agenda": plan.agenda,
        "tensionPoints": plan.tension_points,
        "sourceRisks": plan.source_risks,
        "guests": plan.guests,
        "transcript": transcript,
        "instruction": "选择下一位 AI 嘉宾回应当前圆桌。只能选择 host、participant、investor、expert；绝不能输出 user。若用户刚发言，优先安排最适合回应用户观点的 AI 嘉宾。"
    });
    let schema = JsonSchemaSpec {
        name: "interactive_next_turn".into(),
        strict: true,
        schema: json!({
            "type": "object",
            "additionalProperties": false,
            "required": ["speakerId", "intent", "instruction"],
            "properties": {
                "speakerId": {"type": "string", "enum": ["host", "participant", "investor", "expert"]},
                "intent": {"type": "string", "enum": ["open", "context", "intuition", "business", "technical", "challenge", "followup", "transition", "summary"]},
                "instruction": {"type": "string"}
            }
        }),
    };
    let value = openai_chat_json(
        &client,
        &url,
        &settings.provider_id,
        None,
        "interactive_next_turn",
        &api_key,
        &model,
        "你是中文 AI 圆桌的中控 agent。只输出 JSON，不要 markdown。你只能安排 AI 嘉宾发言，用户发言只能来自真实用户输入。",
        prompt_for_provider(&settings.provider_id, prompt.to_string(), &schema),
        prompt_config.tasks.draft_turn_planner.temperature,
        &schema,
    )?;
    let turn: TurnPlanItem = serde_json::from_value(value).map_err(|error| error.to_string())?;
    if is_ai_guest_speaker(&turn.speaker_id) {
        Ok(turn)
    } else {
        Err("中控 agent 不能安排 user 发言".into())
    }
}

fn fallback_next_interactive_turn(
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    draft: &EpisodeDraft,
) -> TurnPlanItem {
    let last_user_text = draft
        .dialogue
        .iter()
        .rev()
        .find(|turn| turn.speaker_id == "user")
        .map(|turn| turn.text.as_str());
    let ai_turns = draft
        .dialogue
        .iter()
        .filter(|turn| turn.speaker_id != "user")
        .count();
    let speaker_id = if let Some(text) = last_user_text {
        if text.contains('技') || text.contains("模型") || text.contains("工程") {
            "expert"
        } else if text.contains("商业") || text.contains("收入") || text.contains("投资") || text.contains("成本") {
            "investor"
        } else {
            "host"
        }
    } else {
        ["host", "participant", "expert", "investor"][ai_turns % 4]
    };
    let intent = match speaker_id {
        "host" => {
            if ai_turns == 0 {
                "open"
            } else {
                "followup"
            }
        }
        "participant" => "intuition",
        "investor" => "business",
        "expert" => "technical",
        _ => "context",
    };
    let instruction = if let Some(text) = last_user_text {
        format!("先回应用户刚刚的真实发言「{}」，再把讨论拉回「{}」的事实和判断。", snippet(text, 160), hotspot.title)
    } else {
        format!("围绕「{}」推进圆桌，回应前文并给出可核查、可编辑的中文发言。", hotspot.title)
    };
    let speaker_id = if plan.guests.iter().any(|guest| guest.id == speaker_id) {
        speaker_id
    } else {
        plan.guests.first().map(|guest| guest.id.as_str()).unwrap_or("host")
    };
    TurnPlanItem {
        speaker_id: speaker_id.into(),
        intent: intent.into(),
        tool_queries: vec![hotspot.title.clone(), instruction.clone()],
        instruction,
    }
}

fn stream_interactive_ai_turn(
    app: &tauri::AppHandle,
    session_id: &str,
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    settings: &Option<ProviderSettings>,
    prompt_config: &LlmPromptConfig,
    draft: &EpisodeDraft,
    speaker: &GuestPersona,
    turn_plan: &TurnPlanItem,
    cancel_current_turn: Arc<AtomicBool>,
) -> Result<StreamTextOutcome, String> {
    if let Some(settings) = settings {
        if !should_use_mock_provider(settings) {
            return stream_interactive_ai_turn_with_model(
                app,
                session_id,
                plan,
                hotspot,
                settings,
                prompt_config,
                draft,
                speaker,
                turn_plan,
                cancel_current_turn,
            );
        }
    }
    Ok(stream_mock_interactive_ai_turn(
        app,
        session_id,
        speaker,
        turn_plan,
        cancel_current_turn,
    ))
}

fn stream_interactive_ai_turn_with_model(
    app: &tauri::AppHandle,
    session_id: &str,
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    settings: &ProviderSettings,
    prompt_config: &LlmPromptConfig,
    draft: &EpisodeDraft,
    speaker: &GuestPersona,
    turn_plan: &TurnPlanItem,
    cancel_current_turn: Arc<AtomicBool>,
) -> Result<StreamTextOutcome, String> {
    ensure_generation_provider_ready(settings)?;
    let api_key = required_api_key(settings)?;
    let model = required_selected_model(settings)?;
    let client = Client::builder()
        .timeout(llm_request_timeout(&settings.provider_id, 90))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("{}/chat/completions", settings.base_url.trim_end_matches('/'));
    let plan_json = serde_json::to_string(plan).map_err(|error| error.to_string())?;
    let sources_json = serde_json::to_string(&hotspot.sources).map_err(|error| error.to_string())?;
    let speaker_json = serde_json::to_string(speaker).map_err(|error| error.to_string())?;
    let transcript = render_transcript(&draft.dialogue, &plan.guests);
    let mut turn_replacements = style_replacements(prompt_config);
    turn_replacements.extend([
        ("hotspotTitle", hotspot.title.clone()),
        ("hotspotSummary", hotspot.summary.clone()),
        ("sourcesJson", sources_json),
        ("planJson", plan_json),
        ("speakerPersonaJson", speaker_json),
        ("turnInstruction", turn_plan.instruction.clone()),
        (
            "transcript",
            if transcript.is_empty() {
                "（暂无，当前是互动圆桌开场轮）".into()
            } else {
                transcript
            },
        ),
    ]);
    let turn_prompt = format!(
        "{}\n\n互动规则：用户发言只来自真实用户输入，你不能替用户补写。当前只输出「{}」这一位 AI 嘉宾的发言正文；如果上一轮有用户发言，必须自然回应。",
        render_template(
            &prompt_config.tasks.draft_guest_turn.user_template,
            &turn_replacements,
        ),
        speaker.label
    );
    let stream_turn = ai_dialogue_turn(&speaker.id, &turn_plan.intent, "");
    openai_chat_text_stream_until_cancelled(
        &client,
        &url,
        &settings.provider_id,
        None,
        "interactive_guest_turn_stream",
        &api_key,
        &model,
        "你正在扮演中文圆桌 AI 嘉宾。只输出这一轮发言正文，不要 JSON，不要 Markdown，不要字段名。",
        turn_prompt,
        prompt_config.tasks.draft_guest_turn.temperature,
        |delta| emit_draft_token(app, session_id, &stream_turn, delta),
        || cancel_current_turn.load(Ordering::SeqCst),
    )
}

fn stream_mock_interactive_ai_turn(
    app: &tauri::AppHandle,
    session_id: &str,
    speaker: &GuestPersona,
    turn_plan: &TurnPlanItem,
    cancel_current_turn: Arc<AtomicBool>,
) -> StreamTextOutcome {
    let text = fallback_guest_turn_text(speaker, turn_plan);
    let stream_turn = ai_dialogue_turn(&speaker.id, &turn_plan.intent, "");
    let mut content = String::new();
    for ch in text.chars() {
        if cancel_current_turn.load(Ordering::SeqCst) {
            return StreamTextOutcome::Cancelled(content);
        }
        let delta = ch.to_string();
        emit_draft_token(app, session_id, &stream_turn, &delta);
        content.push(ch);
        thread::sleep(Duration::from_millis(24));
    }
    StreamTextOutcome::Completed(content)
}

fn should_use_mock_provider(settings: &ProviderSettings) -> bool {
    settings.provider_id == "mock"
        || settings.api_key.as_deref().unwrap_or("").trim().is_empty()
        || settings
            .selected_model
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
}

fn emit_interactive_state(
    app: &tauri::AppHandle,
    session_id: &str,
    status: &str,
    message: &str,
    draft: Option<EpisodeDraft>,
    active_speaker_id: Option<String>,
) {
    let _ = app.emit(
        "roundtable://interactive-state",
        InteractiveSessionEvent {
            session_id: session_id.into(),
            status: status.into(),
            message: message.into(),
            draft,
            active_speaker_id,
        },
    );
}

#[tauri::command]
async fn generate_autonomous_episode_draft(
    app: tauri::AppHandle,
    plan: RoundtablePlan,
    hotspot: HotspotCandidate,
    settings: ProviderSettings,
    options: AutonomousDraftOptions,
    agent_runtime_settings: AgentRuntimeSettings,
) -> Result<EpisodeDraft, String> {
    tauri::async_runtime::spawn_blocking(move || {
        generate_autonomous_episode_draft_native(
            &app,
            &plan,
            &hotspot,
            &settings,
            &options,
            &agent_runtime_settings,
        )
    })
    .await
    .map_err(|error| error.to_string())?
}

fn generate_autonomous_episode_draft_native(
    app: &tauri::AppHandle,
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    settings: &ProviderSettings,
    options: &AutonomousDraftOptions,
    runtime_settings: &AgentRuntimeSettings,
) -> Result<EpisodeDraft, String> {
    let prompt_config = get_or_seed_prompt_config(Some(app))?;
    let log_dir = llm_logs_dir(app)?;
    let depth = if options.discussion_depth.trim().is_empty() {
        runtime_settings.discussion_depth.as_str()
    } else {
        options.discussion_depth.as_str()
    };
    let (min_turns, max_turns) = autonomous_turn_range(depth);
    let session_id = options.session_id.trim();
    let memory_chunks = build_autonomous_memory_chunks(hotspot, &options.supplemental_documents);
    let mut sources = hotspot.sources.clone();
    let mut agent_trace = vec![agent_trace_record(
        stable_id("trace", &format!("{}{}autonomous-memory", plan.id, hotspot.id)),
        "info",
        "controller",
        "中控 Agent",
        "memory.index",
        format!(
            "已建立 {} 个本地记忆片段，包含热点、来源和 {} 份补充资料。",
            memory_chunks.len(),
            options.supplemental_documents.iter().filter(|doc| !doc.content.trim().is_empty()).count()
        ),
        hotspot.sources.clone(),
    )];
    if !runtime_settings.generation_engine.trim().is_empty()
        && runtime_settings.generation_engine.trim() != "native"
    {
        agent_trace.push(agent_trace_record(
            stable_id("trace", &format!("{}{}engine-native", plan.id, hotspot.id)),
            "warning",
            "controller",
            "中控 Agent",
            "runtime.engine",
            "Python Remote 已归档，本次强自治圆桌使用 Native Rust Runtime 执行。",
            Vec::new(),
        ));
    }
    if !session_id.is_empty() {
        emit_agent_progress(
            app,
            session_id,
            "controller",
            "中控 Agent",
            "建立记忆索引",
            "running",
            8,
            "正在整理热点、来源和补充资料，建立本地记忆片段",
            "info",
            None,
        );
    }

    let turn_plan = if should_use_mock_provider(settings) {
        fallback_autonomous_turn_plan(plan, hotspot, min_turns, &prompt_config)
    } else {
        ensure_generation_provider_ready(settings)?;
        let api_key = required_api_key(settings)?;
        let model = required_selected_model(settings)?;
        generate_autonomous_turn_plan_with_model(
            plan,
            hotspot,
            settings,
            Some(log_dir.as_path()),
            &api_key,
            &model,
            &prompt_config,
            min_turns,
            max_turns,
            &memory_chunks,
            runtime_settings,
            app,
            session_id,
            &mut agent_trace,
        )?
    };
    let planned_turn_count = turn_plan.turns.len().clamp(min_turns, max_turns).max(1);
    agent_trace.push(agent_trace_record(
        stable_id("trace", &format!("{}{}autonomous-plan", plan.id, hotspot.id)),
        "info",
        "controller",
        "中控 Agent",
        "planning",
        format!(
            "讨论深度为 {}，中控规划 {} 轮发言（目标范围 {}-{}）。",
            depth, planned_turn_count, min_turns, max_turns
        ),
        hotspot.sources.clone(),
    ));
    if !session_id.is_empty() {
        emit_agent_progress(
            app,
            session_id,
            "controller",
            "中控 Agent",
            "调度完成",
            "succeeded",
            22,
            "中控已完成强自治调度，开始逐轮检索和发言",
            "info",
            None,
        );
    }

    let client = Client::builder()
        .timeout(llm_request_timeout(&settings.provider_id, 90))
        .user_agent("ai-roundtable/0.4 native-autonomous")
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("{}/chat/completions", settings.base_url.trim_end_matches('/'));
    let api_key = if should_use_mock_provider(settings) {
        String::new()
    } else {
        required_api_key(settings)?
    };
    let model = if should_use_mock_provider(settings) {
        String::new()
    } else {
        required_selected_model(settings)?
    };
    let plan_json = serde_json::to_string(plan).map_err(|error| error.to_string())?;
    let mut dialogue = Vec::new();

    for (index, turn) in turn_plan.turns.into_iter().take(max_turns).enumerate() {
        let speaker = plan
            .guests
            .iter()
            .find(|guest| guest.id == turn.speaker_id)
            .or_else(|| plan.guests.first())
            .ok_or_else(|| "圆桌计划没有可用嘉宾".to_string())?;
        let progress = 24 + ((index as f32 / planned_turn_count as f32) * 68.0).round() as u8;
        if !session_id.is_empty() {
            emit_agent_progress(
                app,
                session_id,
                &speaker.id,
                &speaker.label,
                "检索资料",
                "running",
                progress,
                "正在执行 memory.search，并按配置尝试 web.search",
                "info",
                Some(index + 1),
            );
        }
        let queries = autonomous_turn_queries(&turn, hotspot);
        let mut memory_hits = Vec::new();
        let mut web_sources = Vec::new();
        for query in queries.iter().take(2) {
            memory_hits.extend(autonomous_memory_search(&memory_chunks, query, 3));
            match autonomous_web_search(runtime_settings, query, Some(&client)) {
                Ok(results) => web_sources.extend(results),
                Err(error) => agent_trace.push(agent_trace_record(
                    stable_id("trace", &format!("{}{}{}web-error", plan.id, hotspot.id, index + 1)),
                    "warning",
                    &speaker.id,
                    &speaker.label,
                    "web.search",
                    format!("搜索失败，已跳过外部来源：{error}"),
                    Vec::new(),
                )),
            }
        }
        sources = merge_sources_by_url(sources, web_sources.clone());
        let memory_sources = memory_hits
            .iter()
            .filter_map(|chunk| chunk.source.clone())
            .collect::<Vec<_>>();
        let retrieval_sources = merge_sources_by_url(memory_sources, web_sources.clone());
        agent_trace.push(agent_trace_record(
            stable_id("trace", &format!("{}{}{}retrieval", plan.id, hotspot.id, index + 1)),
            if retrieval_sources.is_empty() { "debug" } else { "info" },
            &speaker.id,
            &speaker.label,
            "retrieval",
            format!(
                "第 {} 轮检索命中 {} 个记忆片段、{} 个外部来源。查询：{}",
                index + 1,
                memory_hits.len(),
                web_sources.len(),
                queries.join(" / ")
            ),
            retrieval_sources,
        ));

        let text = if should_use_mock_provider(settings) {
            fallback_autonomous_guest_text(hotspot, speaker, &turn, &memory_hits)
        } else {
            generate_autonomous_guest_turn_with_model(
                &client,
                &url,
                &settings.provider_id,
                Some(log_dir.as_path()),
                &api_key,
                &model,
                &prompt_config,
                plan,
                hotspot,
                &plan_json,
                speaker,
                &turn,
                &dialogue,
                &memory_hits,
                &web_sources,
                app,
                session_id,
                index + 1,
                &mut agent_trace,
            )?
        };
        let dialogue_turn = DialogueTurn {
            speaker_id: speaker.id.clone(),
            intent: turn.intent,
            text,
            source: Some("ai".into()),
            interrupted: false,
            created_at: Some(now()),
        };
        if should_use_mock_provider(settings) && !session_id.is_empty() {
            emit_draft_turn(app, session_id, dialogue_turn.clone());
        }
        dialogue.push(dialogue_turn);
        if !session_id.is_empty() {
            emit_agent_progress(
                app,
                session_id,
                &speaker.id,
                &speaker.label,
                "发言完成",
                "succeeded",
                progress.saturating_add(6),
                "本轮发言已写入圆桌稿",
                "info",
                Some(index + 1),
            );
        }
    }

    let current_time = now();
    let mut draft = generate_rule_based_draft(plan.clone(), hotspot.clone(), &prompt_config);
    draft.title = turn_plan.title;
    draft.summary = turn_plan.summary;
    draft.sources = sources;
    draft.dialogue = dialogue;
    draft.takeaways = turn_plan.takeaways;
    draft.fact_checks = turn_plan.fact_checks;
    draft.created_at = current_time.clone();
    draft.updated_at = current_time;
    agent_trace.push(agent_trace_record(
        stable_id("trace", &format!("{}{}autonomous-final", plan.id, hotspot.id)),
        "info",
        "controller",
        "中控 Agent",
        "finalize",
        format!(
            "强自治圆桌已完成，最终保留 {} 个来源、{} 条发言和 {} 条事实核查提示。",
            draft.sources.len(),
            draft.dialogue.len(),
            draft.fact_checks.len()
        ),
        draft.sources.clone(),
    ));
    draft.agent_trace = filter_autonomous_trace(agent_trace, runtime_settings.debug_trace_enabled);
    if !session_id.is_empty() {
        emit_agent_progress(
            app,
            session_id,
            "controller",
            "中控 Agent",
            "完成",
            "succeeded",
            100,
            "强自治圆桌稿已生成",
            "info",
            None,
        );
    }
    Ok(draft)
}

fn generate_rule_based_draft(
    plan: RoundtablePlan,
    hotspot: HotspotCandidate,
    prompt_config: &LlmPromptConfig,
) -> EpisodeDraft {
    let current_time = now();
    let source_names = hotspot
        .sources
        .iter()
        .map(|source| source.publisher.clone())
        .collect::<Vec<_>>()
        .join("、");
    let topic_title = plan
        .topic_title
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| hotspot.title.clone());
    let topic_summary = plan
        .topic_summary
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| hotspot.summary.clone());

    EpisodeDraft {
        id: stable_id("draft", &format!("{}{}", plan.id, hotspot.id)),
        title: format!("圆桌：{}", topic_title),
        summary: format!(
            "{} 本期基于 {} 个来源展开，重点讨论事实背景、工程可行性、商业影响和本周行动判断。",
            topic_summary, hotspot.source_count
        ),
        status: "draft".into(),
        plan_id: plan.id,
        hotspot_id: hotspot.id,
        sources: hotspot.sources,
        guests: plan.guests,
        dialogue: vec![
            DialogueTurn {
                speaker_id: "host".into(),
                intent: "open".into(),
                text: format!("今天我们讨论「{}」。先提醒一句，接下来的嘉宾都是模拟圆桌角色，不是真实采访对象。我们会基于来源材料，把事实、争议和判断分开。", topic_title),
                source: Some("ai".into()),
                interrupted: false,
                created_at: Some(current_time.clone()),
            },
            DialogueTurn {
                speaker_id: "participant".into(),
                intent: "intuition".into(),
                text: "作为产品使用者，我最关心的不是标题本身，而是它是否真的改变日常工作流、降低试用门槛，并且值得持续付费。".into(),
                source: Some("ai".into()),
                interrupted: false,
                created_at: Some(current_time.clone()),
            },
            DialogueTurn {
                speaker_id: "expert".into(),
                intent: "technical".into(),
                text: "技术上我会先看三个问题：能力是否能复现，失败模式是否清楚，工程系统是否能观测、回滚和审计。没有这些，热点容易停留在演示层。".into(),
                source: Some("ai".into()),
                interrupted: false,
                created_at: Some(current_time.clone()),
            },
            DialogueTurn {
                speaker_id: "investor".into(),
                intent: "business".into(),
                text: "商业上我会追问付费场景是不是足够刚性。如果只是效率叙事，还需要看到具体岗位、预算归属和竞争壁垒。".into(),
                source: Some("ai".into()),
                interrupted: false,
                created_at: Some(current_time.clone()),
            },
            DialogueTurn {
                speaker_id: "host".into(),
                intent: "summary".into(),
                text: format!("所以这期先给一个保守判断：它值得关注，但结论要继续回到来源和证据。当前主要来源包括：{}。", source_names),
                source: Some("ai".into()),
                interrupted: false,
                created_at: Some(current_time.clone()),
            },
        ],
        takeaways: prompt_config.fallbacks.takeaways.clone(),
        fact_checks: prompt_config.fallbacks.fact_checks.clone(),
        agent_trace: Vec::new(),
        created_at: current_time.clone(),
        updated_at: current_time,
    }
}

fn agent_trace_record(
    id: impl Into<String>,
    level: &str,
    agent_id: &str,
    agent_label: &str,
    phase: &str,
    message: impl Into<String>,
    sources: Vec<Source>,
) -> AgentTraceRecord {
    AgentTraceRecord {
        id: id.into(),
        level: level.into(),
        agent_id: agent_id.into(),
        agent_label: agent_label.into(),
        phase: phase.into(),
        message: message.into(),
        sources,
        created_at: now(),
    }
}

fn generate_draft_with_openai_compatible(
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    provider_id: &str,
    log_dir: Option<&Path>,
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt_config: &LlmPromptConfig,
) -> Result<EpisodeDraft, String> {
    let client = Client::builder()
        .timeout(llm_request_timeout(provider_id, 90))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let plan_json = serde_json::to_string(plan).map_err(|error| error.to_string())?;
    let sources_json =
        serde_json::to_string(&hotspot.sources).map_err(|error| error.to_string())?;
    let guests_json = serde_json::to_string(&plan.guests).map_err(|error| error.to_string())?;
    let mut replacements = style_replacements(prompt_config);
    replacements.extend([
        ("hotspotTitle", hotspot.title.clone()),
        ("hotspotSummary", hotspot.summary.clone()),
        ("planJson", plan_json),
        ("sourcesJson", sources_json),
        ("guestPersonasJson", guests_json),
    ]);
    let prompt = prompt_for_provider(
        provider_id,
        render_template(&prompt_config.tasks.draft.user_template, &replacements),
        &prompt_config.schemas.draft,
    );
    let value = openai_chat_json(
        &client,
        &url,
        provider_id,
        log_dir,
        "episode_draft_single",
        api_key,
        model,
        &prompt_config.tasks.draft.system_prompt,
        prompt,
        prompt_config.tasks.draft.temperature,
        &prompt_config.schemas.draft,
    )?;
    let mut draft = generate_rule_based_draft(plan.clone(), hotspot.clone(), prompt_config);
    if let Some(title) = value.get("title").and_then(|item| item.as_str()) {
        draft.title = title.to_string();
    }
    if let Some(summary) = value.get("summary").and_then(|item| item.as_str()) {
        draft.summary = summary.to_string();
    }
    if let Some(dialogue) = parse_dialogue(&value) {
        draft.dialogue = dialogue;
    }
    if let Some(takeaways) = string_array(&value, "takeaways") {
        draft.takeaways = takeaways;
    }
    if let Some(fact_checks) = string_array(&value, "factChecks") {
        draft.fact_checks = fact_checks;
    }
    draft.agent_trace = vec![
        agent_trace_record(
            format!("trace-{}-single-planner", draft.id),
            "info",
            "controller",
            "中控 Agent",
            "整稿生成",
            format!(
                "单模型模式已基于 {} 个来源生成圆桌稿，并保留来源供事实核查。",
                draft.sources.len()
            ),
            draft.sources.clone(),
        ),
        agent_trace_record(
            format!("trace-{}-single-review", draft.id),
            "info",
            "controller",
            "中控 Agent",
            "事实核查提示",
            format!("已生成 {} 条待核查提示。", draft.fact_checks.len()),
            draft.sources.clone(),
        ),
    ];
    Ok(draft)
}

fn generate_multi_agent_draft_with_openai_compatible(
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    provider_id: &str,
    log_dir: Option<&Path>,
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt_config: &LlmPromptConfig,
    stream: Option<(&tauri::AppHandle, &str)>,
) -> Result<EpisodeDraft, String> {
    let client = Client::builder()
        .timeout(llm_request_timeout(provider_id, 90))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let plan_json = serde_json::to_string(plan).map_err(|error| error.to_string())?;
    let sources_json =
        serde_json::to_string(&hotspot.sources).map_err(|error| error.to_string())?;
    let guests_json = serde_json::to_string(&plan.guests).map_err(|error| error.to_string())?;
    if let Some((app, session_id)) = stream.filter(|(_, session_id)| !session_id.is_empty()) {
        emit_agent_progress(
            app,
            session_id,
            "controller",
            "中控 Agent",
            "规划调度",
            "running",
            12,
            "中控 agent 正在规划圆桌调度和发言顺序",
            "info",
            None,
        );
    }

    let mut planner_replacements = style_replacements(prompt_config);
    planner_replacements.extend([
        ("hotspotTitle", hotspot.title.clone()),
        ("hotspotSummary", hotspot.summary.clone()),
        ("planJson", plan_json.clone()),
        ("sourcesJson", sources_json.clone()),
        ("guestPersonasJson", guests_json),
    ]);
    let planner_prompt = prompt_for_provider(
        provider_id,
        render_template(
            &prompt_config.tasks.draft_turn_planner.user_template,
            &planner_replacements,
        ),
        &prompt_config.schemas.turn_plan,
    );
    let planner_started_at = Instant::now();
    let planner_value = openai_chat_json(
        &client,
        &url,
        provider_id,
        log_dir,
        "draft_turn_planner",
        api_key,
        model,
        &prompt_config.tasks.draft_turn_planner.system_prompt,
        planner_prompt,
        prompt_config.tasks.draft_turn_planner.temperature,
        &prompt_config.schemas.turn_plan,
    )?;
    println!(
        "[AI timing] draft_turn_planner {}ms",
        planner_started_at.elapsed().as_millis()
    );
    let turn_plan: TurnPlanResponse =
        serde_json::from_value(planner_value).map_err(|error| error.to_string())?;
    if turn_plan.turns.len() < 8 {
        return Err("中控 agent 返回的对话轮次少于 8 轮".into());
    }
    let planned_turn_count = turn_plan.turns.len().min(16).max(1);
    let mut agent_trace = vec![agent_trace_record(
        stable_id("trace", &format!("{}{}controller", plan.id, hotspot.id)),
        "info",
        "controller",
        "中控 Agent",
        "规划调度",
        format!(
            "中控 agent 已规划 {} 轮发言，议程覆盖 {} 个讨论点。",
            planned_turn_count,
            plan.agenda.len()
        ),
        hotspot.sources.clone(),
    )];
    if let Some((app, session_id)) = stream.filter(|(_, session_id)| !session_id.is_empty()) {
        emit_agent_progress(
            app,
            session_id,
            "controller",
            "中控 Agent",
            "调度中",
            "succeeded",
            24,
            "中控 agent 已完成调度，开始逐位生成嘉宾发言",
            "info",
            None,
        );
    }

    let mut dialogue = Vec::new();
    for (index, turn) in turn_plan.turns.into_iter().take(16).enumerate() {
        let speaker = plan
            .guests
            .iter()
            .find(|guest| guest.id == turn.speaker_id)
            .or_else(|| plan.guests.first())
            .ok_or_else(|| "圆桌计划没有可用嘉宾".to_string())?;
        let turn_progress = 24 + ((index as f32 / planned_turn_count as f32) * 68.0).round() as u8;
        agent_trace.push(agent_trace_record(
            stable_id(
                "trace",
                &format!("{}{}{}prepare", plan.id, hotspot.id, index + 1),
            ),
            "info",
            &speaker.id,
            &speaker.label,
            "整理资料",
            format!(
                "第 {} 轮由「{}」发言，目标是：{}",
                index + 1,
                speaker.label,
                turn.instruction
            ),
            hotspot.sources.clone(),
        ));
        if let Some((app, session_id)) = stream.filter(|(_, session_id)| !session_id.is_empty()) {
            emit_agent_progress(
                app,
                session_id,
                &speaker.id,
                &speaker.label,
                "整理资料",
                "running",
                turn_progress,
                "正在查找资料、整理上下文和角色立场",
                "info",
                Some(index + 1),
            );
        }
        let speaker_json = serde_json::to_string(speaker).map_err(|error| error.to_string())?;
        let transcript = render_transcript(&dialogue, &plan.guests);
        let mut turn_replacements = style_replacements(prompt_config);
        turn_replacements.extend([
            ("hotspotTitle", hotspot.title.clone()),
            ("hotspotSummary", hotspot.summary.clone()),
            ("sourcesJson", sources_json.clone()),
            ("planJson", plan_json.clone()),
            ("speakerPersonaJson", speaker_json),
            ("turnInstruction", turn.instruction.clone()),
            (
                "transcript",
                if transcript.is_empty() {
                    "（暂无，当前是开场轮）".into()
                } else {
                    transcript
                },
            ),
        ]);
        let turn_prompt = prompt_for_provider(
            provider_id,
            render_template(
                &prompt_config.tasks.draft_guest_turn.user_template,
                &turn_replacements,
            ),
            &prompt_config.schemas.guest_turn,
        );
        let turn_started_at = Instant::now();
        let stream_turn = DialogueTurn {
            speaker_id: turn.speaker_id.clone(),
            intent: turn.intent.clone(),
            text: String::new(),
            source: Some("ai".into()),
            interrupted: false,
            created_at: Some(now()),
        };
        let turn_value_result = if let Some((app, session_id)) = stream.filter(|(_, session_id)| !session_id.is_empty()) {
            let stream_prompt = format!(
                "{}\n\n重要：本次是流式输出，请只输出当前嘉宾这一轮发言正文。不要 JSON，不要 Markdown，不要输出 text 字段名。",
                turn_prompt
            );
            openai_chat_text_stream(
                &client,
                &url,
                provider_id,
                log_dir,
                "draft_guest_turn_stream",
                api_key,
                model,
                "你正在扮演中文圆桌嘉宾。只输出这一轮发言正文，不要 JSON，不要 Markdown，不要字段名。",
                stream_prompt,
                prompt_config.tasks.draft_guest_turn.temperature,
                |delta| emit_draft_token(app, session_id, &stream_turn, delta),
            )
            .map(|text| json!({ "text": text }))
        } else {
            openai_chat_json(
                &client,
                &url,
                provider_id,
                log_dir,
                "draft_guest_turn",
                api_key,
                model,
                &prompt_config.tasks.draft_guest_turn.system_prompt,
                turn_prompt,
                prompt_config.tasks.draft_guest_turn.temperature,
                &prompt_config.schemas.guest_turn,
            )
        };
        println!(
            "[AI timing] draft_guest_turn {} {}ms",
            index + 1,
            turn_started_at.elapsed().as_millis()
        );
        if let Some((app, session_id)) = stream.filter(|(_, session_id)| !session_id.is_empty()) {
            emit_agent_progress(
                app,
                session_id,
                &speaker.id,
                &speaker.label,
                "生成发言",
                "running",
                turn_progress.saturating_add(4),
                "正在流式写入本轮发言",
                "info",
                Some(index + 1),
            );
        }
        let text = match turn_value_result
            .and_then(|value| serde_json::from_value::<GuestTurnResponse>(value).map_err(|error| error.to_string()))
            .map(|guest_turn| guest_turn.text.trim().to_string())
        {
            Ok(text) if !text.is_empty() => text,
            Ok(_) => {
                let fallback = fallback_guest_turn_text(speaker, &turn);
                if let Some((app, session_id)) = stream.filter(|(_, session_id)| !session_id.is_empty()) {
                    emit_draft_token(app, session_id, &stream_turn, &fallback);
                }
                agent_trace.push(agent_trace_record(
                    stable_id(
                        "trace",
                        &format!("{}{}{}fallback-empty", plan.id, hotspot.id, index + 1),
                    ),
                    "warning",
                    &speaker.id,
                    &speaker.label,
                    "兜底生成",
                    "模型返回了空发言，已使用本地兜底文本继续生成。",
                    hotspot.sources.clone(),
                ));
                write_llm_log(
                    log_dir,
                    "draft_guest_turn_fallback",
                    provider_id,
                    model,
                    &json!({"turnIndex": index + 1, "speakerId": turn.speaker_id, "reason": "empty_text"}),
                    None,
                    Some(&fallback),
                    Some("嘉宾发言为空，已使用本地兜底发言继续生成。"),
                );
                fallback
            }
            Err(error) => {
                let error_message = error.to_string();
                let fallback = fallback_guest_turn_text(speaker, &turn);
                if let Some((app, session_id)) = stream.filter(|(_, session_id)| !session_id.is_empty()) {
                    emit_draft_token(app, session_id, &stream_turn, &fallback);
                }
                agent_trace.push(agent_trace_record(
                    stable_id(
                        "trace",
                        &format!("{}{}{}fallback-error", plan.id, hotspot.id, index + 1),
                    ),
                    "warning",
                    &speaker.id,
                    &speaker.label,
                    "兜底生成",
                    format!("嘉宾发言生成或解析失败，已使用本地兜底文本继续生成：{error_message}"),
                    hotspot.sources.clone(),
                ));
                write_llm_log(
                    log_dir,
                    "draft_guest_turn_fallback",
                    provider_id,
                    model,
                    &json!({"turnIndex": index + 1, "speakerId": turn.speaker_id, "reason": error_message}),
                    None,
                    Some(&fallback),
                    Some("嘉宾发言生成或解析失败，已使用本地兜底发言继续生成。"),
                );
                fallback
            }
        };
        let dialogue_turn = DialogueTurn {
            speaker_id: turn.speaker_id,
            intent: turn.intent,
            text,
            source: Some("ai".into()),
            interrupted: false,
            created_at: Some(now()),
        };
        if stream.filter(|(_, session_id)| !session_id.is_empty()).is_none() {
            if let Some((app, session_id)) = stream {
                emit_draft_turn(app, session_id, dialogue_turn.clone());
            }
        }
        agent_trace.push(agent_trace_record(
            stable_id(
                "trace",
                &format!("{}{}{}complete", plan.id, hotspot.id, index + 1),
            ),
            "info",
            &speaker.id,
            &speaker.label,
            "发言完成",
            format!(
                "第 {} 轮发言已生成，约 {} 个字符。",
                index + 1,
                dialogue_turn.text.chars().count()
            ),
            Vec::new(),
        ));
        dialogue.push(dialogue_turn);
        if let Some((app, session_id)) = stream.filter(|(_, session_id)| !session_id.is_empty()) {
            emit_agent_progress(
                app,
                session_id,
                &speaker.id,
                &speaker.label,
                "发言完成",
                "succeeded",
                turn_progress.saturating_add(8),
                "本轮发言已写入圆桌稿",
                "info",
                Some(index + 1),
            );
        }
    }

    let mut draft = generate_rule_based_draft(plan.clone(), hotspot.clone(), prompt_config);
    draft.title = turn_plan.title;
    draft.summary = turn_plan.summary;
    draft.dialogue = dialogue;
    draft.takeaways = turn_plan.takeaways;
    draft.fact_checks = turn_plan.fact_checks;
    agent_trace.push(agent_trace_record(
        stable_id("trace", &format!("{}{}fact-check", plan.id, hotspot.id)),
        "info",
        "controller",
        "中控 Agent",
        "事实核查提示",
        format!("已生成 {} 条待核查提示，建议发布前逐条核对来源。", draft.fact_checks.len()),
        draft.sources.clone(),
    ));
    draft.agent_trace = agent_trace;
    Ok(draft)
}

fn autonomous_turn_range(depth: &str) -> (usize, usize) {
    match depth {
        "low" => (8, 10),
        "high" => (12, 16),
        _ => (10, 14),
    }
}

fn build_autonomous_memory_chunks(
    hotspot: &HotspotCandidate,
    supplemental_documents: &[SupplementalDocument],
) -> Vec<AutonomousMemoryChunk> {
    let mut chunks = vec![AutonomousMemoryChunk {
        id: format!("hotspot:{}", hotspot.id),
        title: hotspot.title.clone(),
        text: format!(
            "{}\n{}\n{}",
            hotspot.title,
            hotspot.summary,
            hotspot.note.clone().unwrap_or_default()
        ),
        source: None,
    }];
    chunks.extend(hotspot.sources.iter().map(|source| AutonomousMemoryChunk {
        id: format!("source:{}", source.id),
        title: source.title.clone(),
        text: format!(
            "{}\n{}\n{}\n{}",
            source.title,
            source.publisher,
            source.url,
            source.published_at.clone().unwrap_or_default()
        ),
        source: Some(source.clone()),
    }));
    for document in supplemental_documents {
        let text = document.content.trim();
        if text.is_empty() {
            continue;
        }
        for (index, chunk) in chunk_autonomous_text(text, 1400, 180).into_iter().enumerate() {
            chunks.push(AutonomousMemoryChunk {
                id: format!("document:{}:{}", document.id, index),
                title: document.name.clone(),
                text: format!("{}\n路径：{}\n{}", document.name, document.path, chunk),
                source: None,
            });
        }
    }
    chunks
}

fn chunk_autonomous_text(value: &str, max_chars: usize, overlap: usize) -> Vec<String> {
    let text = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if text.chars().count() <= max_chars {
        return vec![text];
    }
    let chars = text.chars().collect::<Vec<_>>();
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < chars.len() {
        let end = (start + max_chars).min(chars.len());
        chunks.push(chars[start..end].iter().collect::<String>());
        if end == chars.len() {
            break;
        }
        start = end.saturating_sub(overlap);
    }
    chunks
}

fn autonomous_memory_search(
    chunks: &[AutonomousMemoryChunk],
    query: &str,
    limit: usize,
) -> Vec<AutonomousMemoryChunk> {
    let terms = query
        .replace(['/', '|', '，', '。', '、', '：'], " ")
        .split_whitespace()
        .map(|term| term.trim().to_lowercase())
        .filter(|term| !term.is_empty())
        .collect::<Vec<_>>();
    if terms.is_empty() {
        return chunks.iter().take(limit).cloned().collect();
    }
    let mut scored = chunks
        .iter()
        .filter_map(|chunk| {
            let haystack = format!("{}\n{}", chunk.title, chunk.text).to_lowercase();
            let score = terms
                .iter()
                .map(|term| haystack.matches(term).count())
                .sum::<usize>();
            (score > 0).then(|| (score, chunk.clone()))
        })
        .collect::<Vec<_>>();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.id.cmp(&b.1.id)));
    scored
        .into_iter()
        .map(|(_, chunk)| chunk)
        .take(limit)
        .collect()
}

fn autonomous_web_search(
    settings: &AgentRuntimeSettings,
    query: &str,
    client: Option<&Client>,
) -> Result<Vec<Source>, String> {
    let base_url = settings.search_base_url.trim();
    if base_url.is_empty() {
        return Ok(Vec::new());
    }
    let local_client;
    let client = match client {
        Some(client) => client,
        None => {
            local_client = Client::builder()
                .timeout(Duration::from_secs(30))
                .user_agent("ai-roundtable/0.4 native-autonomous-search")
                .build()
                .map_err(|error| error.to_string())?;
            &local_client
        }
    };
    let mut headers = HeaderMap::new();
    headers.insert("Content-Type", HeaderValue::from_static("application/json"));
    if let Some(api_key) = settings.search_api_key.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        let value = HeaderValue::from_str(&format!("Bearer {api_key}"))
            .map_err(|error| format!("Search API Key 不是有效 header：{error}"))?;
        headers.insert("Authorization", value);
    }
    let body = json!({
        "query": query,
        "maxResults": settings.search_max_results.clamp(1, 10),
        "language": settings.search_language,
        "recencyDays": settings.search_recency_days,
    });
    let response = client
        .post(base_url)
        .headers(headers)
        .json(&body)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let value: serde_json::Value = response.json().map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {status}: {value}"));
    }
    let raw_results = value
        .get("results")
        .and_then(|results| results.as_array())
        .or_else(|| value.as_array())
        .cloned()
        .unwrap_or_default();
    let mut sources = Vec::new();
    for (index, item) in raw_results
        .into_iter()
        .take(settings.search_max_results.clamp(1, 10))
        .enumerate()
    {
        let title = item
            .get("title")
            .or_else(|| item.get("name"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        let url = item
            .get("url")
            .or_else(|| item.get("link"))
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        if title.is_empty() || url.is_empty() {
            continue;
        }
        let publisher = item
            .get("source")
            .or_else(|| item.get("publisher"))
            .and_then(|value| value.as_str())
            .unwrap_or("Web Search")
            .trim();
        sources.push(Source {
            id: stable_id("web", &format!("{url}-{index}")),
            title: title.into(),
            url: url.into(),
            publisher: if publisher.is_empty() { "Web Search".into() } else { publisher.into() },
            published_at: item
                .get("publishedAt")
                .or_else(|| item.get("published_at"))
                .and_then(|value| value.as_str())
                .map(ToString::to_string),
        });
    }
    Ok(sources)
}

fn filter_autonomous_trace(
    trace: Vec<AgentTraceRecord>,
    include_debug: bool,
) -> Vec<AgentTraceRecord> {
    if include_debug {
        trace
    } else {
        trace
            .into_iter()
            .filter(|record| record.level != "debug")
            .collect()
    }
}

fn merge_sources_by_url(mut existing: Vec<Source>, extra: Vec<Source>) -> Vec<Source> {
    let mut seen = existing
        .iter()
        .map(|source| source.url.clone())
        .collect::<Vec<_>>();
    for source in extra {
        if !seen.iter().any(|url| url == &source.url) {
            seen.push(source.url.clone());
            existing.push(source);
        }
    }
    existing
}

fn autonomous_turn_queries(turn: &TurnPlanItem, hotspot: &HotspotCandidate) -> Vec<String> {
    let mut queries = turn
        .tool_queries
        .iter()
        .map(|query| query.trim().to_string())
        .filter(|query| !query.is_empty())
        .collect::<Vec<_>>();
    if queries.is_empty() {
        queries.push(hotspot.title.clone());
        if !turn.instruction.trim().is_empty() {
            queries.push(turn.instruction.clone());
        }
    }
    queries
}

fn fallback_autonomous_turn_plan(
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    min_turns: usize,
    prompt_config: &LlmPromptConfig,
) -> TurnPlanResponse {
    let intents = [
        "open",
        "context",
        "intuition",
        "business",
        "technical",
        "challenge",
        "followup",
        "transition",
        "summary",
    ];
    let turns = (0..min_turns)
        .map(|index| {
            let guest = plan
                .guests
                .get(index % plan.guests.len().max(1))
                .map(|guest| guest.id.clone())
                .unwrap_or_else(|| "host".into());
            let agenda = plan
                .agenda
                .get(index % plan.agenda.len().max(1))
                .cloned()
                .unwrap_or_else(|| hotspot.title.clone());
            TurnPlanItem {
                speaker_id: guest,
                intent: intents[index % intents.len()].into(),
                instruction: format!(
                    "围绕「{}」推进讨论，优先使用 memory.search 检索补充资料，并保守区分事实与判断：{}",
                    hotspot.title, agenda
                ),
                tool_queries: vec![hotspot.title.clone(), agenda],
            }
        })
        .collect();
    TurnPlanResponse {
        title: format!("圆桌：{}", plan.topic_title.clone().unwrap_or_else(|| hotspot.title.clone())),
        summary: plan
            .topic_summary
            .clone()
            .unwrap_or_else(|| hotspot.summary.clone()),
        turns,
        takeaways: prompt_config.fallbacks.takeaways.clone(),
        fact_checks: prompt_config.fallbacks.fact_checks.clone(),
    }
}

fn generate_autonomous_turn_plan_with_model(
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    settings: &ProviderSettings,
    log_dir: Option<&Path>,
    api_key: &str,
    model: &str,
    prompt_config: &LlmPromptConfig,
    min_turns: usize,
    max_turns: usize,
    memory_chunks: &[AutonomousMemoryChunk],
    runtime_settings: &AgentRuntimeSettings,
    app: &tauri::AppHandle,
    session_id: &str,
    agent_trace: &mut Vec<AgentTraceRecord>,
) -> Result<TurnPlanResponse, String> {
    if !session_id.is_empty() {
        emit_agent_progress(
            app,
            session_id,
            "controller",
            "中控 Agent",
            "规划调度",
            "running",
            16,
            "正在按讨论深度规划发言轮次和工具查询",
            "info",
            None,
        );
    }
    let client = Client::builder()
        .timeout(llm_request_timeout(&settings.provider_id, 90))
        .user_agent("ai-roundtable/0.4 native-autonomous")
        .build()
        .map_err(|error| error.to_string())?;
    let url = format!("{}/chat/completions", settings.base_url.trim_end_matches('/'));
    let plan_json = serde_json::to_string(plan).map_err(|error| error.to_string())?;
    let sources_json = serde_json::to_string(&hotspot.sources).map_err(|error| error.to_string())?;
    let guests_json = serde_json::to_string(&plan.guests).map_err(|error| error.to_string())?;
    let memory_summary = memory_chunks
        .iter()
        .take(8)
        .map(|chunk| format!("{}: {}", chunk.title, truncate_chars(&chunk.text, 260)))
        .collect::<Vec<_>>()
        .join("\n");
    let supplemental_names = if memory_summary.is_empty() {
        "无".into()
    } else {
        memory_summary
    };
    let mut planner_replacements = style_replacements(prompt_config);
    planner_replacements.extend([
        ("hotspotTitle", hotspot.title.clone()),
        ("hotspotSummary", hotspot.summary.clone()),
        ("planJson", plan_json),
        ("sourcesJson", sources_json),
        ("guestPersonasJson", guests_json),
    ]);
    let user_prompt = format!(
        "{}\n\n调用方补充要求：discussionDepth={}，turns 必须在 {} 到 {} 轮之间。每个 turn 必须包含 toolQueries 字符串数组，优先写 memory.search 查询词；仅当 Search API 已配置且确需最新外部材料时再写 web.search 查询方向。\n\n可检索记忆摘要：\n{}\n\nSearch API：{}，语言：{}，最多 {} 条，近 {} 天。",
        render_template(
            &prompt_config.tasks.draft_turn_planner.user_template,
            &planner_replacements,
        ),
        runtime_settings.discussion_depth,
        min_turns,
        max_turns,
        supplemental_names,
        if runtime_settings.search_base_url.trim().is_empty() { "未配置，规划中不要依赖外部搜索" } else { "已配置，可按需使用" },
        runtime_settings.search_language,
        runtime_settings.search_max_results.clamp(1, 10),
        runtime_settings
            .search_recency_days
            .map(|days| days.to_string())
            .unwrap_or_else(|| "不限".into())
    );
    let planner_prompt = prompt_for_provider(&settings.provider_id, user_prompt, &prompt_config.schemas.turn_plan);
    let value = openai_chat_json(
        &client,
        &url,
        &settings.provider_id,
        log_dir,
        "autonomous_turn_planner",
        api_key,
        model,
        &prompt_config.tasks.draft_turn_planner.system_prompt,
        planner_prompt,
        prompt_config.tasks.draft_turn_planner.temperature,
        &prompt_config.schemas.turn_plan,
    )?;
    let mut turn_plan: TurnPlanResponse =
        serde_json::from_value(value).map_err(|error| error.to_string())?;
    if turn_plan.turns.len() < min_turns {
        agent_trace.push(agent_trace_record(
            stable_id("trace", &format!("{}{}autonomous-plan-fallback", plan.id, hotspot.id)),
            "warning",
            "controller",
            "中控 Agent",
            "planning.fallback",
            format!("模型规划少于 {} 轮，已使用本地强自治兜底计划。", min_turns),
            hotspot.sources.clone(),
        ));
        return Ok(fallback_autonomous_turn_plan(plan, hotspot, min_turns, prompt_config));
    }
    turn_plan.turns.truncate(max_turns);
    Ok(turn_plan)
}

fn generate_autonomous_guest_turn_with_model(
    client: &Client,
    url: &str,
    provider_id: &str,
    log_dir: Option<&Path>,
    api_key: &str,
    model: &str,
    prompt_config: &LlmPromptConfig,
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    plan_json: &str,
    speaker: &GuestPersona,
    turn: &TurnPlanItem,
    dialogue: &[DialogueTurn],
    memory_hits: &[AutonomousMemoryChunk],
    web_sources: &[Source],
    app: &tauri::AppHandle,
    session_id: &str,
    turn_index: usize,
    agent_trace: &mut Vec<AgentTraceRecord>,
) -> Result<String, String> {
    let speaker_json = serde_json::to_string(speaker).map_err(|error| error.to_string())?;
    let sources = merge_sources_by_url(
        hotspot.sources.clone(),
        web_sources.to_vec(),
    );
    let sources_json = serde_json::to_string(&sources).map_err(|error| error.to_string())?;
    let transcript = render_transcript(dialogue, &plan.guests);
    let tool_context = json!({
        "toolQueries": turn.tool_queries,
        "memoryHits": memory_hits.iter().take(4).map(|chunk| json!({
            "id": chunk.id,
            "title": chunk.title,
            "text": truncate_chars(&chunk.text, 800),
        })).collect::<Vec<_>>(),
        "webSources": web_sources.iter().take(4).collect::<Vec<_>>(),
    });
    let mut turn_replacements = style_replacements(prompt_config);
    turn_replacements.extend([
        ("hotspotTitle", hotspot.title.clone()),
        ("hotspotSummary", hotspot.summary.clone()),
        ("sourcesJson", sources_json),
        ("planJson", plan_json.to_string()),
        ("speakerPersonaJson", speaker_json),
        (
            "turnInstruction",
            format!(
                "{}\n\n后端工具结果：{}",
                turn.instruction,
                serde_json::to_string(&tool_context).unwrap_or_default()
            ),
        ),
        (
            "transcript",
            if transcript.is_empty() {
                "（暂无，当前是开场轮）".into()
            } else {
                transcript
            },
        ),
    ]);
    let prompt = prompt_for_provider(
        provider_id,
        render_template(
            &prompt_config.tasks.draft_guest_turn.user_template,
            &turn_replacements,
        ),
        &prompt_config.schemas.guest_turn,
    );
    let stream_turn = DialogueTurn {
        speaker_id: speaker.id.clone(),
        intent: turn.intent.clone(),
        text: String::new(),
        source: Some("ai".into()),
        interrupted: false,
        created_at: Some(now()),
    };
    let result = if !session_id.is_empty() {
        let stream_prompt = format!(
            "{}\n\n重要：本次是流式输出，请只输出当前嘉宾这一轮发言正文。不要 JSON，不要 Markdown，不要输出 text 字段名。",
            prompt
        );
        openai_chat_text_stream(
            client,
            url,
            provider_id,
            log_dir,
            "autonomous_guest_turn_stream",
            api_key,
            model,
            "你正在扮演中文圆桌嘉宾。只输出这一轮发言正文，不要 JSON，不要 Markdown，不要字段名。",
            stream_prompt,
            prompt_config.tasks.draft_guest_turn.temperature,
            |delta| emit_draft_token(app, session_id, &stream_turn, delta),
        )
    } else {
        openai_chat_json(
            client,
            url,
            provider_id,
            log_dir,
            "autonomous_guest_turn",
            api_key,
            model,
            &prompt_config.tasks.draft_guest_turn.system_prompt,
            prompt,
            prompt_config.tasks.draft_guest_turn.temperature,
            &prompt_config.schemas.guest_turn,
        )
        .and_then(|value| {
            serde_json::from_value::<GuestTurnResponse>(value)
                .map_err(|error| error.to_string())
                .map(|turn| turn.text)
        })
    };
    match result.map(|text| text.trim().to_string()) {
        Ok(text) if !text.is_empty() => Ok(text),
        Ok(_) => {
            let fallback = fallback_autonomous_guest_text(hotspot, speaker, turn, memory_hits);
            if !session_id.is_empty() {
                emit_draft_token(app, session_id, &stream_turn, &fallback);
            }
            agent_trace.push(agent_trace_record(
                stable_id("trace", &format!("{}{}{}autonomous-empty", plan.id, hotspot.id, turn_index)),
                "warning",
                &speaker.id,
                &speaker.label,
                "guest.fallback",
                "模型返回空发言，已使用本地兜底文本继续生成。",
                web_sources.to_vec(),
            ));
            Ok(fallback)
        }
        Err(error) => {
            let fallback = fallback_autonomous_guest_text(hotspot, speaker, turn, memory_hits);
            if !session_id.is_empty() {
                emit_draft_token(app, session_id, &stream_turn, &fallback);
            }
            agent_trace.push(agent_trace_record(
                stable_id("trace", &format!("{}{}{}autonomous-error", plan.id, hotspot.id, turn_index)),
                "warning",
                &speaker.id,
                &speaker.label,
                "guest.fallback",
                format!("模型发言生成失败，已使用本地兜底文本：{error}"),
                web_sources.to_vec(),
            ));
            Ok(fallback)
        }
    }
}

fn fallback_autonomous_guest_text(
    hotspot: &HotspotCandidate,
    speaker: &GuestPersona,
    turn: &TurnPlanItem,
    memory_hits: &[AutonomousMemoryChunk],
) -> String {
    let memory_hint = memory_hits
        .first()
        .map(|chunk| format!("我会把补充材料里的「{}」也纳入判断，", truncate_chars(&chunk.title, 36)))
        .unwrap_or_default();
    format!(
        "{}我先按「{}」的视角给一个保守判断：{} 这一轮要推进的是：{} 但所有结论都应该回到来源、补充资料和可复核证据上，不把热度直接当成落地。",
        memory_hint,
        speaker.label,
        hotspot.summary,
        turn.instruction
    )
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        format!("{}...", value.chars().take(max_chars).collect::<String>())
    }
}

fn fallback_guest_turn_text(speaker: &GuestPersona, turn: &TurnPlanItem) -> String {
    format!(
        "我先按{}的视角给一个保守判断：{} 这里最重要的是别把发布消息直接等同于成熟落地。我们需要继续看真实工作流里的延迟、稳定性、成本和可验证结果，再决定它到底是短期话题，还是会变成可持续的产品能力。",
        speaker.label,
        turn.instruction
    )
}

fn render_transcript(dialogue: &[DialogueTurn], guests: &[GuestPersona]) -> String {
    dialogue
        .iter()
        .map(|turn| {
            let label = guests
                .iter()
                .find(|guest| guest.id == turn.speaker_id)
                .map(|guest| guest.label.as_str())
                .unwrap_or(turn.speaker_id.as_str());
            format!("{label}（{}）：{}", turn.intent, turn.text)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn parse_dialogue(value: &serde_json::Value) -> Option<Vec<DialogueTurn>> {
    let items = value.get("dialogue")?.as_array()?;
    let turns = items
        .iter()
        .filter_map(|item| {
            let speaker_id = item.get("speakerId")?.as_str()?.to_string();
            if !is_ai_guest_speaker(&speaker_id) {
                return None;
            }
            Some(DialogueTurn {
                speaker_id,
                intent: item.get("intent")?.as_str()?.to_string(),
                text: item.get("text")?.as_str()?.to_string(),
                source: Some("ai".into()),
                interrupted: false,
                created_at: Some(now()),
            })
        })
        .collect::<Vec<_>>();
    if turns.is_empty() {
        None
    } else {
        Some(turns)
    }
}

#[tauri::command]
fn save_episode_draft(app: tauri::AppHandle, draft: EpisodeDraft) -> Result<String, String> {
    let path = data_dir(&app)?
        .join("drafts")
        .join(format!("{}.json", draft.id));
    write_json(path.clone(), &draft)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, content).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn write_binary_file(path: String, base64_content: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let bytes = general_purpose::STANDARD
        .decode(base64_content)
        .map_err(|error| error.to_string())?;
    fs::write(&path, bytes).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn export_episode_mp3(app: tauri::AppHandle, draft: EpisodeDraft, path: String) -> Result<String, String> {
    let path = PathBuf::from(path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let settings = get_or_seed_tts_settings(&app)?;
    validate_tts_settings_shape(&settings)?;
    let api_key = required_tts_api_key(&settings)?;
    let model = required_tts_model(&settings)?;
    let prompt_config = get_or_seed_prompt_config(Some(&app))?;
    let client = Client::builder()
        .timeout(Duration::from_secs(180))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let narrator_voice = default_tts_voice(&settings.provider_id, &model);

    let test_audio = request_tts_pcm(
        &client,
        &settings,
        &api_key,
        &model,
        narrator_voice,
        "中文 TTS 连接测试。请用自然语气朗读。",
        "连接测试",
    )?;
    if test_audio.is_empty() {
        return Err("TTS 模型连接测试返回了空音频".into());
    }

    let sample_rate = 24_000u32;
    let mut samples = Vec::new();
    append_theme_music(&mut samples, sample_rate, false);
    append_silence(&mut samples, sample_rate, 0.45);

    let intro = format!(
        "这里是 AI小圆桌。本期为 AI 生成的模拟圆桌录音，主题是：{}。{}",
        draft.title, draft.summary
    );
    append_tts_segments(
        &client,
        &settings,
        &api_key,
        &model,
        narrator_voice,
        "你是中文圆桌节目的主持人口播。声音清晰、克制、自然，有录音室开场的质感。",
        &[intro],
        &mut samples,
        sample_rate,
    )?;
    append_silence(&mut samples, sample_rate, 0.55);

    for turn in &draft.dialogue {
        let guest = draft
            .guests
            .iter()
            .find(|guest| guest.id == turn.speaker_id);
        let label = guest
            .map(|guest| guest.label.as_str())
            .unwrap_or(turn.speaker_id.as_str());
        let tts = tts_config_for_speaker(&prompt_config, guest, &turn.speaker_id);
        let voice = tts_voice_for_model(&tts, &settings.provider_id, &model);
        let chunks = split_tts_text_for_provider(&turn.text, &settings.provider_id);
        append_tts_segments(
            &client,
            &settings,
            &api_key,
            &model,
            &voice,
            &tts.instructions,
            &chunks,
            &mut samples,
            sample_rate,
        )
        .map_err(|error| format!("{label} 的语音生成失败：{error}"))?;
        append_silence(&mut samples, sample_rate, 0.38);
    }

    append_silence(&mut samples, sample_rate, 0.35);
    let outro = format!("本期 AI小圆桌到这里。请记住，这是一份基于来源材料生成的模拟圆桌稿，关键事实仍需要回到原始来源核验。");
    append_tts_segments(
        &client,
        &settings,
        &api_key,
        &model,
        narrator_voice,
        "你是中文圆桌节目的主持人。用温和、可信的语气做闭场。",
        &[outro],
        &mut samples,
        sample_rate,
    )?;
    append_silence(&mut samples, sample_rate, 0.25);
    append_theme_music(&mut samples, sample_rate, true);
    add_room_tone(&mut samples);

    let mp3 = encode_samples_to_mp3(&samples, sample_rate)?;
    fs::write(&path, mp3).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

fn append_tts_segments(
    client: &Client,
    settings: &TtsSettings,
    api_key: &str,
    model: &str,
    voice: &str,
    instructions: &str,
    segments: &[String],
    out: &mut Vec<i16>,
    sample_rate: u32,
) -> Result<(), String> {
    for segment in segments {
        for chunk in split_tts_text_for_provider(segment, &settings.provider_id) {
            let trimmed = chunk.trim();
            if trimmed.is_empty() {
                continue;
            }
            let audio = request_tts_pcm(client, settings, api_key, model, voice, instructions, trimmed)?;
            out.extend(audio);
            append_silence(out, sample_rate, 0.18);
        }
    }
    Ok(())
}

fn request_tts_pcm(
    client: &Client,
    settings: &TtsSettings,
    api_key: &str,
    model: &str,
    voice: &str,
    instructions: &str,
    input: &str,
) -> Result<Vec<i16>, String> {
    match settings.provider_id.as_str() {
        "openai" => request_openai_tts_pcm(
            client,
            &openai_tts_url(&settings.base_url),
            api_key,
            model,
            voice,
            instructions,
            input,
        ),
        "dashscope" | "qwen" => {
            request_dashscope_tts_pcm(client, &settings.base_url, api_key, model, voice, instructions, input)
        }
        _ => Err(format!("不支持的 TTS 厂商：{}", settings.provider_id)),
    }
}

fn request_openai_tts_pcm(
    client: &Client,
    url: &str,
    api_key: &str,
    model: &str,
    voice: &str,
    instructions: &str,
    input: &str,
) -> Result<Vec<i16>, String> {
    let mut body = json!({
        "model": model,
        "voice": voice,
        "input": input,
        "response_format": "pcm"
    });
    if model.contains("gpt-4o") {
        body["instructions"] = json!(instructions);
    }
    let bytes = client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| error.to_string())?
        .bytes()
        .map_err(|error| error.to_string())?;
    if bytes.len() < 2 {
        return Err("TTS 返回了空音频".into());
    }
    let mut samples = Vec::with_capacity(bytes.len() / 2);
    for chunk in bytes.chunks_exact(2) {
        samples.push(i16::from_le_bytes([chunk[0], chunk[1]]));
    }
    Ok(samples)
}

fn request_dashscope_tts_pcm(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    voice: &str,
    instructions: &str,
    input: &str,
) -> Result<Vec<i16>, String> {
    let normalized_model = normalize_dashscope_tts_model(model);
    if is_minimax_tts_model(&normalized_model) {
        return request_minimax_tts_pcm(client, base_url, api_key, &normalized_model, voice, input);
    }
    if is_cosyvoice_tts_model(&normalized_model) {
        return request_cosyvoice_tts_pcm(client, base_url, api_key, &normalized_model, voice, instructions, input);
    }
    Err(format!("DashScope TTS 不支持的模型：{model}"))
}

fn request_minimax_tts_pcm(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    voice: &str,
    input: &str,
) -> Result<Vec<i16>, String> {
    let body = json!({
        "model": model,
        "input": {
            "text": input,
            "voice_setting": {
                "voice_id": voice,
                "speed": 1.0,
                "vol": 1.0,
                "pitch": 0
            },
            "audio_setting": {
                "sample_rate": 24000,
                "bitrate": 128000,
                "format": "wav",
                "channel": 1
            },
            "language_boost": "Chinese",
            "subtitle_enable": false
        }
    });
    let response = client
        .post(dashscope_generation_url(base_url))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("MiniMax TTS 请求失败：{status} {}", explain_dashscope_tts_error(&body, "MiniMax/speech-2.8-hd")));
    }
    let payload = response.json::<MiniMaxTtsResponse>().map_err(|error| error.to_string())?;
    if let Some(error) = minimax_response_error(&payload) {
        return Err(format!("MiniMax TTS 返回错误：{}", explain_dashscope_tts_error(&error, model)));
    }
    let audio_hex = payload
        .data
        .as_ref()
        .and_then(|data| data.audio.as_deref())
        .or_else(|| {
            payload
                .output
                .as_ref()
                .and_then(|output| output.data.as_ref())
                .and_then(|data| data.audio.as_deref())
        })
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "MiniMax TTS 返回结果中没有音频内容。".to_string())?;
    let bytes = decode_hex_audio(audio_hex)?;
    wav_bytes_to_mono_24k_pcm(&bytes)
}

fn request_cosyvoice_tts_pcm(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    voice: &str,
    instructions: &str,
    input: &str,
) -> Result<Vec<i16>, String> {
    let mut input_body = json!({
        "text": input,
        "voice": voice,
        "format": "wav",
        "sample_rate": 24000
    });
    let instruction = concise_tts_instruction(instructions);
    if !instruction.is_empty() {
        input_body["instruction"] = json!(instruction);
    }
    let body = json!({
        "model": model,
        "input": input_body,
        "parameters": {
            "language_hints": ["zh"]
        }
    });
    let response = client
        .post(dashscope_cosyvoice_url(base_url))
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("CosyVoice TTS 请求失败：{status} {}", explain_dashscope_tts_error(&body, "cosyvoice-v3.5-plus")));
    }
    let payload = response.json::<DashScopeUrlTtsResponse>().map_err(|error| error.to_string())?;
    let audio_ref = payload
        .output
        .as_ref()
        .and_then(|output| output.audio.as_ref())
        .and_then(|audio| audio.url.as_deref().or(audio.data.as_deref()))
        .map(str::to_string)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            let details = payload
                .code
                .as_deref()
                .zip(payload.message.as_deref())
                .map(|(code, message)| format!("{code}: {message}"))
                .unwrap_or_else(|| "响应中没有音频地址".into());
            format!("CosyVoice TTS 返回结果不可用：{details}")
        })?;
    let bytes = dashscope_audio_bytes(client, &audio_ref)?;
    wav_bytes_to_mono_24k_pcm(&bytes)
}

fn openai_tts_url(base_url: &str) -> String {
    format!("{}/audio/speech", base_url.trim_end_matches('/'))
}

fn dashscope_generation_url(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/generation") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/services/aigc/multimodal-generation/generation")
    }
}

fn dashscope_cosyvoice_url(base_url: &str) -> String {
    let trimmed = base_url.trim_end_matches('/');
    if trimmed.ends_with("/SpeechSynthesizer") {
        trimmed.to_string()
    } else {
        format!("{trimmed}/services/audio/tts/SpeechSynthesizer")
    }
}

fn dashscope_audio_bytes(client: &Client, audio_ref: &str) -> Result<Vec<u8>, String> {
    let trimmed = audio_ref.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return client
            .get(trimmed)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|error| error.to_string())?
            .bytes()
            .map(|bytes| bytes.to_vec())
            .map_err(|error| error.to_string());
    }

    let encoded = trimmed
        .split_once(',')
        .map(|(_, value)| value)
        .unwrap_or(trimmed);
    general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| format!("DashScope TTS 音频不是可下载 URL，也不是有效 base64：{error}"))
}

fn decode_hex_audio(value: &str) -> Result<Vec<u8>, String> {
    let normalized: String = value.chars().filter(|ch| !ch.is_whitespace()).collect();
    if normalized.len() % 2 != 0 {
        return Err("MiniMax TTS 返回的 hex 音频长度不是偶数。".into());
    }
    let mut bytes = Vec::with_capacity(normalized.len() / 2);
    let raw = normalized.as_bytes();
    for pair in raw.chunks_exact(2) {
        let high = hex_value(pair[0]).ok_or_else(|| "MiniMax TTS 返回了无效 hex 音频。".to_string())?;
        let low = hex_value(pair[1]).ok_or_else(|| "MiniMax TTS 返回了无效 hex 音频。".to_string())?;
        bytes.push((high << 4) | low);
    }
    Ok(bytes)
}

fn hex_value(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn minimax_response_error(payload: &MiniMaxTtsResponse) -> Option<String> {
    let base_resp = payload
        .base_resp
        .as_ref()
        .or_else(|| payload.output.as_ref().and_then(|output| output.base_resp.as_ref()));
    if let Some(resp) = base_resp {
        if resp.status_code.unwrap_or_default() != 0 {
            return Some(format!(
                "{} {}",
                resp.status_code.unwrap_or_default(),
                resp.status_msg.as_deref().unwrap_or("未知错误")
            ));
        }
    }
    if payload.code.is_some() || payload.message.is_some() {
        return Some(format!(
            "{} {}",
            payload
                .code
                .as_ref()
                .map(|code| code.to_string())
                .unwrap_or_else(|| "未知错误".into()),
            payload.message.as_deref().unwrap_or("")
        ));
    }
    None
}

fn explain_dashscope_tts_error(body: &str, model: &str) -> String {
    if body.contains("The product is not activated") {
        return format!(
            "{body}\n需要先在阿里云百炼模型市场开通 {model}，当前 API Key 对这个模型还没有调用权限。"
        );
    }
    if model == "cosyvoice-v3.5-plus" && body.contains("Engine return error code: 418") {
        return format!(
            "{body}\ncosyvoice-v3.5-plus 不支持内置系统音色，请在 config/prompts/personas.json 的 cosyVoice 字段填写你在百炼创建的声音复刻或声音设计音色 ID。"
        );
    }
    body.to_string()
}

fn wav_bytes_to_mono_24k_pcm(bytes: &[u8]) -> Result<Vec<i16>, String> {
    let mut reader = hound::WavReader::new(Cursor::new(bytes)).map_err(|error| error.to_string())?;
    let spec = reader.spec();
    if spec.channels == 0 {
        return Err("TTS 返回的 WAV 声道数无效".into());
    }

    let mut samples = Vec::new();
    let mut channel_index = 0u16;
    let mut frame_acc = 0i32;
    match spec.sample_format {
        hound::SampleFormat::Float => {
            for sample in reader.samples::<f32>() {
                let value = (sample.map_err(|error| error.to_string())?.clamp(-1.0, 1.0) * i16::MAX as f32)
                    .round() as i16;
                push_downmixed_sample(value, spec.channels, &mut channel_index, &mut frame_acc, &mut samples);
            }
        }
        hound::SampleFormat::Int if spec.bits_per_sample <= 8 => {
            for sample in reader.samples::<i8>() {
                let value = (sample.map_err(|error| error.to_string())? as i16) << 8;
                push_downmixed_sample(value, spec.channels, &mut channel_index, &mut frame_acc, &mut samples);
            }
        }
        hound::SampleFormat::Int if spec.bits_per_sample <= 16 => {
            for sample in reader.samples::<i16>() {
                push_downmixed_sample(
                    sample.map_err(|error| error.to_string())?,
                    spec.channels,
                    &mut channel_index,
                    &mut frame_acc,
                    &mut samples,
                );
            }
        }
        hound::SampleFormat::Int => {
            let shift = spec.bits_per_sample.saturating_sub(16);
            for sample in reader.samples::<i32>() {
                let value = (sample.map_err(|error| error.to_string())? >> shift)
                    .clamp(i16::MIN as i32, i16::MAX as i32) as i16;
                push_downmixed_sample(value, spec.channels, &mut channel_index, &mut frame_acc, &mut samples);
            }
        }
    }

    if samples.is_empty() {
        return Err("TTS 返回了空 WAV 音频".into());
    }
    if spec.sample_rate == 24_000 {
        Ok(samples)
    } else {
        Ok(resample_linear_i16(&samples, spec.sample_rate, 24_000))
    }
}

fn push_downmixed_sample(
    sample: i16,
    channels: u16,
    channel_index: &mut u16,
    frame_acc: &mut i32,
    out: &mut Vec<i16>,
) {
    *frame_acc += sample as i32;
    *channel_index += 1;
    if *channel_index >= channels {
        out.push((*frame_acc / channels as i32).clamp(i16::MIN as i32, i16::MAX as i32) as i16);
        *channel_index = 0;
        *frame_acc = 0;
    }
}

fn resample_linear_i16(samples: &[i16], from_rate: u32, to_rate: u32) -> Vec<i16> {
    if samples.is_empty() || from_rate == 0 || from_rate == to_rate {
        return samples.to_vec();
    }
    let output_len = ((samples.len() as u64 * to_rate as u64) / from_rate as u64).max(1) as usize;
    let ratio = from_rate as f64 / to_rate as f64;
    let mut output = Vec::with_capacity(output_len);
    for index in 0..output_len {
        let source_pos = index as f64 * ratio;
        let base_index = source_pos.floor() as usize;
        let next_index = (base_index + 1).min(samples.len() - 1);
        let fraction = source_pos - base_index as f64;
        let a = samples[base_index.min(samples.len() - 1)] as f64;
        let b = samples[next_index] as f64;
        output.push((a + (b - a) * fraction).round().clamp(i16::MIN as f64, i16::MAX as f64) as i16);
    }
    output
}

fn split_tts_text(text: &str, max_chars: usize) -> Vec<String> {
    let max_chars = max_chars.max(1);
    let mut chunks = Vec::new();
    let mut current = String::new();
    for part in text.split_inclusive(['。', '！', '？', '；', '\n']) {
        let part_len = part.chars().count();
        if part_len > max_chars {
            if !current.trim().is_empty() {
                chunks.push(current.trim().to_string());
                current.clear();
            }
            chunks.extend(split_long_tts_part(part, max_chars));
            continue;
        }
        if current.chars().count() + part_len > max_chars && !current.trim().is_empty() {
            chunks.push(current.trim().to_string());
            current.clear();
        }
        current.push_str(part);
    }
    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }
    if chunks.is_empty() {
        chunks.push(text.chars().take(max_chars).collect());
    }
    chunks
}

fn split_tts_text_for_provider(text: &str, provider_id: &str) -> Vec<String> {
    if provider_id == "openai" {
        split_tts_text(text, openai_tts_input_max_chars())
    } else {
        split_tts_text(text, dashscope_tts_input_max_chars())
    }
}

fn split_long_tts_part(part: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for ch in part.chars() {
        if current.chars().count() >= max_chars {
            chunks.push(current.trim().to_string());
            current.clear();
        }
        current.push(ch);
    }
    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }
    chunks
}

fn openai_tts_input_max_chars() -> usize {
    900
}

fn dashscope_tts_input_max_chars() -> usize {
    900
}

fn normalize_dashscope_tts_model(model: &str) -> String {
    let trimmed = model.trim();
    if trimmed.eq_ignore_ascii_case("speech-2.8-hd") {
        "MiniMax/speech-2.8-hd".into()
    } else {
        trimmed.to_string()
    }
}

fn is_minimax_tts_model(model: &str) -> bool {
    let normalized = normalize_dashscope_tts_model(model);
    normalized == "MiniMax/speech-2.8-hd"
}

fn is_cosyvoice_tts_model(model: &str) -> bool {
    model.trim() == "cosyvoice-v3.5-plus"
}

fn is_supported_dashscope_tts_model(model: &str) -> bool {
    let normalized = normalize_dashscope_tts_model(model);
    is_minimax_tts_model(&normalized) || is_cosyvoice_tts_model(&normalized)
}

fn concise_tts_instruction(instructions: &str) -> String {
    instructions
        .chars()
        .take(42)
        .collect::<String>()
        .trim_matches(['。', '；', '，', '、', ' '])
        .to_string()
}

fn tts_config_for_speaker(
    prompt_config: &LlmPromptConfig,
    guest: Option<&GuestPersona>,
    speaker_id: &str,
) -> TtsPersonaConfig {
    if let Some(config) = guest.and_then(|guest| guest.tts.clone()) {
        return config;
    }

    if let Some(config) = prompt_config
        .personas
        .get(speaker_id)
        .and_then(|value| serde_json::from_value::<GuestPersona>(value.clone()).ok())
        .and_then(|persona| persona.tts)
    {
        return config;
    }

    TtsPersonaConfig {
        voice: "alloy".into(),
        dashscope_voice: None,
        minimax_voice: Some("male-qn-qingse".into()),
        cosy_voice: Some("longanlang".into()),
        qwen_voice: None,
        instructions: "中文圆桌嘉宾声音。语气自然，像真实会议录音；不要读出舞台提示，不要过度表演。".into(),
    }
}

fn tts_voice_for_model(tts: &TtsPersonaConfig, provider_id: &str, model: &str) -> String {
    if provider_id == "dashscope" || provider_id == "qwen" {
        if is_minimax_tts_model(model) {
            return tts
                .minimax_voice
                .clone()
                .or_else(|| tts.dashscope_voice.clone())
                .or_else(|| tts.qwen_voice.clone())
                .unwrap_or_else(|| "male-qn-qingse".into());
        }
        if is_cosyvoice_tts_model(model) {
            return tts
                .cosy_voice
                .clone()
                .or_else(|| tts.dashscope_voice.clone())
                .or_else(|| tts.qwen_voice.clone())
                .unwrap_or_else(|| "longanlang".into());
        }
    }
    tts.voice.clone()
}

fn default_tts_voice(provider_id: &str, model: &str) -> &'static str {
    if provider_id == "dashscope" || provider_id == "qwen" {
        if is_minimax_tts_model(model) {
            return "male-qn-qingse";
        }
        if is_cosyvoice_tts_model(model) {
            return "longanlang";
        }
    }
    "alloy"
}

fn append_silence(out: &mut Vec<i16>, sample_rate: u32, seconds: f32) {
    let count = (sample_rate as f32 * seconds).round() as usize;
    out.extend(std::iter::repeat(0).take(count));
}

fn append_theme_music(out: &mut Vec<i16>, sample_rate: u32, closing: bool) {
    let seconds = if closing { 3.2 } else { 3.6 };
    let total = (sample_rate as f32 * seconds).round() as usize;
    let notes = if closing {
        [392.0f32, 329.63, 293.66, 246.94]
    } else {
        [246.94f32, 293.66, 329.63, 392.0]
    };
    for index in 0..total {
        let t = index as f32 / sample_rate as f32;
        let progress = index as f32 / total as f32;
        let envelope = if progress < 0.18 {
            progress / 0.18
        } else if progress > 0.82 {
            (1.0 - progress) / 0.18
        } else {
            1.0
        }
        .clamp(0.0, 1.0);
        let note = notes[((progress * notes.len() as f32).floor() as usize).min(notes.len() - 1)];
        let pad = (2.0 * std::f32::consts::PI * note * t).sin() * 0.34
            + (2.0 * std::f32::consts::PI * note * 1.5 * t).sin() * 0.18
            + (2.0 * std::f32::consts::PI * 98.0 * t).sin() * 0.08;
        let value = (pad * envelope * 6500.0).clamp(i16::MIN as f32, i16::MAX as f32);
        out.push(value as i16);
    }
}

fn add_room_tone(samples: &mut [i16]) {
    let mut seed = 0x4d595df4u32;
    for sample in samples {
        seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
        let noise = (((seed >> 16) & 0xff) as i16 - 128) / 14;
        *sample = sample.saturating_add(noise);
    }
}

fn encode_samples_to_mp3(samples: &[i16], sample_rate: u32) -> Result<Vec<u8>, String> {
    use shine_rs::{Mp3Encoder, Mp3EncoderConfig, StereoMode};

    let config = Mp3EncoderConfig::new()
        .sample_rate(sample_rate)
        .bitrate(64)
        .channels(1)
        .stereo_mode(StereoMode::Mono);
    let mut encoder = Mp3Encoder::new(config).map_err(|error| error.to_string())?;
    let frame_size = encoder.samples_per_frame();
    let mut output = Vec::new();
    for chunk in samples.chunks(frame_size) {
        let frames = if chunk.len() == frame_size {
            encoder.encode_interleaved(chunk)
        } else {
            let mut padded = vec![0i16; frame_size];
            padded[..chunk.len()].copy_from_slice(chunk);
            encoder.encode_interleaved(&padded)
        }
        .map_err(|error| error.to_string())?;
        for frame in frames {
            output.extend(frame);
        }
    }
    output.extend(encoder.finish().map_err(|error| error.to_string())?);
    Ok(output)
}

#[tauri::command]
fn list_episode_drafts(app: tauri::AppHandle) -> Result<Vec<EpisodeDraft>, String> {
    let dir = data_dir(&app)?.join("drafts");
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut drafts = Vec::new();
    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let path = entry.map_err(|error| error.to_string())?.path();
        if path.extension().and_then(|value| value.to_str()) == Some("json") {
            if let Ok(draft) = read_json::<EpisodeDraft>(path) {
                drafts.push(draft);
            }
        }
    }
    drafts.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(drafts)
}

#[tauri::command]
fn get_model_catalog() -> Vec<ModelProvider> {
    vec![
        ModelProvider {
            id: "openai".into(),
            name: "OpenAI".into(),
            base_url: "https://api.openai.com/v1".into(),
            models: vec![
                "gpt-5.4".into(),
                "gpt-5.4-mini".into(),
                "gpt-5.3-codex".into(),
                "gpt-4.1".into(),
            ],
            requires_api_key: true,
        },
        ModelProvider {
            id: "anthropic".into(),
            name: "Anthropic".into(),
            base_url: "https://api.anthropic.com".into(),
            models: vec![
                "claude-4.5-sonnet".into(),
                "claude-4.5-haiku".into(),
                "claude-4-opus".into(),
            ],
            requires_api_key: true,
        },
        ModelProvider {
            id: "google".into(),
            name: "Google Gemini".into(),
            base_url: "https://generativelanguage.googleapis.com".into(),
            models: vec!["gemini-2.5-pro".into(), "gemini-2.5-flash".into()],
            requires_api_key: true,
        },
        ModelProvider {
            id: "deepseek".into(),
            name: "DeepSeek".into(),
            base_url: "https://api.deepseek.com".into(),
            models: vec!["deepseek-chat".into(), "deepseek-reasoner".into()],
            requires_api_key: true,
        },
        ModelProvider {
            id: "qwen".into(),
            name: "Qwen / DashScope".into(),
            base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1".into(),
            models: qwen_default_models(),
            requires_api_key: true,
        },
    ]
}

#[tauri::command]
fn get_provider_settings(app: tauri::AppHandle) -> Result<Vec<ProviderSettings>, String> {
    let path = provider_settings_path(&app)?;
    if path.exists() {
        read_json(path)
    } else {
        let settings = default_provider_settings();
        write_json(path, &settings)?;
        Ok(settings)
    }
}

#[tauri::command]
fn save_provider_settings(
    app: tauri::AppHandle,
    settings: ProviderSettings,
) -> Result<Vec<ProviderSettings>, String> {
    let path = provider_settings_path(&app)?;
    let mut all_settings: Vec<ProviderSettings> = if path.exists() {
        read_json(path.clone())?
    } else {
        default_provider_settings()
    };
    all_settings.retain(|item| item.provider_id != settings.provider_id);
    all_settings.push(settings);
    all_settings.sort_by(|a, b| a.provider_id.cmp(&b.provider_id));
    write_json(path, &all_settings)?;
    Ok(all_settings)
}

#[tauri::command]
fn refresh_model_catalog(settings: ProviderSettings) -> Result<Vec<ModelProvider>, String> {
    let mut catalog = get_model_catalog();
    let models = fetch_provider_models(&settings)?;
    if let Some(provider) = catalog
        .iter_mut()
        .find(|provider| provider.id == settings.provider_id)
    {
        provider.base_url = settings.base_url;
        if !models.is_empty() {
            provider.models = models;
        }
    }
    Ok(catalog)
}

#[tauri::command]
fn validate_provider_connection(settings: ProviderSettings) -> Result<String, String> {
    if settings.provider_id == "mock" {
        return Ok("本地规则生成器可用；不会调用外部 LLM。".into());
    }

    ensure_generation_provider_ready(&settings)?;
    let models = fetch_provider_models(&settings)?;
    Ok(format!(
        "模型连接成功，已读取到 {} 个模型；生成时将不再静默 fallback。",
        models.len()
    ))
}

fn ensure_generation_provider_ready(settings: &ProviderSettings) -> Result<(), String> {
    if settings.provider_id == "mock" {
        return Ok(());
    }
    if settings.provider_id != "openai" && settings.provider_id != "deepseek" && settings.provider_id != "qwen" {
        return Err("当前生成链路只支持 OpenAI / DeepSeek / Qwen 这类 OpenAI-compatible 厂商；请先切换到已支持的厂商。".into());
    }
    if settings.base_url.trim().is_empty() {
        return Err("Base URL 为空，请先在设置里填写模型厂商地址。".into());
    }
    let _api_key = required_api_key(settings)?;
    let _model = required_selected_model(settings)?;
    let _models = fetch_provider_models(settings)?;
    Ok(())
}

fn required_api_key(settings: &ProviderSettings) -> Result<String, String> {
    settings
        .api_key
        .clone()
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| "API Key 为空，请先在设置里保存有效 API Key。".to_string())
}

fn required_selected_model(settings: &ProviderSettings) -> Result<String, String> {
    settings
        .selected_model
        .clone()
        .filter(|model| !model.trim().is_empty())
        .ok_or_else(|| "未选择模型，请先在设置里选择可用模型。".to_string())
}

fn default_provider_settings() -> Vec<ProviderSettings> {
    get_model_catalog()
        .into_iter()
        .map(|provider| ProviderSettings {
            provider_id: provider.id,
            base_url: provider.base_url,
            api_key: None,
            selected_model: provider.models.first().cloned(),
            draft_generation_mode: Some("single".into()),
        })
        .collect()
}

fn qwen_default_models() -> Vec<String> {
    vec![
        "qwen3.6-plus".into(),
        "qwen3.6-flash".into(),
        "qwen3.6-max-preview".into(),
        "qwen3.5-plus".into(),
        "qwen3-max".into(),
        "qwen-plus".into(),
        "qwen-flash".into(),
        "qwen-turbo".into(),
        "qwen3-coder-plus".into(),
    ]
}

fn qwen_text_generation_models(models: Vec<String>) -> Vec<String> {
    let mut filtered: Vec<String> = models
        .into_iter()
        .filter(|model| {
            let lower = model.to_lowercase();
            lower.starts_with("qwen")
                && ![
                    "image",
                    "vl",
                    "audio",
                    "tts",
                    "omni",
                    "embedding",
                    "rerank",
                    "asr",
                    "ocr",
                    "livetranslate",
                    "s2s",
                    "realtime",
                    "math",
                ]
                .iter()
                .any(|needle| lower.contains(needle))
        })
        .collect();
    filtered.sort_by(|a, b| qwen_model_rank(a).cmp(&qwen_model_rank(b)).then_with(|| a.cmp(b)));
    filtered.dedup();
    filtered
}

fn qwen_model_rank(model: &str) -> (u8, String) {
    let lower = model.to_lowercase();
    let rank = if lower.contains("3.6-plus") {
        0
    } else if lower.contains("3.6-flash") {
        1
    } else if lower.contains("3.6-max") {
        2
    } else if lower.contains("3.5-plus") {
        3
    } else if lower.contains("qwen3-max") {
        4
    } else if lower.contains("qwen-plus") {
        5
    } else if lower.contains("qwen-flash") {
        6
    } else if lower.contains("qwen-turbo") {
        7
    } else if lower.contains("coder") {
        8
    } else {
        9
    };
    (rank, lower)
}

fn default_tts_settings() -> TtsSettings {
    TtsSettings {
        provider_id: "dashscope".into(),
        base_url: "https://dashscope.aliyuncs.com/api/v1".into(),
        api_key: None,
        selected_model: "MiniMax/speech-2.8-hd".into(),
    }
}

fn default_asr_settings() -> AsrSettings {
    AsrSettings {
        provider_id: "dashscope".into(),
        base_url: "wss://dashscope.aliyuncs.com/api-ws/v1/inference".into(),
        api_key: None,
        selected_model: "paraformer-realtime-v2".into(),
    }
}

fn default_agent_runtime_settings() -> AgentRuntimeSettings {
    AgentRuntimeSettings {
        generation_engine: "native".into(),
        python_agent_base_url: "http://127.0.0.1:8787".into(),
        discussion_depth: "medium".into(),
        search_base_url: String::new(),
        search_api_key: None,
        search_language: "zh-CN".into(),
        search_max_results: 5,
        search_recency_days: Some(14),
        debug_trace_enabled: false,
    }
}

fn normalize_agent_runtime_settings(mut settings: AgentRuntimeSettings) -> AgentRuntimeSettings {
    settings.generation_engine = "native".into();
    if settings.python_agent_base_url.trim().is_empty() {
        settings.python_agent_base_url = "http://127.0.0.1:8787".into();
    }
    if !matches!(settings.discussion_depth.as_str(), "low" | "medium" | "high") {
        settings.discussion_depth = "medium".into();
    }
    settings.search_base_url = settings.search_base_url.trim().to_string();
    settings.search_language = settings.search_language.trim().to_string();
    if settings.search_language.is_empty() {
        settings.search_language = "zh-CN".into();
    }
    settings.search_max_results = settings.search_max_results.clamp(1, 10);
    settings
}

#[tauri::command]
fn get_agent_runtime_settings(_app: tauri::AppHandle) -> Result<AgentRuntimeSettings, String> {
    Ok(normalize_agent_runtime_settings(default_agent_runtime_settings()))
}

#[tauri::command]
fn save_agent_runtime_settings(settings: AgentRuntimeSettings) -> Result<AgentRuntimeSettings, String> {
    Ok(normalize_agent_runtime_settings(settings))
}

fn seed_tts_settings_from_roundtable(_app: &tauri::AppHandle) -> Result<TtsSettings, String> {
    Ok(default_tts_settings())
}

fn get_or_seed_tts_settings(app: &tauri::AppHandle) -> Result<TtsSettings, String> {
    let path = tts_settings_path(app)?;
    if path.exists() {
        let settings = normalize_tts_settings(read_json(path.clone())?);
        write_json(path, &settings)?;
        Ok(settings)
    } else {
        let settings = seed_tts_settings_from_roundtable(app)?;
        write_json(path, &settings)?;
        Ok(settings)
    }
}

#[tauri::command]
fn get_tts_settings(app: tauri::AppHandle) -> Result<TtsSettings, String> {
    get_or_seed_tts_settings(&app)
}

#[tauri::command]
fn save_tts_settings(app: tauri::AppHandle, settings: TtsSettings) -> Result<TtsSettings, String> {
    let settings = normalize_tts_settings(settings);
    validate_tts_settings_shape(&settings)?;
    let path = tts_settings_path(&app)?;
    write_json(path, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn validate_tts_connection(settings: TtsSettings) -> Result<String, String> {
    let settings = normalize_tts_settings(settings);
    validate_tts_settings_shape(&settings)?;
    let api_key = required_tts_api_key(&settings)?;
    let model = required_tts_model(&settings)?;
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;
    let audio = request_tts_pcm(
        &client,
        &settings,
        &api_key,
        &model,
        default_tts_voice(&settings.provider_id, &model),
        "中文 TTS 连接测试。请用自然语气朗读。",
        "连接测试",
    )?;
    if audio.is_empty() {
        return Err("TTS 模型返回了空音频".into());
    }
    Ok(format!("TTS 模型连接成功：{model}"))
}

fn validate_tts_settings_shape(settings: &TtsSettings) -> Result<(), String> {
    if settings.provider_id != "openai" && settings.provider_id != "dashscope" {
        return Err("当前 MP3 导出只支持 OpenAI TTS 和 DashScope TTS。".into());
    }
    if settings.base_url.trim().is_empty() {
        return Err("TTS Base URL 为空，请先填写。".into());
    }
    let _api_key = required_tts_api_key(settings)?;
    let model = required_tts_model(settings)?;
    if settings.provider_id == "dashscope" && !is_supported_dashscope_tts_model(&model) {
        return Err("DashScope TTS 当前仅支持 MiniMax/speech-2.8-hd 和 cosyvoice-v3.5-plus。".into());
    }
    Ok(())
}

fn validate_asr_settings_shape(settings: &AsrSettings) -> Result<(), String> {
    if settings.provider_id != "dashscope" {
        return Err("当前语音转文字仅支持 DashScope Paraformer。".into());
    }
    if settings.base_url.trim().is_empty() {
        return Err("ASR WebSocket Base URL 为空，请先填写。".into());
    }
    if settings.api_key.as_deref().unwrap_or("").trim().is_empty() {
        return Err("ASR API Key 为空，请先填写 DashScope API Key；文字打断不需要 API Key。".into());
    }
    if settings.selected_model.trim().is_empty() {
        return Err("ASR 模型为空，请填写 paraformer-realtime-v2。".into());
    }
    Ok(())
}

fn normalize_asr_settings(mut settings: AsrSettings) -> AsrSettings {
    settings.provider_id = "dashscope".into();
    if settings.base_url.trim().is_empty() {
        settings.base_url = "wss://dashscope.aliyuncs.com/api-ws/v1/inference".into();
    }
    if settings.selected_model.trim().is_empty() {
        settings.selected_model = "paraformer-realtime-v2".into();
    }
    settings
}

fn normalize_tts_settings(mut settings: TtsSettings) -> TtsSettings {
    if settings.provider_id == "qwen" {
        settings.provider_id = "dashscope".into();
        settings.base_url = "https://dashscope.aliyuncs.com/api/v1".into();
        settings.selected_model = "MiniMax/speech-2.8-hd".into();
    }
    if settings.provider_id == "dashscope" {
        if settings.base_url.trim().is_empty() {
            settings.base_url = "https://dashscope.aliyuncs.com/api/v1".into();
        }
        settings.selected_model = normalize_dashscope_tts_model(&settings.selected_model);
        if !is_supported_dashscope_tts_model(&settings.selected_model) {
            settings.selected_model = "MiniMax/speech-2.8-hd".into();
        }
    }
    settings
}

fn required_tts_api_key(settings: &TtsSettings) -> Result<String, String> {
    settings
        .api_key
        .clone()
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| "TTS API Key 为空，请先在设置的 TTS 配音页保存对应厂商的 API Key。".to_string())
}

fn required_tts_model(settings: &TtsSettings) -> Result<String, String> {
    if settings.selected_model.trim().is_empty() {
        Err("TTS 模型为空，请先选择或填写 TTS 模型。".into())
    } else {
        Ok(settings.selected_model.trim().to_string())
    }
}

fn fetch_provider_models(settings: &ProviderSettings) -> Result<Vec<String>, String> {
    if settings.provider_id == "mock" {
        return Ok(vec!["backend-rule-generator".into()]);
    }

    let api_key = settings
        .api_key
        .clone()
        .filter(|key| !key.trim().is_empty())
        .ok_or_else(|| "请先保存该厂商的 API Key，再更新模型列表。".to_string())?;

    let client = Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("ai-roundtable/0.1")
        .build()
        .map_err(|error| error.to_string())?;

    match settings.provider_id.as_str() {
        "openai" | "deepseek" | "qwen" => {
            let url = format!("{}/models", settings.base_url.trim_end_matches('/'));
            let response: OpenAiModelList = client
                .get(url)
                .bearer_auth(api_key)
                .send()
                .and_then(|response| response.error_for_status())
                .map_err(|error| error.to_string())?
                .json()
                .map_err(|error| error.to_string())?;
            let models: Vec<String> = response.data.into_iter().map(|model| model.id).collect();
            if settings.provider_id == "qwen" {
                let filtered = qwen_text_generation_models(models);
                if filtered.is_empty() {
                    Ok(qwen_default_models())
                } else {
                    Ok(filtered)
                }
            } else {
                Ok(models)
            }
        }
        "anthropic" => {
            let url = format!("{}/v1/models", settings.base_url.trim_end_matches('/'));
            let mut headers = HeaderMap::new();
            headers.insert(
                "x-api-key",
                HeaderValue::from_str(&api_key).map_err(|error| error.to_string())?,
            );
            headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            let response: AnthropicModelList = client
                .get(url)
                .headers(headers)
                .send()
                .and_then(|response| response.error_for_status())
                .map_err(|error| error.to_string())?
                .json()
                .map_err(|error| error.to_string())?;
            Ok(response.data.into_iter().map(|model| model.id).collect())
        }
        "google" => {
            let url = format!(
                "{}/v1beta/models?key={}",
                settings.base_url.trim_end_matches('/'),
                api_key
            );
            let response: GeminiModelList = client
                .get(url)
                .send()
                .and_then(|response| response.error_for_status())
                .map_err(|error| error.to_string())?
                .json()
                .map_err(|error| error.to_string())?;
            Ok(response
                .models
                .into_iter()
                .map(|model| model.name.trim_start_matches("models/").to_string())
                .collect())
        }
        _ => Err("暂不支持该厂商的模型列表抓取。".into()),
    }
}

pub fn run() {
    // #region agent log
    {
        let icons_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons");
        let mut files: Vec<serde_json::Value> = Vec::new();
        if let Ok(rd) = fs::read_dir(&icons_dir) {
            for entry in rd.flatten() {
                let path = entry.path();
                if let Ok(meta) = entry.metadata() {
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("");
                    files.push(json!({
                        "name": entry.file_name().to_string_lossy(),
                        "len": meta.len(),
                        "ext": ext,
                    }));
                }
            }
        }
        files.sort_by(|a, b| {
            let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
            na.cmp(nb)
        });
        agent_debug_log(
            "H1_H2_H3",
            "startup_icons_dir_scan",
            json!({ "icons_dir": icons_dir.display().to_string(), "files": files }),
        );
    }
    // #endregion
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Keep the main window near the configured 1440×920 aspect ratio while resizing.
            // Skip while maximized/fullscreen so OS fill modes are not fought.
            const ASPECT_RATIO: f64 = 1440.0 / 920.0;
            const MIN_WIDTH: u32 = 1064;
            const MIN_HEIGHT: u32 = 680;
            const RATIO_EPSILON: f64 = 0.012;

            if let Some(window) = app.get_webview_window("main") {
                let adjusting = Arc::new(AtomicBool::new(false));
                let last_size = Arc::new(Mutex::new((0u32, 0u32)));
                let window_for_event = window.clone();
                let adjusting_for_event = adjusting.clone();
                let last_size_for_event = last_size.clone();

                window.on_window_event(move |event| {
                    let WindowEvent::Resized(size) = event else {
                        return;
                    };
                    if size.width == 0 || size.height == 0 {
                        return;
                    }
                    if window_for_event.is_maximized().unwrap_or(false)
                        || window_for_event.is_fullscreen().unwrap_or(false)
                    {
                        if let Ok(mut last) = last_size_for_event.lock() {
                            *last = (size.width, size.height);
                        }
                        return;
                    }
                    if adjusting_for_event.load(Ordering::SeqCst) {
                        if let Ok(mut last) = last_size_for_event.lock() {
                            *last = (size.width, size.height);
                        }
                        adjusting_for_event.store(false, Ordering::SeqCst);
                        return;
                    }

                    let current_ratio = size.width as f64 / size.height as f64;
                    if (current_ratio - ASPECT_RATIO).abs() <= RATIO_EPSILON {
                        if let Ok(mut last) = last_size_for_event.lock() {
                            *last = (size.width, size.height);
                        }
                        return;
                    }

                    let (last_w, last_h) = last_size_for_event
                        .lock()
                        .map(|guard| *guard)
                        .unwrap_or((size.width, size.height));
                    let dw = (size.width as i64 - last_w as i64).unsigned_abs();
                    let dh = (size.height as i64 - last_h as i64).unsigned_abs();

                    let (mut next_w, mut next_h) = if dw >= dh {
                        let height = (size.width as f64 / ASPECT_RATIO).round().max(1.0) as u32;
                        (size.width, height)
                    } else {
                        let width = (size.height as f64 * ASPECT_RATIO).round().max(1.0) as u32;
                        (width, size.height)
                    };

                    if next_w < MIN_WIDTH || next_h < MIN_HEIGHT {
                        let scale_w = MIN_WIDTH as f64 / next_w as f64;
                        let scale_h = MIN_HEIGHT as f64 / next_h as f64;
                        let scale = scale_w.max(scale_h);
                        next_w = (next_w as f64 * scale).round() as u32;
                        next_h = (next_h as f64 * scale).round() as u32;
                    }

                    if next_w == size.width && next_h == size.height {
                        if let Ok(mut last) = last_size_for_event.lock() {
                            *last = (size.width, size.height);
                        }
                        return;
                    }

                    adjusting_for_event.store(true, Ordering::SeqCst);
                    if let Ok(mut last) = last_size_for_event.lock() {
                        *last = (next_w, next_h);
                    }
                    let _ = window_for_event.set_size(Size::Physical(PhysicalSize {
                        width: next_w,
                        height: next_h,
                    }));
                });
            }

            // #region agent log
            #[cfg(windows)]
            {
                let icon_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("icons/icon.ico");
                let load = tauri::image::Image::from_path(&icon_path).map(|i| i.to_owned());
                agent_debug_log(
                    "H6",
                    "runtime_icon_from_path",
                    json!({
                        "path": icon_path.display().to_string(),
                        "ok": load.is_ok(),
                        "err": load.as_ref().err().map(|e| e.to_string()),
                        "decode_w": load.as_ref().ok().map(|i| i.width()),
                        "decode_h": load.as_ref().ok().map(|i| i.height()),
                    }),
                );
                if let Ok(icon) = load {
                    for (label, window) in app.webview_windows() {
                        match window.set_icon(icon.clone()) {
                            Ok(()) => {
                                agent_debug_log(
                                    "H6",
                                    "runtime_set_icon",
                                    json!({ "label": label, "ok": true }),
                                );
                            }
                            Err(err) => {
                                agent_debug_log(
                                    "H6",
                                    "runtime_set_icon",
                                    json!({ "label": label, "ok": false, "err": err.to_string() }),
                                );
                            }
                        }
                    }
                }
            }
            // #endregion
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_feeds,
            get_app_data_dir,
            save_feeds,
            get_hotspot_candidates,
            save_hotspot_candidates,
            search_hotspots,
            import_manual_attachment,
            add_manual_hotspot,
            generate_roundtable_plan,
            generate_episode_draft,
            start_interactive_roundtable,
            interrupt_interactive_roundtable,
            submit_interactive_user_turn,
            finish_interactive_roundtable,
            generate_autonomous_episode_draft,
            save_episode_draft,
            write_text_file,
            write_binary_file,
            export_episode_mp3,
            get_model_catalog,
            refresh_model_catalog,
            validate_provider_connection,
            get_provider_settings,
            save_provider_settings,
            get_tts_settings,
            save_tts_settings,
            validate_tts_connection,
            get_asr_settings,
            save_asr_settings,
            transcribe_audio_with_paraformer,
            get_agent_runtime_settings,
            save_agent_runtime_settings,
            list_episode_drafts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_guest_turn_with_unescaped_line_breaks() {
        let raw = "{\n  \"text\": \"第一句。\n第二句。\"\n}";
        let value = parse_model_json_content(raw, "draft_guest_turn").expect("should recover");
        assert_eq!(value["text"], "第一句。 第二句。");
    }

    #[test]
    fn recovers_truncated_guest_turn_text() {
        let raw = "{\"text\":\"我直接说结论：从模型规模和算力需求看，Claude 目前只能走云端 API。延迟上，文本补全可以容忍一两秒";
        let value = parse_model_json_content(raw, "draft_guest_turn").expect("should recover text");
        assert!(value["text"].as_str().unwrap().starts_with("我直接说结论"));
    }

    #[test]
    fn model_dialogue_parser_rejects_user_speaker_turns() {
        let value = json!({
            "dialogue": [
                {"speakerId": "user", "intent": "challenge", "text": "这条不能来自模型。"},
                {"speakerId": "expert", "intent": "technical", "text": "这条可以进入草稿。"}
            ]
        });

        let dialogue = parse_dialogue(&value).expect("should keep valid AI turns");

        assert_eq!(dialogue.len(), 1);
        assert_eq!(dialogue[0].speaker_id, "expert");
    }

    #[test]
    fn user_turn_metadata_identifies_real_user_input() {
        let turn = user_dialogue_turn("我想补充一点：先看真实工作流。");

        assert_eq!(turn.speaker_id, "user");
        assert_eq!(turn.source.as_deref(), Some("user"));
        assert!(!turn.interrupted);
        assert_eq!(turn.text, "我想补充一点：先看真实工作流。");
        assert!(turn.created_at.is_some());
    }

    #[test]
    fn interrupted_ai_turn_preserves_partial_text_and_marks_status() {
        let turn = interrupted_ai_turn("expert", "technical", "这里我先说一半");

        assert_eq!(turn.speaker_id, "expert");
        assert_eq!(turn.source.as_deref(), Some("ai"));
        assert!(turn.interrupted);
        assert_eq!(turn.text, "这里我先说一半");
        assert!(turn.created_at.is_some());
    }

    #[test]
    fn rule_based_plan_leaves_topic_metadata_empty_for_model_generation() {
        let prompt_config = bundled_prompt_config().expect("bundled config should parse");
        let hotspot = HotspotCandidate {
            id: "merged-1".into(),
            title: "多源圆桌：国产 Coding 争霸赛 / Claude Sonnet 5 agent 降价 / Copilot benchmark".into(),
            summary: "第一篇 RSS 摘要。\n\n第二篇 RSS 摘要。".into(),
            category: "developer".into(),
            status: "shortlisted".into(),
            source_count: 3,
            sources: vec![
                Source {
                    id: "source-1".into(),
                    title: "国产 Coding 争霸赛".into(),
                    url: "https://example.com/a".into(),
                    publisher: "雷峰网".into(),
                    published_at: Some("2026-07-01".into()),
                },
                Source {
                    id: "source-2".into(),
                    title: "Claude Sonnet 5 agent 降价".into(),
                    url: "https://example.com/b".into(),
                    publisher: "Anthropic".into(),
                    published_at: Some("2026-07-01".into()),
                },
            ],
            matched_signals: vec!["coding".into(), "agent".into()],
            created_at: "2026-07-01T00:00:00.000Z".into(),
            note: Some("由 3 个候选源合并生成".into()),
            display_category: None,
        };

        let plan = generate_rule_based_plan(hotspot, &prompt_config);

        assert!(plan.topic_title.is_none());
        assert!(plan.topic_summary.is_none());
    }

    #[test]
    fn plan_without_model_topic_metadata_is_rejected() {
        let prompt_config = bundled_prompt_config().expect("bundled config should parse");
        let hotspot = HotspotCandidate {
            id: "hotspot-1".into(),
            title: "RSS 原始标题".into(),
            summary: "RSS 原始摘要".into(),
            category: "developer".into(),
            status: "shortlisted".into(),
            source_count: 1,
            sources: vec![],
            matched_signals: vec!["agent".into()],
            created_at: "2026-07-01T00:00:00.000Z".into(),
            note: None,
            display_category: None,
        };
        let plan = generate_rule_based_plan(hotspot, &prompt_config);

        let error = require_model_topic_metadata(plan).expect_err("missing model metadata should fail");

        assert!(error.contains("模型"));
        assert!(error.contains("主题"));
        assert!(error.contains("摘要"));
    }

    #[test]
    fn prompt_config_version_refreshes_topic_metadata_schema_changes() {
        let prompt_config = bundled_prompt_config().expect("bundled config should parse");

        assert!(prompt_config.version.unwrap_or_default() >= 5);
    }

    #[test]
    fn plan_schema_avoids_provider_unsupported_length_keywords() {
        let prompt_config = bundled_prompt_config().expect("bundled config should parse");
        let topic_summary = prompt_config
            .schemas
            .plan
            .schema
            .get("properties")
            .and_then(|properties| properties.get("topicSummary"))
            .expect("topicSummary schema should exist");

        assert!(topic_summary.get("maxLength").is_none());
    }

    #[test]
    fn deepseek_plan_prompt_sanitizer_removes_false_positive_terms() {
        let raw = "下一个杀手级AI产品，主持人可以打断，像四个真实的人聊天。";

        let sanitized = sanitize_for_deepseek_plan_prompt(raw);

        assert!(!sanitized.contains("杀手级"));
        assert!(!sanitized.contains("打断"));
        assert!(!sanitized.contains("真实的人"));
        assert!(sanitized.contains("爆款级"));
        assert!(sanitized.contains("插话"));
        assert!(sanitized.contains("自然的嘉宾"));
    }

    #[test]
    fn autonomous_depth_sets_expected_turn_ranges() {
        assert_eq!(autonomous_turn_range("low"), (8, 10));
        assert_eq!(autonomous_turn_range("medium"), (10, 14));
        assert_eq!(autonomous_turn_range("high"), (12, 16));
        assert_eq!(autonomous_turn_range("unknown"), (10, 14));
    }

    #[test]
    fn autonomous_memory_indexes_supplemental_documents() {
        let hotspot = HotspotCandidate {
            id: "hotspot-memory".into(),
            title: "Agent 记忆测试".into(),
            summary: "摘要里没有私有补充材料。".into(),
            category: "developer".into(),
            status: "shortlisted".into(),
            source_count: 1,
            sources: vec![Source {
                id: "source-memory".into(),
                title: "公开来源".into(),
                url: "https://example.com/source".into(),
                publisher: "Example".into(),
                published_at: None,
            }],
            matched_signals: vec!["agent".into()],
            created_at: "2026-07-01T00:00:00.000Z".into(),
            note: None,
            display_category: None,
        };
        let docs = vec![SupplementalDocument {
            id: "doc-private".into(),
            name: "内部补充.md".into(),
            path: "notes/internal.md".into(),
            content: "这份补充材料提到专属线索：memory-sentinel。".into(),
        }];

        let chunks = build_autonomous_memory_chunks(&hotspot, &docs);
        let hits = autonomous_memory_search(&chunks, "memory-sentinel", 3);

        assert!(hits.iter().any(|chunk| chunk.id.starts_with("document:doc-private")));
    }

    #[test]
    fn autonomous_search_skips_when_base_url_is_empty() {
        let settings = default_agent_runtime_settings();

        let result = autonomous_web_search(&settings, "latest ai", None).expect("empty search config should not fail");

        assert!(result.is_empty());
    }

    #[test]
    fn autonomous_trace_filter_hides_debug_by_default() {
        let records = vec![
            agent_trace_record("trace-info", "info", "controller", "中控 Agent", "planning", "info", Vec::new()),
            agent_trace_record("trace-debug", "debug", "controller", "中控 Agent", "memory.search", "debug", Vec::new()),
        ];

        let filtered = filter_autonomous_trace(records.clone(), false);

        assert_eq!(filtered.len(), 1);
        assert_eq!(filtered[0].level, "info");
        assert_eq!(filter_autonomous_trace(records, true).len(), 2);
    }
}

fn get_or_seed_asr_settings(app: &tauri::AppHandle) -> Result<AsrSettings, String> {
    let path = asr_settings_path(app)?;
    if path.exists() {
        let settings = normalize_asr_settings(read_json(path.clone())?);
        write_json(path, &settings)?;
        Ok(settings)
    } else {
        let settings = default_asr_settings();
        write_json(path, &settings)?;
        Ok(settings)
    }
}

#[tauri::command]
fn get_asr_settings(app: tauri::AppHandle) -> Result<AsrSettings, String> {
    get_or_seed_asr_settings(&app)
}

#[tauri::command]
fn save_asr_settings(app: tauri::AppHandle, settings: AsrSettings) -> Result<AsrSettings, String> {
    let settings = normalize_asr_settings(settings);
    validate_asr_settings_shape(&settings)?;
    let path = asr_settings_path(&app)?;
    write_json(path, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn transcribe_audio_with_paraformer(settings: AsrSettings, audio_base64: String) -> Result<String, String> {
    let settings = normalize_asr_settings(settings);
    validate_asr_settings_shape(&settings)?;
    if audio_base64.trim().is_empty() {
        return Err("没有收到可转写的音频。".into());
    }
    Err("Paraformer 实时 WebSocket 转写需要持续音频流；当前版本已保存 ASR 设置，但尚未启用后台流式转写。请先使用文字打断。".into())
}
