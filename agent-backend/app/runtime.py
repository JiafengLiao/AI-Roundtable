from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import Awaitable, Callable
from typing import Any, TypedDict

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

from .schemas import (
    AgentProgressEvent,
    AgentTraceRecord,
    DialogueTurn,
    EpisodeDraft,
    GenerateRequest,
    Source,
    utc_now,
)
from .tools import MemoryChunk, build_memory_chunks, memory_search, web_search

BackendEvent = dict[str, Any]
EventSink = Callable[[BackendEvent], Awaitable[None]]


class RoundtableState(TypedDict, total=False):
    request: GenerateRequest
    memory_chunks: list[MemoryChunk]
    sources: list[Source]
    trace: list[AgentTraceRecord]
    turn_plan: dict[str, Any]
    dialogue: list[DialogueTurn]
    draft: EpisodeDraft


DEPTH_TURNS = {
    "low": (8, 10),
    "medium": (10, 14),
    "high": (12, 18),
}


async def generate_episode(request: GenerateRequest) -> EpisodeDraft:
    return await _run_graph(request, None)


async def generate_episode_events(request: GenerateRequest):
    queue: asyncio.Queue[BackendEvent | None] = asyncio.Queue()

    async def sink(event: BackendEvent) -> None:
        await queue.put(event)

    async def worker() -> None:
        try:
            draft = await _run_graph(request, sink)
            await queue.put({"type": "final", "draft": draft.model_dump(by_alias=True)})
        except Exception as error:  # noqa: BLE001
            await queue.put({"type": "error", "message": str(error)})
        finally:
            await queue.put(None)

    task = asyncio.create_task(worker())
    try:
        while True:
            event = await queue.get()
            if event is None:
                break
            yield event
    finally:
        if not task.done():
            task.cancel()


async def _run_graph(request: GenerateRequest, sink: EventSink | None) -> EpisodeDraft:
    graph = StateGraph(RoundtableState)
    graph.add_node("preprocess", _node(preprocess, sink))
    graph.add_node("controller", _node(controller_plan, sink))
    graph.add_node("guests", _node(guest_rounds, sink))
    graph.add_node("finalizer", _node(finalizer, sink))
    graph.set_entry_point("preprocess")
    graph.add_edge("preprocess", "controller")
    graph.add_edge("controller", "guests")
    graph.add_edge("guests", "finalizer")
    graph.add_edge("finalizer", END)

    compiled = graph.compile()
    state = await compiled.ainvoke({"request": request})
    draft = state.get("draft")
    if not draft:
        raise RuntimeError("Agent graph finished without an EpisodeDraft")
    return draft


def _node(fn, sink: EventSink | None):
    async def wrapped(state: RoundtableState) -> RoundtableState:
        return await fn(state, sink)

    return wrapped


async def preprocess(state: RoundtableState, sink: EventSink | None) -> RoundtableState:
    request = state["request"]
    await emit_progress(request, sink, "controller", "中控 Agent", "preprocess", 8, "正在建立本地资料索引")
    chunks = build_memory_chunks(request.hotspot, request.options.supplemental_documents)
    trace = [
        trace_record(
            "info",
            "controller",
            "中控 Agent",
            "memory.index",
            f"已建立 {len(chunks)} 个本地记忆片段",
        )
    ]
    return {
        **state,
        "memory_chunks": chunks,
        "sources": list(request.hotspot.sources),
        "trace": trace,
    }


async def controller_plan(state: RoundtableState, sink: EventSink | None) -> RoundtableState:
    request = state["request"]
    await emit_progress(request, sink, "controller", "中控 Agent", "planning", 18, "正在规划发言顺序和讨论目标")
    min_turns, max_turns = DEPTH_TURNS[request.options.discussion_depth]
    fallback = fallback_turn_plan(request, min_turns)
    if should_use_mock(request):
        return {**state, "turn_plan": fallback}

    prompt = {
        "objective": request.plan.objective,
        "audiencePromise": request.plan.audience_promise,
        "agenda": request.plan.agenda,
        "tensionPoints": request.plan.tension_points,
        "sourceRisks": request.plan.source_risks,
        "guests": [guest.model_dump(by_alias=True) for guest in request.plan.guests],
        "hotspot": {
            "title": request.hotspot.title,
            "summary": request.hotspot.summary,
        },
        "requiredTurnRange": [min_turns, max_turns],
    }
    try:
        value = await call_json_model(
            request,
            "你是圆桌会议的中控 agent。只输出 JSON，不要 Markdown。",
            (
                "请规划一场中文 AI 圆桌。输出字段：title, summary, turns, takeaways, factChecks。"
                "turns 每项包含 speakerId, intent, instruction, toolQueries。toolQueries 是字符串数组，"
                "用于 memory.search 或 web.search，不要编造工具结果。\n\n"
                f"{json.dumps(prompt, ensure_ascii=False)}"
            ),
        )
        turns = list(value.get("turns") or [])[:max_turns]
        if len(turns) < min_turns:
            value["turns"] = fallback["turns"]
        return {**state, "turn_plan": {**fallback, **value, "turns": value.get("turns", fallback["turns"])}}
    except Exception as error:  # noqa: BLE001
        state["trace"].append(
            trace_record(
                "warning",
                "controller",
                "中控 Agent",
                "planning.fallback",
                f"中控规划失败，使用本地规划：{error}",
            )
        )
        return {**state, "turn_plan": fallback}


