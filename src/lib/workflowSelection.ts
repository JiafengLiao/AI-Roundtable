import type { HotspotCandidate } from "../types";

type SelectableArticle = {
  hotspot?: HotspotCandidate;
};

export type GenerationSelectionState = {
  focusedHotspot: HotspotCandidate | null;
  selectedHotspotIds: string[];
};

export function getPostFetchSelectionState(
  allHotspots: HotspotCandidate[],
  visibleHotspots: HotspotCandidate[]
): GenerationSelectionState {
  return {
    focusedHotspot: visibleHotspots[0] ?? allHotspots[0] ?? null,
    selectedHotspotIds: []
  };
}

export function getCategoryGenerationSelection(articles: SelectableArticle[]): GenerationSelectionState {
  const hotspots = articles.flatMap((article) => (article.hotspot ? [article.hotspot] : []));
  const selectedHotspotIds = Array.from(new Set(hotspots.map((hotspot) => hotspot.id)));

  return {
    focusedHotspot: hotspots[0] ?? null,
    selectedHotspotIds
  };
}
