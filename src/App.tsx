import { startTransition, useEffect, useMemo, useRef, useState, type ChangeEvent, type ElementRef, type ReactNode } from "react";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Activity,
  ArrowRight,
  BarChart2,
  BookOpen,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  DollarSign,
  Download,
  Eye,
  Flame,
  FileText,
  Layers,
  LineChart,
  Lock,
  Mic,
  PenLine,
  Pause,
  Plus,
  Radio,
  RefreshCcw,
  Rss,
  Save,
  Search,
  Settings,
  Shield,
  Sparkles,
  Terminal,
  TrendingUp,
  Users,
  X,
  Zap
} from "lucide-react";
import {
  addManualHotspot,
  exportEpisodeMp3,
  finishInteractiveRoundtable,
  generateEpisodeDraft,
  generateAutonomousEpisodeDraft,
  getAsrSettings,
  getAgentRuntimeSettings,
  generateRoundtablePlan,
  getAppDataDir,
  getModelCatalog,
  getProviderSettings,
  getTtsSettings,
  getFeeds,
  getHotspotCandidates,
  interruptInteractiveRoundtable,
  importManualAttachment,
  listEpisodeDrafts,
  openExternalUrl,
  refreshModelCatalog as refreshModelCatalogFromBackend,
  saveEpisodeDraft,
  saveFeeds,
  saveHotspotCandidates,
  saveAsrSettings,
  saveAgentRuntimeSettings,
  saveProviderSettings,
  saveTtsSettings,
  searchHotspots,
  startInteractiveRoundtable,
  submitInteractiveUserTurn,
  transcribeAudioWithParaformer,
  validateProviderConnection,
  validateTtsConnection,
  writeBinaryFile,
  writeTextFile
} from "./lib/tauriClient";
import type { ManualAttachmentImportResult, ManualHotspotInput } from "./lib/tauriClient";
import { addDays, MAX_HOTSPOT_RANGE_DAYS, normalizeDateRange, type ChangedDateBoundary } from "./lib/dateRange";
import { getCategoryGenerationSelection, getPostFetchSelectionState } from "./lib/workflowSelection";
import { resolveHotspotDisplayCategory, type HotspotDisplayCategoryKey } from "./lib/hotspotClassification";
import { finalizeHotspotCategories } from "./lib/hotspotEmbeddingClassifier";
import { getPlanTopicDisplay } from "./lib/roundtablePlan";
import type {
  AgentProgressEvent,
  AgentRuntimeSettings,
  AsrSettings,
  DialogueTurn,
  DiscussionDepth,
  DraftDeltaEvent,
  DraftGenerationMode,
  EpisodeDraft,
  FeedSource,
  GenerationJob,
  HotspotCandidate,
  HotspotFilters,
  InteractiveSessionEvent,
  ModelProvider,
  ProviderSettings,
  RoundtablePlan,
  SupplementalDocument,
  TtsSettings
} from "./types";

void saveAsrSettings;

