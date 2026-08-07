import { invoke } from "@tauri-apps/api/core";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import type {
  AgentRuntimeSettings,
  AsrSettings,
  AutonomousDraftOptions,
  EpisodeDraft,
  FeedSource,
  HotspotCandidate,
  ModelProvider,
  ProviderSettings,
  RoundtablePlan,
  TtsSettings
} from "../types";

export type ManualHotspotInput = {
  title: string;
  summary: string;
  url: string;
  publisher?: string;
  category?: string;
  content?: string;
  sourceFilePath?: string;
  sourceFileName?: string;
};

export type ManualAttachmentImportResult = {
  originalName: string;
  storedPath: string;
  content: string;
};

export function getFeeds() {
  return invoke<FeedSource[]>("get_feeds");
}

export function getAppDataDir() {
  return invoke<string>("get_app_data_dir");
}

export function saveFeeds(feeds: FeedSource[]) {
  return invoke<FeedSource[]>("save_feeds", { feeds });
}

export function searchHotspots() {
  return invoke<HotspotCandidate[]>("search_hotspots");
}

export function getHotspotCandidates() {
  return invoke<HotspotCandidate[]>("get_hotspot_candidates");
}

export function saveHotspotCandidates(candidates: HotspotCandidate[]) {
  return invoke<HotspotCandidate[]>("save_hotspot_candidates", { candidates });
}

export function addManualHotspot(input: ManualHotspotInput) {
  return invoke<HotspotCandidate>("add_manual_hotspot", { input });
}

export function importManualAttachment(path: string) {
  return invoke<ManualAttachmentImportResult>("import_manual_attachment", { path });
}

export function generateRoundtablePlan(hotspot: HotspotCandidate, settings?: ProviderSettings) {
  return invoke<RoundtablePlan>("generate_roundtable_plan", { hotspot, settings });
}

export function generateEpisodeDraft(plan: RoundtablePlan, hotspot: HotspotCandidate, settings?: ProviderSettings, sessionId?: string) {
  return invoke<EpisodeDraft>("generate_episode_draft", { plan, hotspot, settings, sessionId });
}

export function generateAutonomousEpisodeDraft(
  plan: RoundtablePlan,
  hotspot: HotspotCandidate,
  settings: ProviderSettings,
  options: AutonomousDraftOptions,
  agentRuntimeSettings: AgentRuntimeSettings
) {
  return invoke<EpisodeDraft>("generate_autonomous_episode_draft", { plan, hotspot, settings, options, agentRuntimeSettings });
}

export function startInteractiveRoundtable(
  plan: RoundtablePlan,
  hotspot: HotspotCandidate,
  settings: ProviderSettings | undefined,
  sessionId: string
) {
  return invoke<EpisodeDraft>("start_interactive_roundtable", { plan, hotspot, settings, sessionId });
}

export function interruptInteractiveRoundtable(sessionId: string) {
  return invoke<void>("interrupt_interactive_roundtable", { sessionId });
}

export function submitInteractiveUserTurn(sessionId: string, text: string) {
  return invoke<EpisodeDraft>("submit_interactive_user_turn", { sessionId, text });
}

export function finishInteractiveRoundtable(sessionId: string) {
  return invoke<EpisodeDraft>("finish_interactive_roundtable", { sessionId });
}

export function saveEpisodeDraft(draft: EpisodeDraft) {
  return invoke<string>("save_episode_draft", { draft });
}

export function writeTextFile(path: string, content: string) {
  return invoke<string>("write_text_file", { path, content });
}

export function writeBinaryFile(path: string, base64Content: string) {
  return invoke<string>("write_binary_file", { path, base64Content });
}

export function exportEpisodeMp3(draft: EpisodeDraft, path: string) {
  return invoke<string>("export_episode_mp3", { draft, path });
}

export function getModelCatalog() {
  return invoke<ModelProvider[]>("get_model_catalog");
}

export function refreshModelCatalog(settings: ProviderSettings) {
  return invoke<ModelProvider[]>("refresh_model_catalog", { settings });
}

export function validateProviderConnection(settings: ProviderSettings) {
  return invoke<string>("validate_provider_connection", { settings });
}

export function getProviderSettings() {
  return invoke<ProviderSettings[]>("get_provider_settings");
}

export function saveProviderSettings(settings: ProviderSettings) {
  return invoke<ProviderSettings[]>("save_provider_settings", { settings });
}

export function getTtsSettings() {
  return invoke<TtsSettings>("get_tts_settings");
}

export function saveTtsSettings(settings: TtsSettings) {
  return invoke<TtsSettings>("save_tts_settings", { settings });
}

export function validateTtsConnection(settings: TtsSettings) {
  return invoke<string>("validate_tts_connection", { settings });
}

export function getAsrSettings() {
  return invoke<AsrSettings>("get_asr_settings");
}

export function saveAsrSettings(settings: AsrSettings) {
  return invoke<AsrSettings>("save_asr_settings", { settings });
}

export function transcribeAudioWithParaformer(settings: AsrSettings, audioBase64: string) {
  return invoke<string>("transcribe_audio_with_paraformer", { settings, audioBase64 });
}

export function getAgentRuntimeSettings() {
  return invoke<AgentRuntimeSettings>("get_agent_runtime_settings");
}

export function saveAgentRuntimeSettings(settings: AgentRuntimeSettings) {
  return invoke<AgentRuntimeSettings>("save_agent_runtime_settings", { settings });
}

export function listEpisodeDrafts() {
  return invoke<EpisodeDraft[]>("list_episode_drafts");
}

export function openExternalUrl(url: string) {
  if (/^[a-zA-Z]:[\\/]/.test(url) || url.startsWith("\\\\") || url.startsWith("/")) {
    return openPath(url);
  }
  return openUrl(url);
}
