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
export type SpeakerId = GuestId | "user";

export type GuestPersona = {
  id: GuestId;
  label: string;
  role: string;
  stance: string;
  speakingStyle: string;
  tts?: {
    voice: string;
    dashscopeVoice?: string;
    minimaxVoice?: string;
    cosyVoice?: string;
    qwenVoice?: string;
    instructions: string;
  };
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
  speakerId: SpeakerId;
  intent: "open" | "context" | "intuition" | "business" | "technical" | "challenge" | "followup" | "transition" | "summary" | "user_input";
  text: string;
  source?: "ai" | "user";
  interrupted?: boolean;
  createdAt?: string;
};

export type AgentTraceLevel = "info" | "warning" | "debug";

export type AgentTraceRecord = {
  id: string;
  level: AgentTraceLevel;
  agentId: string;
  agentLabel: string;
  phase: string;
  message: string;
  sources?: Source[];
  createdAt: string;
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
  agentTrace?: AgentTraceRecord[];
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

export type DraftGenerationMode = "single" | "multi_agent" | "autonomous_agent";
export type DiscussionDepth = "low" | "medium" | "high";
export type AgentGenerationEngine = "native" | "python_remote";

export type ProviderSettings = {
  providerId: string;
  baseUrl: string;
  apiKey?: string;
  selectedModel?: string;
  draftGenerationMode?: DraftGenerationMode;
};

export type AgentRuntimeSettings = {
  generationEngine: AgentGenerationEngine;
  pythonAgentBaseUrl: string;
  discussionDepth: DiscussionDepth;
  searchBaseUrl: string;
  searchApiKey?: string;
  searchLanguage: string;
  searchMaxResults: number;
  searchRecencyDays?: number;
  debugTraceEnabled: boolean;
};

export type SupplementalDocument = {
  id: string;
  name: string;
  path: string;
  content: string;
};

export type AutonomousDraftOptions = {
  sessionId: string;
  discussionDepth: DiscussionDepth;
  supplementalDocuments: SupplementalDocument[];
};

export type AgentProgressEvent = {
  sessionId: string;
  agentId: string;
  agentLabel: string;
  phase: string;
  status: "queued" | "running" | "succeeded" | "failed" | "warning";
  progress: number;
  message: string;
  severity: AgentTraceLevel;
  turnIndex?: number;
};

export type DraftDeltaEvent = {
  sessionId: string;
  kind: "turn" | "token" | "final";
  turn?: DialogueTurn;
  textDelta?: string;
};

export type InteractiveRoundtableStatus = "idle" | "running" | "awaiting_user" | "interrupted" | "finished" | "failed";

export type InteractiveSessionEvent = {
  sessionId: string;
  status: InteractiveRoundtableStatus;
  message: string;
  draft?: EpisodeDraft;
  activeSpeakerId?: SpeakerId;
};

export type TtsSettings = {
  providerId: "openai" | "dashscope";
  baseUrl: string;
  apiKey?: string;
  selectedModel: string;
};

export type AsrSettings = {
  providerId: "dashscope";
  baseUrl: string;
  apiKey?: string;
  selectedModel: string;
};