const RSS_PRESETS: FeedSource[] = [
  { id: "sspai", name: "少数派", url: "https://sspai.com/feed", category: "developer", enabled: true, lastStatus: "idle" },
  { id: "36kr", name: "36氪", url: "https://36kr.com/feed", category: "market", enabled: true, lastStatus: "idle" },
  { id: "leiphone", name: "雷峰网", url: "https://www.leiphone.com/feed", category: "market", enabled: true, lastStatus: "idle" },
  { id: "ithome", name: "IT之家", url: "https://www.ithome.com/rss/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "geekpark", name: "极客公园", url: "https://www.geekpark.net/rss", category: "market", enabled: true, lastStatus: "idle" },
  { id: "qbitai", name: "量子位", url: "https://www.qbitai.com/feed", category: "market", enabled: true, lastStatus: "idle" },
  { id: "the-decoder", name: "The Decoder", url: "https://the-decoder.com/feed/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "techcrunch-ai", name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "nvidia-ai-blog", name: "NVIDIA AI Blog", url: "https://blogs.nvidia.com/blog/category/deep-learning/feed/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "venturebeat-ai", name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "microsoft-ai-blog", name: "Microsoft AI Blog", url: "https://blogs.microsoft.com/ai/feed/", category: "company", enabled: true, lastStatus: "idle" },
  { id: "mit-news-ai", name: "MIT News AI", url: "https://news.mit.edu/topic/artificial-intelligence2-rss.xml", category: "research", enabled: true, lastStatus: "idle" },
  { id: "google-ai-blog", name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", category: "company", enabled: true, lastStatus: "idle" },
  { id: "openai-blog", name: "OpenAI Blog", url: "https://openai.com/news/rss.xml", category: "company", enabled: true, lastStatus: "idle" },
  { id: "anthropic-news", name: "Anthropic News", url: "https://www.anthropic.com/news/rss.xml", category: "company", enabled: true, lastStatus: "idle" },
  { id: "huggingface-blog", name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", category: "developer", enabled: true, lastStatus: "idle" },
  { id: "arxiv-ai", name: "arXiv AI", url: "https://export.arxiv.org/rss/cs.AI", category: "research", enabled: true, lastStatus: "idle" },
  { id: "github-blog-ai", name: "GitHub Blog AI", url: "https://github.blog/ai-and-ml/feed/", category: "developer", enabled: true, lastStatus: "idle" }
];

const productNavItems = [
  { id: "workbench", label: "首页", icon: CalendarDays },
  { id: "hotspots", label: "热点库", icon: Flame },
  { id: "roundtable", label: "圆桌", icon: Users },
  { id: "history", label: "历史", icon: Clock },
  { id: "settings", label: "设置", icon: Settings }
] as const;

type AppView = (typeof productNavItems)[number]["id"];
type HotspotTab = "candidates" | "feeds" | "manual";
type RoundtableStep = "plan" | "draft";

const DEFAULT_PROVIDER_ID = "deepseek";
const DEFAULT_TTS_SETTINGS: TtsSettings = {
  providerId: "dashscope",
  baseUrl: "https://dashscope.aliyuncs.com/api/v1",
  apiKey: "",
  selectedModel: "MiniMax/speech-2.8-hd"
};
const DEFAULT_ASR_SETTINGS: AsrSettings = {
  providerId: "dashscope",
  baseUrl: "wss://dashscope.aliyuncs.com/api-ws/v1/inference",
  apiKey: "",
  selectedModel: "paraformer-realtime-v2"
};
const DEFAULT_AGENT_RUNTIME_SETTINGS: AgentRuntimeSettings = {
  generationEngine: "native",
  pythonAgentBaseUrl: "http://127.0.0.1:8787",
  discussionDepth: "medium",
  searchBaseUrl: "",
  searchApiKey: "",
  searchLanguage: "zh-CN",
  searchMaxResults: 5,
  searchRecencyDays: 14,
  debugTraceEnabled: false
};
const TTS_PROVIDER_OPTIONS: Array<{
  id: TtsSettings["providerId"];
  name: string;
  baseUrl: string;
  models: string[];
  apiKeyPlaceholder: string;
}> = [
  {
    id: "openai",
    name: "OpenAI TTS",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o-mini-tts", "gpt-4o-mini-tts-2025-12-15", "tts-1", "tts-1-hd"],
    apiKeyPlaceholder: "输入 OpenAI API Key；MP3 导出前会检查 TTS 模型连通性"
  },
  {
    id: "dashscope",
    name: "DashScope TTS",
    baseUrl: "https://dashscope.aliyuncs.com/api/v1",
    models: ["MiniMax/speech-2.8-hd", "cosyvoice-v3.5-plus"],
    apiKeyPlaceholder: "输入 DashScope API Key；也就是 DASHSCOPE_API_KEY 对应的密钥"
  }
];

function App() {
  const [activeView, setActiveView] = useState<AppView>("workbench");
  const [hotspotTab, setHotspotTab] = useState<HotspotTab>("candidates");
  const [roundtableStep, setRoundtableStep] = useState<RoundtableStep>("plan");
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [hotspots, setHotspots] = useState<HotspotCandidate[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotCandidate | null>(null);
  const [selectedHotspotIds, setSelectedHotspotIds] = useState<string[]>([]);
  const [roundtablePlan, setRoundtablePlan] = useState<RoundtablePlan | null>(null);
  const [episodeDraft, setEpisodeDraft] = useState<EpisodeDraft | null>(null);
  const [lastSavedPath, setLastSavedPath] = useState("");
  const [filters, setFilters] = useState<HotspotFilters>(() => ({
    ...getCurrentWeekRange(),
    tag: "all",
    source: "all"
  }));
  const [modelCatalog, setModelCatalog] = useState<ModelProvider[]>([]);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings[]>([]);
  const [ttsSettings, setTtsSettings] = useState<TtsSettings>(DEFAULT_TTS_SETTINGS);
  const [asrSettings, setAsrSettings] = useState<AsrSettings>(DEFAULT_ASR_SETTINGS);
  const [agentRuntimeSettings, setAgentRuntimeSettings] = useState<AgentRuntimeSettings>(DEFAULT_AGENT_RUNTIME_SETTINGS);
  const [selectedProviderId, setSelectedProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [selectedModel, setSelectedModel] = useState("deepseek-chat");
  const [draftGenerationMode, setDraftGenerationMode] = useState<DraftGenerationMode>("single");
  const [discussionDepth, setDiscussionDepth] = useState<DiscussionDepth>("medium");
  const [supplementalDocuments, setSupplementalDocuments] = useState<SupplementalDocument[]>([]);
  const [, setAgentProgress] = useState<Record<string, AgentProgressEvent>>({});
  const [, setStreamingTurns] = useState<DialogueTurn[]>([]);
  const [activeAgentSessionId, setActiveAgentSessionId] = useState("");
  const activeAgentSessionRef = useRef("");
  const [interactiveSessionId, setInteractiveSessionId] = useState("");
  const interactiveSessionRef = useRef("");
  const [interactiveStatus, setInteractiveStatus] = useState<InteractiveSessionEvent | null>(null);
  const [userInterjectionText, setUserInterjectionText] = useState("");
  const [isVoiceTranscribing, setIsVoiceTranscribing] = useState(false);
  const [historyDrafts, setHistoryDrafts] = useState<EpisodeDraft[]>([]);
  const [selectedHistoryDraft, setSelectedHistoryDraft] = useState<EpisodeDraft | null>(null);
  const [appDataDir, setAppDataDir] = useState("");
  const [job, setJob] = useState<GenerationJob>({
    id: "job-001",
    type: "fetch",
    status: "idle",
    message: "等待连接 Tauri 后端"
  });

  const selectedHotspots = useMemo(
    () => hotspots.filter((hotspot) => selectedHotspotIds.includes(hotspot.id)),
    [hotspots, selectedHotspotIds]
  );
  const generationHotspot = useMemo(
    () => mergeHotspots(selectedHotspots),
    [selectedHotspots]
  );
  const filteredHotspots = useMemo(() => filterHotspots(hotspots, filters), [hotspots, filters]);
  const availableTags = useMemo(() => Array.from(new Set(hotspots.flatMap((hotspot) => hotspot.matchedSignals))).sort(), [hotspots]);
  const availableSources = useMemo(
    () => Array.from(new Set(hotspots.flatMap((hotspot) => hotspot.sources.map((source) => source.publisher)))).sort(),
    [hotspots]
  );

  useEffect(() => {
    void (async () => {
      try {
        const icon = await defaultWindowIcon();
        if (icon) {
          await getCurrentWindow().setIcon(icon);
        }
      } catch (error) {
        console.warn("Unable to apply window icon", error);
      }
    })();

    void (async () => {
      try {
        setJob({ id: "job-init", type: "fetch", status: "running", message: "正在连接 Tauri 后端" });
        const [feedResult, catalogResult, settingsResult, ttsSettingsResult, asrSettingsResult, agentSettingsResult, historyResult, appDataDirResult, candidateResult] = await Promise.all([
          getFeeds(),
          getModelCatalog(),
          getProviderSettings(),
          getTtsSettings(),
          getAsrSettings(),
          getAgentRuntimeSettings(),
          listEpisodeDrafts(),
          getAppDataDir(),
          getHotspotCandidates()
        ]);
        setFeeds(feedResult);
        setHotspots(candidateResult);
        setAppDataDir(appDataDirResult);
        let nextCatalog = catalogResult.filter((item) => item.id !== "mock");
        const startupProvider = nextCatalog.find((item) => item.id === DEFAULT_PROVIDER_ID) ?? nextCatalog[0];
        const startupSettings = settingsResult.find((item) => item.providerId === startupProvider?.id);
        if (startupSettings?.apiKey) {
          try {
            nextCatalog = (await refreshModelCatalogFromBackend(startupSettings)).filter((item) => item.id !== "mock");
          } catch (error) {
            console.warn("Unable to refresh model catalog during startup", error);
          }
        }
        setModelCatalog(nextCatalog);
        setProviderSettings(settingsResult);
        setTtsSettings(ttsSettingsResult);
        setAsrSettings(asrSettingsResult);
        setAgentRuntimeSettings(agentSettingsResult);
        setDiscussionDepth(agentSettingsResult.discussionDepth);
        setHistoryDrafts(historyResult);
        const provider = nextCatalog.find((item) => item.id === DEFAULT_PROVIDER_ID) ?? nextCatalog[0];
        if (provider) {
          setSelectedProviderId(provider.id);
          const saved = settingsResult.find((item) => item.providerId === provider.id);
          setSelectedModel(saved?.selectedModel ?? provider.models[0] ?? "");
          setDraftGenerationMode(saved?.draftGenerationMode ?? "single");
        }
        let nextCandidates = candidateResult;
        if (candidateResult.some((hotspot) => !hotspot.displayCategory)) {
          setJob({ id: "job-classify", type: "fetch", status: "running", message: "正在为历史热点补充分类（首次需下载嵌入模型）" });
          nextCandidates = await finalizeHotspotCategories(candidateResult, candidateResult);
          await saveHotspotCandidates(nextCandidates);
          setHotspots(nextCandidates);
        }
        setJob({ id: "job-init", type: "fetch", status: "succeeded", message: `后端已连接，已加载 ${feedResult.length} 个 RSS 源${nextCandidates.length ? `、${nextCandidates.length} 条热点` : ""}` });
      } catch (error) {
        setJob({ id: "job-init", type: "fetch", status: "failed", message: formatError(error, "无法连接 Tauri 后端，请使用 npm.cmd run tauri:dev（Windows）或 npm run tauri:dev（macOS）打开桌面窗口") });
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedHotspot && !filteredHotspots.some((hotspot) => hotspot.id === selectedHotspot.id)) {
      setSelectedHotspot(filteredHotspots[0] ?? null);
    }
    setSelectedHotspotIds((current) => current.filter((id) => filteredHotspots.some((hotspot) => hotspot.id === id)));
  }, [filteredHotspots, selectedHotspot]);

  useEffect(() => {
    activeAgentSessionRef.current = activeAgentSessionId;
  }, [activeAgentSessionId]);

  useEffect(() => {
    interactiveSessionRef.current = interactiveSessionId;
  }, [interactiveSessionId]);

  useEffect(() => {
    let cleanupProgress: (() => void) | undefined;
    let cleanupDelta: (() => void) | undefined;
    let cancelled = false;

    void listen<AgentProgressEvent>("roundtable://agent-progress", (event) => {
      const sessionId = activeAgentSessionRef.current;
      if (!sessionId || event.payload.sessionId !== sessionId) return;
      setAgentProgress((current) => ({
        ...current,
        [event.payload.agentId]: event.payload
      }));
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        cleanupProgress = unlisten;
      }
    });

    void listen<DraftDeltaEvent>("roundtable://draft-delta", (event) => {
      const sessionId = activeAgentSessionRef.current;
      const interactiveId = interactiveSessionRef.current;
      if ((!sessionId || event.payload.sessionId !== sessionId) && (!interactiveId || event.payload.sessionId !== interactiveId)) return;
      if (event.payload.kind === "turn" && event.payload.turn) {
        const turn = event.payload.turn as DialogueTurn;
        setStreamingTurns((current) => upsertFinalTurn(current, turn));
        setEpisodeDraft((current) =>
          current
            ? {
                ...current,
                dialogue: upsertFinalTurn(current.dialogue, turn),
                updatedAt: new Date().toISOString()
              }
            : current
        );
      }
      if (event.payload.kind === "token" && event.payload.turn && event.payload.textDelta) {
        const turn = event.payload.turn as DialogueTurn;
        const textDelta = event.payload.textDelta;
        setStreamingTurns((current) => appendTokenToTurns(current, turn, textDelta));
        setEpisodeDraft((current) =>
          current
            ? {
                ...current,
                dialogue: appendTokenToTurns(current.dialogue, turn, textDelta),
                updatedAt: new Date().toISOString()
              }
            : current
        );
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        cleanupDelta = unlisten;
      }
    });

    return () => {
      cancelled = true;
      cleanupProgress?.();
      cleanupDelta?.();
    };
  }, []);

  useEffect(() => {
    let cleanupInteractive: (() => void) | undefined;
    let cancelled = false;

    void listen<InteractiveSessionEvent>("roundtable://interactive-state", (event) => {
      const sessionId = interactiveSessionRef.current;
      if (!sessionId || event.payload.sessionId !== sessionId) return;
      setInteractiveStatus(event.payload);
      if (event.payload.draft) {
        setEpisodeDraft(event.payload.draft);
      }
      if (event.payload.status === "awaiting_user" || event.payload.status === "interrupted") {
        setRoundtableStep("draft");
        setActiveView("roundtable");
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        cleanupInteractive = unlisten;
      }
    });

    return () => {
      cancelled = true;
      cleanupInteractive?.();
    };
  }, []);

  async function loadFeeds() {
    try {
      setJob({ id: "job-feeds", type: "fetch", status: "running", message: "正在读取本地 RSS 源配置" });
      const result = await getFeeds();
      setFeeds(result);
      setJob({ id: "job-feeds", type: "fetch", status: "succeeded", message: `已加载 ${result.length} 个 RSS 源` });
    } catch (error) {
      setJob({ id: "job-feeds", type: "fetch", status: "failed", message: formatError(error, "无法连接 Tauri 后端，请使用 npm.cmd run tauri:dev（Windows）或 npm run tauri:dev（macOS）打开桌面窗口") });
    }
  }

  async function runFetch() {
    try {
      setJob({ id: "job-fetch", type: "fetch", status: "running", message: "正在由 Rust 后端抓取 RSS，可能需要几十秒" });
      const result = await searchHotspots();
      setJob({
        id: "job-classify",
        type: "fetch",
        status: "running",
        message: "正在加载本地嵌入模型并分类热点（首次需下载模型）"
      });
      const classified = await finalizeHotspotCategories(result, hotspots);
      await saveHotspotCandidates(classified);
      const nextFiltered = filterHotspots(classified, filters);
      const nextSelection = getPostFetchSelectionState(classified, nextFiltered);
      startTransition(() => {
        setHotspots(classified);
        setSelectedHotspot(nextSelection.focusedHotspot);
        setSelectedHotspotIds(nextSelection.selectedHotspotIds);
        setRoundtablePlan(null);
        setEpisodeDraft(null);
        setActiveView("hotspots");
      });
      setJob({ id: "job-fetch", type: "fetch", status: "succeeded", message: `抓取并分类完成，发现 ${classified.length} 个候选热点` });
      await loadFeeds();
    } catch (error) {
      setJob({ id: "job-fetch", type: "fetch", status: "failed", message: formatError(error, "RSS 抓取失败") });
    }
  }

  function setCurrentWeekRange() {
    setFilters((current) => ({
      ...current,
      ...getCurrentWeekRange()
    }));
    setJob({ id: "job-week", type: "fetch", status: "succeeded", message: "已设置为本周时间范围，可继续筛选候选热点" });
  }

  function updateDateRange(startDate: string, endDate: string, changed: ChangedDateBoundary = "endDate") {
    const normalized = normalizeDateRange({ startDate, endDate }, changed);
    setFilters((current) => ({ ...current, ...normalized }));
    setJob({ id: "job-date-range", type: "fetch", status: "succeeded", message: "日期范围已更新，可继续抓取或筛选热点" });
  }

  function clearFilters() {
    setFilters({ ...getCurrentWeekRange(), tag: "all", source: "all" });
  }

  async function refreshModelCatalog() {
    try {
      setJob({ id: "job-models", type: "fetch", status: "running", message: "正在更新厂商和模型选项" });
      const catalog = await getModelCatalog();
      const visibleCatalog = catalog.filter((item) => item.id !== "mock");
      setModelCatalog(visibleCatalog);
      const provider = visibleCatalog.find((item) => item.id === selectedProviderId) ?? visibleCatalog.find((item) => item.id === DEFAULT_PROVIDER_ID) ?? visibleCatalog[0];
      if (provider) {
        setSelectedProviderId(provider.id);
        setSelectedModel(provider.models[0] ?? "");
      }
      setJob({ id: "job-models", type: "fetch", status: "succeeded", message: `已更新 ${catalog.length} 个模型厂商` });
    } catch (error) {
      setJob({ id: "job-models", type: "fetch", status: "failed", message: formatError(error, "更新模型列表失败") });
    }
  }

  async function toggleFeed(feedId: string) {
    const nextFeeds = feeds.map((feed) => (feed.id === feedId ? { ...feed, enabled: !feed.enabled } : feed));
    setFeeds(nextFeeds);
    try {
      const saved = await saveFeeds(nextFeeds);
      setFeeds(saved);
      setJob({ id: "job-feeds-save", type: "save", status: "succeeded", message: "RSS 源配置已写入本地 JSON" });
    } catch (error) {
      setJob({ id: "job-feeds-save", type: "save", status: "failed", message: formatError(error, "保存 RSS 源配置失败") });
    }
  }

  async function addFeed(feed: FeedSource) {
    const nextFeeds = [feed, ...feeds.filter((item) => item.id !== feed.id && item.url !== feed.url)];
    setFeeds(nextFeeds);
    try {
      setJob({ id: "job-feeds-add", type: "save", status: "running", message: "正在保存新增 RSS 源" });
      const saved = await saveFeeds(nextFeeds);
      setFeeds(saved);
      setJob({ id: "job-feeds-add", type: "save", status: "succeeded", message: `RSS 源已添加：${feed.name}` });
    } catch (error) {
      setJob({ id: "job-feeds-add", type: "save", status: "failed", message: formatError(error, "新增 RSS 源失败") });
    }
  }

  async function handleManualAdd(input: ManualHotspotInput) {
    try {
      setJob({ id: "job-manual", type: "save", status: "running", message: "正在写入手动补充热点" });
      const candidate = await addManualHotspot({ ...input, category: "other" });
      setJob({ id: "job-classify", type: "fetch", status: "running", message: "正在用本地嵌入模型分类手动热点" });
      const [classified] = await finalizeHotspotCategories([candidate], hotspots);
      const nextHotspots = [classified, ...hotspots.filter((item) => item.id !== classified.id)];
      await saveHotspotCandidates(nextHotspots);
      setHotspots(nextHotspots);
      setSelectedHotspot(classified);
      setSelectedHotspotIds([classified.id]);
      setJob({ id: "job-manual", type: "save", status: "succeeded", message: "手动热点已写入本地候选池" });
      setHotspotTab("candidates");
      setActiveView("hotspots");
    } catch (error) {
      setJob({ id: "job-manual", type: "save", status: "failed", message: formatError(error, "手动热点写入失败") });
    }
  }

  async function importManualAttachmentFile(path: string): Promise<ManualAttachmentImportResult> {
    try {
      setJob({ id: "job-manual-attachment", type: "fetch", status: "running", message: "正在解析附件并保存到本地" });
      const result = await importManualAttachment(path);
      setJob({ id: "job-manual-attachment", type: "fetch", status: "succeeded", message: `附件解析完成，已保存到：${result.storedPath}` });
      return result;
    } catch (error) {
      setJob({ id: "job-manual-attachment", type: "fetch", status: "failed", message: formatError(error, "附件解析失败") });
      throw error;
    }
  }

  async function addSupplementalDocument() {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: "圆桌补充资料",
            extensions: ["pdf", "docx", "md", "markdown", "txt", "text"]
          }
        ]
      });
      if (typeof selected !== "string") return;
      const imported = await importManualAttachmentFile(selected);
      setSupplementalDocuments((current) => [
        ...current,
        {
          id: `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          name: imported.originalName,
          path: imported.storedPath,
          content: imported.content
        }
      ]);
    } catch (error) {
      window.alert(formatError(error, "补充资料导入失败"));
    }
  }

  async function saveAgentSettings(settings: AgentRuntimeSettings) {
    try {
      setJob({ id: "job-agent-settings", type: "save", status: "running", message: "正在保存 Agent 工具设置" });
      const saved = await saveAgentRuntimeSettings(settings);
      setAgentRuntimeSettings(saved);
      setDiscussionDepth(saved.discussionDepth);
      setJob({ id: "job-agent-settings", type: "save", status: "succeeded", message: "Agent 工具设置已保存" });
    } catch (error) {
      setJob({ id: "job-agent-settings", type: "save", status: "failed", message: formatError(error, "保存 Agent 工具设置失败") });
    }
  }

  async function generatePlan() {
    if (!generationHotspot) {
      setJob({ id: "job-plan", type: "plan", status: "failed", message: "请先选择一个热点候选" });
      return;
    }

    try {
      const settings = currentProviderSettings();
      const connected = await ensureLlmConnected(settings, "生成议程前模型连接检查失败");
      if (!connected) return;
      const startedAt = performance.now();
      setJob({ id: "job-plan", type: "plan", status: "running", message: "正在生成圆桌议程" });
      const plan = await generateRoundtablePlan(generationHotspot, settings);
      const elapsed = Math.round(performance.now() - startedAt);
      console.info(`[AI timing] generate_roundtable_plan ${elapsed}ms`);
      setRoundtablePlan(plan);
      setEpisodeDraft(null);
      setJob({ id: "job-plan", type: "plan", status: "succeeded", message: `圆桌议程已生成，用时 ${elapsed}ms` });
      setRoundtableStep("plan");
      setActiveView("roundtable");
    } catch (error) {
      setJob({ id: "job-plan", type: "plan", status: "failed", message: formatError(error, "生成议程失败") });
      showLlmSettingsPrompt(error, "生成议程失败，模型连接或调用没有成功。");
    }
  }

  async function generateDraft() {
    if (!generationHotspot) {
      setJob({ id: "job-draft", type: "draft", status: "failed", message: "请先选择一个热点候选" });
      return;
    }

    try {
      const settings = currentProviderSettings();
      const connected = await ensureLlmConnected(settings, "生成稿件前模型连接检查失败");
      if (!connected) return;
      const startedAt = performance.now();
      setJob({ id: "job-draft", type: "draft", status: "running", message: "正在生成圆桌稿" });
      const plan = roundtablePlan ?? (await generateRoundtablePlan(generationHotspot, settings));
      let draft: EpisodeDraft;
      const sessionId = `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      activeAgentSessionRef.current = sessionId;
      setActiveAgentSessionId(sessionId);
      setStreamingTurns([]);
      setLastSavedPath("");
      setEpisodeDraft(createStreamingDraftShell(plan, generationHotspot));
      setRoundtableStep("draft");
      setActiveView("roundtable");
      if (settings.draftGenerationMode === "autonomous_agent") {
        setAgentProgress({
          controller: {
            sessionId,
            agentId: "controller",
            agentLabel: "中控 Agent",
            phase: "启动运行时",
            status: "running",
            progress: 4,
            message: "正在启动 Native Rust 强自治圆桌运行时",
            severity: "info"
          }
        });
        setStreamingTurns([]);
        draft = await generateAutonomousEpisodeDraft(plan, generationHotspot, settings, {
          sessionId,
          discussionDepth,
          supplementalDocuments
        }, agentRuntimeSettings);
      } else {
        setAgentProgress(
          settings.draftGenerationMode === "multi_agent"
            ? {
                controller: {
                  sessionId,
                  agentId: "controller",
                  agentLabel: "中控 Agent",
                  phase: "规划轮次",
                  status: "running",
                  progress: 8,
                  message: "正在规划圆桌发言顺序",
                  severity: "info"
                }
              }
            : {}
        );
        draft = await generateEpisodeDraft(plan, generationHotspot, settings, sessionId);
      }
      const elapsed = Math.round(performance.now() - startedAt);
      console.info(`[AI timing] generate_episode_draft ${elapsed}ms`);
      setRoundtablePlan(plan);
      setEpisodeDraft(draft);
      setLastSavedPath("");
      setJob({ id: "job-draft", type: "draft", status: "succeeded", message: `圆桌稿已生成，用时 ${elapsed}ms` });
      setRoundtableStep("draft");
      setActiveView("roundtable");
    } catch (error) {
      setJob({ id: "job-draft", type: "draft", status: "failed", message: formatError(error, "生成稿件失败") });
      showLlmSettingsPrompt(error, "生成稿件失败，模型连接或调用没有成功。");
    }
  }

  async function startInteractiveDraft() {
    if (!generationHotspot) {
      setJob({ id: "job-interactive", type: "draft", status: "failed", message: "请先选择一个热点候选" });
      return;
    }

    try {
      const settings = interactiveProviderSettings();
      const plan = roundtablePlan ?? (await generateRoundtablePlan(generationHotspot, settings));
      const sessionId = `interactive-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      interactiveSessionRef.current = sessionId;
      setInteractiveSessionId(sessionId);
      setInteractiveStatus({
        sessionId,
        status: "running",
        message: "互动圆桌正在启动"
      });
      setUserInterjectionText("");
      setStreamingTurns([]);
      setLastSavedPath("");
      setRoundtablePlan(plan);
      setRoundtableStep("draft");
      setActiveView("roundtable");
      setJob({ id: "job-interactive", type: "draft", status: "running", message: "互动圆桌正在生成，可随时打断" });
      const draft = await startInteractiveRoundtable(plan, generationHotspot, settings, sessionId);
      setEpisodeDraft(draft);
    } catch (error) {
      setJob({ id: "job-interactive", type: "draft", status: "failed", message: formatError(error, "启动互动圆桌失败") });
      showLlmSettingsPrompt(error, "启动互动圆桌失败，模型连接或调用没有成功。");
    }
  }

  async function interruptInteractiveDraft() {
    if (!interactiveSessionId) return;
    try {
      await interruptInteractiveRoundtable(interactiveSessionId);
      setInteractiveStatus((current) =>
        current
          ? { ...current, status: "interrupted", message: "正在停止当前 AI 发言，稍后可输入你的观点。" }
          : { sessionId: interactiveSessionId, status: "interrupted", message: "正在停止当前 AI 发言，稍后可输入你的观点。" }
      );
      setJob({ id: "job-interrupt", type: "draft", status: "running", message: "正在打断当前 AI 发言" });
    } catch (error) {
      setJob({ id: "job-interrupt", type: "draft", status: "failed", message: formatError(error, "打断失败") });
    }
  }

  async function submitInteractiveText(text: string) {
    if (!interactiveSessionId) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setJob({ id: "job-user-turn", type: "draft", status: "failed", message: "请输入你的发言" });
      return;
    }
    try {
      const draft = await submitInteractiveUserTurn(interactiveSessionId, trimmed);
      setEpisodeDraft(draft);
      setUserInterjectionText("");
      setInteractiveStatus({
        sessionId: interactiveSessionId,
        status: "running",
        message: "已插入你的发言，中控 agent 正在重排后续嘉宾回应。",
        draft
      });
      setJob({ id: "job-user-turn", type: "draft", status: "running", message: "用户发言已插入，正在继续互动圆桌" });
    } catch (error) {
      setJob({ id: "job-user-turn", type: "draft", status: "failed", message: formatError(error, "提交用户发言失败") });
    }
  }

  async function finishInteractiveDraft() {
    if (!interactiveSessionId) return;
    try {
      const draft = await finishInteractiveRoundtable(interactiveSessionId);
      setEpisodeDraft(draft);
      setInteractiveStatus({
        sessionId: interactiveSessionId,
        status: "finished",
        message: "互动圆桌已收束，可以保存草稿。",
        draft
      });
      setJob({ id: "job-interactive-finish", type: "draft", status: "succeeded", message: "互动圆桌已收束" });
    } catch (error) {
      setJob({ id: "job-interactive-finish", type: "draft", status: "failed", message: formatError(error, "结束互动圆桌失败") });
    }
  }

  async function transcribeVoiceInterjection(audioBase64: string) {
    try {
      setIsVoiceTranscribing(true);
      const text = await transcribeAudioWithParaformer(asrSettings, audioBase64);
      setUserInterjectionText((current) => `${current}${current.trim() ? "\n" : ""}${text}`.trim());
      setJob({ id: "job-asr", type: "fetch", status: "succeeded", message: "语音已转成文字，请确认后发送" });
    } catch (error) {
      setJob({ id: "job-asr", type: "fetch", status: "failed", message: formatError(error, "语音转文字失败，可继续使用文字输入") });
    } finally {
      setIsVoiceTranscribing(false);
    }
  }

  async function saveDraft() {
    if (!episodeDraft) {
      setJob({ id: "job-save", type: "save", status: "failed", message: "当前没有可保存的草稿" });
      return;
    }

    try {
      setJob({ id: "job-save", type: "save", status: "running", message: "正在写入本地 JSON 草稿" });
      const path = await saveEpisodeDraft(episodeDraft);
      setLastSavedPath(path);
      const history = await listEpisodeDrafts();
      setHistoryDrafts(history);
      setJob({ id: "job-save", type: "save", status: "succeeded", message: `草稿已保存：${path}` });
    } catch (error) {
      setJob({ id: "job-save", type: "save", status: "failed", message: formatError(error, "保存草稿失败") });
    }
  }

  async function loadHistory() {
    try {
      setJob({ id: "job-history", type: "fetch", status: "running", message: "正在读取本地圆桌历史" });
      const history = await listEpisodeDrafts();
      setHistoryDrafts(history);
      setSelectedHistoryDraft(history[0] ?? null);
      setJob({ id: "job-history", type: "fetch", status: "succeeded", message: `已读取 ${history.length} 篇圆桌草稿` });
    } catch (error) {
      setJob({ id: "job-history", type: "fetch", status: "failed", message: formatError(error, "读取圆桌历史失败") });
    }
  }

  function updatePlanAgenda(index: number, value: string) {
    if (!roundtablePlan) return;
    setRoundtablePlan({
      ...roundtablePlan,
      agenda: roundtablePlan.agenda.map((item, itemIndex) => (itemIndex === index ? value : item))
    });
  }

  function updatePlanTension(index: number, value: string) {
    if (!roundtablePlan) return;
    setRoundtablePlan({
      ...roundtablePlan,
      tensionPoints: roundtablePlan.tensionPoints.map((item, itemIndex) => (itemIndex === index ? value : item))
    });
  }

  function updatePlanTopicTitle(value: string) {
    if (!roundtablePlan) return;
    setRoundtablePlan({
      ...roundtablePlan,
      topicTitle: value
    });
  }

  function updatePlanTopicSummary(value: string) {
    if (!roundtablePlan) return;
    setRoundtablePlan({
      ...roundtablePlan,
      topicSummary: value
    });
  }

  async function refreshModelsFromProvider(settings: ProviderSettings) {
    try {
      setJob({ id: "job-models", type: "fetch", status: "running", message: "正在向模型厂商抓取模型列表" });
      const catalog = await refreshModelCatalogFromBackend(settings);
      const visibleCatalog = catalog.filter((item) => item.id !== "mock");
      setModelCatalog(visibleCatalog);
      const provider = visibleCatalog.find((item) => item.id === settings.providerId);
      if (provider) {
        setSelectedModel(provider.models[0] ?? "");
      }
      setJob({ id: "job-models", type: "fetch", status: "succeeded", message: "模型列表已更新" });
    } catch (error) {
      setJob({ id: "job-models", type: "fetch", status: "failed", message: formatError(error, "更新模型列表失败") });
    }
  }

  async function saveSettings(settings: ProviderSettings) {
    let settingsSaved = false;
    try {
      setJob({ id: "job-settings-save", type: "save", status: "running", message: "正在保存模型设置" });
      const saved = await saveProviderSettings(settings);
      settingsSaved = true;
      setProviderSettings(saved);
      setJob({ id: "job-settings-models", type: "save", status: "running", message: "设置已保存，正在更新模型列表" });
      const catalog = await refreshModelCatalogFromBackend(settings);
      const visibleCatalog = catalog.filter((item) => item.id !== "mock");
      setModelCatalog(visibleCatalog);

      const provider = visibleCatalog.find((item) => item.id === settings.providerId);
      const refreshedModel =
        provider?.models.find((model) => model === settings.selectedModel) ?? provider?.models[0] ?? settings.selectedModel ?? "";
      setSelectedModel(refreshedModel);

      const savedWithRefreshedModel = await saveProviderSettings({
        ...settings,
        selectedModel: refreshedModel
      });
      setProviderSettings(savedWithRefreshedModel);
      setJob({
        id: "job-settings",
        type: "save",
        status: "succeeded",
        message: `模型设置已保存，模型列表已更新${provider ? `：${provider.models.length} 个模型` : ""}`
      });
    } catch (error) {
      const fallback = settingsSaved ? "模型设置已保存，但更新模型列表失败" : "保存模型设置失败";
      setJob({ id: "job-settings", type: "save", status: "failed", message: formatError(error, fallback) });
      showLlmSettingsPrompt(error, `${fallback}。`);
    }
  }

  async function saveTtsAudioSettings(settings: TtsSettings) {
    let settingsSaved = false;
    try {
      setJob({ id: "job-tts-save", type: "save", status: "running", message: "正在保存 TTS 配音设置" });
      const saved = await saveTtsSettings(settings);
      settingsSaved = true;
      setTtsSettings(saved);
      setJob({ id: "job-tts-check", type: "fetch", status: "running", message: "正在检查 TTS 模型连接" });
      const connectionMessage = await validateTtsConnection(saved);
      setJob({ id: "job-tts", type: "fetch", status: "succeeded", message: connectionMessage });
    } catch (error) {
      const fallback = settingsSaved ? "TTS 设置已保存，但模型连接检查失败" : "保存 TTS 设置失败";
      const message = formatError(error, fallback);
      setJob({ id: "job-tts", type: "fetch", status: "failed", message });
      setActiveView("settings");
      window.alert(`${message}\n\n请检查 TTS 页签里的厂商、Base URL、API Key 和模型。`);
    }
  }

  async function ensureLlmConnected(settings: ProviderSettings, fallback: string) {
    try {
      setJob({ id: "job-llm-check", type: "fetch", status: "running", message: "正在检查模型连接" });
      await validateProviderConnection(settings);
      return true;
    } catch (error) {
      setJob({ id: "job-llm-check", type: "fetch", status: "failed", message: formatError(error, fallback) });
      showLlmSettingsPrompt(error, fallback);
      return false;
    }
  }

  function showLlmSettingsPrompt(error: unknown, fallback: string) {
    const message = formatError(error, fallback);
    window.alert(`${message}\n\n请回到设置页检查厂商、Base URL、API Key 和模型。`);
    setActiveView("settings");
  }

  function toggleHotspotSelection(hotspot: HotspotCandidate) {
    setSelectedHotspot(hotspot);
    setSelectedHotspotIds((current) =>
      current.includes(hotspot.id)
        ? current.filter((id) => id !== hotspot.id)
        : [...current, hotspot.id]
    );
  }

  function selectCategoryForGeneration(articles: ZipArticle[]) {
    const nextSelection = getCategoryGenerationSelection(articles);
    setSelectedHotspot(nextSelection.focusedHotspot);
    setSelectedHotspotIds(nextSelection.selectedHotspotIds);
  }

  async function generatePlanFromCategory(articles: ZipArticle[]) {
    const nextSelection = getCategoryGenerationSelection(articles);
    setSelectedHotspot(nextSelection.focusedHotspot);
    setSelectedHotspotIds(nextSelection.selectedHotspotIds);

    const selectedIdSet = new Set(nextSelection.selectedHotspotIds);
    const categoryHotspots = articles.flatMap((article) =>
      article.hotspot && selectedIdSet.has(article.hotspot.id) ? [article.hotspot] : []
    );
    const categoryHotspot = mergeHotspots(categoryHotspots);
    if (!categoryHotspot) {
      setJob({ id: "job-plan-category", type: "plan", status: "failed", message: "No articles in this category can be used for roundtable generation." });
      return;
    }

    try {
      const settings = currentProviderSettings();
      const connected = await ensureLlmConnected(settings, "Category roundtable generation model connection failed");
      if (!connected) return;
      const startedAt = performance.now();
      setJob({ id: "job-plan", type: "plan", status: "running", message: "Generating roundtable agenda from this category" });
      const plan = await generateRoundtablePlan(categoryHotspot, settings);
      const elapsed = Math.round(performance.now() - startedAt);
      console.info(`[AI timing] generate_roundtable_plan ${elapsed}ms`);
      setRoundtablePlan(plan);
      setEpisodeDraft(null);
      setJob({ id: "job-plan", type: "plan", status: "succeeded", message: `Category roundtable agenda generated in ${elapsed}ms` });
      setRoundtableStep("plan");
      setActiveView("roundtable");
    } catch (error) {
      setJob({ id: "job-plan", type: "plan", status: "failed", message: formatError(error, "Category roundtable generation failed") });
      showLlmSettingsPrompt(error, "Category roundtable generation failed. Check model connection and settings.");
    }
  }

  function openHistoryDraft(draft: EpisodeDraft) {
    setSelectedHistoryDraft(draft);
  }

  function updateHistoryDraft(draft: EpisodeDraft) {
    setSelectedHistoryDraft(draft);
    setHistoryDrafts((current) => current.map((item) => (item.id === draft.id ? draft : item)));
    if (episodeDraft?.id === draft.id) {
      setEpisodeDraft(draft);
    }
  }

  function returnToHistoryList() {
    setSelectedHistoryDraft(null);
  }

  async function openSource(url: string) {
    try {
      await openExternalUrl(url);
    } catch (error) {
      setJob({ id: "job-open-source", type: "fetch", status: "failed", message: formatError(error, "打开来源失败") });
    }
  }

  async function openFirstHotspotSource(hotspot: HotspotCandidate) {
    const url = hotspot.sources[0]?.url;
    if (!url) {
      setJob({ id: "job-open-source", type: "fetch", status: "failed", message: "当前热点没有可打开的来源链接" });
      return;
    }
    await openSource(url);
  }

  function currentProviderSettings(): ProviderSettings {
    const provider = modelCatalog.find((item) => item.id === selectedProviderId);
    const saved = providerSettings.find((item) => item.providerId === selectedProviderId);
    return {
      providerId: selectedProviderId,
      baseUrl: saved?.baseUrl ?? provider?.baseUrl ?? "local",
      apiKey: saved?.apiKey,
      selectedModel,
      draftGenerationMode
    };
  }

  function interactiveProviderSettings(): ProviderSettings | undefined {
    const settings = currentProviderSettings();
    if (!settings.apiKey || !settings.selectedModel) {
      return {
        providerId: "mock",
        baseUrl: "local",
        selectedModel: "mock-interactive",
        draftGenerationMode: "multi_agent"
      };
    }
    return {
      ...settings,
      draftGenerationMode: "multi_agent"
    };
  }

  void lastSavedPath;
  void interactiveStatus;
  void isVoiceTranscribing;
  void selectedHistoryDraft;
  void availableTags;
  void availableSources;
  void setCurrentWeekRange;
  void updateDateRange;
  void clearFilters;
  void addSupplementalDocument;
  void interruptInteractiveDraft;
  void finishInteractiveDraft;
  void transcribeVoiceInterjection;
  void saveDraft;
  void refreshModelsFromProvider;
  void saveTtsAudioSettings;
  void openHistoryDraft;
  void updateHistoryDraft;
  void returnToHistoryList;

  async function exportCurrentDraft(format: "md" | "html" | "pdf" | "mp3") {
    if (!episodeDraft) {
      setJob({ id: "job-export", type: "save", status: "failed", message: "当前没有可导出的圆桌稿" });
      return;
    }
    try {
      setJob({ id: "job-export", type: "save", status: "running", message: `正在导出 ${format.toUpperCase()}` });
      const path = await saveDraftAs(episodeDraft, format);
      setJob({
        id: "job-export",
        type: "save",
        status: path ? "succeeded" : "idle",
        message: path ? `已导出：${path}` : "已取消导出"
      });
    } catch (error) {
      setJob({ id: "job-export", type: "save", status: "failed", message: formatError(error, "导出失败") });
    }
  }

  async function saveAsrAudioSettings(settings: AsrSettings) {
    try {
      setJob({ id: "job-asr-save", type: "save", status: "running", message: "正在保存 ASR 设置" });
      const saved = await saveAsrSettings(settings);
      setAsrSettings(saved);
      setJob({ id: "job-asr-save", type: "save", status: "succeeded", message: "ASR 设置已保存" });
    } catch (error) {
      setJob({ id: "job-asr-save", type: "save", status: "failed", message: formatError(error, "保存 ASR 设置失败") });
    }
  }

  async function openCurrentDraftSource() {
    const source = episodeDraft?.sources[0] ?? generationHotspot?.sources[0] ?? selectedHotspot?.sources[0];
    if (!source?.url) {
      setJob({ id: "job-open-source", type: "fetch", status: "failed", message: "当前没有可打开的来源" });
      return;
    }
    await openSource(source.url);
  }

  function setDraftStatus(status: EpisodeDraft["status"]) {
    if (!episodeDraft) {
      setJob({ id: "job-draft-status", type: "save", status: "failed", message: "当前没有可切换状态的草稿" });
      return;
    }
    setEpisodeDraft({ ...episodeDraft, status, updatedAt: new Date().toISOString() });
    setJob({ id: "job-draft-status", type: "save", status: "succeeded", message: `草稿状态已切换为：${statusLabel(status)}` });
  }

  async function testSettingsPanel(panel: "model" | "agent" | "tts" | "asr") {
    try {
      if (panel === "model") {
        await ensureLlmConnected(currentProviderSettings(), "模型连接测试失败");
        return;
      }
      if (panel === "tts") {
        setJob({ id: "job-tts-check", type: "fetch", status: "running", message: "正在测试 TTS 连接" });
        const message = await validateTtsConnection(ttsSettings);
        setJob({ id: "job-tts-check", type: "fetch", status: "succeeded", message });
        return;
      }
      setJob({
        id: `job-${panel}-check`,
        type: "fetch",
        status: "succeeded",
        message: panel === "agent" ? "Agent 运行时配置已读取" : "ASR 配置已读取，请在圆桌稿页用语音输入做端到端测试"
      });
    } catch (error) {
      setJob({ id: `job-${panel}-check`, type: "fetch", status: "failed", message: formatError(error, "连接测试失败") });
    }
  }

  const canOpenRoundtable = Boolean(roundtablePlan || episodeDraft);
  const showActivityBar = job.status === "running" && job.type !== "draft";

  function navigateTo(view: AppView) {
    if (view === "roundtable" && !canOpenRoundtable) {
      return;
    }
    if (view === "roundtable" && !roundtablePlan && episodeDraft) {
      setRoundtableStep("draft");
    }
    setActiveView(view);
  }

  const zipPage = (
    <ZipProductPage
      activeView={activeView}
      agentRuntimeSettings={agentRuntimeSettings}
      appDataDir={appDataDir}
      asrSettings={asrSettings}
      draft={episodeDraft}
      draftGenerationMode={draftGenerationMode}
      feeds={feeds}
      filters={filters}
      historyDrafts={historyDrafts}
      hotspotTab={hotspotTab}
      hotspots={filteredHotspots}
      interactiveSessionId={interactiveSessionId}
      interactiveStatus={interactiveStatus}
      job={job}
      modelCatalog={modelCatalog}
      onAddFeed={addFeed}
      onDateRangeChange={updateDateRange}
      onDraftGenerationModeChange={(mode) => {
        setDraftGenerationMode(mode);
        setDiscussionDepth(
          mode === "autonomous_agent" ? "high" : mode === "multi_agent" ? "medium" : "low"
        );
      }}
      onGenerateDraft={generateDraft}
      onGeneratePlan={generatePlan}
      onFinishInteractive={finishInteractiveDraft}
      onHistoryRefresh={loadHistory}
      onHotspotTabChange={setHotspotTab}
      onImportAttachment={async () => {
        const selected = await openDialog({
          multiple: false,
          filters: [
            { name: "Documents", extensions: ["pdf", "md", "txt", "html"] },
            { name: "All files", extensions: ["*"] }
          ]
        });
        if (typeof selected !== "string") return null;
        return importManualAttachmentFile(selected);
      }}
      onManualSubmit={handleManualAdd}
      onModelChange={setSelectedModel}
      onNavigate={navigateTo}
      onOpenDraftSource={openCurrentDraftSource}
      onOpenSource={openFirstHotspotSource}
      onInterruptInteractive={interruptInteractiveDraft}
      onProviderChange={(providerId) => {
        setSelectedProviderId(providerId);
        const provider = modelCatalog.find((item) => item.id === providerId);
        const saved = providerSettings.find((item) => item.providerId === providerId);
        setSelectedModel(provider?.models[0] ?? "");
        setDraftGenerationMode(saved?.draftGenerationMode ?? "single");
      }}
      onRefreshFeeds={loadFeeds}
      onRefreshFromProvider={refreshModelsFromProvider}
      onRefreshModels={refreshModelCatalog}
      onRoundtableStepChange={setRoundtableStep}
      onRunFetch={runFetch}
      onSaveAgentSettings={saveAgentSettings}
      onSaveAsrSettings={saveAsrAudioSettings}
      onSaveDraft={saveDraft}
      onSaveSettings={saveSettings}
      onSaveTtsSettings={saveTtsAudioSettings}
      onSelectHotspot={setSelectedHotspot}
      onSetDraftStatus={setDraftStatus}
      onStartInteractiveDraft={startInteractiveDraft}
      onSubmitUserTurn={() => submitInteractiveText(userInterjectionText)}
      onExportDraft={exportCurrentDraft}
      onTestSettingsPanel={testSettingsPanel}
      onToggleFeed={toggleFeed}
      onToggleHotspotSelection={toggleHotspotSelection}
      onUpdatePlanAgenda={updatePlanAgenda}
      onUpdatePlanTension={updatePlanTension}
      onUpdatePlanTopicSummary={updatePlanTopicSummary}
      onUpdatePlanTopicTitle={updatePlanTopicTitle}
      onSelectCategoryForGeneration={selectCategoryForGeneration}
      onGenerateCategoryPlan={generatePlanFromCategory}
      providerSettings={providerSettings}
      roundtablePlan={roundtablePlan}
      roundtableStep={roundtableStep}
      selectedHotspot={generationHotspot ?? selectedHotspot}
      selectedHotspotIds={selectedHotspotIds}
      selectedModel={selectedModel}
      selectedProviderId={selectedProviderId}
      ttsSettings={ttsSettings}
      userInterjectionText={userInterjectionText}
      onUserInterjectionTextChange={setUserInterjectionText}
    />
  );

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <svg aria-hidden="true" width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="11" y="1" width="4" height="3" rx="1.5" fill="currentColor" opacity="0.9" />
              <rect x="11" y="22" width="4" height="3" rx="1.5" fill="currentColor" opacity="0.9" />
              <rect x="1" y="11" width="3" height="4" rx="1.5" fill="currentColor" opacity="0.9" />
              <rect x="22" y="11" width="3" height="4" rx="1.5" fill="currentColor" opacity="0.9" />
              <circle cx="13" cy="13" r="7" fill="currentColor" opacity="0.22" />
              <circle cx="13" cy="13" r="7" stroke="currentColor" strokeWidth="2" opacity="0.95" />
              <circle cx="13" cy="13" r="1.6" fill="currentColor" opacity="0.8" />
            </svg>
          </div>
          <div>
            <strong>AI小圆桌</strong>
            <span>Weekly AI Studio</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          {productNavItems.map((item) => {
            const Icon = item.icon;
            const roundtableLocked = item.id === "roundtable" && !canOpenRoundtable;
            return (
              <button
                className={`${activeView === item.id ? "navItem active" : "navItem"}${roundtableLocked ? " muted" : ""}`}
                disabled={roundtableLocked}
                key={item.id}
                onClick={() => navigateTo(item.id)}
                title={roundtableLocked ? "生成议程后可进入" : undefined}
                type="button"
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <span className={job.status === "failed" ? "statusDot dangerDot" : job.status === "running" ? "statusDot runningDot" : "statusDot"} />
          {job.status === "running" && <span className="inlineSpinner sidebarSpinner" aria-hidden="true" />}
          <span className="sidebarFooterText" title={job.message}>{sidebarFooterLabel(job)}</span>
        </div>
      </aside>

      <section className="mainPanel zipMain">
        {zipPage}
        {showActivityBar && <ZipActivityBar job={job} mode={draftGenerationMode} />}
      </section>
    </main>
  );
}

function formatError(error: unknown, fallback: string) {
  console.error(fallback, error);
  if (typeof error === "string") return `${fallback}: ${error}`;
  if (error instanceof Error) return `${fallback}: ${error.message}`;
  return fallback;
}

function isJobRunning(job: GenerationJob, type: GenerationJob["type"]) {
  return job.status === "running" && job.type === type;
}

function isRssFetchRunning(job: GenerationJob) {
  return job.status === "running" && job.id === "job-fetch";
}

function sidebarFooterLabel(job: GenerationJob) {
  if (job.status === "running") {
    return job.message.length > 28 ? `${job.message.slice(0, 28)}…` : job.message;
  }
  if (job.status === "failed") {
    return job.message.length > 28 ? `${job.message.slice(0, 28)}…` : job.message;
  }
  return "Tauri backend";
}

type ZipProductPageProps = {
  activeView: AppView;
  agentRuntimeSettings: AgentRuntimeSettings;
  appDataDir: string;
  asrSettings: AsrSettings;
  draft: EpisodeDraft | null;
  draftGenerationMode: DraftGenerationMode;
  feeds: FeedSource[];
  filters: HotspotFilters;
  historyDrafts: EpisodeDraft[];
  hotspotTab: HotspotTab;
  hotspots: HotspotCandidate[];
  interactiveSessionId: string;
  interactiveStatus: InteractiveSessionEvent | null;
  job: GenerationJob;
  modelCatalog: ModelProvider[];
  onAddFeed: (feed: FeedSource) => Promise<void>;
  onDateRangeChange: (startDate: string, endDate: string, changed: ChangedDateBoundary) => void;
  onDraftGenerationModeChange: (mode: DraftGenerationMode) => void;
  onGenerateDraft: () => Promise<void>;
  onGeneratePlan: () => Promise<void>;
  onFinishInteractive: () => Promise<void>;
  onHistoryRefresh: () => Promise<void>;
  onHotspotTabChange: (tab: HotspotTab) => void;
  onImportAttachment: () => Promise<ManualAttachmentImportResult | null>;
  onManualSubmit: (input: ManualHotspotInput) => Promise<void>;
  onModelChange: (model: string) => void;
  onNavigate: (view: AppView) => void;
  onOpenDraftSource: () => Promise<void>;
  onOpenSource: (hotspot: HotspotCandidate) => void;
  onInterruptInteractive: () => Promise<void>;
  onProviderChange: (providerId: string) => void;
  onRefreshFeeds: () => Promise<void>;
  onRefreshFromProvider: (settings: ProviderSettings) => Promise<void>;
  onRefreshModels: () => Promise<void>;
  onRoundtableStepChange: (step: RoundtableStep) => void;
  onRunFetch: () => Promise<void>;
  onSaveAgentSettings: (settings: AgentRuntimeSettings) => Promise<void>;
  onSaveAsrSettings: (settings: AsrSettings) => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onSaveSettings: (settings: ProviderSettings) => Promise<void>;
  onSaveTtsSettings: (settings: TtsSettings) => Promise<void>;
  onSelectHotspot: (hotspot: HotspotCandidate) => void;
  onSetDraftStatus: (status: EpisodeDraft["status"]) => void;
  onStartInteractiveDraft: () => Promise<void>;
  onSubmitUserTurn: () => Promise<void>;
  onExportDraft: (format: "md" | "html" | "pdf" | "mp3") => Promise<void>;
  onTestSettingsPanel: (panel: "model" | "agent" | "tts" | "asr") => Promise<void>;
  onToggleFeed: (feedId: string) => Promise<void>;
  onToggleHotspotSelection: (hotspot: HotspotCandidate) => void;
  onUpdatePlanAgenda: (index: number, value: string) => void;
  onUpdatePlanTension: (index: number, value: string) => void;
  onUpdatePlanTopicSummary: (value: string) => void;
  onUpdatePlanTopicTitle: (value: string) => void;
  onSelectCategoryForGeneration: (articles: ZipArticle[]) => void;
  onGenerateCategoryPlan: (articles: ZipArticle[]) => Promise<void>;
  providerSettings: ProviderSettings[];
  roundtablePlan: RoundtablePlan | null;
  roundtableStep: RoundtableStep;
  selectedHotspot: HotspotCandidate | null;
  selectedHotspotIds: string[];
  selectedModel: string;
  selectedProviderId: string;
  ttsSettings: TtsSettings;
  userInterjectionText: string;
  onUserInterjectionTextChange: (value: string) => void;
};

type ZipPillVariant = "neutral" | "teal" | "blue" | "warning" | "error" | "success";

function ZipProductPage(props: ZipProductPageProps) {
  switch (props.activeView) {
    case "workbench":
      return <ZipShowPage {...props} />;
    case "hotspots":
      return <ZipHotspotHubPage {...props} />;
    case "roundtable":
      return <ZipRoundtablePage {...props} />;
    case "history":
      return <ZipHistoryPage {...props} />;
    case "settings":
      return <ZipSettingsPage {...props} />;
    default:
      return null;
  }
}

function ZipPageHeader({
  actions,
  label,
  subtitle,
  title
}: {
  actions?: ReactNode;
  label: string;
  subtitle: string;
  title: string;
}) {
  return (
    <div className="zipHeader">
      <div>
        <p className="zipHeaderLabel">{label}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="zipHeaderActions">{actions}</div>}
    </div>
  );
}

function ZipPill({
  active = false,
  children,
  onClick,
  variant = "neutral"
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  variant?: ZipPillVariant;
}) {
  return (
    <span className={`zipPill ${variant} ${active ? "active" : ""} ${onClick ? "clickable" : ""}`} onClick={onClick}>
      {children}
    </span>
  );
}

function ZipBtn({
  children,
  disabled,
  icon,
  onClick,
  variant = "ghost"
}: {
  children: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost";
}) {
  return (
    <button className={`zipBtn ${variant}`} disabled={disabled} onClick={onClick} type="button">
      {icon}
      {children}
    </button>
  );
}

function ZipCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`zipCard ${className}`}>{children}</div>;
}

function ZipCommonActions({
  canGenerate = true,
  job,
  onGeneratePlan,
  onRunFetch
}: {
  canGenerate?: boolean;
  job: GenerationJob;
  onGeneratePlan: () => Promise<void>;
  onRunFetch: () => Promise<void>;
}) {
  const isFetching = isRssFetchRunning(job);
  const isPlanning = isJobRunning(job, "plan");
  return (
    <>
      <ZipBtn disabled={isFetching} onClick={() => void onRunFetch()}>{isFetching ? "抓取中…" : "抓取 RSS"}</ZipBtn>
      <ZipBtn disabled={!canGenerate || isPlanning} icon={<Zap size={13} />} onClick={() => void onGeneratePlan()} variant="primary">
        {isPlanning ? "生成中…" : "生成圆桌"}
      </ZipBtn>
    </>
  );
}

function ZipCheckbox({ selected }: { selected: boolean }) {
  return <div className={`zipCheckbox ${selected ? "selected" : ""}`}>{selected && <Check size={11} strokeWidth={3} />}</div>;
}

function ZipDateRangeControl({
  endDate,
  onDateRangeChange,
  startDate
}: {
  endDate: string;
  onDateRangeChange: (startDate: string, endDate: string, changed: ChangedDateBoundary) => void;
  startDate: string;
}) {
  function changeDate(boundary: ChangedDateBoundary, value: string) {
    const next = boundary === "startDate"
      ? { startDate: value, endDate }
      : { startDate, endDate: value };
    const normalized = normalizeDateRange(next, boundary);
    onDateRangeChange(normalized.startDate, normalized.endDate, boundary);
  }

  return (
    <ZipCard className="zipDateRangeCard">
      <div>
        <CalendarDays size={16} />
        <span>日期范围</span>
      </div>
      <label>
        起始
        <input
          max={endDate}
          min={endDate ? addDays(endDate, -MAX_HOTSPOT_RANGE_DAYS) : undefined}
          onChange={(event) => changeDate("startDate", event.target.value)}
          type="date"
          value={startDate}
        />
      </label>
      <label>
        结尾
        <input
          max={startDate ? addDays(startDate, MAX_HOTSPOT_RANGE_DAYS) : undefined}
          min={startDate}
          onChange={(event) => changeDate("endDate", event.target.value)}
          type="date"
          value={endDate}
        />
      </label>
      <ZipPill variant="blue">最长 4 周</ZipPill>
    </ZipCard>
  );
}

function isoWeekNumber(dateValue: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function formatCnDateParts(dateValue: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (!match) return dateValue;
  return { year: match[1], month: Number(match[2]), day: Number(match[3]) };
}

function formatHomeWeekLabel(startDate: string, endDate: string) {
  const week = isoWeekNumber(startDate);
  const start = formatCnDateParts(startDate);
  const end = formatCnDateParts(endDate);
  if (typeof start === "string" || typeof end === "string") {
    return `${startDate} - ${endDate}`;
  }
  const weekPrefix = week ? `第 ${week} 周 · ` : "";
  if (start.year === end.year) {
    return `${weekPrefix}${start.year}年${start.month}月${start.day}日 - ${end.month}月${end.day}日`;
  }
  return `${weekPrefix}${start.year}年${start.month}月${start.day}日 - ${end.year}年${end.month}月${end.day}日`;
}

function ZipShowPage({
  draft,
  filters,
  hotspots,
  job,
  onDateRangeChange,
  onNavigate,
  onRunFetch,
  roundtablePlan,
  selectedHotspotIds
}: ZipProductPageProps) {
  const isFetching = isRssFetchRunning(job);
  const topHotspots = [...hotspots].sort(compareHotspotsByRecency).slice(0, 3);
  const canOpenRoundtable = Boolean(roundtablePlan);
  const selectedCount = selectedHotspotIds.length;
  const roundtableStatus = draft
    ? statusLabel(draft.status)
    : roundtablePlan
      ? "议程就绪"
      : "尚未开始";
  const reviewStatus = draft ? statusLabel(draft.status) : "队列为空";

  function changeDate(boundary: ChangedDateBoundary, value: string) {
    const next = boundary === "startDate"
      ? { startDate: value, endDate: filters.endDate }
      : { startDate: filters.startDate, endDate: value };
    const normalized = normalizeDateRange(next, boundary);
    onDateRangeChange(normalized.startDate, normalized.endDate, boundary);
  }

  return (
    <div className="zipPage zipHomePage">
      <header className="zipHomeHeader">
        <p className="zipHomeWeek">
          <CalendarDays size={15} />
          <span>{formatHomeWeekLabel(filters.startDate, filters.endDate)}</span>
        </p>
        <h1>本周编辑工作台概览</h1>
      </header>

      <div className="zipHomeStatGrid">
        <ZipCard className="zipHomeStatCard">
          <p>RSS 热点总计</p>
          <div className="zipHomeStatValue">
            <strong>{hotspots.length}</strong>
            <span className="zipHomeStatHint">当前范围</span>
          </div>
        </ZipCard>
        <ZipCard className="zipHomeStatCard accent">
          <p>已选主线</p>
          <div className="zipHomeStatValue">
            <strong className="teal">{selectedCount}</strong>
            <span className="zipHomeStatHint">{selectedCount > 0 ? "/ 已标记" : "/ 待筛选"}</span>
          </div>
        </ZipCard>
        <ZipCard className="zipHomeStatCard">
          <p>圆桌状态</p>
          <div className="zipHomeStatValue">
            <ZipPill variant={roundtablePlan || draft ? "success" : "neutral"}>{roundtableStatus}</ZipPill>
          </div>
        </ZipCard>
        <ZipCard className="zipHomeStatCard">
          <p>成稿审校</p>
          <div className="zipHomeStatValue">
            <ZipPill variant={draft ? "success" : "neutral"}>{reviewStatus}</ZipPill>
          </div>
        </ZipCard>
      </div>

      <div className="zipHomeEntryGrid">
        <button className="zipHomeEntryCard" onClick={() => onNavigate("hotspots")} type="button">
          <div className="zipHomeEntryIcon brand">
            <Search size={22} />
          </div>
          <div className="zipHomeEntryBody">
            <h3>进入热点库</h3>
            <p>
              {hotspots.length > 0
                ? `从 ${hotspots.length} 个收录热点中筛选本期圆桌的核心议题，标记感兴趣的 AI 趋势。`
                : "抓取并筛选本期圆桌的核心议题，标记感兴趣的 AI 趋势。"}
            </p>
            <span className="zipHomeEntryCta">
              开始筛选
              <ArrowRight size={14} />
            </span>
          </div>
        </button>

        <button
          className={`zipHomeEntryCard${canOpenRoundtable ? "" : " locked"}`}
          disabled={!canOpenRoundtable}
          onClick={() => onNavigate("roundtable")}
          title={canOpenRoundtable ? undefined : "生成议程后可进入"}
          type="button"
        >
          <div className={`zipHomeEntryIcon${canOpenRoundtable ? " brand" : ""}`}>
            <Users size={22} />
          </div>
          <div className="zipHomeEntryBody">
            <div className="zipHomeEntryTitleRow">
              <h3>进入圆桌议程</h3>
              {!canOpenRoundtable && <ZipPill variant="neutral">锁定</ZipPill>}
            </div>
            <p>
              {canOpenRoundtable
                ? "审议程、嘉宾与冲突点，确认后生成圆桌稿。"
                : selectedCount > 0
                  ? "已选热点，请在热点库生成议程后再进入圆桌。"
                  : "尚未选择任何热点主线。请先在热点库中标记至少 1 个核心话题以生成议程。"}
            </p>
            {canOpenRoundtable ? (
              <span className="zipHomeEntryCta">
                打开议程
                <ArrowRight size={14} />
              </span>
            ) : (
              <span className="zipHomeEntryLocked">
                <Lock size={13} />
                需先完成热点筛选
              </span>
            )}
          </div>
        </button>
      </div>

      <ZipCard className="zipHomeHighlightCard">
        <div className="zipHomeHighlightHeader">
          <h4>近期高热度关注</h4>
          <span>Top 3 Hotspots</span>
        </div>
        {topHotspots.length === 0 ? (
          <div className="zipEmptyInline">当前范围内暂无热点，可先调整周次或重新抓取 RSS。</div>
        ) : (
          <div className="zipHomeHighlightList">
            {topHotspots.map((hotspot, index) => (
              <div className="zipHomeHighlightRow" key={hotspot.id}>
                <span className="zipHomeHighlightIndex">{String(index + 1).padStart(2, "0")}</span>
                <div className="zipHomeHighlightTitle">{hotspot.title}</div>
                <div className="zipHomeHighlightMeta">
                  <span>{hotspot.sourceCount} 来源</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </ZipCard>

      <div className="zipHomeWeekBarWrap">
        <div className="zipHomeWeekBar">
          <div className="zipHomeWeekBarLabel">
            <CalendarDays size={15} />
            <span>工作周次</span>
          </div>
          <div className="zipHomeWeekBarDates">
            <input
              max={filters.endDate}
              min={filters.endDate ? addDays(filters.endDate, -MAX_HOTSPOT_RANGE_DAYS) : undefined}
              onChange={(event) => changeDate("startDate", event.target.value)}
              type="date"
              value={filters.startDate}
            />
            <span>—</span>
            <input
              max={filters.startDate ? addDays(filters.startDate, MAX_HOTSPOT_RANGE_DAYS) : undefined}
              min={filters.startDate}
              onChange={(event) => changeDate("endDate", event.target.value)}
              type="date"
              value={filters.endDate}
            />
          </div>
          <span className="zipHomeWeekBarDivider" />
          <button
            className="zipHomeWeekBarRefresh"
            disabled={isFetching}
            onClick={() => void onRunFetch()}
            type="button"
          >
            <RefreshCcw size={13} />
            {isFetching ? "抓取中…" : "重新抓取 RSS"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ZipRssPanel({ feeds, job, onAddFeed, onRefreshFeeds, onRunFetch, onToggleFeed }: ZipProductPageProps) {
  const isFetching = isRssFetchRunning(job);
  const [draftUrl, setDraftUrl] = useState("");
  const [searchText, setSearchText] = useState("");
  const shownFeeds = feeds.length > 0 ? feeds : RSS_PRESETS.slice(0, 6);
  const visibleFeeds = shownFeeds.filter((feed) => {
    const query = searchText.trim().toLowerCase();
    if (!query) return true;
    return feed.name.toLowerCase().includes(query) || feed.url.toLowerCase().includes(query);
  });
  const activeCount = shownFeeds.filter((feed) => feed.enabled).length;
  const failedCount = shownFeeds.filter((feed) => feed.lastStatus === "failed").length;

  async function addDraftFeed() {
    if (!draftUrl.trim()) return;
    await onAddFeed({
      id: `feed-${Date.now()}`,
      name: draftUrl.replace(/^https?:\/\//, "").split("/")[0] || "新来源",
      url: draftUrl,
      category: "market",
      enabled: true,
      lastStatus: "idle"
    });
    setDraftUrl("");
  }

  return (
    <>
      <div className="zipStatGrid">
        {[
          { label: "活跃来源", value: activeCount, tone: "teal" },
          { label: "本周新文章", value: shownFeeds.reduce((sum, feed) => sum + (feed.lastFetchedAt ? 1 : 0), 0) || shownFeeds.length * 7, tone: "" },
          { label: "失败来源", value: failedCount, tone: "danger" }
        ].map((stat) => (
          <ZipCard className="zipInlineStat" key={stat.label}>
            <strong className={stat.tone}>{stat.value}</strong>
            <span>{stat.label}</span>
          </ZipCard>
        ))}
      </div>

      <ZipCard className="zipTableCard">
        <div className="zipTableHeader">
          <h3>已配置来源</h3>
          <div className="zipSearchBox"><Search size={13} /><input onChange={(event) => setSearchText(event.target.value)} placeholder="搜索来源..." value={searchText} /></div>
        </div>
        <div className="zipDivide">
          {visibleFeeds.map((feed) => {
            const ok = feed.lastStatus !== "failed";
            return (
              <div className="zipFeedRow" key={feed.id}>
                <span className={`zipFeedDot ${ok ? "" : "failed"}`} />
                <div>
                  <strong>{feed.name}</strong>
                  <span>{feed.url.replace(/^https?:\/\//, "")}</span>
                </div>
                <em>{feed.lastFetchedAt ? "已抓取" : "待抓取"}</em>
                <ZipPill variant={ok ? "success" : "error"}>{ok ? "正常" : "抓取失败"}</ZipPill>
                {!ok && <ZipBtn icon={<RefreshCcw size={12} />} onClick={() => void onRefreshFeeds()}>重试</ZipBtn>}
                <button className="zipIconButton danger" onClick={() => void onToggleFeed(feed.id)} type="button">
                  {feed.enabled ? <X size={13} /> : <Check size={13} />}
                </button>
              </div>
            );
          })}
          {visibleFeeds.length === 0 && <div className="zipEmptyInline">没有匹配的来源</div>}
        </div>
      </ZipCard>

      <ZipCard className="zipFormStrip">
        <h3>添加新来源</h3>
        <div>
          <input onChange={(event) => setDraftUrl(event.target.value)} placeholder="RSS feed URL，例如 https://openai.com/news/rss" value={draftUrl} />
          <ZipBtn icon={<Plus size={13} />} onClick={() => void addDraftFeed()} variant="primary">添加</ZipBtn>
          <ZipBtn disabled={isFetching} icon={<RefreshCcw size={13} />} onClick={() => void onRunFetch()} variant="primary">{isFetching ? "抓取中…" : "全部抓取"}</ZipBtn>
        </div>
        <p>支持 RSS 2.0、Atom 1.0 和 JSON Feed 格式</p>
      </ZipCard>
    </>
  );
}

function ZipRssPage(props: ZipProductPageProps) {
  return (
    <div className="zipPage">
      <ZipPageHeader
        label="数据采集"
        subtitle="配置和监控自动抓取的内容来源，失败源可重试或停用。"
        title="RSS 源管理"
      />
      <ZipRssPanel {...props} />
    </div>
  );
}

type ZipArticle = {
  date: string;
  hotspot?: HotspotCandidate;
  selected: boolean;
  source: string;
  summary: string;
  title: string;
};

type ZipCategory = {
  articles: ZipArticle[];
  icon: ReactNode;
  key: HotspotDisplayCategoryKey;
  label: string;
  tone: string;
};

function buildZipCategories(hotspots: HotspotCandidate[], selectedHotspotIds: string[]): ZipCategory[] {
  if (hotspots.length === 0) {
    return [];
  }

  const buckets: ZipCategory[] = [
    { key: "model", label: "模型能力", icon: <Cpu size={14} />, tone: "blue", articles: [] },
    { key: "agent", label: "Agent 工程", icon: <Zap size={14} />, tone: "green", articles: [] },
    { key: "product", label: "产品动态", icon: <TrendingUp size={14} />, tone: "amber", articles: [] },
    { key: "investment", label: "投融资", icon: <DollarSign size={14} />, tone: "red", articles: [] },
    { key: "research", label: "学术前沿", icon: <BookOpen size={14} />, tone: "gray", articles: [] },
    { key: "other", label: "其他", icon: <Layers size={14} />, tone: "slate", articles: [] }
  ];
  hotspots.forEach((hotspot) => {
    const bucket = buckets.find((item) => item.key === resolveHotspotDisplayCategory(hotspot));
    if (!bucket) {
      return;
    }
    bucket.articles.push({
      date: formatLooseDate(hotspot.sources[0]?.publishedAt ?? hotspot.createdAt).replace(/^2026\./, ""),
      hotspot,
      selected: selectedHotspotIds.includes(hotspot.id),
      source: primarySourceName(hotspot),
      summary: hotspot.summary,
      title: hotspot.title
    });
  });
  return buckets.filter((bucket) => bucket.articles.length > 0);
}

function ZipHotspotCandidatesPanel({
  filters,
  hotspots,
  job,
  onDateRangeChange,
  onGeneratePlan,
  onNavigate,
  onOpenSource,
  onRunFetch,
  onSelectHotspot,
  onToggleHotspotSelection,
  selectedHotspotIds
}: ZipProductPageProps) {
  const isFetching = isRssFetchRunning(job);
  const isPlanning = isJobRunning(job, "plan");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const categories = buildZipCategories(hotspots, selectedHotspotIds);
  const selectedStaticCount = categories.flatMap((category) => category.articles).filter((article) => article.selected).length;
  const totalSelected = selectedHotspotIds.length || selectedStaticCount;
  const filtered = categories
    .map((category) => ({
      ...category,
      articles: searchText
        ? category.articles.filter((article) => article.title.includes(searchText) || article.summary.includes(searchText))
        : category.articles
    }))
    .filter((category) => category.articles.length > 0 && (!activeCategory || category.key === activeCategory));

  function toggleArticle(article: ZipArticle) {
    if (article.hotspot) {
      onSelectHotspot(article.hotspot);
      onToggleHotspotSelection(article.hotspot);
    }
  }

  return (
    <>
      <ZipDateRangeControl
        endDate={filters.endDate}
        onDateRangeChange={onDateRangeChange}
        startDate={filters.startDate}
      />

      <div className="zipFilterBar">
        <ZipPill active={activeCategory === null} onClick={() => setActiveCategory(null)}>全部</ZipPill>
        {categories.map((category) => {
          const selectedCount = category.articles.filter((article) => article.selected).length;
          return (
            <button className={`zipCategoryPill ${category.tone} ${activeCategory === category.key ? "active" : ""}`} key={category.key} onClick={() => setActiveCategory(activeCategory === category.key ? null : category.key)} type="button">
              {category.icon}
              {category.label}
              {selectedCount > 0 && <b>{selectedCount}</b>}
            </button>
          );
        })}
        <div className="zipFilterGrow" />
        <div className="zipSearchBox"><Search size={13} /><input onChange={(event) => setSearchText(event.target.value)} placeholder="搜索标题、摘要..." value={searchText} /></div>
      </div>

      {hotspots.length === 0 && (
        <ZipCard className="zipHotspotEmpty">
          <div>
            <span><Rss size={18} /></span>
            <ZipPill variant="warning">未抓取</ZipPill>
          </div>
          <h2>还没有抓取 RSS</h2>
          <p>先抓取 RSS，AI小圆桌会把来源文章整理成候选热点，再按模型能力、Agent 工程、产品动态等分类展示。</p>
          <ZipBtn disabled={isFetching} icon={<RefreshCcw size={14} />} onClick={() => void onRunFetch()} variant="primary">
            {isFetching ? "抓取中…" : "抓取 RSS"}
          </ZipBtn>
        </ZipCard>
      )}

      <div className="zipCategoryStack">
        {filtered.map((category) => (
          <ZipCard className="zipCategoryCard" key={category.key}>
            <div className={`zipCategoryHeader ${category.tone}`}>
              <div>
                {category.icon}
                <strong>{category.label}</strong>
                <span>{category.articles.length} 篇</span>
              </div>
            </div>
            <div className="zipDivide">
              {category.articles.map((article) => (
                <div className={`zipArticleRow ${article.selected ? "selected" : ""}`} key={`${category.key}-${article.title}`} onClick={() => toggleArticle(article)}>
                  <ZipCheckbox selected={article.selected} />
                  <div>
                    <strong>{article.title}</strong>
                    <p>{article.summary}</p>
                  </div>
                  <aside>
                    <span>{article.date}</span>
                    <button onClick={(event) => { event.stopPropagation(); if (article.hotspot) void onOpenSource(article.hotspot); }} type="button">{article.source}</button>
                  </aside>
                </div>
              ))}
            </div>
          </ZipCard>
        ))}
      </div>

      {totalSelected > 0 && (
        <div className="zipNextActionBar">
          <div>
            <strong>下一步：生成圆桌议程</strong>
            <span>已选 {totalSelected} 篇，生成后进入圆桌</span>
          </div>
          <ZipBtn
            disabled={isPlanning}
            icon={<Zap size={13} />}
            onClick={() => void onGeneratePlan().then(() => onNavigate("roundtable"))}
            variant="primary"
          >
            {isPlanning ? "生成中…" : "生成圆桌议程"}
          </ZipBtn>
        </div>
      )}
    </>
  );
}

function ZipHotspotHubPage(props: ZipProductPageProps) {
  const { hotspotTab, job, onHotspotTabChange, onRunFetch, selectedHotspotIds } = props;
  const isFetching = isRssFetchRunning(job);
  const isPlanning = isJobRunning(job, "plan");
  const tabs: Array<{ id: HotspotTab; label: string }> = [
    { id: "candidates", label: "候选" },
    { id: "feeds", label: "RSS 源" },
    { id: "manual", label: "手动补充" }
  ];

  return (
    <div className="zipPage">
      <ZipPageHeader
        actions={
          hotspotTab === "candidates" ? (
            <>
              <ZipBtn disabled={isFetching} onClick={() => void onRunFetch()}>{isFetching ? "抓取中…" : "抓取 RSS"}</ZipBtn>
              {selectedHotspotIds.length > 0 && (
                <ZipBtn
                  disabled={isPlanning}
                  icon={<Zap size={13} />}
                  onClick={() => void props.onGeneratePlan().then(() => props.onNavigate("roundtable"))}
                  variant="primary"
                >
                  {isPlanning ? "生成中…" : `下一步：生成议程（${selectedHotspotIds.length}）`}
                </ZipBtn>
              )}
            </>
          ) : undefined
        }
        label="热点库"
        subtitle="候选选题、RSS 设置与手动补充都在这里完成。"
        title="热点库"
      />

      <div className="zipSubNav" role="tablist" aria-label="热点库分区">
        {tabs.map((tab) => (
          <button
            aria-selected={hotspotTab === tab.id}
            className={hotspotTab === tab.id ? "zipSubNavItem active" : "zipSubNavItem"}
            key={tab.id}
            onClick={() => onHotspotTabChange(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {hotspotTab === "candidates" && <ZipHotspotCandidatesPanel {...props} />}
      {hotspotTab === "feeds" && <ZipRssPanel {...props} />}
      {hotspotTab === "manual" && <ZipManualPanel {...props} />}
    </div>
  );
}

function ZipHotspotPage(props: ZipProductPageProps) {
  return <ZipHotspotHubPage {...props} />;
}

function ZipManualPanel({ onImportAttachment, onManualSubmit }: ZipProductPageProps) {
  const [form, setForm] = useState({ angle: "", source: "", summary: "", title: "" });
  const [attached, setAttached] = useState(false);

  async function submitManual() {
    if (!form.title.trim()) return;
    await onManualSubmit({
      summary: form.summary || form.angle,
      title: form.title,
      url: form.source
    });
    setForm({ angle: "", source: "", summary: "", title: "" });
  }

  async function importAttachment() {
    const result = await onImportAttachment();
    setAttached(Boolean(result));
  }

  return (
    <div className="zipManualGrid">
      <ZipCard className="zipSectionCard">
        <div className="zipCardHeader simple">
          <h3>补充一个热点</h3>
          <p>适合小道消息、会议笔记、本地文件和人工判断</p>
        </div>
        <div className="zipFieldStack">
          {[
            { key: "title", label: "热点标题", placeholder: "一句话概括这个热点...", multiline: false },
            { key: "summary", label: "事实摘要", placeholder: "什么发生了，谁做的，什么时间...", multiline: true },
            { key: "source", label: "来源链接或本地文件", placeholder: "https:// 或拖入本地文件", multiline: false },
            { key: "angle", label: "希望圆桌讨论的角度", placeholder: "你认为最值得深挖的问题或争议点...", multiline: true }
          ].map((field) => (
            <label className="zipField" key={field.key}>
              <span>{field.label}</span>
              {field.multiline ? (
                <textarea onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} placeholder={field.placeholder} value={form[field.key as keyof typeof form]} />
              ) : (
                <input onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} placeholder={field.placeholder} value={form[field.key as keyof typeof form]} />
              )}
            </label>
          ))}
        </div>
        <div className="zipSubmitRow">
          <ZipBtn icon={<Plus size={13} />} onClick={() => void submitManual()} variant="primary">加入候选池</ZipBtn>
          <ZipBtn onClick={() => setForm({ angle: "", source: "", summary: "", title: "" })}>清空</ZipBtn>
        </div>
      </ZipCard>

      <div className="zipStack">
        <ZipCard className="zipDropCard">
          <div className="zipDropIcon"><FileText size={18} /></div>
          <h3>导入本地资料</h3>
          <p>支持 PDF、Markdown、TXT 和网页剪贴。导入后会写入补充资料池。</p>
          <ZipBtn icon={<Plus size={13} />} onClick={() => void importAttachment()} variant="primary">{attached ? "已导入，继续添加" : "选择文件"}</ZipBtn>
        </ZipCard>
        <ZipCard className="zipSectionCard">
          <div className="zipCardHeader simple">
            <h3>写入反馈</h3>
            <p>确保编辑知道刚才发生了什么</p>
          </div>
          <div className="zipChecklist">
            <label><ZipCheckbox selected={Boolean(form.title)} />标题已填写</label>
            <label><ZipCheckbox selected={Boolean(form.summary)} />事实摘要已填写</label>
            <label><ZipCheckbox selected={Boolean(form.source) || attached} />来源可追溯</label>
          </div>
        </ZipCard>
      </div>
    </div>
  );
}

function ZipManualPage(props: ZipProductPageProps) {
  return (
    <div className="zipPage">
      <ZipPageHeader
        label="补充资料"
        subtitle="轻量投稿表单，强调来源可追溯和写入反馈。"
        title="把 RSS 没覆盖的信息加入本周候选"
      />
      <ZipManualPanel {...props} />
    </div>
  );
}

const ZIP_GUESTS = [
  { bg: "green", icon: <Radio size={18} />, label: "主持人", sublabel: "Host" },
  { bg: "blue", icon: <Layers size={18} />, label: "消费者（产品使用者）", sublabel: "User" },
  { bg: "amber", icon: <Terminal size={18} />, label: "热点技术人员", sublabel: "Technical" },
  { bg: "gray", icon: <LineChart size={18} />, label: "投资人", sublabel: "Investor" }
];

function AutoGrowTextarea({
  className,
  disabled,
  onChange,
  rows = 1,
  value
}: {
  className: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  rows?: number;
  value: string;
}) {
  const textareaRef = useRef<ElementRef<"textarea">>(null);

  function resize() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  useEffect(() => {
    resize();
  }, [value]);

  function handleChange(event: ChangeEvent<ElementRef<"textarea">>) {
    onChange(event.target.value);
    globalThis.requestAnimationFrame(resize);
  }

  return (
    <textarea
      className={className}
      disabled={disabled}
      onChange={handleChange}
      ref={textareaRef}
      rows={rows}
      value={value}
    />
  );
}

function ZipAgendaPanel({
  job,
  onGenerateDraft,
  onGeneratePlan,
  onNavigate,
  onRoundtableStepChange,
  onUpdatePlanAgenda,
  onUpdatePlanTension,
  onUpdatePlanTopicSummary,
  onUpdatePlanTopicTitle,
  roundtablePlan,
  selectedHotspot,
  selectedHotspotIds
}: ZipProductPageProps) {
  const isPlanning = isJobRunning(job, "plan");
  if (!roundtablePlan) {
    const canGenerate = selectedHotspotIds.length > 0 || Boolean(selectedHotspot);
    return (
      <ZipCard className="zipHotspotEmpty">
        <div>
          <span><Users size={18} /></span>
          <ZipPill variant="warning">未生成</ZipPill>
        </div>
        <h2>还没有圆桌议程</h2>
        <p>先在热点库选题，再生成议程。生成前不会展示占位主题或假议程。</p>
        <div className="zipButtonRow">
          <ZipBtn icon={<Flame size={13} />} onClick={() => onNavigate("hotspots")}>回热点库选题</ZipBtn>
          <ZipBtn
            disabled={!canGenerate || isPlanning}
            icon={<Zap size={13} />}
            onClick={() => void onGeneratePlan()}
            variant="primary"
          >
            {isPlanning ? "生成中…" : "生成圆桌议程"}
          </ZipBtn>
        </div>
      </ZipCard>
    );
  }

  const topic = getPlanTopicDisplay(roundtablePlan, selectedHotspot, "等待模型提炼主题", "生成圆桌议程后显示模型总结。");
  const agendaItems = roundtablePlan.agenda;
  const tensions = roundtablePlan.tensionPoints;
  const risks = roundtablePlan.sourceRisks;

  return (
    <>
      <ZipCard className="zipHeroCard">
        <div className="zipHeroCopy">
          <ZipPill variant="success">已基于 {selectedHotspot?.sourceCount ?? selectedHotspotIds.length} 个来源</ZipPill>
          <AutoGrowTextarea
            className="zipTopicTitleInput"
            onChange={onUpdatePlanTopicTitle}
            value={topic.title}
          />
          <AutoGrowTextarea
            className="zipTopicSummaryInput"
            onChange={onUpdatePlanTopicSummary}
            rows={3}
            value={topic.summary}
          />
        </div>
        <ZipBtn
          icon={<FileText size={13} />}
          onClick={() => {
            onRoundtableStepChange("draft");
            void onGenerateDraft();
          }}
          variant="primary"
        >
          下一步：生成圆桌稿
        </ZipBtn>
      </ZipCard>

      <ZipCard className="zipSectionCard">
        <div className="zipCardHeader">
          <div>
            <h3>模拟嘉宾</h3>
            <p>清楚标注为模拟角色</p>
          </div>
          <ZipPill variant="warning">模拟角色</ZipPill>
        </div>
        <div className="zipGuestRow">
          {ZIP_GUESTS.map((guest) => (
            <div className="zipGuest" key={guest.label}>
              <div className={guest.bg}>{guest.icon}</div>
              <strong>{guest.label}</strong>
              <span>{guest.sublabel}</span>
            </div>
          ))}
        </div>
      </ZipCard>

      <div className="zipAgendaGrid">
        <ZipCard className="zipSectionCard">
          <div className="zipCardHeader simple">
            <h3>议程</h3>
            <p>生成前可编辑的节目结构</p>
          </div>
          <div className="zipStack">
            {agendaItems.map((item, index) => (
              <label className="zipAgendaDraggable" key={`agenda-${index}`}>
                <b>{index + 1}</b>
                <AutoGrowTextarea
                  className="zipAgendaText"
                  onChange={(value) => onUpdatePlanAgenda(index, value)}
                  rows={2}
                  value={item}
                />
                <ChevronRight size={14} />
              </label>
            ))}
          </div>
        </ZipCard>
        <ZipCard className="zipSectionCard">
          <div className="zipCardHeader simple">
            <h3>冲突点</h3>
            <p>让观点不变成流水账</p>
          </div>
          <div className="zipStack">
            {tensions.map((item, index) => (
              <label className="zipReviewCard warning" key={`tension-${index}`}>
                <AutoGrowTextarea
                  className="zipReviewText"
                  onChange={(value) => onUpdatePlanTension(index, value)}
                  rows={2}
                  value={item}
                />
              </label>
            ))}
          </div>
        </ZipCard>
        <ZipCard className="zipSectionCard">
          <div className="zipCardHeader simple">
            <h3>来源风险</h3>
            <p>生成前必须看见</p>
          </div>
          <div className="zipStack">
            {risks.length > 0
              ? risks.map((risk, index) => <div className="zipReviewCard risk" key={`${risk}-${index}`}>{risk}</div>)
              : <div className="zipEmptyInline">暂无来源风险提示</div>}
          </div>
        </ZipCard>
      </div>
    </>
  );
}

function ZipAgendaPage(props: ZipProductPageProps) {
  return (
    <div className="zipPage">
      <ZipPageHeader
        label="节目策划"
        subtitle="把中控 Agent 的计划做成可编辑的节目策划板。"
        title="先审议程，再生成圆桌稿"
      />
      <ZipAgendaPanel {...props} />
    </div>
  );
}

function getDraftTurns(draft: EpisodeDraft | null): DialogueTurn[] {
  if (draft?.dialogue.length) return draft.dialogue;
  return [];
}

function speakerLabel(speakerId: DialogueTurn["speakerId"]) {
  if (speakerId === "host") return "主持人";
  if (speakerId === "participant") return "消费者（产品使用者）";
  if (speakerId === "expert") return "热点技术人员";
  if (speakerId === "investor") return "投资人";
  return "用户";
}

function ZipSpeakerAvatar({ speakerId }: { speakerId: DialogueTurn["speakerId"] }) {
  if (speakerId === "participant") return <div className="zipSpeakerAvatar blue"><Layers size={16} /></div>;
  if (speakerId === "expert") return <div className="zipSpeakerAvatar amber"><Terminal size={16} /></div>;
  if (speakerId === "investor") return <div className="zipSpeakerAvatar gray"><LineChart size={16} /></div>;
  return <div className="zipSpeakerAvatar green"><Radio size={16} /></div>;
}

function ZipDraftPanel({
  draft,
  interactiveSessionId,
  interactiveStatus,
  job,
  onExportDraft,
  onFinishInteractive,
  onGenerateDraft,
  onInterruptInteractive,
  onOpenDraftSource,
  onRoundtableStepChange,
  onSaveDraft,
  onSetDraftStatus,
  onStartInteractiveDraft,
  onSubmitUserTurn,
  onUserInterjectionTextChange,
  userInterjectionText
}: ZipProductPageProps) {
  const isDraftRunning = job.status === "running" && job.type === "draft";
  const isInteractive = Boolean(interactiveSessionId);
  const canInterrupt = isInteractive && interactiveStatus?.status === "running";
  const canSubmitUserTurn = isInteractive && (interactiveStatus?.status === "awaiting_user" || interactiveStatus?.status === "interrupted");
  const canFinishInteractive = isInteractive && interactiveStatus?.status !== "finished";
  const turns = getDraftTurns(draft);
  const sourceCount = draft?.sources.length ?? 0;
  const factCheckCount = draft?.factChecks.length ?? 0;

  if (!draft) {
    return (
      <ZipCard className="zipHotspotEmpty">
        <div>
          <span><FileText size={18} /></span>
          <ZipPill variant={isDraftRunning ? "success" : "warning"}>{isDraftRunning ? "生成中" : "未生成"}</ZipPill>
        </div>
        <h2>{isDraftRunning ? "圆桌稿正在生成" : "还没有圆桌稿"}</h2>
        <p>{isDraftRunning ? job.message : "先完成议程，再生成圆桌稿。"}</p>
        {isDraftRunning ? <div className="zipProgressTrack"><span style={{ width: "62%" }} /></div> : (
          <div className="zipButtonRow">
            <ZipBtn onClick={() => onRoundtableStepChange("plan")}>回议程</ZipBtn>
            <ZipBtn icon={<FileText size={13} />} onClick={() => void onGenerateDraft()} variant="primary">生成圆桌稿</ZipBtn>
          </div>
        )}
      </ZipCard>
    );
  }

  return (
    <div className="zipDraftGrid">
      <ZipCard className="zipSectionCard">
        <div className="zipCardHeader">
          <div>
            <h3>圆桌稿</h3>
            <p>{draft.summary}</p>
          </div>
          <ZipPill variant={isDraftRunning ? "success" : "neutral"}>{isDraftRunning ? "运行中" : statusLabel(draft.status)}</ZipPill>
        </div>
        <div className="zipStack zipDialogueScroll">
          {turns.length === 0 ? (
            <div className="zipTurn">
              <ZipSpeakerAvatar speakerId="host" />
              <div>
                <div>
                  <strong>等待内容</strong>
                  <ZipPill variant={isDraftRunning ? "success" : "warning"}>{isDraftRunning ? "生成中" : "无对话"}</ZipPill>
                </div>
                <p>{isDraftRunning ? job.message : "当前草稿还没有对话内容。"}</p>
              </div>
            </div>
          ) : turns.map((turn, index) => (
            <div className="zipTurn" key={`${turn.speakerId}-${index}`}>
              <ZipSpeakerAvatar speakerId={turn.speakerId} />
              <div>
                <div>
                  <strong>{speakerLabel(turn.speakerId)}</strong>
                  <ZipPill variant={index === turns.length - 1 && canInterrupt ? "warning" : "neutral"}>{turn.interrupted ? "已打断" : turn.intent}</ZipPill>
                </div>
                <p>{turn.text}</p>
              </div>
            </div>
          ))}
        </div>
        <details className="zipLiveDetails">
          <summary>互动控制（次要）</summary>
          <div className="zipLiveBox">
            <p>{interactiveStatus?.message ?? (isDraftRunning ? job.message : "可以启动互动圆桌，或在系统等待你发言时插入观点。")}</p>
            <div className="zipProgressTrack"><span style={{ width: isDraftRunning ? "62%" : "18%" }} /></div>
            <textarea disabled={!canSubmitUserTurn} onChange={(event) => onUserInterjectionTextChange(event.target.value)} placeholder="插入我的观点..." value={userInterjectionText} />
            <div>
              {!isInteractive && <ZipBtn disabled={isDraftRunning} icon={<Radio size={12} />} onClick={() => void onStartInteractiveDraft()}>启动互动</ZipBtn>}
              {canInterrupt && <ZipBtn icon={<Pause size={12} />} onClick={() => void onInterruptInteractive()}>打断当前发言</ZipBtn>}
              {canFinishInteractive && <ZipBtn disabled={isDraftRunning && !canSubmitUserTurn} icon={<CheckCircle2 size={12} />} onClick={() => void onFinishInteractive()}>结束互动</ZipBtn>}
              <ZipBtn disabled={!canSubmitUserTurn || !userInterjectionText.trim()} icon={<Plus size={12} />} onClick={() => void onSubmitUserTurn()} variant="primary">插入我的观点</ZipBtn>
            </div>
          </div>
        </details>
      </ZipCard>

      <ZipCard className="zipSectionCard zipReviewPanel">
        <div className="zipCardHeader simple">
          <h3>审稿侧栏</h3>
          <p>来源、风险、导出和状态</p>
        </div>
        <div className="zipReviewStats">
          <div><span>事实核查</span><strong>{factCheckCount}</strong></div>
          <div><span>来源链接</span><strong>{sourceCount}</strong></div>
        </div>
        <div className="zipChecklist">
          {[
            { done: sourceCount > 0, label: "来源已附加", warn: sourceCount === 0 },
            { done: draft.guests.length > 0, label: "模拟角色已标注", warn: false },
            { done: factCheckCount === 0, label: factCheckCount > 0 ? "仍有事实核查项" : "暂无事实核查项", warn: factCheckCount > 0 },
            { done: turns.length > 1, label: "观点有来回", warn: turns.length <= 1 }
          ].map((check) => (
            <label className={check.warn ? "warning" : ""} key={check.label}>
              <ZipCheckbox selected={check.done} />
              {check.label}
            </label>
          ))}
        </div>
        <div className="zipDivider" />
        <p className="zipUpperLabel">导出格式</p>
        <div className="zipStack">
          {[
            { format: "md" as const, label: "导出 Markdown" },
            { format: "html" as const, label: "导出 HTML" },
            { format: "pdf" as const, label: "导出 PDF" },
            { format: "mp3" as const, label: "导出 MP3" }
          ].map((item, index) => (
            <ZipBtn disabled={isDraftRunning} icon={<Download size={12} />} key={item.format} onClick={() => void onExportDraft(item.format)} variant={index === 0 ? "primary" : "ghost"}>{item.label}</ZipBtn>
          ))}
        </div>
        <div className="zipStatusPills">
          <ZipPill active={draft.status === "draft"} onClick={isDraftRunning ? undefined : () => onSetDraftStatus("draft")} variant="warning">草稿</ZipPill>
          <ZipPill active={draft.status === "reviewed"} onClick={isDraftRunning ? undefined : () => onSetDraftStatus("reviewed")}>已审</ZipPill>
          <ZipPill active={draft.status === "published"} onClick={isDraftRunning ? undefined : () => onSetDraftStatus("published")}>已发布</ZipPill>
        </div>
        <div className="zipDivider" />
        <div className="zipButtonRow">
          <ZipBtn disabled={isDraftRunning} icon={<Save size={12} />} onClick={() => void onSaveDraft()} variant="primary">保存草稿</ZipBtn>
          <ZipBtn icon={<Eye size={12} />} onClick={() => void onOpenDraftSource()}>打开来源</ZipBtn>
        </div>
      </ZipCard>
    </div>
  );
}

function ZipDraftPage(props: ZipProductPageProps) {
  return (
    <div className="zipPage">
      <ZipPageHeader
        label="创作编辑"
        subtitle="对话稿、来源、审稿风险和互动控制保持同步。"
        title="圆桌稿"
      />
      <ZipDraftPanel {...props} />
    </div>
  );
}

function ZipRoundtablePage(props: ZipProductPageProps) {
  const { draft, onRoundtableStepChange, roundtableStep } = props;
  const draftLocked = !draft && props.job.status !== "running";

  return (
    <div className="zipPage">
      <ZipPageHeader
        label="圆桌"
        subtitle="议程与圆桌稿是同一条线性流程。"
        title={roundtableStep === "plan" ? "圆桌议程" : "圆桌稿"}
      />

      <div className="zipStepNav" role="tablist" aria-label="圆桌步骤">
        <button
          aria-selected={roundtableStep === "plan"}
          className={roundtableStep === "plan" ? "zipStepNavItem active" : "zipStepNavItem"}
          onClick={() => onRoundtableStepChange("plan")}
          role="tab"
          type="button"
        >
          1. 议程
        </button>
        <button
          aria-selected={roundtableStep === "draft"}
          className={`${roundtableStep === "draft" ? "zipStepNavItem active" : "zipStepNavItem"}${draftLocked && roundtableStep !== "draft" ? " muted" : ""}`}
          disabled={draftLocked && roundtableStep !== "draft"}
          onClick={() => onRoundtableStepChange("draft")}
          role="tab"
          title={draftLocked ? "生成圆桌稿后可进入" : undefined}
          type="button"
        >
          2. 圆桌稿
        </button>
      </div>

      {roundtableStep === "plan" ? <ZipAgendaPanel {...props} /> : <ZipDraftPanel {...props} />}
    </div>
  );
}

function ZipDraftPageLegacy({ draft, interactiveSessionId, interactiveStatus, job, onExportDraft, onFinishInteractive, onGeneratePlan, onInterruptInteractive, onOpenDraftSource, onRunFetch, onSaveDraft, onSetDraftStatus, onStartInteractiveDraft, onSubmitUserTurn, onUserInterjectionTextChange, userInterjectionText }: ZipProductPageProps) {
  const isDraftRunning = job.status === "running" && job.type === "draft";
  const isInteractive = Boolean(interactiveSessionId);
  const canInterrupt = isInteractive && interactiveStatus?.status === "running";
  const canSubmitUserTurn = isInteractive && (interactiveStatus?.status === "awaiting_user" || interactiveStatus?.status === "interrupted");
  const canFinishInteractive = isInteractive && interactiveStatus?.status !== "finished";
  void onFinishInteractive;
  void onInterruptInteractive;
  void canInterrupt;
  void canSubmitUserTurn;
  void canFinishInteractive;

  if (!draft) {
    return (
      <div className="zipPage">
        <ZipPageHeader
          actions={<ZipCommonActions job={job} onGeneratePlan={onGeneratePlan} onRunFetch={onRunFetch} />}
          label="创作编辑"
          subtitle="先选择热点并生成圆桌稿，之后再保存、导出和审稿。"
          title="圆桌稿"
        />
        <ZipCard className="zipHotspotEmpty">
          <div>
            <span><FileText size={18} /></span>
            <ZipPill variant={isDraftRunning ? "success" : "warning"}>{isDraftRunning ? "生成中" : "未生成"}</ZipPill>
          </div>
          <h2>{isDraftRunning ? "圆桌稿正在生成" : "还没有圆桌稿"}</h2>
          <p>{isDraftRunning ? job.message : "先从热点库选择文章，生成议程后再生成圆桌稿。"}</p>
          {isDraftRunning ? <div className="zipProgressTrack"><span style={{ width: "62%" }} /></div> : null}
        </ZipCard>
      </div>
    );
  }

  const turns = getDraftTurns(draft);
  const sourceCount = draft.sources.length;
  const checks = [
    { done: sourceCount > 0, label: "来源已附加", warn: false },
    { done: true, label: "模拟角色已标注", warn: false },
    { done: false, label: "数字/日期需复核", warn: true },
    { done: turns.length > 1, label: "观点有差异", warn: false }
  ];

  return (
    <div className="zipPage">
      <ZipPageHeader
        actions={<ZipCommonActions job={job} onGeneratePlan={onGeneratePlan} onRunFetch={onRunFetch} />}
        label="创作编辑"
        subtitle="对话稿是主画布，来源和审稿风险始终在右侧。"
        title="生成、打断、编辑和事实检查在同一屏"
      />

      <div className="zipDraftGrid">
        <ZipCard className="zipSectionCard">
          <div className="zipCardHeader">
            <div>
              <h3>圆桌稿</h3>
              <p>角色化对话流，支持生成中和人工插话</p>
            </div>
            <ZipPill variant={job.status === "running" ? "success" : "neutral"}>{job.status === "running" ? "互动圆桌运行中" : draft?.status ?? "草稿"}</ZipPill>
          </div>
          <div className="zipStack">
            {turns.map((turn, index) => (
              <div className="zipTurn" key={`${turn.speakerId}-${index}`}>
                <ZipSpeakerAvatar speakerId={turn.speakerId} />
                <div>
                  <div>
                    <strong>{speakerLabel(turn.speakerId)}</strong>
                    <ZipPill variant={index === turns.length - 1 ? "warning" : "neutral"}>{index === turns.length - 1 ? "可打断" : "已引用来源"}</ZipPill>
                  </div>
                  <p>{turn.text}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="zipLiveBox">
            <p>{job.status === "running" ? "AI 正在组织下一轮发言..." : "可以继续生成或插入你的观点"}</p>
            <div className="zipProgressTrack"><span style={{ width: job.status === "running" ? "62%" : "18%" }} /></div>
            <textarea onChange={(event) => onUserInterjectionTextChange(event.target.value)} placeholder="插入我的观点..." value={userInterjectionText} />
            <div>
              <ZipBtn icon={<Pause size={12} />} onClick={() => void onStartInteractiveDraft()}>打断</ZipBtn>
              <ZipBtn icon={<Plus size={12} />} onClick={() => void onSubmitUserTurn()} variant="primary">插入我的观点</ZipBtn>
            </div>
          </div>
        </ZipCard>

        <ZipCard className="zipSectionCard zipReviewPanel">
          <div className="zipCardHeader simple">
            <h3>审稿侧栏</h3>
            <p>来源、风险、导出和状态</p>
          </div>
          <div className="zipReviewStats">
            <div><span>事实检查</span><strong>3 项</strong></div>
            <div><span>来源链接</span><strong>{sourceCount}</strong></div>
          </div>
          <div className="zipChecklist">
            {checks.map((check) => (
              <label className={check.warn ? "warning" : ""} key={check.label}>
                <ZipCheckbox selected={check.done} />
                {check.label}
              </label>
            ))}
          </div>
          <div className="zipDivider" />
          <p className="zipUpperLabel">导出格式</p>
          <div className="zipStack">
            {[
              { format: "md" as const, label: "导出 Markdown" },
              { format: "html" as const, label: "导出 HTML" },
              { format: "pdf" as const, label: "导出 PDF" },
              { format: "mp3" as const, label: "导出 MP3" }
            ].map((item, index) => (
              <ZipBtn icon={<Download size={12} />} key={item.format} onClick={() => void onExportDraft(item.format)} variant={index === 0 ? "primary" : "ghost"}>{item.label}</ZipBtn>
            ))}
          </div>
          <div className="zipStatusPills">
            <ZipPill active={draft?.status === "draft"} onClick={() => onSetDraftStatus("draft")} variant="warning">草稿</ZipPill>
            <ZipPill active={draft?.status === "reviewed"} onClick={() => onSetDraftStatus("reviewed")}>已审</ZipPill>
            <ZipPill active={draft?.status === "published"} onClick={() => onSetDraftStatus("published")}>已发布</ZipPill>
          </div>
          <div className="zipDivider" />
          <div className="zipButtonRow">
            <ZipBtn icon={<Save size={12} />} onClick={() => void onSaveDraft()} variant="primary">保存草稿</ZipBtn>
            <ZipBtn icon={<Eye size={12} />} onClick={() => void onOpenDraftSource()}>打开来源</ZipBtn>
          </div>
        </ZipCard>
      </div>
    </div>
  );
}

void ZipDraftPageLegacy;
void ZipRssPage;
void ZipManualPage;
void ZipHotspotPage;
void ZipAgendaPage;
void ZipDraftPage;
void ZipCommonActions;

function ZipHistoryPage({ draft, historyDrafts, onExportDraft, onHistoryRefresh, onNavigate, onOpenDraftSource }: ZipProductPageProps) {
  const [filter, setFilter] = useState("全部");
  const [selected, setSelected] = useState(0);
  const [detailMode, setDetailMode] = useState<"summary" | "sources" | "trace">("summary");
  const items = historyDrafts.length > 0 ? historyDrafts : draft ? [draft] : [];
  const fallback = [
    { sourceCount: 8, status: "draft", title: "Agent 工具链进入生产化拐点", updatedAt: "2026.06.21" },
    { sourceCount: 11, status: "reviewed", title: "开源模型上下文窗口竞赛", updatedAt: "2026.06.20" },
    { sourceCount: 14, status: "published", title: "AI 浏览器与任务代理", updatedAt: "2026.06.19" },
    { sourceCount: 17, status: "draft", title: "企业知识库 RAG 复兴", updatedAt: "2026.06.18" }
  ];
  const rows = items.length
    ? items.map((item) => ({ sourceCount: item.sources.length, status: item.status, title: item.title, updatedAt: formatLooseDate(item.updatedAt) }))
    : fallback;
  const visibleRows = rows.filter((row) => filter === "全部" || statusLabel(row.status) === filter);
  const detail = visibleRows[Math.min(selected, Math.max(visibleRows.length - 1, 0))] ?? rows[0];

  return (
    <div className="zipPage">
      <ZipPageHeader
        actions={<ZipBtn icon={<RefreshCcw size={13} />} onClick={() => void onHistoryRefresh()} variant="primary">刷新历史</ZipBtn>}
        label="作品库"
        subtitle="列表筛选、状态切换、详情编辑和导出集中在这里。"
        title="管理过去保存的圆桌稿"
      />

      <div className="zipHistoryGrid">
        <ZipCard className="zipSectionCard">
          <div className="zipCardHeader">
            <div>
              <h3>圆桌历史</h3>
              <p>按状态、更新时间和来源筛选</p>
            </div>
            <div className="zipPillGroup">{["全部", "草稿", "已审", "已发布"].map((item) => <ZipPill active={filter === item} key={item} onClick={() => setFilter(item)}>{item}</ZipPill>)}</div>
          </div>
          <div className="zipStack">
            {visibleRows.map((item, index) => (
              <div className={`zipHistoryRow ${selected === index ? "active" : ""}`} key={`${item.title}-${index}`} onClick={() => setSelected(index)}>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.updatedAt} · {item.sourceCount} 来源</span>
                </div>
                <ZipPill variant={item.status === "published" ? "blue" : item.status === "reviewed" ? "success" : "warning"}>{statusLabel(item.status)}</ZipPill>
              </div>
            ))}
            {visibleRows.length === 0 && <div className="zipEmptyInline">没有这个状态的圆桌稿</div>}
          </div>
        </ZipCard>

        <ZipCard className="zipSectionCard zipDetailCard">
          <div className="zipCardHeader simple">
            <h3>详情编辑</h3>
            <p>选中历史后可二次编辑并导出</p>
          </div>
          <h2>{detail.title}</h2>
          <p>本期圆桌聚焦 agent 工具链的生产化趋势：浏览器操作、代码生成、企业权限和长任务调度正在合流。</p>
          <div className="zipStack">
            <ZipBtn icon={<FileText size={12} />} onClick={() => onNavigate("roundtable")} variant="primary">编辑标题摘要</ZipBtn>
            <ZipBtn icon={<Eye size={12} />} onClick={() => { setDetailMode("sources"); void onOpenDraftSource(); }}>查看来源</ZipBtn>
            <ZipBtn icon={<BarChart2 size={12} />} onClick={() => setDetailMode("trace")}>查看 Agent Trace</ZipBtn>
            <ZipBtn icon={<Download size={12} />} onClick={() => void onExportDraft("mp3")}>导出 MP3</ZipBtn>
          </div>
          <div className="zipTraceBox">
            <strong>{detailMode === "sources" ? "来源" : detailMode === "trace" ? "Agent Trace" : "摘要"}</strong>
            <p>
              {detailMode === "sources"
                ? `当前稿件包含 ${detail.sourceCount} 个来源，已尝试打开第一个来源。`
                : detailMode === "trace"
                  ? "包含中控决策、工具调用、来源摘要和生成轮次。"
                  : "本期圆桌聚焦 agent 工具链的生产化趋势。"}
            </p>
          </div>
        </ZipCard>
      </div>
    </div>
  );
}

function statusLabel(status: EpisodeDraft["status"] | string) {
  if (status === "published") return "已发布";
  if (status === "reviewed") return "已审";
  return "草稿";
}

const INTELLIGENCE_MODE_OPTIONS: Array<{
  depth: DiscussionDepth;
  hint: string;
  label: string;
  mode: DraftGenerationMode;
}> = [
  { depth: "low", label: "低", hint: "更快更省", mode: "single" },
  { depth: "medium", label: "中", hint: "默认平衡", mode: "multi_agent" },
  { depth: "high", label: "高", hint: "更充分更深", mode: "autonomous_agent" }
];

function intelligenceDepthFromMode(mode: DraftGenerationMode): DiscussionDepth {
  if (mode === "autonomous_agent") return "high";
  if (mode === "multi_agent") return "medium";
  return "low";
}

function ZipSettingsPage({
  agentRuntimeSettings,
  appDataDir,
  draftGenerationMode,
  job,
  modelCatalog,
  onDraftGenerationModeChange,
  onModelChange,
  onProviderChange,
  onRefreshFromProvider,
  onSaveAgentSettings,
  onSaveSettings,
  onTestSettingsPanel,
  providerSettings,
  selectedModel,
  selectedProviderId
}: ZipProductPageProps) {
  const isSaving = isJobRunning(job, "save");
  const isFetching = isJobRunning(job, "fetch");
  const selectedProvider = modelCatalog.find((provider) => provider.id === selectedProviderId);
  const saved = providerSettings.find((settings) => settings.providerId === selectedProviderId);
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? "");
  const [baseUrl, setBaseUrl] = useState(saved?.baseUrl ?? selectedProvider?.baseUrl ?? "");
  const [agentSettingsDraft, setAgentSettingsDraft] = useState<AgentRuntimeSettings>(agentRuntimeSettings);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentAdvancedOpen, setAgentAdvancedOpen] = useState(false);
  const intelligenceDepth = intelligenceDepthFromMode(draftGenerationMode);

  useEffect(() => {
    setApiKey(saved?.apiKey ?? "");
    setBaseUrl(saved?.baseUrl ?? selectedProvider?.baseUrl ?? "");
  }, [saved?.apiKey, saved?.baseUrl, selectedProvider?.baseUrl, selectedProviderId]);

  useEffect(() => {
    setAgentSettingsDraft(agentRuntimeSettings);
  }, [agentRuntimeSettings]);

  const currentSettings: ProviderSettings = {
    providerId: selectedProviderId,
    baseUrl,
    apiKey,
    selectedModel,
    draftGenerationMode
  };

  function applyIntelligence(depth: DiscussionDepth) {
    const option = INTELLIGENCE_MODE_OPTIONS.find((item) => item.depth === depth) ?? INTELLIGENCE_MODE_OPTIONS[1];
    onDraftGenerationModeChange(option.mode);
    setAgentSettingsDraft((prev) => ({ ...prev, discussionDepth: option.depth }));
  }

  async function saveCoreSettings() {
    await onSaveSettings({
      ...currentSettings,
      draftGenerationMode: INTELLIGENCE_MODE_OPTIONS.find((item) => item.depth === intelligenceDepth)?.mode ?? draftGenerationMode
    });
    await onSaveAgentSettings({
      ...agentSettingsDraft,
      discussionDepth: intelligenceDepth
    });
  }

  async function saveAgentSettingsOnly() {
    await onSaveAgentSettings({
      ...agentSettingsDraft,
      discussionDepth: intelligenceDepth
    });
  }

  return (
    <div className="zipPage zipSettingsPage">
      <ZipPageHeader
        label="配置中心"
        subtitle="一分钟完成大模型配置，再按需打开 Agent 能力。"
        title="模型与智能 Agent 设置"
      />

      <ZipCard className="zipSectionCard zipSettingsCoreCard">
        <div className="zipCardHeader">
          <div>
            <h3>核心模型</h3>
            <p>用于圆桌议程与成稿生成。</p>
          </div>
          <ZipPill variant={apiKey || !selectedProvider?.requiresApiKey ? "success" : "warning"}>
            {apiKey || !selectedProvider?.requiresApiKey ? "已配置" : "待配置"}
          </ZipPill>
        </div>

        <div className="zipSettingsFields">
          <label className="zipField">
            <span>厂商</span>
            <select onChange={(event) => onProviderChange(event.target.value)} value={selectedProviderId}>
              {modelCatalog.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </label>
          <label className="zipField">
            <span>模型</span>
            <select onChange={(event) => onModelChange(event.target.value)} value={selectedModel}>
              {(selectedProvider?.models ?? []).map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
            <button
              className="zipQuietLink"
              disabled={isFetching || isSaving}
              onClick={() => void onRefreshFromProvider(currentSettings)}
              type="button"
            >
              更新模型列表
            </button>
          </label>
        </div>

        <label className="zipField">
          <span>Base URL</span>
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
        </label>
        <label className="zipField">
          <span>API Key</span>
          <input
            autoComplete="off"
            placeholder={selectedProvider?.requiresApiKey ? "输入后本地保存，界面不会明文展示完整 key" : "本地生成器不需要 API Key"}
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
        </label>

        <div className="zipIntelligenceBlock">
          <p className="zipFieldLabel">智能模式</p>
          <div className="zipIntelligenceGrid" role="radiogroup" aria-label="智能模式">
            {INTELLIGENCE_MODE_OPTIONS.map((option) => {
              const active = intelligenceDepth === option.depth;
              return (
                <button
                  aria-checked={active}
                  className={active ? "zipModeCard active" : "zipModeCard"}
                  key={option.depth}
                  onClick={() => applyIntelligence(option.depth)}
                  role="radio"
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.hint}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="zipSettingsFooter">
          <p className="mutedText">数据保存在本地。目录：{appDataDir || "未读取"}</p>
          <div className="zipButtonRow">
            <ZipBtn disabled={isFetching || isSaving} icon={<Shield size={12} />} onClick={() => void onTestSettingsPanel("model")}>测试</ZipBtn>
            <ZipBtn disabled={isSaving} onClick={() => void saveCoreSettings()} variant="primary">{isSaving ? "保存中…" : "保存设置"}</ZipBtn>
          </div>
        </div>
      </ZipCard>

      <button
        aria-expanded={agentOpen}
        className={agentOpen ? "zipDisclosureBtn active" : "zipDisclosureBtn"}
        onClick={() => setAgentOpen((open) => !open)}
        type="button"
      >
        <ChevronRight size={16} />
        更多能力 · Agent
      </button>

      {agentOpen && (
        <ZipCard className="zipSectionCard zipSettingsAgentCard">
          <div className="zipCardHeader">
            <div>
              <h3>Agent 工具</h3>
              <p>强自治圆桌可用的检索与调试选项。智能模式沿用上方低 / 中 / 高。</p>
            </div>
            <ZipPill variant={agentSettingsDraft.searchApiKey ? "success" : "neutral"}>
              {agentSettingsDraft.searchApiKey ? "已配置搜索" : "可选"}
            </ZipPill>
          </div>

          <button
            className="zipQuietLink zipAdvancedToggle"
            onClick={() => setAgentAdvancedOpen((open) => !open)}
            type="button"
          >
            {agentAdvancedOpen ? "收起高级设置" : "高级设置（搜索 API）"}
          </button>

          {agentAdvancedOpen && (
            <div className="zipAgentAdvanced">
              <label className="zipField">
                <span>Search API Base URL</span>
                <input
                  placeholder="https://your-search-api.example.com/search"
                  value={agentSettingsDraft.searchBaseUrl}
                  onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, searchBaseUrl: event.target.value })}
                />
              </label>
              <label className="zipField">
                <span>Search API Key</span>
                <input
                  autoComplete="off"
                  type="password"
                  value={agentSettingsDraft.searchApiKey ?? ""}
                  onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, searchApiKey: event.target.value })}
                />
              </label>
              <div className="zipSettingsFields">
                <label className="zipField">
                  <span>搜索语言</span>
                  <input
                    value={agentSettingsDraft.searchLanguage}
                    onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, searchLanguage: event.target.value })}
                  />
                </label>
                <label className="zipField">
                  <span>默认结果数</span>
                  <input
                    max={10}
                    min={1}
                    type="number"
                    value={agentSettingsDraft.searchMaxResults}
                    onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, searchMaxResults: Number(event.target.value) })}
                  />
                </label>
              </div>
              <label className="zipField">
                <span>搜索时间范围（天，可空）</span>
                <input
                  min={0}
                  type="number"
                  value={agentSettingsDraft.searchRecencyDays ?? ""}
                  onChange={(event) => setAgentSettingsDraft({
                    ...agentSettingsDraft,
                    searchRecencyDays: event.target.value ? Number(event.target.value) : undefined
                  })}
                />
              </label>
              <label className="checkboxLine">
                <input
                  checked={agentSettingsDraft.debugTraceEnabled}
                  type="checkbox"
                  onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, debugTraceEnabled: event.target.checked })}
                />
                保存 debug 级完整 agent trace
              </label>
            </div>
          )}

          <div className="zipButtonRow">
            <ZipBtn disabled={isFetching || isSaving} onClick={() => void onTestSettingsPanel("agent")}>测试 Agent</ZipBtn>
            <ZipBtn disabled={isSaving} onClick={() => void saveAgentSettingsOnly()} variant="primary">{isSaving ? "保存中…" : "保存 Agent"}</ZipBtn>
          </div>
        </ZipCard>
      )}
    </div>
  );
}

function compactText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getCurrentWeekRange() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 7);
  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(today)
  };
}

function formatDateCn(value: string) {
  if (!value) return "未设置";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日`;
}

function formatDateTimeCn(value: string) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function primarySourceName(hotspot: HotspotCandidate) {
  return hotspot.sources[0]?.publisher ?? "Unknown RSS";
}

function primarySourceDate(hotspot: HotspotCandidate) {
  return formatLooseDate(hotspot.sources[0]?.publishedAt ?? hotspot.createdAt);
}

function formatLooseDate(value: string) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getFullYear()}年${String(date.getMonth() + 1).padStart(2, "0")}月${String(date.getDate()).padStart(2, "0")}日`;
  }
  return value.slice(0, 10);
}

function fileSafeName(value: string) {
  const sanitized = Array.from(value)
    .map((char) => (char.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(char) ? "-" : char))
    .join("");
  return sanitized.replace(/-+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "roundtable";
}

function draftToMarkdown(draft: EpisodeDraft) {
  const sourceLines = draft.sources
    .map((source, index) => `${index + 1}. ${source.publisher} - ${source.title}${source.publishedAt ? ` (${formatLooseDate(source.publishedAt)})` : ""}\n   ${source.url}`)
    .join("\n");
  const dialogueLines = draft.dialogue
    .map((turn, index) => {
      const label = dialogueSpeakerLabel(draft, turn);
      const marker = turn.interrupted ? "（被用户打断）" : "";
      return `### ${index + 1}. ${label}${marker}\n\n${turn.text}`;
    })
    .join("\n\n");
  return `# ${draft.title}

生成时间：${formatDateTimeCn(draft.createdAt)}
更新时间：${formatDateTimeCn(draft.updatedAt)}
状态：${draft.status}

## 摘要

${draft.summary}

## 来源

${sourceLines || "未记录来源"}

## 圆桌正文

${dialogueLines}

## Takeaways

${draft.takeaways.map((item) => `- ${item}`).join("\n")}

## Fact Checks

${draft.factChecks.map((item) => `- ${item}`).join("\n")}
`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function draftToHtmlDocument(draft: EpisodeDraft) {
  const turns = draft.dialogue
    .map((turn) => {
      const label = dialogueSpeakerLabel(draft, turn);
      return `<article class="turn"><div><span>${escapeHtml(label)}</span><small>${escapeHtml(turn.interrupted ? "被用户打断" : turn.intent)}</small></div><p>${escapeHtml(turn.text)}</p></article>`;
    })
    .join("");
  const sources = draft.sources
    .map((source) => `<button class="sourceChip"><span><strong>${escapeHtml(source.publisher)}</strong>${source.publishedAt ? `<small>${escapeHtml(formatLooseDate(source.publishedAt))}</small>` : ""}</span><em>${escapeHtml(source.title)}</em></button>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(draft.title)}</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body { margin: 0; font-family: "Microsoft YaHei", "Segoe UI", sans-serif; color: #e8eef2; background: #080b0f; line-height: 1.65; }
      main { max-width: 1180px; margin: 0 auto; padding: 28px; }
      .contentPane { min-height: 680px; padding: 18px; border: 1px solid rgba(151, 174, 180, 0.14); border-radius: 8px; background: rgba(10, 15, 19, 0.92); }
      .viewStack { display: grid; gap: 12px; }
      .detailTitleBlock { display: grid; gap: 6px; }
      .eyebrow { margin: 0; color: #8ea0a7; font-size: 12px; text-transform: uppercase; letter-spacing: 0; }
      h1 { margin: 0; font-size: 24px; line-height: 1.25; color: #e8eef2; }
      .sectionMeta { margin: 0; color: #8ea0a7; font-size: 13px; }
      .summary, .turn p, .sourceChip em { color: #a9b8bd; line-height: 1.65; }
      .summary { margin: 0; }
      .dialogueFlow { display: grid; gap: 12px; }
      .turn { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 14px; padding: 14px; border: 1px solid rgba(151, 174, 180, 0.13); border-radius: 8px; background: rgba(17, 24, 30, 0.72); break-inside: avoid; }
      .turn span { display: block; color: #55f0dd; font-size: 13px; font-weight: 700; }
      .turn small { color: #8ea0a7; font-size: 12px; }
      .turn p { margin: 0; }
      .historySources { display: grid; gap: 10px; }
      .historySources h2 { margin: 0; font-size: 18px; color: #e8eef2; }
      .sourceChip { display: grid; grid-template-columns: minmax(160px, 0.45fr) minmax(0, 1fr); gap: 12px; width: 100%; padding: 12px; border: 1px solid rgba(151, 174, 180, 0.13); border-radius: 8px; color: #dbe5e9; text-align: left; background: rgba(17, 24, 30, 0.48); }
      .sourceChip strong, .sourceChip small { display: block; }
      .sourceChip strong { color: #edf7f8; }
      .sourceChip small { margin-top: 4px; color: #8ea0a7; font-size: 12px; }
      .sourceChip em { font-style: normal; overflow-wrap: anywhere; }
    </style>
  </head>
  <body><main><section class="contentPane"><div class="viewStack"><section class="detailTitleBlock"><p class="eyebrow">圆桌详情</p><h1>${escapeHtml(draft.title)}</h1><p class="sectionMeta">生成时间：${escapeHtml(formatDateTimeCn(draft.createdAt))} · 更新时间：${escapeHtml(formatDateTimeCn(draft.updatedAt))}</p></section><p class="summary">${escapeHtml(draft.summary)}</p><div class="dialogueFlow">${turns}</div><div class="historySources"><h2>来源</h2>${sources}</div></div></section></main></body>
</html>`;
}

function dialogueSpeakerLabel(draft: EpisodeDraft, turn: DialogueTurn) {
  if (turn.speakerId === "user") return "你";
  return draft.guests.find((item) => item.id === turn.speakerId)?.label ?? turn.speakerId;
}

function interactiveActiveSpeakerLabel(draft: EpisodeDraft, status: InteractiveSessionEvent | null) {
  if (status?.activeSpeakerId) {
    if (status.activeSpeakerId === "user") return "等待你的发言";
    const guest = draft.guests.find((item) => item.id === status.activeSpeakerId);
    return guest ? `${guest.label}正在发言` : `${status.activeSpeakerId} 正在发言`;
  }
  const lastTurn = draft.dialogue[draft.dialogue.length - 1];
  if (lastTurn) return `${dialogueSpeakerLabel(draft, lastTurn)}刚刚发言`;
  return "中控 Agent 正在调度";
}

function draftToExportElement(draft: EpisodeDraft) {
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "1180px";
  wrapper.innerHTML = draftToHtmlDocument(draft).match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "";
  document.body.appendChild(wrapper);
  return wrapper;
}

async function blobToBase64(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return window.btoa(binary);
}

async function draftToPdfBase64(draft: EpisodeDraft) {
  const element = draftToExportElement(draft);
  try {
    const canvas = await html2canvas(element, {
      backgroundColor: "#080b0f",
      scale: 2,
      useCORS: true
    });
    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 24;
    const imageWidth = pageWidth - margin * 2;
    const pageCanvas = document.createElement("canvas");
    const pageContext = pageCanvas.getContext("2d");
    if (!pageContext) throw new Error("无法创建 PDF 渲染画布");
    const sourcePageHeight = Math.floor(((pageHeight - margin * 2) * canvas.width) / imageWidth);
    pageCanvas.width = canvas.width;
    pageCanvas.height = sourcePageHeight;
    let rendered = 0;
    let page = 0;
    while (rendered < canvas.height) {
      const sliceHeight = Math.min(sourcePageHeight, canvas.height - rendered);
      pageCanvas.height = sliceHeight;
      pageContext.fillStyle = "#080b0f";
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(canvas, 0, rendered, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (page > 0) pdf.addPage();
      const pageData = pageCanvas.toDataURL("image/jpeg", 0.92);
      const outputHeight = (sliceHeight * imageWidth) / canvas.width;
      pdf.addImage(pageData, "JPEG", margin, margin, imageWidth, outputHeight);
      rendered += sourcePageHeight;
      page += 1;
    }
    return blobToBase64(pdf.output("blob"));
  } finally {
    element.remove();
  }
}

async function saveDraftAs(draft: EpisodeDraft, format: "md" | "html" | "pdf" | "mp3") {
  const baseName = fileSafeName(draft.title);
  const filters = {
    md: [{ name: "Markdown", extensions: ["md"] }],
    html: [{ name: "HTML", extensions: ["html"] }],
    pdf: [{ name: "PDF", extensions: ["pdf"] }],
    mp3: [{ name: "MP3 Audio", extensions: ["mp3"] }]
  }[format];
  const selectedPath = await saveDialog({
    defaultPath: `${baseName}.${format}`,
    filters
  });
  if (!selectedPath) return null;

  if (format === "pdf") {
    const base64Pdf = await draftToPdfBase64(draft);
    await writeBinaryFile(selectedPath, base64Pdf);
    return selectedPath;
  }

  if (format === "mp3") {
    await exportEpisodeMp3(draft, selectedPath);
    return selectedPath;
  }

  const content = format === "html" ? draftToHtmlDocument(draft) : draftToMarkdown(draft);
  await writeTextFile(selectedPath, content);
  return selectedPath;
}

function makeFeedId(url: string) {
  return `feed-${url.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || Date.now()}`;
}

function hotspotRecencyMs(hotspot: HotspotCandidate): number {
  const publishedAt = hotspot.sources[0]?.publishedAt ?? hotspot.createdAt;
  const ms = new Date(publishedAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function compareHotspotsByRecency(left: HotspotCandidate, right: HotspotCandidate): number {
  return hotspotRecencyMs(right) - hotspotRecencyMs(left);
}

function filterHotspots(hotspots: HotspotCandidate[], filters: HotspotFilters) {
  return hotspots
    .filter((hotspot) => {
      const publishedAt = hotspot.sources[0]?.publishedAt ?? hotspot.createdAt;
      const dateValue = publishedAt ? new Date(publishedAt).getTime() : new Date(hotspot.createdAt).getTime();
      const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
      const matchesTime = Number.isNaN(dateValue) || (dateValue >= start && dateValue <= end);
      const matchesTag = filters.tag === "all" || hotspot.matchedSignals.includes(filters.tag);
      const matchesSource = filters.source === "all" || hotspot.sources.some((source) => source.publisher === filters.source);
      return matchesTime && matchesTag && matchesSource;
    })
    .sort(compareHotspotsByRecency);
}

function mergeHotspots(hotspots: HotspotCandidate[]) {
  if (hotspots.length === 0) return null;
  if (hotspots.length === 1) return hotspots[0];

  const sources = hotspots.flatMap((hotspot) => hotspot.sources);
  const dedupedSources = sources.filter((source, index) => sources.findIndex((item) => item.url === source.url) === index);
  const signals = hotspots.flatMap((hotspot) => hotspot.matchedSignals);
  const dedupedSignals = Array.from(new Set(signals));

  return {
    id: `merged-${hotspots.map((hotspot) => hotspot.id).join("-")}`,
    title: `多源圆桌：${hotspots.map((hotspot) => hotspot.title).slice(0, 3).join(" / ")}`,
    summary: hotspots.map((hotspot) => hotspot.summary).join("\n\n"),
    category: hotspots[0].category,
    status: "shortlisted",
    sourceCount: dedupedSources.length,
    sources: dedupedSources,
    matchedSignals: dedupedSignals,
    createdAt: new Date().toISOString(),
    note: `由 ${hotspots.length} 个候选源合并生成`
  } satisfies HotspotCandidate;
}

function createStreamingDraftShell(plan: RoundtablePlan, hotspot: HotspotCandidate): EpisodeDraft {
  const timestamp = new Date().toISOString();
  const topicTitle = plan.topicTitle?.trim() || hotspot.title;
  const topicSummary = plan.topicSummary?.trim() || "圆桌稿正在流式生成，新的嘉宾发言会逐轮出现在下方。";
  return {
    id: `streaming-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: `正在生成：${topicTitle}`,
    summary: topicSummary,
    status: "draft",
    planId: plan.id,
    hotspotId: hotspot.id,
    sources: hotspot.sources,
    guests: plan.guests,
    dialogue: [],
    takeaways: [],
    factChecks: plan.sourceRisks,
    agentTrace: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function appendTokenToTurns(turns: DialogueTurn[], turn: DialogueTurn, textDelta: string) {
  const last = turns[turns.length - 1];
  if (last && last.speakerId === turn.speakerId && last.intent === turn.intent) {
    return [
      ...turns.slice(0, -1),
      {
        ...last,
        text: `${last.text}${textDelta}`
      }
    ];
  }
  return [
    ...turns,
    {
      ...turn,
      text: textDelta
    }
  ];
}

function upsertFinalTurn(turns: DialogueTurn[], turn: DialogueTurn) {
  const last = turns[turns.length - 1];
  if (last && last.speakerId === turn.speakerId && last.intent === turn.intent && (last.text === turn.text || turn.text.startsWith(last.text))) {
    return [...turns.slice(0, -1), turn];
  }
  return [...turns, turn];
}

function PageHeader({
  actions,
  eyebrow,
  meta,
  title
}: {
  actions?: ReactNode;
  eyebrow: string;
  meta?: string;
  title: string;
}) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {meta && <p className="sectionMeta">{meta}</p>}
      </div>
      {actions && <div className="topbarActions">{actions}</div>}
    </header>
  );
}

function getViewCopy(view: AppView) {
  const copy: Record<AppView, { eyebrow: string; title: string; meta: string }> = {
    workbench: {
      eyebrow: "本周入口",
      title: "把本周 AI 热点做成一场圆桌",
      meta: "先选题，再进圆桌；来源、模拟角色和事实风险保持可见。"
    },
    hotspots: {
      eyebrow: "热点库",
      title: "候选、RSS 与手动补充",
      meta: "在同一枢纽完成选题与来源配置。"
    },
    roundtable: {
      eyebrow: "圆桌",
      title: "议程到成稿的线性流程",
      meta: "前序未完成时不可跳步；嘉宾保持模拟角色标注。"
    },
    history: {
      eyebrow: "历史",
      title: "回看已生成的圆桌稿",
      meta: "复盘来源、导出内容，并继续编辑已保存草稿。"
    },
    settings: {
      eyebrow: "设置",
      title: "配置模型、语音和本地运行方式",
      meta: "API Key 保存在本地，生成链路保持 OpenAI 兼容。"
    }
  };

  return copy[view];
}

function ProgramHero({
  draft,
  feeds,
  hotspots,
  selectedHotspotIds
}: {
  draft: EpisodeDraft | null;
  feeds: FeedSource[];
  hotspots: HotspotCandidate[];
  selectedHotspotIds: string[];
}) {
  const primaryHotspot = hotspots[0];
  const readiness = Math.min(
    96,
    Math.round(
      (feeds.length > 0 ? 22 : 0) +
        (hotspots.length > 0 ? 24 : 0) +
        (selectedHotspotIds.length > 0 ? 18 : 0) +
        (draft ? 22 : 0) +
        8
    )
  );
  const selectedCount = selectedHotspotIds.length;

  return (
    <section className="programHero">
      <article className="programFeature">
        <div className="topicArt" aria-hidden="true">
          <span>本期主题</span>
          <strong>{primaryHotspot ? compactText(primaryHotspot.title, 22) : "端侧智能正在改变 AI 产品节奏"}</strong>
          <div className="topicBars">
            {Array.from({ length: 14 }).map((_, index) => (
              <i key={index} style={{ height: `${18 + ((index * 13) % 52)}px` }} />
            ))}
          </div>
        </div>
        <div className="programFeatureText">
          <span>推荐节目线</span>
          <h2>{primaryHotspot ? compactText(primaryHotspot.title, 34) : "OpenAI、端侧模型与浏览器 Agent 的新分歧"}</h2>
          <p>{primaryHotspot ? compactText(primaryHotspot.summary, 90) : "把多个来源收束成一个可讨论主题：谁会掌控下一代 AI 入口？节目会保留真实来源、模拟角色标注和事实风险提示。"}</p>
          <div className="heroChips">
            <span>{feeds.length || 0} 个来源</span>
            <span>{selectedCount > 0 ? `${selectedCount} 个已选` : "待选题"}</span>
            <span>{draft ? "草稿已生成" : "草稿待生成"}</span>
          </div>
        </div>
      </article>

      <aside className="readinessPanel">
        <div className="readinessTop">
          <h2>节目准备度</h2>
          <strong>{readiness}%</strong>
        </div>
        <ol className="readinessList">
          <li className={selectedCount > 0 ? "done" : ""}>热点已选择</li>
          <li className={hotspots.length > 0 ? "done" : ""}>素材已抓取</li>
          <li className={feeds.length > 0 ? "done muted" : "muted"}>来源风险待核查</li>
          <li className={draft ? "done muted" : "muted"}>草稿生成</li>
        </ol>
        <div className="progressTrack"><span style={{ width: `${readiness}%` }} /></div>
      </aside>
    </section>
  );
}

function ProductStatusStrip({
  draft,
  feeds,
  hotspots,
  job
}: {
  draft: EpisodeDraft | null;
  feeds: FeedSource[];
  hotspots: HotspotCandidate[];
  job: GenerationJob;
}) {
  return (
    <section className="statusStrip" aria-live="polite">
      <StatusPill label="本地后端" value={job.status === "failed" ? "需要检查" : job.status === "running" ? "运行中" : "已连接"} tone={job.status === "failed" ? "danger" : job.status === "running" ? "warning" : "success"} />
      <StatusPill label="RSS 源" value={`${feeds.length} 个`} tone="neutral" />
      <StatusPill label="候选热点" value={`${hotspots.length} 条`} tone="neutral" />
      <StatusPill label="草稿状态" value={draft?.status ?? "未生成"} tone={draft?.status === "reviewed" || draft?.status === "published" ? "success" : "warning"} />
    </section>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div className={`statusPill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ProductDateRangeControl({
  endDate,
  onSetCurrentWeek,
  onUpdate,
  startDate
}: {
  endDate: string;
  onSetCurrentWeek: () => void;
  onUpdate: (startDate: string, endDate: string) => void;
  startDate: string;
}) {
  return (
    <div className="dateRangeControl">
      <CalendarDays size={16} />
      <input aria-label="开始日期" type="date" value={startDate} onChange={(event) => onUpdate(event.target.value, endDate)} />
      <span>至</span>
      <input aria-label="结束日期" type="date" value={endDate} onChange={(event) => onUpdate(startDate, event.target.value)} />
      <button className="miniButton" onClick={onSetCurrentWeek} type="button">本周</button>
    </div>
  );
}

function ProductHotspotWorkspace({
  availableSources,
  availableTags,
  filters,
  hotspots,
  mode,
  onClearFilters,
  onFiltersChange,
  totalHotspots,
  selectedHotspotIds,
  onGeneratePlan,
  onSelectHotspot,
  onToggleHotspotSelection,
  onOpenSource,
  onFetch
}: {
  availableSources: string[];
  availableTags: string[];
  filters: HotspotFilters;
  hotspots: HotspotCandidate[];
  mode: "compact" | "library";
  onClearFilters: () => void;
  onFiltersChange: (filters: HotspotFilters) => void;
  totalHotspots: number;
  selectedHotspotIds: string[];
  onGeneratePlan: () => void;
  onSelectHotspot: (hotspot: HotspotCandidate) => void;
  onToggleHotspotSelection: (hotspot: HotspotCandidate) => void;
  onOpenSource: (hotspot: HotspotCandidate) => void;
  onFetch: () => void;
}) {
  const hasSelection = selectedHotspotIds.length > 0;

  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">{mode === "compact" ? "今天可聊的热点" : "热点库"}</p>
          <h2>{mode === "compact" ? "像内容产品一样先给出选择，再保留编辑能力" : "从候选热点中挑出本期圆桌主题"}</h2>
          <p className="sectionMeta">当前显示 {hotspots.length} / {totalHotspots} 条候选，已选择 {selectedHotspotIds.length} 条。</p>
        </div>
        <div className="buttonGroup">
          <button className="ghostButton" disabled={!hasSelection} onClick={onGeneratePlan} type="button">
            <Bot size={16} />
            生成议程{selectedHotspotIds.length > 1 ? `(${selectedHotspotIds.length})` : ""}
          </button>
        </div>
      </section>

      <ProductFilterControls
        availableSources={availableSources}
        availableTags={availableTags}
        filters={filters}
        onClearFilters={onClearFilters}
        onFiltersChange={onFiltersChange}
      />

      {hotspots.length === 0 ? (
        <EmptyState title="还没有候选热点" text="点击抓取 RSS，本地后端会读取来源配置并生成候选；如果已经抓取过，请检查筛选条件。" actionLabel="抓取 RSS" onAction={onFetch} />
      ) : (
        <ProductHotspotQueue
          hotspots={hotspots}
          onOpenSource={onOpenSource}
          onSelectHotspot={onSelectHotspot}
          onToggleHotspotSelection={onToggleHotspotSelection}
          selectedHotspotIds={selectedHotspotIds}
        />
      )}
    </div>
  );
}

function ProductHotspotQueue({
  hotspots,
  onOpenSource,
  onSelectHotspot,
  onToggleHotspotSelection,
  selectedHotspotIds
}: {
  hotspots: HotspotCandidate[];
  onOpenSource: (hotspot: HotspotCandidate) => void;
  onSelectHotspot: (hotspot: HotspotCandidate) => void;
  onToggleHotspotSelection: (hotspot: HotspotCandidate) => void;
  selectedHotspotIds: string[];
}) {
  return (
    <div className="productHotspotGrid">
      {hotspots.map((hotspot) => {
        const selected = selectedHotspotIds.includes(hotspot.id);
        return (
          <article
            className={selected ? "productHotspotCard selected" : "productHotspotCard"}
            key={hotspot.id}
            onClick={() => {
              onSelectHotspot(hotspot);
              onToggleHotspotSelection(hotspot);
            }}
          >
            <header>
              <span className={selected ? "selectionBadge isSelected" : "selectionBadge"}>{selected ? "主选题" : "备选"}</span>
            </header>
            <button className="textOpenButton" onClick={(event) => { event.stopPropagation(); void onOpenSource(hotspot); }} type="button">
              <h3>{hotspot.title}</h3>
            </button>
            <p>{compactText(hotspot.summary, 92)}</p>
            <div className="hotspotSignals">
              {hotspot.matchedSignals.slice(0, 3).map((signal) => (
                <span className="tag" key={signal}>{signal}</span>
              ))}
            </div>
            <footer>
              <span>{primarySourceName(hotspot)}</span>
              <span>{hotspot.sourceCount} 个来源</span>
              <span>{hotspot.status}</span>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function ProductFilterControls({
  availableSources,
  availableTags,
  filters,
  onClearFilters,
  onFiltersChange
}: {
  availableSources: string[];
  availableTags: string[];
  filters: HotspotFilters;
  onClearFilters: () => void;
  onFiltersChange: (filters: HotspotFilters) => void;
}) {
  return (
    <section className="filterPanel">
      <div className="filterPanelHeader">
        <div>
          <strong>筛选候选</strong>
          <span>按时间、标签和 RSS 来源收窄本周选题。</span>
        </div>
        <button className="miniButton" onClick={onClearFilters} type="button">
          <RefreshCcw size={14} />
          清空
        </button>
      </div>
      <div className="filterBar">
        <label>
          开始
          <input type="date" value={filters.startDate} onChange={(event) => onFiltersChange({ ...filters, startDate: event.target.value })} />
        </label>
        <label>
          结束
          <input type="date" value={filters.endDate} onChange={(event) => onFiltersChange({ ...filters, endDate: event.target.value })} />
        </label>
        <label>
          标签
          <select value={filters.tag} onChange={(event) => onFiltersChange({ ...filters, tag: event.target.value })}>
            <option value="all">全部标签</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </label>
        <label>
          RSS 来源
          <select value={filters.source} onChange={(event) => onFiltersChange({ ...filters, source: event.target.value })}>
            <option value="all">全部来源</option>
            {availableSources.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function Workbench({
  availableSources,
  availableTags,
  filters,
  hotspots,
  onClearFilters,
  onFiltersChange,
  totalHotspots,
  selectedHotspotIds,
  onGeneratePlan,
  onSelectHotspot,
  onToggleHotspotSelection,
  onOpenSource,
  onFetch
}: {
  availableSources: string[];
  availableTags: string[];
  filters: HotspotFilters;
  hotspots: HotspotCandidate[];
  onClearFilters: () => void;
  onFiltersChange: (filters: HotspotFilters) => void;
  totalHotspots: number;
  selectedHotspotIds: string[];
  onGeneratePlan: () => void;
  onSelectHotspot: (hotspot: HotspotCandidate) => void;
  onToggleHotspotSelection: (hotspot: HotspotCandidate) => void;
  onOpenSource: (hotspot: HotspotCandidate) => void;
  onFetch: () => void;
}) {
  const hasSelection = selectedHotspotIds.length > 0;

  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">本周短名单</p>
          <h2>从真实 RSS 抓取到圆桌稿</h2>
          <p className="sectionMeta">当前显示 {hotspots.length} / {totalHotspots} 条候选</p>
        </div>
        <div className="buttonGroup">
          <button className="ghostButton" disabled={!hasSelection} onClick={onGeneratePlan} type="button">
            <Bot size={16} />
            生成议程{selectedHotspotIds.length > 1 ? `(${selectedHotspotIds.length})` : ""}
          </button>
        </div>
      </section>

      <FilterControls
        availableSources={availableSources}
        availableTags={availableTags}
        filters={filters}
        onClearFilters={onClearFilters}
        onFiltersChange={onFiltersChange}
      />

      {hotspots.length === 0 ? (
        <EmptyState title="还没有候选热点" text="点击抓取 RSS，后端会读取本地 RSS 源配置并抓取真实候选；如果已抓取过，请检查筛选条件。" actionLabel="抓取 RSS" onAction={onFetch} />
      ) : (
        <HotspotQueue
          hotspots={hotspots}
          onOpenSource={onOpenSource}
          onSelectHotspot={onSelectHotspot}
          onToggleHotspotSelection={onToggleHotspotSelection}
          selectedHotspotIds={selectedHotspotIds}
        />
      )}
    </div>
  );
}

void Workbench;

function HotspotQueue({
  hotspots,
  onOpenSource,
  onSelectHotspot,
  onToggleHotspotSelection,
  selectedHotspotIds
}: {
  hotspots: HotspotCandidate[];
  onOpenSource: (hotspot: HotspotCandidate) => void;
  onSelectHotspot: (hotspot: HotspotCandidate) => void;
  onToggleHotspotSelection: (hotspot: HotspotCandidate) => void;
  selectedHotspotIds: string[];
}) {
  return (
    <div className="hotspotGrid hotspotQueue">
      {hotspots.map((hotspot) => {
        const selected = selectedHotspotIds.includes(hotspot.id);
        return (
          <article
            className={selected ? "hotspotCard selected" : "hotspotCard"}
            key={hotspot.id}
            onClick={() => {
              onSelectHotspot(hotspot);
              onToggleHotspotSelection(hotspot);
            }}
          >
            <div className={selected ? "selectionBadge isSelected" : "selectionBadge"}>
              {selected ? "已选择" : "未选择"}
            </div>
            <div className="hotspotMeta">
              <span className="sourceName">{primarySourceName(hotspot)}</span>
              <span>{primarySourceDate(hotspot)}</span>
            </div>
            <button className="textOpenButton" onClick={(event) => { event.stopPropagation(); void onOpenSource(hotspot); }} type="button">
              <h3>{hotspot.title}</h3>
            </button>
            <p>{hotspot.summary}</p>
            <div className="hotspotSignals">
              {hotspot.matchedSignals.slice(0, 3).map((signal) => (
                <span className="tag" key={signal}>{signal}</span>
              ))}
            </div>
            <footer>
              <span>{hotspot.sourceCount} sources</span>
              <span>{hotspot.status}</span>
              <span>{hotspot.category}</span>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function FilterControls({
  availableSources,
  availableTags,
  filters,
  onClearFilters,
  onFiltersChange
}: {
  availableSources: string[];
  availableTags: string[];
  filters: HotspotFilters;
  onClearFilters: () => void;
  onFiltersChange: (filters: HotspotFilters) => void;
}) {
  return (
    <section className="filterPanel">
      <div className="filterPanelHeader">
        <div>
          <strong>筛选候选</strong>
          <span>按时间、标签和 RSS 来源收窄工作台卡片</span>
        </div>
        <button className="miniButton" onClick={onClearFilters} type="button">
          <RefreshCcw size={14} />
          清空
        </button>
      </div>
      <div className="filterBar">
        <label>
          开始
          <input type="date" value={filters.startDate} onChange={(event) => onFiltersChange({ ...filters, startDate: event.target.value })} />
        </label>
        <label>
          结束
          <input type="date" value={filters.endDate} onChange={(event) => onFiltersChange({ ...filters, endDate: event.target.value })} />
        </label>
        <label>
          标签
          <select value={filters.tag} onChange={(event) => onFiltersChange({ ...filters, tag: event.target.value })}>
            <option value="all">全部标签</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </select>
        </label>
        <label>
          RSS 来源
          <select value={filters.source} onChange={(event) => onFiltersChange({ ...filters, source: event.target.value })}>
            <option value="all">全部来源</option>
            {availableSources.map((source) => (
              <option key={source} value={source}>{source}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function InspectorPanel({
  draft,
  hotspot,
  job,
  onGeneratePlan,
  onOpenSource,
  plan,
  selectedCount
}: {
  draft: EpisodeDraft | null;
  hotspot: HotspotCandidate | null;
  job: GenerationJob;
  onGeneratePlan: () => void;
  onOpenSource: (url: string) => void;
  plan: RoundtablePlan | null;
  selectedCount: number;
}) {
  const hasSources = Boolean(hotspot?.sources.length || draft?.sources.length);
  const sources = (draft?.sources.length ? draft.sources : hotspot?.sources ?? []).slice(0, 5);
  const riskItems = draft?.factChecks.length ? draft.factChecks : plan?.sourceRisks ?? [];
  const reviewItems = [
    { label: "来源已附着", done: hasSources },
    { label: "圆桌议程已生成", done: Boolean(plan) },
    { label: "草稿已生成", done: Boolean(draft) },
    { label: "模拟角色已标注", done: Boolean(plan?.guests.length || draft?.guests.length) }
  ];

  return (
    <aside className="inspector workbenchInspector" aria-label="工作台检查器">
      <div className="inspectorHeader">
        <Activity size={16} />
        <span>编辑检查器</span>
      </div>

      <section className="inspectorBlock">
        <p className="eyebrow">当前焦点</p>
        {hotspot ? (
          <>
            <h3>{hotspot.title}</h3>
            <p>{hotspot.summary}</p>
            <div className="inspectorMetrics">
              <span>{selectedCount > 1 ? `${selectedCount} 个热点` : "单热点"}</span>
              <span>{hotspot.sourceCount} 来源</span>
              <span>{hotspot.status}</span>
            </div>
            <button className="primaryButton" disabled={selectedCount === 0 || job.status === "running"} onClick={onGeneratePlan} type="button">
              <Bot size={16} />
              生成议程
            </button>
          </>
        ) : (
          <p className="mutedText">抓取 RSS 后选择一个候选热点，来源、风险和下一步动作会显示在这里。</p>
        )}
      </section>

      <section className="inspectorBlock">
        <p className="eyebrow">来源</p>
        {sources.length > 0 ? (
          <div className="inspectorSourceList">
            {sources.map((source) => (
              <button className="inspectorSource" key={source.id} onClick={() => onOpenSource(source.url)} type="button">
                <strong>{source.publisher}</strong>
                <span>{source.title}</span>
                {source.publishedAt && <small>{formatLooseDate(source.publishedAt)}</small>}
              </button>
            ))}
          </div>
        ) : (
          <p className="mutedText">暂无来源。手动补充或 RSS 抓取成功后会显示。</p>
        )}
      </section>

      <section className="inspectorBlock">
        <p className="eyebrow">审核</p>
        <div className="checklist">
          {reviewItems.map((item) => (
            <label key={item.label}>
              <input checked={item.done} readOnly type="checkbox" />
              {item.label}
            </label>
          ))}
        </div>
      </section>

      <section className="inspectorBlock">
        <p className="eyebrow">事实风险</p>
        {riskItems.length > 0 ? (
          <div className="riskList">
            {riskItems.slice(0, 4).map((item) => (
              <p key={item}>{item}</p>
            ))}
          </div>
        ) : (
          <p className="mutedText">生成议程或草稿后，这里会列出来源风险和待核查点。</p>
        )}
      </section>

      <section className="inspectorBlock">
        <p className="eyebrow">生成状态</p>
        <div className={`inspectorJob ${job.status}`}>
          <strong>{job.status === "running" ? "执行中" : job.status === "failed" ? "需要处理" : "可继续"}</strong>
          <span>{job.message}</span>
        </div>
      </section>
    </aside>
  );
}

function Feeds({
  feeds,
  onAddFeed,
  onRefresh,
  onToggleFeed
}: {
  feeds: FeedSource[];
  onAddFeed: (feed: FeedSource) => void;
  onRefresh: () => void;
  onToggleFeed: (feedId: string) => void;
}) {
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customCategory, setCustomCategory] = useState<FeedSource["category"]>("other");
  const [presetTab, setPresetTab] = useState<"available" | "added">("available");
  const [feedSearch, setFeedSearch] = useState("");
  const existingUrls = new Set(feeds.map((feed) => feed.url));
  const addedPresetCount = RSS_PRESETS.filter((feed) => existingUrls.has(feed.url)).length;
  const availablePresetCount = RSS_PRESETS.length - addedPresetCount;
  const normalizedSearch = feedSearch.trim().toLowerCase();
  const presetFeeds = RSS_PRESETS.filter((feed) => {
    const added = existingUrls.has(feed.url);
    const matchesTab = presetTab === "added" ? added : !added;
    const matchesSearch =
      !normalizedSearch ||
      `${feed.name} ${feed.category} ${feed.url}`.toLowerCase().includes(normalizedSearch);
    return matchesTab && matchesSearch;
  });

  function addCustomFeed() {
    if (!customName.trim() || !customUrl.trim()) return;
    onAddFeed({
      id: makeFeedId(customUrl),
      name: customName.trim(),
      url: customUrl.trim(),
      category: customCategory,
      enabled: true,
      lastStatus: "idle"
    });
    setCustomName("");
    setCustomUrl("");
    setCustomCategory("other");
    setShowAddPanel(false);
  }

  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">RSS 管理</p>
          <h2>本地 JSON 中的可信来源池</h2>
        </div>
        <div className="buttonGroup">
          <button className="ghostButton" onClick={() => setShowAddPanel((value) => !value)} type="button">
            <Plus size={16} />
            添加 RSS 源
          </button>
          <button className="ghostButton" onClick={onRefresh} type="button">
          <RefreshCcw size={16} />
          重新读取
          </button>
        </div>
      </section>
      {showAddPanel && (
        <section className="feedAddPanel">
          <div className="presetFeedPanel">
            <div className="feedPanelHeading">
              <h3>主流 AI RSS 源</h3>
              <span>搜索国内外媒体、公司博客和研究来源，点击未添加源即可加入本地源池</span>
            </div>
            <div className="feedPresetToolbar">
              <div className="segmentedTabs" role="tablist" aria-label="RSS 源添加状态">
                <button className={presetTab === "available" ? "active" : ""} onClick={() => setPresetTab("available")} type="button">
                  未添加 {availablePresetCount}
                </button>
                <button className={presetTab === "added" ? "active" : ""} onClick={() => setPresetTab("added")} type="button">
                  已添加 {addedPresetCount}
                </button>
              </div>
              <input
                className="feedSearchInput"
                placeholder="搜索 RSS 源名称、分类或 URL"
                value={feedSearch}
                onChange={(event) => setFeedSearch(event.target.value)}
              />
            </div>
            <div className="presetFeedGrid">
              {presetFeeds.length === 0 && (
                <div className="presetEmpty">
                  {presetTab === "added" ? "没有匹配的已添加预设源" : "没有匹配的未添加预设源"}
                </div>
              )}
              {presetFeeds.map((feed) => {
                const added = existingUrls.has(feed.url);
                return (
                  <button className="presetFeed" disabled={added} key={feed.id} onClick={() => onAddFeed(feed)} type="button">
                    <span className="presetFeedTop">
                      <strong>{feed.name}</strong>
                      <span>{added ? "已添加" : feed.category}</span>
                    </span>
                    <small>{feed.url}</small>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="customFeedForm">
            <div className="feedPanelHeading">
              <h3>自定义 RSS</h3>
              <span>用于补充垂直媒体、公司博客或研究机构来源</span>
            </div>
            <label>
              来源名称
              <input placeholder="例如：某公司 AI Blog" value={customName} onChange={(event) => setCustomName(event.target.value)} />
            </label>
            <label>
              RSS URL
              <input placeholder="https://example.com/feed.xml" value={customUrl} onChange={(event) => setCustomUrl(event.target.value)} />
            </label>
            <label>
              分类
              <select value={customCategory} onChange={(event) => setCustomCategory(event.target.value as FeedSource["category"])}>
                <option value="company">company</option>
                <option value="developer">developer</option>
                <option value="research">research</option>
                <option value="market">market</option>
                <option value="policy">policy</option>
                <option value="other">other</option>
              </select>
            </label>
            <button className="primaryButton" disabled={!customName.trim() || !customUrl.trim()} onClick={addCustomFeed} type="button">
              <Plus size={16} />
              保存 RSS 源
            </button>
          </div>
        </section>
      )}
      <div className="dataTable feedTable">
        <div className="tableHeader">
          <span>名称</span>
          <span>分类</span>
          <span>抓取状态</span>
          <span>开关</span>
        </div>
        {feeds.map((feed) => (
          <div className="tableRow" key={feed.id}>
            <strong>{feed.name}</strong>
            <span>{feed.category}</span>
            <span>{feed.lastStatus ?? "idle"}</span>
            <button aria-label={feed.enabled ? "关闭 RSS 源" : "开启 RSS 源"} aria-pressed={feed.enabled} className={feed.enabled ? "switch isOn" : "switch"} onClick={() => onToggleFeed(feed.id)} type="button">
              <span />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ManualInput({
  onImportAttachment,
  onSubmit
}: {
  onImportAttachment: (path: string) => Promise<ManualAttachmentImportResult>;
  onSubmit: (input: ManualHotspotInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState("");
  const [publisher, setPublisher] = useState("");
  const [content, setContent] = useState("");
  const [sourceFileName, setSourceFileName] = useState("");
  const [sourceFilePath, setSourceFilePath] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  async function pickAttachment() {
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [
          {
            name: "常见文档",
            extensions: ["pdf", "docx", "md", "markdown", "txt", "text"]
          }
        ]
      });
      if (typeof selected !== "string") return;

      setIsImporting(true);
      const result = await onImportAttachment(selected);
      setContent(result.content);
      setSourceFileName(result.originalName);
      setSourceFilePath(result.storedPath);
      setUrl(result.storedPath);
      setPublisher(result.originalName);
      if (!summary.trim()) {
        setSummary(compactText(result.content, 260));
      }
      if (!title.trim()) {
        setTitle(result.originalName.replace(/\.[^.]+$/, ""));
      }
    } catch (error) {
      window.alert(formatError(error, "附件解析失败"));
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <form
      className="formPanel"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          title,
          summary,
          url,
          publisher: publisher || undefined,
          content: content.trim() || undefined,
          sourceFileName: sourceFileName || undefined,
          sourceFilePath: sourceFilePath || undefined
        });
      }}
    >
      <p className="eyebrow">手动补充</p>
      <h2>补充一个 RSS 未覆盖的热点</h2>
      <div className="manualAttachmentPanel">
        <div>
          <strong>附件导入</strong>
          <span>支持 PDF、DOCX、MD、TXT，解析后会保存文件并回填到内容框</span>
        </div>
        <button className="ghostButton" disabled={isImporting} onClick={pickAttachment} type="button">
          <FileText size={16} />
          {isImporting ? "解析中" : "上传附件"}
        </button>
        {sourceFilePath && (
          <p className="manualAttachmentPath">
            来源文件：<strong>{sourceFileName}</strong>
            <br />
            已保存到：<code>{sourceFilePath}</code>
          </p>
        )}
      </div>
      <label>
        热点标题
        <input onChange={(event) => setTitle(event.target.value)} placeholder="例如：某模型发布、融资、论文或监管事件" value={title} />
      </label>
      <label>
        背景说明
        <textarea onChange={(event) => setSummary(event.target.value)} placeholder="写下你已经知道的事实、疑问和希望圆桌重点讨论的角度。" rows={7} value={summary} />
      </label>
      <label>
        内容
        <textarea
          className="manualContentInput"
          onChange={(event) => setContent(event.target.value)}
          placeholder="可以直接输入完整材料；上传附件解析成功后，文本会自动填入这里，并且仍然可以编辑。"
          value={content}
        />
      </label>
      <label>
        {sourceFilePath ? "来源文件" : "来源链接"}
        <input onChange={(event) => setUrl(event.target.value)} placeholder={sourceFilePath ? "本地来源文件路径" : "https://..."} value={url} />
      </label>
      <label>
        来源名称
        <input onChange={(event) => setPublisher(event.target.value)} placeholder="例如：公司博客、论文、媒体或手动来源" value={publisher} />
      </label>
      <button className="primaryButton" type="submit">
        <Plus size={16} />
        加入候选
      </button>
    </form>
  );
}

function PlanView({
  discussionDepth,
  plan,
  supplementalDocuments,
  onAddSupplementalDocument,
  onClearSupplementalDocuments,
  onDiscussionDepthChange,
  onGenerateDraft,
  onGeneratePlan,
  onStartInteractiveDraft,
  onUpdateAgenda,
  onUpdateTension
}: {
  discussionDepth: DiscussionDepth;
  plan: RoundtablePlan | null;
  supplementalDocuments: SupplementalDocument[];
  onAddSupplementalDocument: () => void;
  onClearSupplementalDocuments: () => void;
  onDiscussionDepthChange: (depth: DiscussionDepth) => void;
  onGenerateDraft: () => void;
  onGeneratePlan: () => void;
  onStartInteractiveDraft: () => void;
  onUpdateAgenda: (index: number, value: string) => void;
  onUpdateTension: (index: number, value: string) => void;
}) {
  if (!plan) {
    return <EmptyState title="还没有圆桌议程" text="先选择热点，再点击生成议程。" actionLabel="生成议程" onAction={onGeneratePlan} />;
  }

  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">圆桌议程</p>
          <h2>{plan.objective}</h2>
        </div>
        <button className="ghostButton" onClick={onGeneratePlan} type="button">
          <Bot size={16} />
          重新生成议程
        </button>
        <button className="primaryButton" onClick={onGenerateDraft} type="button">
          <Sparkles size={16} />
          生成圆桌稿
        </button>
        <button className="primaryButton" onClick={onStartInteractiveDraft} type="button">
          <Mic size={16} />
          互动圆桌
        </button>
      </section>
      <section className="agentPrepPanel">
        <label>
          讨论深度
          <select value={discussionDepth} onChange={(event) => onDiscussionDepthChange(event.target.value as DiscussionDepth)}>
            <option value="low">低：更快，8-10 轮，每位嘉宾最多 1 次工具调用</option>
            <option value="medium">中：默认，10-14 轮，每位嘉宾最多 2 次工具调用</option>
            <option value="high">高：更充分，12-18 轮，每位嘉宾最多 4 次工具调用</option>
          </select>
        </label>
        <div className="supplementalDocs">
          <div>
            <strong>补充记忆资料</strong>
            <span>生成前可上传 PDF、DOCX、MD、TXT，嘉宾 agent 会在发言前按需检索。</span>
          </div>
          <div className="buttonGroup">
            <button className="ghostButton" onClick={onAddSupplementalDocument} type="button">
              <FileText size={16} />
              上传资料
            </button>
            {supplementalDocuments.length > 0 && (
              <button className="ghostButton" onClick={onClearSupplementalDocuments} type="button">
                清空
              </button>
            )}
          </div>
          {supplementalDocuments.length > 0 && (
            <div className="supplementalDocList">
              {supplementalDocuments.map((doc) => (
                <span key={doc.id}>{doc.name}</span>
              ))}
            </div>
          )}
        </div>
      </section>
      <div className="planColumns">
        <div>
          <h3>议程</h3>
          {plan.agenda.map((item, index) => (
            <textarea className="editablePlanItem" key={`${item}-${index}`} rows={3} value={item} onChange={(event) => onUpdateAgenda(index, event.target.value)} />
          ))}
        </div>
        <div>
          <h3>争议点</h3>
          {plan.tensionPoints.map((item, index) => (
            <textarea className="editablePlanItem warn" key={`${item}-${index}`} rows={3} value={item} onChange={(event) => onUpdateTension(index, event.target.value)} />
          ))}
        </div>
      </div>
      <div className="guestGrid">
        {plan.guests.map((guest) => (
          <article className="guestCard" key={guest.id}>
            <span>{guest.label}</span>
            <h3>{guest.role}</h3>
            <p>{guest.stance}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function DraftEditor({
  agentProgress,
  asrSettings,
  draft,
  interactiveSessionId,
  interactiveStatus,
  isGenerating,
  isVoiceTranscribing,
  job,
  lastSavedPath,
  onFinishInteractive,
  onInterruptInteractive,
  onSaveDraft,
  onSubmitUserTurn,
  onTranscribeVoice,
  onUserInterjectionTextChange,
  userInterjectionText
}: {
  agentProgress: Record<string, AgentProgressEvent>;
  asrSettings: AsrSettings;
  draft: EpisodeDraft | null;
  interactiveSessionId: string;
  interactiveStatus: InteractiveSessionEvent | null;
  isGenerating: boolean;
  isVoiceTranscribing: boolean;
  job: GenerationJob;
  lastSavedPath: string;
  onFinishInteractive: () => void;
  onInterruptInteractive: () => void;
  onSaveDraft: () => void;
  onSubmitUserTurn: (text: string) => void;
  onTranscribeVoice: (audioBase64: string) => void;
  onUserInterjectionTextChange: (text: string) => void;
  userInterjectionText: string;
}) {
  const controllerProgress = agentProgress.controller;
  const activeTurnProgress = currentTurnProgress(agentProgress);
  const isInteractive = Boolean(interactiveSessionId);
  const canInterrupt = isInteractive && interactiveStatus?.status === "running";
  const canSendUserTurn = isInteractive && (interactiveStatus?.status === "awaiting_user" || interactiveStatus?.status === "interrupted");
  const latestTurnRef = useRef<HTMLElement>(null);
  const composerRef = useRef<HTMLElement>(null);
  const latestTurn = draft?.dialogue[draft.dialogue.length - 1];
  const latestTurnScrollKey = [
    draft?.id ?? "",
    draft?.dialogue.length ?? 0,
    latestTurn?.speakerId ?? "",
    latestTurn?.intent ?? "",
    latestTurn?.text.length ?? 0,
    interactiveStatus?.status ?? "",
    interactiveStatus?.activeSpeakerId ?? ""
  ].join(":");

  useEffect(() => {
    if (!draft || !isInteractive) return;
    const target = canSendUserTurn ? composerRef.current : latestTurnRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [canSendUserTurn, draft, isInteractive, latestTurnScrollKey]);

  if (!draft) {
    return <EmptyState title="还没有圆桌稿" text="先选择热点，生成圆桌议程，再生成稿件。" />;
  }

  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">圆桌稿</p>
          <h2>{draft.title}</h2>
        </div>
        <div className="buttonGroup">
          {isInteractive && (
            <button className="ghostButton" onClick={onFinishInteractive} type="button">
              <CheckCircle2 size={16} />
              结束互动
            </button>
          )}
          <button className="primaryButton" disabled={isGenerating && !isInteractive} onClick={onSaveDraft} type="button">
            <Save size={16} />
            保存草稿
          </button>
        </div>
      </section>
      {lastSavedPath && <p className="savePath">已保存到：{lastSavedPath}</p>}
      {isInteractive && (
        <InteractiveLiveControl
          activeSpeakerLabel={interactiveActiveSpeakerLabel(draft, interactiveStatus)}
          status={interactiveStatus}
        />
      )}
      {isGenerating && (
        <InlineDraftProgress controllerProgress={controllerProgress} job={job} activeTurnProgress={activeTurnProgress} />
      )}
      <p className="summary">{draft.summary}</p>
      <div className="dialogueFlow">
        {draft.dialogue.length === 0 && (
          <div className="streamingDraftEmpty">
            <span className="inlineSpinner" />
            <p>{activeTurnProgress ? progressMessage(activeTurnProgress) : "Controller agent is planning the roundtable..."}</p>
            {canInterrupt && (
              <button className="inlineInterruptButton" onClick={onInterruptInteractive} type="button">
                <Mic size={16} />
                打断当前发言
              </button>
            )}
          </div>
        )}
        {draft.dialogue.map((turn, index) => {
          const guest = draft.guests.find((item) => item.id === turn.speakerId);
          const speakerLabel = turn.speakerId === "user" ? "你" : guest?.label ?? turn.speakerId;
          const turnProgress = activeTurnProgress?.turnIndex === index + 1 ? activeTurnProgress : undefined;
          const canInterruptThisTurn =
            canInterrupt && index === draft.dialogue.length - 1 && turn.speakerId !== "user" && !turn.interrupted;
          return (
            <article
              className={`turn ${turn.speakerId === "user" ? "userTurn" : ""} ${turn.interrupted ? "interruptedTurn" : ""}`}
              key={`${turn.speakerId}-${index}`}
              ref={index === draft.dialogue.length - 1 ? latestTurnRef : undefined}
            >
              <div>
                <span>{speakerLabel}</span>
                <small>{turn.interrupted ? "被用户打断" : turn.intent}</small>
              </div>
              <div className="turnBody">
                {turnProgress && turnProgress.status === "running" && <TurnProgressLine progress={turnProgress} />}
                <p>{turn.text}</p>
                {canInterruptThisTurn && (
                  <div className="turnLiveActions">
                    <button className="inlineInterruptButton" onClick={onInterruptInteractive} type="button">
                      <Mic size={16} />
                      打断当前发言
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
        {isGenerating && activeTurnProgress?.turnIndex && activeTurnProgress.turnIndex > draft.dialogue.length && (
          <PendingTurnProgress
            canInterrupt={canInterrupt}
            draft={draft}
            onInterrupt={onInterruptInteractive}
            progress={activeTurnProgress}
          />
        )}
        {canSendUserTurn && (
          <section className="interactiveComposerAnchor transcriptComposer" ref={composerRef}>
            <InteractiveComposer
              asrSettings={asrSettings}
              canSend={canSendUserTurn}
              isVoiceTranscribing={isVoiceTranscribing}
              status={interactiveStatus}
              text={userInterjectionText}
              onChange={onUserInterjectionTextChange}
              onSubmit={onSubmitUserTurn}
              onTranscribeVoice={onTranscribeVoice}
            />
          </section>
        )}
      </div>
      <div className="takeaways">
        {draft.takeaways.map((item) => (
          <p key={item}>
            <CheckCircle2 size={16} />
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function InlineDraftProgress({
  activeTurnProgress,
  controllerProgress,
  job
}: {
  activeTurnProgress?: AgentProgressEvent;
  controllerProgress?: AgentProgressEvent;
  job: GenerationJob;
}) {
  const progress = activeTurnProgress ?? controllerProgress;
  const percent = Math.max(4, Math.min(100, progress?.progress ?? 8));
  const title = activeTurnProgress
    ? `${safeAgentLabel(activeTurnProgress)}: ${progressPhase(activeTurnProgress)}`
    : progress
      ? progressMessage(progress)
      : "Generating draft";

  return (
    <section className="inlineDraftProgress" aria-live="polite">
      <div className="inlineDraftProgressTop">
        <span className="inlineSpinner" />
        <div>
          <strong>{title}</strong>
          <p>{activeTurnProgress ? progressMessage(activeTurnProgress) : controllerProgress ? progressMessage(controllerProgress) : job.message}</p>
        </div>
      </div>
      <div className="activityProgressTrack">
        <span style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}

function PendingTurnProgress({
  canInterrupt,
  draft,
  onInterrupt,
  progress
}: {
  canInterrupt: boolean;
  draft: EpisodeDraft;
  onInterrupt: () => void;
  progress: AgentProgressEvent;
}) {
  const guest = draft.guests.find((item) => item.id === progress.agentId);
  return (
    <article className="turn pendingTurn">
      <div>
        <span>{guest?.label ?? safeAgentLabel(progress)}</span>
        <small>{progress.turnIndex ? `Turn ${progress.turnIndex}` : progressPhase(progress)}</small>
      </div>
      <div className="turnBody">
        <TurnProgressLine progress={progress} />
        <p className="mutedText">This turn will start streaming into the draft shortly.</p>
        {canInterrupt && (
          <div className="turnLiveActions">
            <button className="inlineInterruptButton" onClick={onInterrupt} type="button">
              <Mic size={16} />
              打断当前发言
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function TurnProgressLine({ progress }: { progress: AgentProgressEvent }) {
  return (
    <div className="turnProgressLine">
      <span className="inlineSpinner" />
      <strong>{progressPhase(progress)}</strong>
      <small>{progressMessage(progress)}</small>
    </div>
  );
}

function InteractiveLiveControl({
  activeSpeakerLabel,
  status
}: {
  activeSpeakerLabel: string;
  status: InteractiveSessionEvent | null;
}) {
  return (
    <section className="interactiveLiveControl" aria-live="polite">
      <div className="interactiveLiveStatus">
        <span className={`interactiveStatus ${status?.status ?? "idle"}`}>{status?.status ?? "idle"}</span>
        <div>
          <strong>{activeSpeakerLabel}</strong>
          <p>{status?.message ?? "AI 嘉宾正在发言。"}</p>
        </div>
      </div>
    </section>
  );
}

function InteractiveComposer({
  asrSettings,
  canSend,
  isVoiceTranscribing,
  onChange,
  onSubmit,
  onTranscribeVoice,
  status,
  text
}: {
  asrSettings: AsrSettings;
  canSend: boolean;
  isVoiceTranscribing: boolean;
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
  onTranscribeVoice: (audioBase64: string) => void;
  status: InteractiveSessionEvent | null;
  text: string;
}) {
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const canUseVoice = Boolean(asrSettings.apiKey?.trim());

  async function toggleRecording() {
    if (isRecording && recorder) {
      recorder.stop();
      return;
    }
    if (!canUseVoice) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const nextRecorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    nextRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    nextRecorder.onstop = () => {
      setIsRecording(false);
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: nextRecorder.mimeType || "audio/webm" });
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result ?? "");
        onTranscribeVoice(value.includes(",") ? value.split(",")[1] : value);
      };
      reader.readAsDataURL(blob);
    };
    setRecorder(nextRecorder);
    setIsRecording(true);
    nextRecorder.start();
  }

  return (
    <section className="interactiveComposer">
      <div className="interactiveComposerHeader">
        <div>
          <strong>你的嘉宾发言</strong>
          <span>{status?.message ?? "点击打断后，可以用文字或语音插入你的观点。"}</span>
        </div>
        <span className={`interactiveStatus ${status?.status ?? "idle"}`}>{status?.status ?? "idle"}</span>
      </div>
      <textarea
        disabled={!canSend}
        onChange={(event) => onChange(event.target.value)}
        placeholder={canSend ? "输入你的想法，发送后中控 agent 会重排后续发言。" : "等待打断当前 AI 发言后输入。"}
        rows={4}
        value={text}
      />
      <div className="interactiveActions">
        <button className="ghostButton" disabled={!canSend || !canUseVoice || isVoiceTranscribing} onClick={toggleRecording} type="button">
          <Mic size={16} />
          {isRecording ? "停止录音" : isVoiceTranscribing ? "转写中" : "语音转文字"}
        </button>
        <button className="primaryButton" disabled={!canSend || !text.trim()} onClick={() => onSubmit(text)} type="button">
          <Sparkles size={16} />
          发送并继续
        </button>
      </div>
      {!canUseVoice && <p className="mutedText">语音转文字需要在设置里保存 DashScope Paraformer API Key；文字打断可直接使用。</p>}
    </section>
  );
}

function currentTurnProgress(agentProgress: Record<string, AgentProgressEvent>) {
  return Object.values(agentProgress)
    .filter((item) => item.agentId !== "controller" && item.turnIndex && item.status !== "succeeded")
    .sort((a, b) => (b.turnIndex ?? 0) - (a.turnIndex ?? 0) || b.progress - a.progress)[0];
}

function progressPhase(progress?: AgentProgressEvent) {
  if (progress?.phase && !hasBrokenText(progress.phase)) return progress.phase;
  if (progress?.status === "succeeded") return "Done";
  return "Working";
}

function progressMessage(progress?: AgentProgressEvent) {
  if (progress?.message && !hasBrokenText(progress.message)) return progress.message;
  if (progress?.agentId === "controller") return "Controller agent is planning and scheduling the roundtable.";
  return "Searching sources, organizing context, and preparing this speaker's turn.";
}

function safeAgentLabel(progress: AgentProgressEvent) {
  if (progress.agentId === "controller") return "Controller Agent";
  if (progress.agentLabel && !hasBrokenText(progress.agentLabel)) return progress.agentLabel;
  return progress.agentId;
}

function hasBrokenText(value: string) {
  return /[\uFFFD\u951F\u6D93\u59DD]/.test(value);
}

function HistoryView({
  drafts,
  onBackToList,
  onOpenSource,
  onRefresh,
  onSelectDraft,
  onUpdateDraft,
  selectedDraft
}: {
  drafts: EpisodeDraft[];
  onBackToList: () => void;
  onOpenSource: (url: string) => void;
  onRefresh: () => void;
  onSelectDraft: (draft: EpisodeDraft) => void;
  onUpdateDraft: (draft: EpisodeDraft) => void;
  selectedDraft: EpisodeDraft | null;
}) {
  if (selectedDraft) {
    return <HistoryDraftDetail draft={selectedDraft} onBack={onBackToList} onOpenSource={onOpenSource} onUpdateDraft={onUpdateDraft} />;
  }

  return (
    <div className="viewStack">
        <section className="sectionHeader">
          <div>
            <p className="eyebrow">圆桌历史</p>
            <h2>过去保存的圆桌草稿</h2>
            <p className="sectionMeta">共 {drafts.length} 篇，点击任意一行进入圆桌详情。</p>
          </div>
          <button className="ghostButton" onClick={onRefresh} type="button">
            <RefreshCcw size={16} />
            刷新
          </button>
        </section>
        <div className="dataTable historyTable">
          {drafts.length > 0 && (
            <div className="tableHeader">
              <span>标题</span>
              <span>生成时间</span>
              <span>更新时间</span>
              <span>来源</span>
              <span>状态</span>
            </div>
          )}
          {drafts.length === 0 ? (
            <EmptyState title="还没有历史圆桌" text="保存草稿后，这里会显示过去的圆桌列表。" />
          ) : (
            drafts.map((draft) => (
              <button className="tableRow historyRow" key={draft.id} onClick={() => onSelectDraft(draft)} type="button">
                <strong>{draft.title}</strong>
                <span>{formatDateTimeCn(draft.createdAt)}</span>
                <span>{formatDateTimeCn(draft.updatedAt)}</span>
                <span>{draft.sources.map((source) => source.publisher).slice(0, 2).join(", ") || "未记录"}</span>
                <small>{draft.status}</small>
              </button>
            ))
          )}
        </div>
    </div>
  );
}

function HistoryDraftDetail({
  draft,
  onBack,
  onOpenSource,
  onUpdateDraft
}: {
  draft: EpisodeDraft;
  onBack: () => void;
  onOpenSource: (url: string) => void;
  onUpdateDraft: (draft: EpisodeDraft) => void;
}) {
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<{
    status: "saving" | "saved" | "failed";
    message: string;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editableDraft, setEditableDraft] = useState(draft);

  useEffect(() => {
    setEditableDraft(draft);
    setIsEditing(false);
  }, [draft]);

  async function saveEditedDraft() {
    const nextDraft = {
      ...editableDraft,
      updatedAt: new Date().toISOString()
    };
    await saveEpisodeDraft(nextDraft);
    onUpdateDraft(nextDraft);
    setEditableDraft(nextDraft);
    setIsEditing(false);
  }

  function updateTurn(index: number, text: string) {
    setEditableDraft((current) => ({
      ...current,
      dialogue: current.dialogue.map((turn, turnIndex) => (turnIndex === index ? { ...turn, text } : turn))
    }));
  }

  async function handleExport(format: "md" | "html" | "pdf" | "mp3") {
    setExportMenuOpen(false);
    setExportStatus({
      status: "saving",
      message: format === "mp3" ? "保存中，请选择文件保存位置；MP3 会依次生成角色语音、混入开场和闭场音乐。" : "保存中，请选择文件保存位置。"
    });
    try {
      const path = await saveDraftAs(editableDraft, format);
      if (!path) {
        setExportStatus(null);
        return;
      }
      setExportStatus({
        status: "saved",
        message: `已保存到：${path}`
      });
    } catch (error) {
      setExportStatus({ status: "failed", message: formatError(error, "导出失败") });
    }
  }

  return (
    <div className="viewStack historyDraftDetail">
      <section className="sectionHeader detailHeader">
        <button className="ghostButton backButton" onClick={onBack} type="button">
          <span aria-hidden="true">←</span>
          返回列表
        </button>
        <div className="detailActionGroup">
          <button className={isEditing ? "primaryButton" : "editButton"} onClick={() => setIsEditing((value) => !value)} type="button">
            <PenLine size={16} />
            {isEditing ? "退出编辑" : "编辑"}
          </button>
          <div className="exportMenu">
            <button className="primaryButton" onClick={() => setExportMenuOpen((value) => !value)} type="button" aria-expanded={exportMenuOpen}>
              <Download size={16} />
              导出
            </button>
            {exportMenuOpen && (
              <div className="exportMenuList">
                <button onClick={() => { void handleExport("md"); }} type="button">
                  <FileText size={16} />
                  <span>
                    <strong>Markdown</strong>
                    <small>另存为 .md，可继续编辑</small>
                  </span>
                </button>
                <button onClick={() => { void handleExport("html"); }} type="button">
                  <FileText size={16} />
                  <span>
                    <strong>HTML</strong>
                    <small>自包含样式，跨设备阅读一致</small>
                  </span>
                </button>
                <button onClick={() => { void handleExport("pdf"); }} type="button">
                  <Download size={16} />
                  <span>
                    <strong>PDF</strong>
                    <small>内部生成 PDF 并保存</small>
                  </span>
                </button>
                <button onClick={() => { void handleExport("mp3"); }} type="button">
                  <Download size={16} />
                  <span>
                    <strong>MP3 圆桌录音</strong>
                    <small>开场音乐、分角色语音和闭场音乐</small>
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
      <section className="detailTitleBlock">
        <p className="eyebrow">圆桌详情</p>
        {isEditing ? (
          <input className="detailTitleInput" value={editableDraft.title} onChange={(event) => setEditableDraft((current) => ({ ...current, title: event.target.value }))} />
        ) : (
          <h2>{editableDraft.title}</h2>
        )}
        <p className="sectionMeta">生成时间：{formatDateTimeCn(editableDraft.createdAt)} · 更新时间：{formatDateTimeCn(editableDraft.updatedAt)}</p>
      </section>
      {isEditing ? (
        <textarea className="detailSummaryInput" rows={5} value={editableDraft.summary} onChange={(event) => setEditableDraft((current) => ({ ...current, summary: event.target.value }))} />
      ) : (
        <p className="summary">{editableDraft.summary}</p>
      )}
      {isEditing && (
        <div className="editActionBar">
          <button className="ghostButton" onClick={() => { setEditableDraft(draft); setIsEditing(false); }} type="button">
            取消
          </button>
          <button className="primaryButton" onClick={() => { void saveEditedDraft(); }} type="button">
            <Save size={16} />
            保存修改
          </button>
        </div>
      )}
      <div className="dialogueFlow">
        {editableDraft.dialogue.map((turn, index) => {
          const label = dialogueSpeakerLabel(editableDraft, turn);
          return (
            <article className={`turn ${turn.speakerId === "user" ? "userTurn" : ""} ${turn.interrupted ? "interruptedTurn" : ""}`} key={`${turn.speakerId}-${index}`}>
              <div>
                <span>{label}</span>
                <small>{turn.interrupted ? "被用户打断" : turn.intent}</small>
              </div>
              {isEditing ? (
                <textarea className="turnEditInput" rows={5} value={turn.text} onChange={(event) => updateTurn(index, event.target.value)} />
              ) : (
                <p>{turn.text}</p>
              )}
            </article>
          );
        })}
      </div>
      <div className="historySources">
        <h3>来源</h3>
        {editableDraft.sources.map((source) => (
          <button className="sourceChip" key={source.id} onClick={() => onOpenSource(source.url)} type="button">
            <span>
              <strong>{source.publisher}</strong>
              {source.publishedAt && <small>{formatLooseDate(source.publishedAt)}</small>}
            </span>
            <em>{source.title}</em>
          </button>
        ))}
      </div>
      <details className="agentTraceSection">
        <summary>
          <span>
            <strong>Agent Trace</strong>
            <small>{editableDraft.agentTrace?.length ? `${editableDraft.agentTrace.length} 条记录，包含中控决策、工具调用和来源摘要` : "暂无 Agent Trace"}</small>
          </span>
          <em>展开</em>
        </summary>
        {editableDraft.agentTrace?.length ? (
          <div className="agentTraceList">
            {editableDraft.agentTrace.map((record) => (
            <article className={`agentTraceItem ${record.level}`} key={record.id}>
              <div className="traceItemHeader">
                <span className={`traceLevel ${record.level}`}>{record.level}</span>
                <strong>{record.agentLabel}</strong>
                <small>{record.phase}</small>
                <time>{formatDateTimeCn(record.createdAt)}</time>
              </div>
              <p>{record.message}</p>
              {record.sources && record.sources.length > 0 && (
                <div className="traceSourceList">
                  {record.sources.map((source) => (
                    <button className="traceSourceButton" key={`${record.id}-${source.id}`} onClick={() => onOpenSource(source.url)} type="button">
                      <strong>{source.publisher}</strong>
                      <span>{source.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
          </div>
        ) : (
          <p className="agentTraceEmpty">暂无</p>
        )}
      </details>
      {exportStatus && (
        <div className="confirmOverlay" role="status" aria-live="polite">
          <div className="confirmModal">
            <strong>{exportStatus.status === "saving" ? "保存中" : exportStatus.status === "saved" ? "保存完成" : "保存失败"}</strong>
            <p>{exportStatus.message}</p>
            {exportStatus.status !== "saving" && (
              <button className="primaryButton" onClick={() => setExportStatus(null)} type="button">
                确认
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ZipActivityBar({
  job,
  mode
}: {
  job: GenerationJob;
  mode: DraftGenerationMode;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [job.id]);

  const progress = activityProgress(job, mode, elapsed);

  return (
    <div className="zipActivityBar" role="status" aria-live="polite">
      <span className="inlineSpinner zipActivityBarSpinner" aria-hidden="true" />
      <div className="zipActivityBarContent">
        <strong>{progress.title}</strong>
        <p>{progress.detail}</p>
        <div className="zipActivityBarTrack">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <small>{job.message} · 已用时 {elapsed}s</small>
      </div>
    </div>
  );
}

function activityProgress(job: GenerationJob, _mode: DraftGenerationMode, elapsed: number) {
  if (job.type === "plan") {
    return {
      title: "中控 Agent 正在规划调度",
      detail: elapsed < 8 ? "正在整理热点信息和圆桌议程" : "正在等待模型返回规划结果",
      percent: Math.min(90, 28 + elapsed * 4)
    };
  }

  if (job.id === "job-manual-attachment") {
    return {
      title: "正在解析附件",
      detail: elapsed < 4 ? "正在读取文件内容" : "正在保存来源文件到本地内容目录",
      percent: Math.min(92, 18 + elapsed * 8)
    };
  }

  if (job.id === "job-classify") {
    return {
      title: "正在分类热点",
      detail: elapsed < 8 ? "正在加载本地多语言嵌入模型" : "正在计算热点与主题桶的语义相似度",
      percent: Math.min(88, 18 + elapsed * 4)
    };
  }

  if (job.type === "fetch") {
    return {
      title: "正在调用后端",
      detail: elapsed < 6 ? "正在连接本地 Tauri 后端" : "正在抓取 RSS 并筛选候选热点",
      percent: Math.min(86, 20 + elapsed * 5)
    };
  }

  if (job.id === "job-settings-models") {
    return {
      title: "正在更新模型信息",
      detail: elapsed < 5 ? "正在向模型厂商读取可用模型" : "正在刷新模型下拉框和本地设置",
      percent: Math.min(90, 30 + elapsed * 7)
    };
  }

  if (job.id === "job-tts-check") {
    return {
      title: "正在检查 TTS 模型",
      detail: elapsed < 5 ? "正在请求一段极短的测试语音" : "正在等待 TTS 服务返回音频",
      percent: Math.min(90, 28 + elapsed * 6)
    };
  }

  return {
    title: "正在保存",
    detail: "正在写入本地 JSON",
    percent: Math.min(90, 35 + elapsed * 8)
  };
}

function SettingsView({
  agentRuntimeSettings,
  appDataDir,
  asrSettings,
  draftGenerationMode,
  modelCatalog,
  onDraftGenerationModeChange,
  onModelChange,
  onProviderChange,
  onRefreshFromProvider,
  onRefreshModels,
  onSaveAgentSettings,
  onSaveAsrSettings,
  onSaveSettings,
  onSaveTtsSettings,
  providerSettings,
  selectedModel,
  selectedProviderId,
  ttsSettings
}: {
  agentRuntimeSettings: AgentRuntimeSettings;
  appDataDir: string;
  asrSettings: AsrSettings;
  draftGenerationMode: DraftGenerationMode;
  modelCatalog: ModelProvider[];
  onDraftGenerationModeChange: (mode: DraftGenerationMode) => void;
  onModelChange: (model: string) => void;
  onProviderChange: (providerId: string) => void;
  onRefreshFromProvider: (settings: ProviderSettings) => void;
  onRefreshModels: () => void;
  onSaveAgentSettings: (settings: AgentRuntimeSettings) => void;
  onSaveAsrSettings: (settings: AsrSettings) => void;
  onSaveSettings: (settings: ProviderSettings) => void;
  onSaveTtsSettings: (settings: TtsSettings) => void;
  providerSettings: ProviderSettings[];
  selectedModel: string;
  selectedProviderId: string;
  ttsSettings: TtsSettings;
}) {
  const [activeSettingsTab, setActiveSettingsTab] = useState<"roundtable" | "agent" | "tts" | "asr">("roundtable");
  const provider = modelCatalog.find((item) => item.id === selectedProviderId);
  const savedSettings = providerSettings.find((item) => item.providerId === selectedProviderId);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");
  const [ttsProviderId, setTtsProviderId] = useState<TtsSettings["providerId"]>(ttsSettings.providerId);
  const [ttsApiKey, setTtsApiKey] = useState(ttsSettings.apiKey ?? "");
  const [ttsBaseUrl, setTtsBaseUrl] = useState(ttsSettings.baseUrl);
  const [ttsModel, setTtsModel] = useState(ttsSettings.selectedModel);
  const [asrApiKey, setAsrApiKey] = useState(asrSettings.apiKey ?? "");
  const [asrBaseUrl, setAsrBaseUrl] = useState(asrSettings.baseUrl);
  const [asrModel, setAsrModel] = useState(asrSettings.selectedModel);
  const [agentSettingsDraft, setAgentSettingsDraft] = useState<AgentRuntimeSettings>(agentRuntimeSettings);
  const ttsProvider = TTS_PROVIDER_OPTIONS.find((item) => item.id === ttsProviderId) ?? TTS_PROVIDER_OPTIONS[0];

  useEffect(() => {
    setApiKey(savedSettings?.apiKey ?? "");
    setBaseUrl(savedSettings?.baseUrl ?? provider?.baseUrl ?? "");
  }, [provider?.baseUrl, savedSettings?.apiKey, savedSettings?.baseUrl, selectedProviderId]);

  useEffect(() => {
    setTtsProviderId(ttsSettings.providerId);
    setTtsApiKey(ttsSettings.apiKey ?? "");
    setTtsBaseUrl(ttsSettings.baseUrl);
    setTtsModel(ttsSettings.selectedModel);
  }, [ttsSettings.apiKey, ttsSettings.baseUrl, ttsSettings.providerId, ttsSettings.selectedModel]);

  useEffect(() => {
    setAsrApiKey(asrSettings.apiKey ?? "");
    setAsrBaseUrl(asrSettings.baseUrl);
    setAsrModel(asrSettings.selectedModel);
  }, [asrSettings.apiKey, asrSettings.baseUrl, asrSettings.selectedModel]);

  useEffect(() => {
    setAgentSettingsDraft(agentRuntimeSettings);
  }, [agentRuntimeSettings]);

  const currentSettings: ProviderSettings = {
    providerId: selectedProviderId,
    baseUrl,
    apiKey,
    selectedModel,
    draftGenerationMode
  };
  const normalizedTtsModel =
    ttsProvider.models.includes(ttsModel) || ttsProvider.id !== "dashscope" ? ttsModel : ttsProvider.models[0] ?? ttsModel;
  const currentTtsSettings: TtsSettings = {
    providerId: ttsProviderId,
    baseUrl: ttsBaseUrl,
    apiKey: ttsApiKey,
    selectedModel: normalizedTtsModel
  };
  const currentAsrSettings: AsrSettings = {
    providerId: "dashscope",
    baseUrl: asrBaseUrl,
    apiKey: asrApiKey,
    selectedModel: asrModel
  };
  const ttsModelOptions = ttsProvider.id === "dashscope" || ttsProvider.models.includes(ttsModel) ? ttsProvider.models : [ttsModel, ...ttsProvider.models];
  function handleTtsProviderChange(providerId: TtsSettings["providerId"]) {
    const nextProvider = TTS_PROVIDER_OPTIONS.find((item) => item.id === providerId) ?? TTS_PROVIDER_OPTIONS[0];
    setTtsProviderId(providerId);
    setTtsBaseUrl(nextProvider.baseUrl);
    setTtsModel(nextProvider.models[0] ?? "");
    setTtsApiKey(ttsSettings.providerId === providerId ? ttsSettings.apiKey ?? "" : "");
  }

  return (
    <div className="formPanel">
      <p className="eyebrow">设置</p>
      <div className="segmentedTabs settingsTabs" role="tablist" aria-label="模型设置分类">
        <button className={activeSettingsTab === "roundtable" ? "active" : ""} onClick={() => setActiveSettingsTab("roundtable")} type="button">
          圆桌模型
        </button>
        <button className={activeSettingsTab === "agent" ? "active" : ""} onClick={() => setActiveSettingsTab("agent")} type="button">
          Agent 工具
        </button>
        <button className={activeSettingsTab === "tts" ? "active" : ""} onClick={() => setActiveSettingsTab("tts")} type="button">
          TTS 配音
        </button>
        <button className={activeSettingsTab === "asr" ? "active" : ""} onClick={() => setActiveSettingsTab("asr")} type="button">
          ASR 转写
        </button>
      </div>

      {activeSettingsTab === "roundtable" ? (
        <>
          <section className="sectionHeader compactHeader">
            <div>
              <h2>圆桌模型配置</h2>
              <p className="sectionMeta">用于生成圆桌议程和圆桌稿；默认 DeepSeek，保存后会刷新当前厂商模型。</p>
            </div>
            <div className="buttonGroup">
              <button className="ghostButton" onClick={onRefreshModels} type="button">
                <RefreshCcw size={16} />
                重置内置列表
              </button>
              <button className="primaryButton" onClick={() => onRefreshFromProvider(currentSettings)} type="button">
                <RefreshCcw size={16} />
                更新模型
              </button>
            </div>
          </section>
          <label>
            厂商
            <select value={selectedProviderId} onChange={(event) => onProviderChange(event.target.value)}>
              {modelCatalog.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            模型
            <select value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>
              {(provider?.models ?? []).map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label>
          <label>
            Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <label>
            API Key
            <input
              autoComplete="off"
              placeholder={provider?.requiresApiKey ? "输入后本地保存，界面不会明文展示完整 key" : "本地生成器不需要 API Key"}
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <label>
            稿件生成模式
            <select
              value={draftGenerationMode}
              onChange={(event) => onDraftGenerationModeChange(event.target.value as DraftGenerationMode)}
            >
              <option value="single">一个模型直接生成整稿</option>
              <option value="multi_agent">中控调度，多次调用嘉宾独立发言</option>
              <option value="autonomous_agent">0.4 强自治 Agent 圆桌</option>
            </select>
          </label>
          <button className="ghostButton" onClick={() => onSaveSettings(currentSettings)} type="button">
            <Save size={16} />
            保存圆桌模型设置
          </button>
        </>
      ) : activeSettingsTab === "agent" ? (
        <>
          <section className="sectionHeader compactHeader">
            <div>
              <h2>Agent 工具与检索</h2>
              <p className="sectionMeta">用于 0.4 强自治圆桌：本地记忆、补充资料和通用 JSON Web Search API。</p>
            </div>
            <div className="buttonGroup">
              <button className="primaryButton" onClick={() => onSaveAgentSettings(agentSettingsDraft)} type="button">
                <Save size={16} />
                保存 Agent 设置
              </button>
            </div>
          </section>
          <label>
            默认讨论深度
            <select
              value={agentSettingsDraft.discussionDepth}
              onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, discussionDepth: event.target.value as DiscussionDepth })}
            >
              <option value="low">低：更快，工具预算较少</option>
              <option value="medium">中：默认，质量和速度平衡</option>
              <option value="high">高：更充分，工具预算较高</option>
            </select>
          </label>
          <label>
            Agent 生成引擎
            <select
              value={agentSettingsDraft.generationEngine}
              onChange={(event) =>
                setAgentSettingsDraft({
                  ...agentSettingsDraft,
                  generationEngine: event.target.value as AgentRuntimeSettings["generationEngine"]
                })
            }
          >
            <option value="native">Native Rust Runtime</option>
          </select>
        </label>
          <label>
            Search API Base URL
            <input
              placeholder="https://your-search-api.example.com/search"
              value={agentSettingsDraft.searchBaseUrl}
              onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, searchBaseUrl: event.target.value })}
            />
          </label>
          <label>
            Search API Key
            <input
              autoComplete="off"
              type="password"
              value={agentSettingsDraft.searchApiKey ?? ""}
              onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, searchApiKey: event.target.value })}
            />
          </label>
          <label>
            搜索语言
            <input
              value={agentSettingsDraft.searchLanguage}
              onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, searchLanguage: event.target.value })}
            />
          </label>
          <label>
            默认结果数
            <input
              min={1}
              max={10}
              type="number"
              value={agentSettingsDraft.searchMaxResults}
              onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, searchMaxResults: Number(event.target.value) })}
            />
          </label>
          <label>
            搜索时间范围（天，可空）
            <input
              min={0}
              type="number"
              value={agentSettingsDraft.searchRecencyDays ?? ""}
              onChange={(event) =>
                setAgentSettingsDraft({
                  ...agentSettingsDraft,
                  searchRecencyDays: event.target.value ? Number(event.target.value) : undefined
                })
              }
            />
          </label>
          <label className="checkboxLine">
            <input
              checked={agentSettingsDraft.debugTraceEnabled}
              type="checkbox"
              onChange={(event) => setAgentSettingsDraft({ ...agentSettingsDraft, debugTraceEnabled: event.target.checked })}
            />
            保存 debug 级完整 agent trace
          </label>
          <p className="mutedText">Search API 使用通用 JSON 接口：请求包含 <code>query</code>、<code>maxResults</code>、<code>language</code>、<code>recencyDays</code>，响应可以是数组或 <code>{"{ results: [...] }"}</code>。</p>
        </>
      ) : activeSettingsTab === "tts" ? (
        <>
          <section className="sectionHeader compactHeader">
            <div>
              <h2>TTS 配音模型配置</h2>
              <p className="sectionMeta">用于导出 MP3 圆桌录音。保存后会立即生成一小段测试音频来检查模型连通性。</p>
            </div>
            <div className="buttonGroup">
              <button className="primaryButton" onClick={() => onSaveTtsSettings(currentTtsSettings)} type="button">
                <Save size={16} />
                保存并检查 TTS
              </button>
            </div>
          </section>
          <label>
            TTS 厂商
            <select value={ttsProviderId} onChange={(event) => handleTtsProviderChange(event.target.value as TtsSettings["providerId"])}>
              {TTS_PROVIDER_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label>
            TTS 模型
            <select value={normalizedTtsModel} onChange={(event) => setTtsModel(event.target.value)}>
              {ttsModelOptions.map((model) => (
                <option key={model} value={model}>{model}</option>
              ))}
            </select>
          </label>
          <label>
            TTS Base URL
            <input value={ttsBaseUrl} onChange={(event) => setTtsBaseUrl(event.target.value)} />
          </label>
          <label>
            TTS API Key
            <input
              autoComplete="off"
              placeholder={ttsProvider.apiKeyPlaceholder}
              type="password"
              value={ttsApiKey}
              onChange={(event) => setTtsApiKey(event.target.value)}
            />
          </label>
          <p className="mutedText">不同角色的声音和朗读要求配置在 <code>config/prompts/personas.json</code> 的 <code>tts</code> 字段里；这里仅配置 TTS 服务和模型。</p>
          {ttsProviderId === "dashscope" && normalizedTtsModel === "cosyvoice-v3.5-plus" && (
            <p className="mutedText">CosyVoice v3.5 plus 如果提示音色不可用，需要在 <code>personas.json</code> 的 <code>cosyVoice</code> 字段填写你在百炼里创建的声音复刻或声音设计音色 ID。</p>
          )}
        </>
      ) : (
        <>
          <section className="sectionHeader compactHeader">
            <div>
              <h2>Paraformer 语音转文字</h2>
              <p className="sectionMeta">用于互动圆桌里把你的语音打断转成文字；发送前仍需你确认文本。</p>
            </div>
            <div className="buttonGroup">
              <button className="primaryButton" onClick={() => onSaveAsrSettings(currentAsrSettings)} type="button">
                <Save size={16} />
                保存 ASR 设置
              </button>
            </div>
          </section>
          <label>
            ASR 厂商
            <input value="DashScope Paraformer" readOnly />
          </label>
          <label>
            ASR 模型
            <input value={asrModel} onChange={(event) => setAsrModel(event.target.value)} />
          </label>
          <label>
            WebSocket Base URL
            <input value={asrBaseUrl} onChange={(event) => setAsrBaseUrl(event.target.value)} />
          </label>
          <label>
            API Key
            <input
              autoComplete="off"
              placeholder="填写 DashScope API Key；不填写时语音按钮不可用，文字打断仍可用"
              type="password"
              value={asrApiKey}
              onChange={(event) => setAsrApiKey(event.target.value)}
            />
          </label>
          <p className="mutedText">默认模型为 <code>paraformer-realtime-v2</code>。互动圆桌不会自动发送转写结果，必须由你确认后提交。</p>
        </>
      )}

      <label>
        本地内容目录
        <input value={appDataDir || "正在读取本机 app data 目录"} readOnly />
      </label>
      <p className="mutedText">API Key 使用密码输入框展示，不会在界面明文显示完整内容；当前版本保存在本地 app data JSON，后续可迁移到系统凭据管理。</p>
    </div>
  );
}

function EmptyState({ title, text, actionLabel, onAction }: { title: string; text: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="emptyState">
      <h3>{title}</h3>
      <p>{text}</p>
      {actionLabel && onAction && (
        <button className="primaryButton" onClick={onAction} type="button">
          <RefreshCcw size={16} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

void PageHeader;
void formatDateCn;
void getViewCopy;
void ProgramHero;
void ProductStatusStrip;
void ProductDateRangeControl;
void ProductHotspotWorkspace;
void InspectorPanel;
void Feeds;
void ManualInput;
void PlanView;
void DraftEditor;
void HistoryView;
void SettingsView;

export default App;
