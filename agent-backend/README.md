# AI Roundtable Python Agent Backend Archive

This directory is retained as an experimental reference for the earlier FastAPI,
LangGraph, and LangChain autonomous-agent prototype.

The product runtime no longer depends on this service. `autonomous_agent` draft
generation is implemented natively in Tauri/Rust and is selected through the
desktop app's normal draft generation mode. The Rust path owns memory retrieval,
supplemental document context, optional JSON web search, depth-controlled turn
planning, progress events, and `agentTrace` output.

Use this archive only for comparison when evolving the native runtime. Do not
package Python, `uv`, LangGraph, or this service into desktop releases.
