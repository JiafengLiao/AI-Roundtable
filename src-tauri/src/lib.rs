use chrono::Utc;
use reqwest::blocking::Client;
use rss::Channel;
use serde::{Deserialize, Serialize};
use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    io::Cursor,
    path::PathBuf,
    time::Duration,
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
                    let title = item.title().unwrap_or("Untitled AI update").trim().to_string();
                    let link = item.link().unwrap_or(&feed.url).trim().to_string();
                    let raw_summary = item
                        .description()
                        .or_else(|| item.content())
                        .unwrap_or("来源未提供摘要，请打开链接查看原文。");
                    let summary = truncate(&strip_html(raw_summary), 220);
                    let signals = keyword_signals(&format!("{title} {summary}"));
                    let score = (55 + signals.len() as u16 * 8 + (feed.category != "other") as u16 * 10).min(98);
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
fn add_manual_hotspot(app: tauri::AppHandle, input: ManualHotspotInput) -> Result<HotspotCandidate, String> {
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
fn generate_roundtable_plan(hotspot: HotspotCandidate) -> Result<RoundtablePlan, String> {
    let signals = if hotspot.matched_signals.is_empty() {
        "来源信号有限".to_string()
    } else {
        hotspot.matched_signals.join("、")
    };

    Ok(RoundtablePlan {
        id: stable_id("plan", &hotspot.id),
        hotspot_id: hotspot.id,
        objective: format!("围绕「{}」建立事实背景、行业直觉、商业判断和技术判断。", hotspot.title),
        audience_promise: "让 AI 从业者快速判断这个热点是否值得投入产品、研发或投资注意力。".into(),
        guests: default_guests(),
        agenda: vec![
            "主持人用 2 分钟解释热点本身和来源可信度。".into(),
            format!("热点参与者从一线工作流解释为什么这些信号重要：{signals}。"),
            "技术专家判断模型、工程、数据、安全和可验证性。".into(),
            "投资人判断商业化路径、竞争壁垒和资本效率。".into(),
            "主持人收束成 3 条本周可行动判断。".into(),
        ],
        tension_points: vec![
            "发布方叙事和真实落地效果之间可能存在差距。".into(),
            "技术可行性不等于用户愿意付费。".into(),
            "来源材料不足时，需要避免编造具体数字或承诺。".into(),
        ],
        speaking_order: vec![
            "host".into(),
            "participant".into(),
            "expert".into(),
            "investor".into(),
            "host".into(),
        ],
        source_risks: vec![
            format!("当前来源数量：{}。少于 2 个来源时建议人工补充交叉验证。", hotspot.source_count),
            "不要把模拟角色写成真实采访对象。".into(),
        ],
    })
}

#[tauri::command]
fn generate_episode_draft(plan: RoundtablePlan, hotspot: HotspotCandidate) -> Result<EpisodeDraft, String> {
    let current_time = now();
    let source_names = hotspot
        .sources
        .iter()
        .map(|source| source.publisher.clone())
        .collect::<Vec<_>>()
        .join("、");

    Ok(EpisodeDraft {
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
        takeaways: vec![
            "先区分事实、发布方叙事和我们的判断。".into(),
            "技术判断重点看可复现性、失败恢复和安全边界。".into(),
            "商业判断重点看真实付费岗位、预算和可持续壁垒。".into(),
            "来源不足时保守表达，并优先补充交叉来源。".into(),
        ],
        fact_checks: vec![
            "逐条打开来源链接，确认标题、日期和关键事实。".into(),
            "删除来源中没有出现的数字、融资额、性能提升或公司承诺。".into(),
            "确认所有嘉宾都被标注为模拟角色。".into(),
        ],
        created_at: current_time.clone(),
        updated_at: current_time,
    })
}

#[tauri::command]
fn save_episode_draft(app: tauri::AppHandle, draft: EpisodeDraft) -> Result<String, String> {
    let path = data_dir(&app)?.join("drafts").join(format!("{}.json", draft.id));
    write_json(path.clone(), &draft)?;
    Ok(path.to_string_lossy().to_string())
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

fn default_guests() -> Vec<GuestPersona> {
    vec![
        GuestPersona {
            id: "host".into(),
            label: "主持人".into(),
            role: "扫盲、追问和总结".into(),
            stance: "把复杂热点拆成事实、争议和行动判断。".into(),
            speaking_style: "短句清晰，节奏稳定。".into(),
        },
        GuestPersona {
            id: "participant".into(),
            label: "热点参与者".into(),
            role: "提供一线 intuition 和行业 know-how。".into(),
            stance: "关注真实工作流里的摩擦和机会。".into(),
            speaking_style: "有现场感，避免空泛评论。".into(),
        },
        GuestPersona {
            id: "investor".into(),
            label: "投资人".into(),
            role: "分析商业化、竞争格局和资本效率。".into(),
            stance: "看重付费意愿、预算归属和壁垒。".into(),
            speaking_style: "结构化、谨慎、偏判断。".into(),
        },
        GuestPersona {
            id: "expert".into(),
            label: "技术专家".into(),
            role: "分析模型、工程、数据和安全风险。".into(),
            stance: "看重可验证性、稳定性和失败恢复。".into(),
            speaking_style: "准确但不论文腔。".into(),
        },
    ]
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_feeds,
            save_feeds,
            search_hotspots,
            add_manual_hotspot,
            generate_roundtable_plan,
            generate_episode_draft,
            save_episode_draft,
            get_model_catalog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
