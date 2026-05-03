import { invoke } from "@tauri-apps/api/core";
import type { EpisodeDraft, FeedSource, HotspotCandidate, ModelProvider, ProviderSettings, RoundtablePlan } from "../types";

export type ManualHotspotInput = {
  title: string;
  summary: string;
  url: string;
  publisher?: string;
  category?: string;
};

export function getFeeds() {
  return invoke<FeedSource[]>("get_feeds");
}

export function saveFeeds(feeds: FeedSource[]) {
  return invoke<FeedSource[]>("save_feeds", { feeds });
}

export function searchHotspots() {
  return invoke<HotspotCandidate[]>("search_hotspots");
}

export function addManualHotspot(input: ManualHotspotInput) {
  return invoke<HotspotCandidate>("add_manual_hotspot", { input });
}

export function generateRoundtablePlan(hotspot: HotspotCandidate, settings?: ProviderSettings) {
  return invoke<RoundtablePlan>("generate_roundtable_plan", { hotspot, settings });
}

export function generateEpisodeDraft(plan: RoundtablePlan, hotspot: HotspotCandidate) {
  return invoke<EpisodeDraft>("generate_episode_draft", { plan, hotspot });
}

export function saveEpisodeDraft(draft: EpisodeDraft) {
  return invoke<string>("save_episode_draft", { draft });
}

export function getModelCatalog() {
  return invoke<ModelProvider[]>("get_model_catalog");
}

export function refreshModelCatalog(settings: ProviderSettings) {
  return invoke<ModelProvider[]>("refresh_model_catalog", { settings });
}

export function getProviderSettings() {
  return invoke<ProviderSettings[]>("get_provider_settings");
}

export function saveProviderSettings(settings: ProviderSettings) {
  return invoke<ProviderSettings[]>("save_provider_settings", { settings });
}

export function listEpisodeDrafts() {
  return invoke<EpisodeDraft[]>("list_episode_drafts");
}