async def guest_rounds(state: RoundtableState, sink: EventSink | None) -> RoundtableState:
    request = state["request"]
    turn_plan = state["turn_plan"]
    chunks = state["memory_chunks"]
    sources = state["sources"]
    trace = state["trace"]
    dialogue: list[DialogueTurn] = []
    guests = {guest.id: guest for guest in request.plan.guests}

    for index, item in enumerate(turn_plan.get("turns", [])):
        speaker_id = str(item.get("speakerId") or request.plan.guests[index % len(request.plan.guests)].id)
        guest = guests.get(speaker_id) or request.plan.guests[index % len(request.plan.guests)]
        await emit_progress(
            request,
            sink,
            guest.id,
            guest.label,
            "retrieval",
            min(90, 25 + index * 4),
            f"正在准备第 {index + 1} 轮发言",
            index,
        )

        queries = [str(query) for query in item.get("toolQueries", []) if str(query).strip()]
        if not queries:
            queries = [request.hotspot.title, str(item.get("instruction") or "")]
        memory_hits = []
        web_sources: list[Source] = []
        for query in queries[:2]:
            memory_hits.extend(memory_search(chunks, query, limit=3))
            try:
                web_sources.extend(await web_search(request.agent_runtime_settings, query))
            except Exception as error:  # noqa: BLE001
                trace.append(trace_record("warning", guest.id, guest.label, "web.search", f"搜索失败：{error}"))
        sources = merge_sources(sources, web_sources)

        text = await generate_guest_turn(request, guest, item, dialogue, memory_hits, web_sources, trace)
        turn = DialogueTurn(speakerId=guest.id, intent=str(item.get("intent") or "context"), text=text)
        dialogue.append(turn)
        trace.append(
            trace_record(
                "info",
                guest.id,
                guest.label,
                "guest.turn",
                f"第 {index + 1} 轮发言已生成",
                web_sources or None,
            )
        )
        await emit_progress(
            request,
            sink,
            guest.id,
            guest.label,
            "speaking",
            min(96, 30 + index * 4),
            f"第 {index + 1} 轮发言已完成",
            index,
        )

    return {**state, "dialogue": dialogue, "sources": sources, "trace": trace}


async def finalizer(state: RoundtableState, sink: EventSink | None) -> RoundtableState:
    request = state["request"]
    await emit_progress(request, sink, "controller", "中控 Agent", "finalize", 96, "正在收束标题、摘要和 fact checks")
    turn_plan = state["turn_plan"]
    now = utc_now()
    draft = EpisodeDraft(
        id=f"draft-{uuid.uuid4().hex[:12]}",
        title=str(turn_plan.get("title") or request.hotspot.title),
        summary=str(turn_plan.get("summary") or request.hotspot.summary),
        status="draft",
        planId=request.plan.id,
        hotspotId=request.hotspot.id,
        sources=state["sources"],
        guests=request.plan.guests,
        dialogue=state["dialogue"],
        takeaways=[str(item) for item in turn_plan.get("takeaways", [])][:5]
        or ["保留事实边界，优先核验来源。"],
        factChecks=[str(item) for item in turn_plan.get("factChecks", [])][:5]
        or ["需复核关键数字、发布时间和公司官方表述。"],
        agentTrace=filter_trace(state["trace"], request.agent_runtime_settings.debug_trace_enabled),
        createdAt=now,
        updatedAt=now,
    )
    await emit_progress(request, sink, "controller", "中控 Agent", "done", 100, "圆桌稿已生成")
    return {**state, "draft": draft}


