use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::{
    io::{BufRead, BufReader},
    time::Duration,
};
use tauri::Emitter;

use crate::{
    emit_agent_progress, AgentProgressEvent, AgentRuntimeSettings, AutonomousDraftOptions,
    EpisodeDraft, HotspotCandidate, ProviderSettings, RoundtablePlan,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PythonAgentGenerateRequest<'a> {
    plan: &'a RoundtablePlan,
    hotspot: &'a HotspotCandidate,
    provider_settings: &'a ProviderSettings,
    options: &'a AutonomousDraftOptions,
    agent_runtime_settings: &'a AgentRuntimeSettings,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum PythonAgentGenerateResponse {
    Draft(EpisodeDraft),
    Envelope { draft: EpisodeDraft },
}

#[derive(Deserialize)]
struct PythonAgentStreamEvent {
    #[serde(rename = "type")]
    kind: String,
    event: Option<AgentProgressEvent>,
    draft: Option<EpisodeDraft>,
    message: Option<String>,
}

pub(crate) fn generate_with_python_agent_backend(
    app: &tauri::AppHandle,
    plan: &RoundtablePlan,
    hotspot: &HotspotCandidate,
    settings: &ProviderSettings,
    options: &AutonomousDraftOptions,
    runtime_settings: &AgentRuntimeSettings,
) -> Result<EpisodeDraft, String> {
    let base_url = runtime_settings
        .python_agent_base_url
        .trim()
        .trim_end_matches('/');
    if base_url.is_empty() {
        return Err("Python Agent Backend 地址为空，请在设置页填写本地服务地址。".into());
    }

    emit_agent_progress(
        app,
        &options.session_id,
        "controller",
        "中控 Agent",
        "连接 Python Agent Backend",
        "running",
        6,
        "正在连接本地 Python/LangGraph agent 服务",
        "info",
        None,
    );

    let request = PythonAgentGenerateRequest {
        plan,
        hotspot,
        provider_settings: settings,
        options,
        agent_runtime_settings: runtime_settings,
    };
    let client = Client::builder()
        .timeout(Duration::from_secs(240))
        .user_agent("ai-roundtable/0.4 python-agent-client")
        .build()
        .map_err(|error| error.to_string())?;

    match generate_with_python_agent_stream(app, base_url, &client, &request) {
        Ok(draft) => {
            emit_python_agent_done(app, options);
            Ok(draft)
        }
        Err(stream_error) => {
            emit_agent_progress(
                app,
                &options.session_id,
                "controller",
                "中控 Agent",
                "Python Agent 流式连接降级",
                "warning",
                8,
                &format!("流式进度不可用，改用普通生成接口：{stream_error}"),
                "warning",
                None,
            );
            let draft = generate_with_python_agent_blocking(base_url, &client, &request)?;
            emit_python_agent_done(app, options);
            Ok(draft)
        }
    }
}

fn generate_with_python_agent_stream(
    app: &tauri::AppHandle,
    base_url: &str,
    client: &Client,
    request: &PythonAgentGenerateRequest<'_>,
) -> Result<EpisodeDraft, String> {
    let url = format!("{base_url}/v1/generate/events");
    let response = client
        .post(&url)
        .json(request)
        .send()
        .map_err(|error| error.to_string())?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().unwrap_or_default();
        return Err(format!("HTTP {status}: {}", compact_error(&body)));
    }

    let mut reader = BufReader::new(response);
    let mut line = String::new();
    let mut final_draft = None;
    loop {
        line.clear();
        let bytes = reader
            .read_line(&mut line)
            .map_err(|error| error.to_string())?;
        if bytes == 0 {
            break;
        }
        let trimmed = line.trim();
        let Some(data) = trimmed.strip_prefix("data:") else {
            continue;
        };
        let data = data.trim();
        if data.is_empty() {
            continue;
        }
        let event: PythonAgentStreamEvent =
            serde_json::from_str(data).map_err(|error| format!("SSE JSON 解析失败：{error}"))?;
        match event.kind.as_str() {
            "agent_progress" => {
                if let Some(progress) = event.event {
                    let _ = app.emit("roundtable://agent-progress", progress);
                }
            }
            "final" => {
                final_draft = event.draft;
                break;
            }
            "error" => {
                return Err(event
                    .message
                    .unwrap_or_else(|| "Python Agent Backend 流式生成失败".into()));
            }
            _ => {}
        }
    }

    final_draft.ok_or_else(|| "Python Agent Backend 流结束但没有返回最终 EpisodeDraft".into())
}

fn generate_with_python_agent_blocking(
    base_url: &str,
    client: &Client,
    request: &PythonAgentGenerateRequest<'_>,
) -> Result<EpisodeDraft, String> {
    let url = format!("{base_url}/v1/generate");
    let response = client.post(&url).json(request).send().map_err(|error| {
        format!(
            "Python Agent Backend 连接失败：{error}。请确认已启动 agent-backend，且地址为 {base_url}。"
        )
    })?;
    let status = response.status();
    let body = response.text().map_err(|error| error.to_string())?;
    if !status.is_success() {
        return Err(format!(
            "Python Agent Backend 返回 {status}：{}",
            compact_error(&body)
        ));
    }

    let parsed: PythonAgentGenerateResponse = serde_json::from_str(&body)
        .map_err(|error| format!("Python Agent Backend 响应不是有效 EpisodeDraft：{error}"))?;
    Ok(match parsed {
        PythonAgentGenerateResponse::Draft(draft) => draft,
        PythonAgentGenerateResponse::Envelope { draft } => draft,
    })
}

fn emit_python_agent_done(app: &tauri::AppHandle, options: &AutonomousDraftOptions) {
    emit_agent_progress(
        app,
        &options.session_id,
        "controller",
        "中控 Agent",
        "Python Agent Backend 已完成",
        "succeeded",
        100,
        "已收到 Python/LangGraph agent 生成的圆桌稿",
        "info",
        None,
    );
}

fn compact_error(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.chars().count() > 800 {
        format!("{}...", trimmed.chars().take(800).collect::<String>())
    } else {
        trimmed.to_string()
    }
}
