export type FeedCategory = "research" | "company" | "developer" | "market" | "policy" | "other";

export type FeedSource = {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  enabled: boolean;
  lastFetchedAt?: string;
  lastStatus?: string;
};

export type Source = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  publishedAt?: string;
};

export type HotspotCandidate = {
  id: string;
  title: string;
  summary: string;
  category: FeedCategory;
  score: number;
  status: "new" | "shortlisted" | "planned" | "drafted";
  sourceCount: number;
  sources: Source[];
  matchedSignals: string[];
  createdAt: string;
  note?: string;
};

export type GuestId = "host" | "participant" | "investor" | "expert";

export type GuestPersona = {
  id: GuestId;
  label: string;
  role: string;
  stance: string;
  speakingStyle: string;
};

export type RoundtablePlan = {
  id: string;
  hotspotId: string;
  objective: string;
  audiencePromise: string;
  guests: GuestPersona[];
  agenda: string[];
  tensionPoints: string[];
  speakingOrder: GuestId[];
  sourceRisks: string[];
};

export type DialogueTurn = {
  speakerId: GuestId;
  intent: "open" | "context" | "intuition" | "business" | "technical" | "challenge" | "summary";
  text: string;
};

export type EpisodeDraft = {
  id: string;
  title: string;
  summary: string;
  status: "draft" | "reviewed" | "published";
  planId: string;
  hotspotId: string;
  sources: Source[];
  guests: GuestPersona[];
  dialogue: DialogueTurn[];
  takeaways: string[];
  factChecks: string[];
  createdAt: string;
  updatedAt: string;
};

export type GenerationJob = {
  id: string;
  type: "fetch" | "plan" | "draft" | "save";
  status: "idle" | "running" | "failed" | "succeeded";
  message: string;
};

export type ModelProvider = {
  id: string;
  name: string;
  baseUrl: string;
  models: string[];
  requiresApiKey: boolean;
};

export type ProviderSettings = {
  providerId: string;
  baseUrl: string;
  apiKey?: string;
  selectedModel?: string;
};