async def generate_guest_turn(
    request: GenerateRequest,
    guest,
    item: dict[str, Any],
    dialogue: list[DialogueTurn],
    memory_hits: list[MemoryChunk],
    web_sources: list[Source],
    trace: list[AgentTraceRecord],
) -> str:
    fallback = fallback_guest_text(request, guest, item)
    if should_use_mock(request):
        return fallback
    context = {
        "guest": guest.model_dump(by_alias=True),
        "instruction": item,
        "previousTurns": [turn.model_dump(by_alias=True) for turn in dialogue[-4:]],
        "memoryHits": [{"title": hit.title, "text": hit.text[:800]} for hit in memory_hits[:4]],
        "webSources": [source.model_dump(by_alias=True) for source in web_sources[:4]],
    }
    try:
        value = await call_json_model(
            request,
            f"你是圆桌嘉宾「{guest.label}」。只输出 JSON，不要 Markdown。",
            (
                "请基于给定资料生成一轮真实圆桌发言。输出字段：text。"
                "要求：中文、口语但专业、120-220 字、引用事实时保持不确定性，不要编造来源。\n\n"
                f"{json.dumps(context, ensure_ascii=False)}"
            ),
        )
        text = str(value.get("text") or "").strip()
        return text or fallback
    except Exception as error:  # noqa: BLE001
        trace.append(trace_record("warning", guest.id, guest.label, "guest.fallback", f"发言生成失败，使用降级发言：{error}"))
        return fallback


async def call_json_model(request: GenerateRequest, system: str, user: str) -> dict[str, Any]:
    settings = request.provider_settings
    if not settings.api_key or not settings.selected_model:
        raise RuntimeError("LLM provider is missing apiKey or selectedModel")
    llm = ChatOpenAI(
        model=settings.selected_model,
        api_key=settings.api_key,
        base_url=settings.base_url.rstrip("/"),
        timeout=200,
        temperature=0.4,
    )
    message = await llm.ainvoke([SystemMessage(content=system), HumanMessage(content=user)])
    return parse_json_object(message_text(message.content))


def parse_json_object(value: str) -> dict[str, Any]:
    text = value.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:].strip()
    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        text = text[start : end + 1]
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("model returned non-object JSON")
    return parsed


def message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and "text" in item:
                parts.append(str(item["text"]))
            else:
                parts.append(str(item))
        return "\n".join(parts)
    return str(content)


async def emit_progress(
    request: GenerateRequest,
    sink: EventSink | None,
    agent_id: str,
    agent_label: str,
    phase: str,
    progress: int,
    message: str,
    turn_index: int | None = None,
) -> None:
    if not sink:
        return
    event = AgentProgressEvent(
        sessionId=request.options.session_id,
        agentId=agent_id,
        agentLabel=agent_label,
        phase=phase,
        status="running" if progress < 100 else "succeeded",
        progress=progress,
        message=message,
        severity="info",
        turnIndex=turn_index,
    )
    await sink({"type": "agent_progress", "event": event.model_dump(by_alias=True)})


def trace_record(
    level: str,
    agent_id: str,
    agent_label: str,
    phase: str,
    message: str,
    sources: list[Source] | None = None,
) -> AgentTraceRecord:
    return AgentTraceRecord(
        id=f"trace-{uuid.uuid4().hex[:12]}",
        level=level,
        agentId=agent_id,
        agentLabel=agent_label,
        phase=phase,
        message=message,
        sources=sources,
    )


def fallback_turn_plan(request: GenerateRequest, min_turns: int) -> dict[str, Any]:
    guests = request.plan.guests
    intents = ["open", "context", "intuition", "business", "technical", "challenge", "summary"]
    turns = []
    for index in range(min_turns):
        guest = guests[index % len(guests)]
        turns.append(
            {
                "speakerId": guest.id,
                "intent": intents[index % len(intents)],
                "instruction": f"围绕「{request.hotspot.title}」推进讨论，回应前文并给出可核验判断。",
                "toolQueries": [request.hotspot.title],
            }
        )
    return {
        "title": request.hotspot.title,
        "summary": request.hotspot.summary,
        "turns": turns,
        "takeaways": ["需要区分产品发布、技术能力和商业落地。"],
        "factChecks": ["核验所有来源发布时间、原始链接和关键数字。"],
    }


def fallback_guest_text(request: GenerateRequest, guest, item: dict[str, Any]) -> str:
    instruction = str(item.get("instruction") or "")
    return (
        f"我先按「{guest.label}」的视角补一层判断：{request.hotspot.summary}"
        f"这里不能只看标题热度，还要看它和现有产品、用户需求、成本结构之间的关系。"
        f"{instruction[:80]}"
    )


def should_use_mock(request: GenerateRequest) -> bool:
    settings = request.provider_settings
    return settings.provider_id == "mock" or not settings.api_key or not settings.selected_model


def merge_sources(existing: list[Source], extra: list[Source]) -> list[Source]:
    seen = {source.url for source in existing}
    merged = list(existing)
    for source in extra:
        if source.url not in seen:
            merged.append(source)
            seen.add(source.url)
    return merged


def filter_trace(trace: list[AgentTraceRecord], include_debug: bool) -> list[AgentTraceRecord]:
    if include_debug:
        return trace
    return [record for record in trace if record.level != "debug"]
