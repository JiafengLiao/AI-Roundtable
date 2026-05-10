from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Source(BaseModel):
    id: str
    title: str
    url: str
    publisher: str
    published_at: str | None = Field(default=None, alias="publishedAt")

    model_config = ConfigDict(populate_by_name=True)


class HotspotCandidate(BaseModel):
    id: str
    title: str
    summary: str
    category: str
    score: int
    status: str
    source_count: int = Field(alias="sourceCount")
    sources: list[Source] = Field(default_factory=list)
    matched_signals: list[str] = Field(default_factory=list, alias="matchedSignals")
    created_at: str = Field(alias="createdAt")
    note: str | None = None

    model_config = ConfigDict(populate_by_name=True)


class GuestPersona(BaseModel):
    id: str
    label: str
    role: str
    stance: str
    speaking_style: str = Field(alias="speakingStyle")
    tts: dict[str, Any] | None = None

    model_config = ConfigDict(populate_by_name=True)


class RoundtablePlan(BaseModel):
    id: str
    hotspot_id: str = Field(alias="hotspotId")
    objective: str
    audience_promise: str = Field(alias="audiencePromise")
    guests: list[GuestPersona]
    agenda: list[str]
    tension_points: list[str] = Field(alias="tensionPoints")
    speaking_order: list[str] = Field(default_factory=list, alias="speakingOrder")
    source_risks: list[str] = Field(default_factory=list, alias="sourceRisks")

    model_config = ConfigDict(populate_by_name=True)


class DialogueTurn(BaseModel):
    speaker_id: str = Field(alias="speakerId")
    intent: str
    text: str

    model_config = ConfigDict(populate_by_name=True)


class AgentTraceRecord(BaseModel):
    id: str
    level: Literal["info", "warning", "debug"]
    agent_id: str = Field(alias="agentId")
    agent_label: str = Field(alias="agentLabel")
    phase: str
    message: str
    sources: list[Source] | None = None
    created_at: str = Field(default_factory=utc_now, alias="createdAt")

    model_config = ConfigDict(populate_by_name=True)


class EpisodeDraft(BaseModel):
    id: str
    title: str
    summary: str
    status: Literal["draft", "reviewed", "published"] = "draft"
    plan_id: str = Field(alias="planId")
    hotspot_id: str = Field(alias="hotspotId")
    sources: list[Source]
    guests: list[GuestPersona]
    dialogue: list[DialogueTurn]
    takeaways: list[str]
    fact_checks: list[str] = Field(alias="factChecks")
    agent_trace: list[AgentTraceRecord] = Field(default_factory=list, alias="agentTrace")
    created_at: str = Field(default_factory=utc_now, alias="createdAt")
    updated_at: str = Field(default_factory=utc_now, alias="updatedAt")

    model_config = ConfigDict(populate_by_name=True)


class ProviderSettings(BaseModel):
    provider_id: str = Field(alias="providerId")
    base_url: str = Field(alias="baseUrl")
    api_key: str | None = Field(default=None, alias="apiKey")
    selected_model: str | None = Field(default=None, alias="selectedModel")
    draft_generation_mode: str | None = Field(default=None, alias="draftGenerationMode")

    model_config = ConfigDict(populate_by_name=True)


class SupplementalDocument(BaseModel):
    id: str
    name: str
    path: str
    content: str


class AutonomousDraftOptions(BaseModel):
    session_id: str = Field(alias="sessionId")
    discussion_depth: Literal["low", "medium", "high"] = Field(alias="discussionDepth")
    supplemental_documents: list[SupplementalDocument] = Field(
        default_factory=list,
        alias="supplementalDocuments",
    )

    model_config = ConfigDict(populate_by_name=True)


class AgentRuntimeSettings(BaseModel):
    generation_engine: str = Field(default="native", alias="generationEngine")
    python_agent_base_url: str = Field(default="http://127.0.0.1:8787", alias="pythonAgentBaseUrl")
    discussion_depth: Literal["low", "medium", "high"] = Field(default="medium", alias="discussionDepth")
    search_base_url: str = Field(default="", alias="searchBaseUrl")
    search_api_key: str | None = Field(default=None, alias="searchApiKey")
    search_language: str = Field(default="zh-CN", alias="searchLanguage")
    search_max_results: int = Field(default=5, alias="searchMaxResults")
    search_recency_days: int | None = Field(default=14, alias="searchRecencyDays")
    debug_trace_enabled: bool = Field(default=False, alias="debugTraceEnabled")

    model_config = ConfigDict(populate_by_name=True)


class GenerateRequest(BaseModel):
    plan: RoundtablePlan
    hotspot: HotspotCandidate
    provider_settings: ProviderSettings = Field(alias="providerSettings")
    options: AutonomousDraftOptions
    agent_runtime_settings: AgentRuntimeSettings = Field(alias="agentRuntimeSettings")

    model_config = ConfigDict(populate_by_name=True)


class AgentProgressEvent(BaseModel):
    session_id: str = Field(alias="sessionId")
    agent_id: str = Field(alias="agentId")
    agent_label: str = Field(alias="agentLabel")
    phase: str
    status: Literal["queued", "running", "succeeded", "failed", "warning"]
    progress: int
    message: str
    severity: Literal["info", "warning", "debug"] = "info"
    turn_index: int | None = Field(default=None, alias="turnIndex")

    model_config = ConfigDict(populate_by_name=True)
