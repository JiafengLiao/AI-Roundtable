import { invoke } from "@tauri-apps/api/core";
import type { EpisodeDraft, FeedSource, HotspotCandidate, ModelProvider, RoundtablePlan } from "../types";

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

export function generateRoundtablePlan(hotspot: HotspotCandidate) {
  return invoke<RoundtablePlan>("generate_roundtable_plan", { hotspot });
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
