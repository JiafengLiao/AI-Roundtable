from __future__ import annotations

import json

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse

from .runtime import generate_episode, generate_episode_events
from .schemas import GenerateRequest

app = FastAPI(title="AI Roundtable Agent Backend", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "engine": "python-langgraph"}


@app.post("/v1/generate")
async def generate(request: GenerateRequest):
    try:
        draft = await generate_episode(request)
        return draft.model_dump(by_alias=True)
    except Exception as error:  # noqa: BLE001 - API boundary should return a readable error.
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.post("/v1/generate/events")
async def generate_events(request: GenerateRequest):
    async def stream():
        try:
            async for event in generate_episode_events(request):
                yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as error:  # noqa: BLE001
            payload = {"type": "error", "message": str(error)}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream")
