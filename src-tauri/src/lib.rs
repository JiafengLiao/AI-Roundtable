use base64::{engine::general_purpose, Engine as _};
use chrono::Utc;
use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue};
use rss::Channel;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::Cursor,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};
use tauri::Manager;

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
    score: u16,
    status: String,
    #[serde(rename = "sourceCount")]
    source_count: u16,
    sources: Vec<Source>,
    #[serde(rename = "matchedSignals")]
    matched_signals: Vec<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    note: Option<String>,
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
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ManualHotspotInput {
    title: String,
    summary: String,
    url: String,
    publisher: Option<String>,
    category: Option<String>,
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

#[derive(Debug, Deserialize)]
struct TurnPlanItem {
    #[serde(rename = "speakerId")]
    speaker_id: String,
    intent: String,
    instruction: String,
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

fn stable_id(prefix: &str, value: &str) -> String {
    let mut hasher = DefaultHasher::new();
    value.hash(&mut hasher);
    format!("{prefix}-{:x}", hasher.finish())
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
            id: "openai-blog".into(),
            name: "OpenAI Blog".into(),
            url: "https://openai.com/news/rss.xml".into(),
            category: "company".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "anthropic-news".into(),
            name: "Anthropic News".into(),
            url: "https://www.anthropic.com/news/rss.xml".into(),
            category: "company".into(),
            enabled: true,
            last_fetched_at: None,
            last_status: Some("idle".into()),
        },
        FeedSource {
            id: "huggingface-blog".into(),
            name: "Hugging Face Blog".into(),
            url: "https://huggingface.co/blog/feed.xml".into(),
            category: "developer".into(),
            enabled: true,
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

fn bundled_prompt_config() -> Result<LlmPromptConfig, String> {
    Ok(LlmPromptConfig {
        version: Some(4),
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
                Ok(config) if config.version.unwrap_or_default() >= 4 => Ok(config),
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
fn search_hotspots(app: tauri::AppHandle) -> Result<Vec<HotspotCandidate>, String> {
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
                    let score =
                        (55 + signals.len() as u16 * 8 + (feed.category != "other") as u16 * 10)
                            .min(98);
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
                        score,
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

    candidates.sort_by(|a, b| b.score.cmp(&a.score));
    candidates.truncate(30);
    write_json(feeds_path(&app)?, &feeds)?;
    write_json(candidates_path(&app)?, &candidates)?;
    Ok(candidates)
}

#[tauri::command]
fn add_manual_hotspot(
    app: tauri::AppHandle,
    input: ManualHotspotInput,
) -> Result<HotspotCandidate, String> {
    if input.title.trim().is_empty() {
        return Err("热点标题不能为空".into());
    }
    if input.url.trim().is_empty() {
        return Err("来源链接不能为空".into());
    }

    let publisher = input.publisher.unwrap_or_else(|| "Manual Source".into());
    let category = input.category.unwrap_or_else(|| "other".into());
    let source = Source {
        id: stable_id("src", &input.url),
        title: input.title.clone(),
        url: input.url.clone(),
        publisher,
        published_at: Some(now()),
    };
    let candidate = HotspotCandidate {
        id: stable_id("manual", &format!("{}{}", input.title, input.url)),
        title: input.title,
        summary: if input.summary.trim().is_empty() {
            "手动补充热点，等待编辑补充背景说明。".into()
        } else {
            input.summary
        },
        category,
        score: 80,
        status: "shortlisted".into(),
        source_count: 1,
        sources: vec![source],
        matched_signals: vec!["manual".into()],
        created_at: now(),
        note: Some("用户手动补充".into()),
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
            return Ok(generate_rule_based_plan(hotspot, &prompt_config));
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

    Ok(generate_rule_based_plan(hotspot, &prompt_config))
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
    let mut replacements = style_replacements(prompt_config);
    replacements.extend([
        ("hotspotTitle", hotspot.title.clone()),
        ("hotspotSummary", hotspot.summary.clone()),
        ("sourcesJson", sources),
        ("guestPersonasJson", guests),
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
    Ok(plan)
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
fn generate_episode_draft(
    app: tauri::AppHandle,
    plan: RoundtablePlan,
    hotspot: HotspotCandidate,
    settings: Option<ProviderSettings>,
) -> Result<EpisodeDraft, String> {
    let prompt_config = get_or_seed_prompt_config(Some(&app))?;
    let log_dir = llm_logs_dir(&app)?;
    if let Some(settings) = settings {
        if settings.provider_id == "mock" {
            return Ok(generate_rule_based_draft(plan, hotspot, &prompt_config));
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

    EpisodeDraft {
        id: stable_id("draft", &format!("{}{}", plan.id, hotspot.id)),
        title: format!("圆桌：{}", hotspot.title),
        summary: format!(
            "{} 本期基于 {} 个来源展开，重点讨论事实背景、工程可行性、商业影响和本周行动判断。",
            hotspot.summary, hotspot.source_count
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
                text: format!("今天我们讨论「{}」。先提醒一句，接下来的嘉宾都是模拟圆桌角色，不是真实采访对象。我们会基于来源材料，把事实、争议和判断分开。", hotspot.title),
            },
            DialogueTurn {
                speaker_id: "participant".into(),
                intent: "intuition".into(),
                text: "从一线视角看，这类热点最值得关注的不是标题本身，而是它是否改变了团队做产品、写代码、评估模型或配置工作流的方式。".into(),
            },
            DialogueTurn {
                speaker_id: "expert".into(),
                intent: "technical".into(),
                text: "技术上我会先看三个问题：能力是否能复现，失败模式是否清楚，工程系统是否能观测、回滚和审计。没有这些，热点容易停留在演示层。".into(),
            },
            DialogueTurn {
                speaker_id: "investor".into(),
                intent: "business".into(),
                text: "商业上我会追问付费场景是不是足够刚性。如果只是效率叙事，还需要看到具体岗位、预算归属和竞争壁垒。".into(),
            },
            DialogueTurn {
                speaker_id: "host".into(),
                intent: "summary".into(),
                text: format!("所以这期先给一个保守判断：它值得关注，但结论要继续回到来源和证据。当前主要来源包括：{}。", source_names),
            },
        ],
        takeaways: prompt_config.fallbacks.takeaways.clone(),
        fact_checks: prompt_config.fallbacks.fact_checks.clone(),
        created_at: current_time.clone(),
        updated_at: current_time,
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

    let mut dialogue = Vec::new();
    for (index, turn) in turn_plan.turns.into_iter().take(16).enumerate() {
        let speaker = plan
            .guests
            .iter()
            .find(|guest| guest.id == turn.speaker_id)
            .or_else(|| plan.guests.first())
            .ok_or_else(|| "圆桌计划没有可用嘉宾".to_string())?;
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
        let turn_value_result = openai_chat_json(
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
        );
        println!(
            "[AI timing] draft_guest_turn {} {}ms",
            index + 1,
            turn_started_at.elapsed().as_millis()
        );
        let text = match turn_value_result
            .and_then(|value| serde_json::from_value::<GuestTurnResponse>(value).map_err(|error| error.to_string()))
            .map(|guest_turn| guest_turn.text.trim().to_string())
        {
            Ok(text) if !text.is_empty() => text,
            Ok(_) => {
                let fallback = fallback_guest_turn_text(speaker, &turn);
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
                let fallback = fallback_guest_turn_text(speaker, &turn);
                write_llm_log(
                    log_dir,
                    "draft_guest_turn_fallback",
                    provider_id,
                    model,
                    &json!({"turnIndex": index + 1, "speakerId": turn.speaker_id, "reason": error}),
                    None,
                    Some(&fallback),
                    Some("嘉宾发言生成或解析失败，已使用本地兜底发言继续生成。"),
                );
                fallback
            }
        };
        dialogue.push(DialogueTurn {
            speaker_id: turn.speaker_id,
            intent: turn.intent,
            text,
        });
    }

    let mut draft = generate_rule_based_draft(plan.clone(), hotspot.clone(), prompt_config);
    draft.title = turn_plan.title;
    draft.summary = turn_plan.summary;
    draft.dialogue = dialogue;
    draft.takeaways = turn_plan.takeaways;
    draft.fact_checks = turn_plan.fact_checks;
    Ok(draft)
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
            Some(DialogueTurn {
                speaker_id: item.get("speakerId")?.as_str()?.to_string(),
                intent: item.get("intent")?.as_str()?.to_string(),
                text: item.get("text")?.as_str()?.to_string(),
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
            search_hotspots,
            add_manual_hotspot,
            generate_roundtable_plan,
            generate_episode_draft,
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
}
