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
    path::PathBuf,
    time::{Duration, Instant},
};
use tauri::Manager;

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

fn prompt_config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("llm-prompts.json"))
}

fn parse_bundled_json<T: DeserializeOwned>(name: &str, content: &str) -> Result<T, String> {
    serde_json::from_str(content)
        .map_err(|error| format!("invalid bundled prompt file {name}: {error}"))
}

fn bundled_prompt_config() -> Result<LlmPromptConfig, String> {
    Ok(LlmPromptConfig {
        version: Some(3),
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
                Ok(config) if config.version.unwrap_or_default() >= 3 => Ok(config),
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
    if provider_id == "deepseek" {
        json!({ "type": "json_object" })
    } else {
        response_format(schema)
    }
}

fn prompt_for_provider(provider_id: &str, prompt: String, schema: &JsonSchemaSpec) -> String {
    if provider_id != "deepseek" {
        return prompt;
    }

    let schema_json = serde_json::to_string(&schema.schema).unwrap_or_default();
    format!(
        "{prompt}\n\nDeepSeek JSON Output 要求：请只输出一个合法 JSON 对象，不要 markdown，不要解释文字。JSON 对象必须匹配这个 schema 的字段结构：\n{schema_json}"
    )
}

fn openai_chat_json(
    client: &Client,
    url: &str,
    provider_id: &str,
    api_key: &str,
    model: &str,
    system_prompt: &str,
    user_prompt: String,
    temperature: f32,
    schema: &JsonSchemaSpec,
) -> Result<serde_json::Value, String> {
    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": temperature,
        "response_format": response_format_for_provider(provider_id, schema)
    });

    let response: ChatCompletionResponse = client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| error.to_string())?
        .json()
        .map_err(|error| error.to_string())?;

    let content = response
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .ok_or_else(|| "模型没有返回内容".to_string())?;
    serde_json::from_str(content.trim()).map_err(|error| error.to_string())
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
        .user_agent("APD AI Roundtable Workbench/0.1")
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
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt_config: &LlmPromptConfig,
) -> Result<RoundtablePlan, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(45))
        .user_agent("APD AI Roundtable Workbench/0.1")
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

    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt_config.tasks.plan.system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": prompt_config.tasks.plan.temperature,
        "response_format": response_format_for_provider(provider_id, &prompt_config.schemas.plan)
    });

    let response: ChatCompletionResponse = client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| error.to_string())?
        .json()
        .map_err(|error| error.to_string())?;

    let content = response
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .ok_or_else(|| "模型没有返回内容".to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(content.trim()).map_err(|error| error.to_string())?;
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
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt_config: &LlmPromptConfig,
) -> Result<EpisodeDraft, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(90))
        .user_agent("APD AI Roundtable Workbench/0.1")
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
    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": prompt_config.tasks.draft.system_prompt},
            {"role": "user", "content": prompt}
        ],
        "temperature": prompt_config.tasks.draft.temperature,
        "response_format": response_format_for_provider(provider_id, &prompt_config.schemas.draft)
    });
    let response: ChatCompletionResponse = client
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .and_then(|response| response.error_for_status())
        .map_err(|error| error.to_string())?
        .json()
        .map_err(|error| error.to_string())?;
    let content = response
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .ok_or_else(|| "模型没有返回内容".to_string())?;
    let value: serde_json::Value =
        serde_json::from_str(content.trim()).map_err(|error| error.to_string())?;
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
    base_url: &str,
    api_key: &str,
    model: &str,
    prompt_config: &LlmPromptConfig,
) -> Result<EpisodeDraft, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(90))
        .user_agent("APD AI Roundtable Workbench/0.1")
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
        let turn_value = openai_chat_json(
            &client,
            &url,
            provider_id,
            api_key,
            model,
            &prompt_config.tasks.draft_guest_turn.system_prompt,
            turn_prompt,
            prompt_config.tasks.draft_guest_turn.temperature,
            &prompt_config.schemas.guest_turn,
        )?;
        println!(
            "[AI timing] draft_guest_turn {} {}ms",
            index + 1,
            turn_started_at.elapsed().as_millis()
        );
        let guest_turn: GuestTurnResponse =
            serde_json::from_value(turn_value).map_err(|error| error.to_string())?;
        let text = guest_turn.text.trim().to_string();
        if text.is_empty() {
            return Err(format!("第 {} 轮嘉宾发言为空", index + 1));
        }
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
            id: "mock".into(),
            name: "本地规则生成器".into(),
            base_url: "local".into(),
            models: vec!["backend-rule-generator".into()],
            requires_api_key: false,
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
    if settings.provider_id != "openai" && settings.provider_id != "deepseek" {
        return Err("当前生成链路只支持 OpenAI / DeepSeek 这类 OpenAI-compatible 厂商；请先切换到已支持的厂商。".into());
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
        .user_agent("APD AI Roundtable Workbench/0.1")
        .build()
        .map_err(|error| error.to_string())?;

    match settings.provider_id.as_str() {
        "openai" | "deepseek" => {
            let url = format!("{}/models", settings.base_url.trim_end_matches('/'));
            let response: OpenAiModelList = client
                .get(url)
                .bearer_auth(api_key)
                .send()
                .and_then(|response| response.error_for_status())
                .map_err(|error| error.to_string())?
                .json()
                .map_err(|error| error.to_string())?;
            Ok(response.data.into_iter().map(|model| model.id).collect())
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_feeds,
            save_feeds,
            search_hotspots,
            add_manual_hotspot,
            generate_roundtable_plan,
            generate_episode_draft,
            save_episode_draft,
            get_model_catalog,
            refresh_model_catalog,
            validate_provider_connection,
            get_provider_settings,
            save_provider_settings,
            list_episode_drafts
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
