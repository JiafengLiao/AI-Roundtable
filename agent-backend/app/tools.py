from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import httpx

from .schemas import AgentRuntimeSettings, HotspotCandidate, Source, SupplementalDocument


@dataclass(frozen=True)
class MemoryChunk:
    id: str
    title: str
    text: str
    source: Source | None = None


def build_memory_chunks(
    hotspot: HotspotCandidate,
    supplemental_documents: Iterable[SupplementalDocument],
) -> list[MemoryChunk]:
    chunks: list[MemoryChunk] = [
        MemoryChunk(
            id=f"hotspot:{hotspot.id}",
            title=hotspot.title,
            text=f"{hotspot.title}\n{hotspot.summary}\n{hotspot.note or ''}",
        )
    ]
    for source in hotspot.sources:
        chunks.append(
            MemoryChunk(
                id=f"source:{source.id}",
                title=source.title,
                text=f"{source.title}\n{source.publisher}\n{source.url}",
                source=source,
            )
        )
    for document in supplemental_documents:
        text = document.content.strip()
        if not text:
            continue
        for index, part in enumerate(chunk_text(text)):
            chunks.append(
                MemoryChunk(
                    id=f"document:{document.id}:{index}",
                    title=document.name,
                    text=part,
                )
            )
    return chunks


def memory_search(chunks: list[MemoryChunk], query: str, limit: int = 4) -> list[MemoryChunk]:
    terms = {term.lower() for term in query.replace("/", " ").replace("|", " ").split() if term}
    if not terms:
        return chunks[:limit]
    scored: list[tuple[int, MemoryChunk]] = []
    for chunk in chunks:
        haystack = f"{chunk.title}\n{chunk.text}".lower()
        score = sum(haystack.count(term) for term in terms)
        if score:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:limit]]


async def web_search(settings: AgentRuntimeSettings, query: str) -> list[Source]:
    if not settings.search_base_url.strip():
        return []

    payload = {
        "query": query,
        "maxResults": settings.search_max_results,
        "language": settings.search_language,
        "recencyDays": settings.search_recency_days,
    }
    headers = {"Content-Type": "application/json"}
    if settings.search_api_key:
        headers["Authorization"] = f"Bearer {settings.search_api_key}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(settings.search_base_url, json=payload, headers=headers)
        response.raise_for_status()
        data = response.json()

    raw_results = data.get("results", data) if isinstance(data, dict) else data
    if not isinstance(raw_results, list):
        return []

    sources: list[Source] = []
    for index, item in enumerate(raw_results[: settings.search_max_results]):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or item.get("name") or "").strip()
        url = str(item.get("url") or item.get("link") or "").strip()
        if not title or not url:
            continue
        publisher = str(item.get("source") or item.get("publisher") or "Web Search").strip()
        sources.append(
            Source(
                id=f"web-{abs(hash(url))}-{index}",
                title=title,
                url=url,
                publisher=publisher,
                publishedAt=item.get("publishedAt") or item.get("published_at"),
            )
        )
    return sources


def chunk_text(value: str, max_chars: int = 1400, overlap: int = 180) -> list[str]:
    text = " ".join(value.split())
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        chunks.append(text[start:end])
        if end == len(text):
            break
        start = max(0, end - overlap)
    return chunks
