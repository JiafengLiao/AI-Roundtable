import { useEffect, useMemo, useState } from "react";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
  Activity,
  Bot,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Download,
  FileEdit,
  FileText,
  PenLine,
  Plus,
  Radio,
  RefreshCcw,
  Rss,
  Save,
  Settings,
  Sparkles
} from "lucide-react";
import {
  addManualHotspot,
  generateEpisodeDraft,
  generateRoundtablePlan,
  getAppDataDir,
  getModelCatalog,
  getProviderSettings,
  getFeeds,
  listEpisodeDrafts,
  openExternalUrl,
  refreshModelCatalog as refreshModelCatalogFromBackend,
  saveEpisodeDraft,
  saveFeeds,
  saveProviderSettings,
  searchHotspots,
  validateProviderConnection,
  writeBinaryFile,
  writeTextFile
} from "./lib/tauriClient";
import type { EpisodeDraft, FeedSource, GenerationJob, HotspotCandidate, ModelProvider, ProviderSettings, RoundtablePlan } from "./types";

const RSS_PRESETS: FeedSource[] = [
  { id: "openai-blog", name: "OpenAI Blog", url: "https://openai.com/news/rss.xml", category: "company", enabled: true, lastStatus: "idle" },
  { id: "anthropic-news", name: "Anthropic News", url: "https://www.anthropic.com/news/rss.xml", category: "company", enabled: true, lastStatus: "idle" },
  { id: "google-ai-blog", name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", category: "company", enabled: true, lastStatus: "idle" },
  { id: "microsoft-ai-blog", name: "Microsoft AI Blog", url: "https://blogs.microsoft.com/ai/feed/", category: "company", enabled: true, lastStatus: "idle" },
  { id: "huggingface-blog", name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", category: "developer", enabled: true, lastStatus: "idle" },
  { id: "github-blog-ai", name: "GitHub Blog AI", url: "https://github.blog/ai-and-ml/feed/", category: "developer", enabled: true, lastStatus: "idle" },
  { id: "arxiv-ai", name: "arXiv AI", url: "https://export.arxiv.org/rss/cs.AI", category: "research", enabled: true, lastStatus: "idle" },
  { id: "mit-news-ai", name: "MIT News AI", url: "https://news.mit.edu/topic/artificial-intelligence2-rss.xml", category: "research", enabled: true, lastStatus: "idle" },
  { id: "qbitai", name: "量子位", url: "https://www.qbitai.com/feed", category: "market", enabled: true, lastStatus: "idle" },
  { id: "ithome", name: "IT之家", url: "https://www.ithome.com/rss/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "geekpark", name: "极客公园", url: "https://www.geekpark.net/rss", category: "market", enabled: true, lastStatus: "idle" },
  { id: "leiphone", name: "雷峰网", url: "https://www.leiphone.com/feed", category: "market", enabled: true, lastStatus: "idle" },
  { id: "36kr", name: "36氪", url: "https://36kr.com/feed", category: "market", enabled: true, lastStatus: "idle" },
  { id: "sspai", name: "少数派", url: "https://sspai.com/feed", category: "developer", enabled: true, lastStatus: "idle" },
  { id: "nvidia-ai-blog", name: "NVIDIA AI Blog", url: "https://blogs.nvidia.com/blog/category/deep-learning/feed/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "venturebeat-ai", name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "techcrunch-ai", name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "market", enabled: true, lastStatus: "idle" },
  { id: "the-decoder", name: "The Decoder", url: "https://the-decoder.com/feed/", category: "market", enabled: true, lastStatus: "idle" }
];

const navItems = [
  { id: "workbench", label: "工作台", icon: Activity },
  { id: "feeds", label: "RSS 源", icon: Rss },
  { id: "manual", label: "手动补充", icon: Plus },
  { id: "plan", label: "圆桌议程", icon: BrainCircuit },
  { id: "draft", label: "圆桌稿", icon: FileEdit },
  { id: "history", label: "圆桌历史", icon: CheckCircle2 },
  { id: "settings", label: "设置", icon: Settings }
];

const DEFAULT_PROVIDER_ID = "deepseek";

function App() {
  const [activeView, setActiveView] = useState("workbench");
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [hotspots, setHotspots] = useState<HotspotCandidate[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotCandidate | null>(null);
  const [selectedHotspotIds, setSelectedHotspotIds] = useState<string[]>([]);
  const [roundtablePlan, setRoundtablePlan] = useState<RoundtablePlan | null>(null);
  const [episodeDraft, setEpisodeDraft] = useState<EpisodeDraft | null>(null);
  const [lastSavedPath, setLastSavedPath] = useState("");
  const [filters, setFilters] = useState(() => ({
    ...getCurrentWeekRange(),
    minScore: 0,
    tag: "all",
    source: "all"
  }));
  const [modelCatalog, setModelCatalog] = useState<ModelProvider[]>([]);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState(DEFAULT_PROVIDER_ID);
  const [selectedModel, setSelectedModel] = useState("deepseek-chat");
  const [draftGenerationMode, setDraftGenerationMode] = useState<"single" | "multi_agent">("single");
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
    () => mergeHotspots(selectedHotspots.length > 0 ? selectedHotspots : selectedHotspot ? [selectedHotspot] : []),
    [selectedHotspot, selectedHotspots]
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
        const [feedResult, catalogResult, settingsResult, historyResult, appDataDirResult] = await Promise.all([
          getFeeds(),
          getModelCatalog(),
          getProviderSettings(),
          listEpisodeDrafts(),
          getAppDataDir()
        ]);
        setFeeds(feedResult);
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
        setHistoryDrafts(historyResult);
        const provider = nextCatalog.find((item) => item.id === DEFAULT_PROVIDER_ID) ?? nextCatalog[0];
        if (provider) {
          setSelectedProviderId(provider.id);
          const saved = settingsResult.find((item) => item.providerId === provider.id);
          setSelectedModel(saved?.selectedModel ?? provider.models[0] ?? "");
          setDraftGenerationMode(saved?.draftGenerationMode ?? "single");
        }
        setJob({ id: "job-init", type: "fetch", status: "succeeded", message: `后端已连接，已加载 ${feedResult.length} 个 RSS 源` });
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
      setHotspots(result);
      const nextFiltered = filterHotspots(result, filters);
      setSelectedHotspot(nextFiltered[0] ?? result[0] ?? null);
      setSelectedHotspotIds((nextFiltered[0] ?? result[0]) ? [(nextFiltered[0] ?? result[0]).id] : []);
      setRoundtablePlan(null);
      setEpisodeDraft(null);
      setJob({ id: "job-fetch", type: "fetch", status: "succeeded", message: `后端抓取完成，发现 ${result.length} 个候选热点` });
      setActiveView("workbench");
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

  function updateDateRange(startDate: string, endDate: string) {
    setFilters((current) => ({ ...current, startDate, endDate }));
    setJob({ id: "job-date-range", type: "fetch", status: "succeeded", message: "日期范围已更新，可继续抓取或筛选热点" });
  }

  function clearFilters() {
    setFilters({ ...getCurrentWeekRange(), minScore: 0, tag: "all", source: "all" });
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

  async function handleManualAdd(input: { title: string; summary: string; url: string; publisher?: string }) {
    try {
      setJob({ id: "job-manual", type: "save", status: "running", message: "正在写入手动补充热点" });
      const candidate = await addManualHotspot({ ...input, category: "other" });
      setHotspots((current) => [candidate, ...current.filter((item) => item.id !== candidate.id)]);
      setSelectedHotspot(candidate);
      setSelectedHotspotIds([candidate.id]);
      setJob({ id: "job-manual", type: "save", status: "succeeded", message: "手动热点已写入本地候选池" });
      setActiveView("workbench");
    } catch (error) {
      setJob({ id: "job-manual", type: "save", status: "failed", message: formatError(error, "手动热点写入失败") });
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
      setActiveView("plan");
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
      const draft = await generateEpisodeDraft(plan, generationHotspot, settings);
      const elapsed = Math.round(performance.now() - startedAt);
      console.info(`[AI timing] generate_episode_draft ${elapsed}ms`);
      setRoundtablePlan(plan);
      setEpisodeDraft(draft);
      setLastSavedPath("");
      setJob({ id: "job-draft", type: "draft", status: "succeeded", message: `圆桌稿已生成，用时 ${elapsed}ms` });
      setActiveView("draft");
    } catch (error) {
      setJob({ id: "job-draft", type: "draft", status: "failed", message: formatError(error, "生成稿件失败") });
      showLlmSettingsPrompt(error, "生成稿件失败，模型连接或调用没有成功。");
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

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <Radio size={20} />
          </div>
          <div>
            <strong>AI小圆桌</strong>
            <span>本地圆桌工作台</span>
          </div>
        </div>

        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={activeView === item.id ? "navItem active" : "navItem"}
                key={item.id}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebarFooter">
          <span className={job.status === "failed" ? "statusDot dangerDot" : "statusDot"} />
          <span>{job.status === "failed" ? "Backend error" : "Tauri backend"}</span>
        </div>
      </aside>

      <section className="mainPanel">
        {activeView === "workbench" && (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">Windows 本地内容生产工具</p>
                <h1>每周 AI 热点圆桌工作台</h1>
              </div>
            </header>

            <section className="statusStrip" aria-live="polite">
              <StatusPill label="后端状态" value={job.message} tone={job.status === "failed" ? "danger" : job.status === "running" ? "warning" : "success"} />
              <StatusPill label="RSS 源" value={`${feeds.length} 个`} tone="neutral" />
              <StatusPill label="候选热点" value={`${hotspots.length} 条`} tone="neutral" />
              <StatusPill label="草稿状态" value={episodeDraft?.status ?? "未生成"} tone="warning" />
            </section>

            <section className="fetchControlBand">
              <DateRangeControl
                endDate={filters.endDate}
                onSetCurrentWeek={setCurrentWeekRange}
                onUpdate={updateDateRange}
                startDate={filters.startDate}
              />
              <span className="dateRangeText">{formatDateCn(filters.startDate)} - {formatDateCn(filters.endDate)}</span>
              <button className="primaryButton" disabled={job.status === "running"} onClick={runFetch} type="button">
                <RefreshCcw size={16} />
                {job.status === "running" && job.type === "fetch" ? "抓取中" : "抓取 RSS"}
              </button>
            </section>
          </>
        )}

        <div className="workspace fullWorkspace">
          <section className="contentPane">
            {activeView === "workbench" && (
              <Workbench
                hotspots={filteredHotspots}
                availableSources={availableSources}
                availableTags={availableTags}
                filters={filters}
                onClearFilters={clearFilters}
                onFiltersChange={setFilters}
                totalHotspots={hotspots.length}
                selectedHotspotIds={selectedHotspotIds}
                onGeneratePlan={generatePlan}
                onSelectHotspot={setSelectedHotspot}
                onToggleHotspotSelection={toggleHotspotSelection}
                onOpenSource={openFirstHotspotSource}
                onFetch={runFetch}
              />
            )}
            {activeView === "feeds" && <Feeds feeds={feeds} onAddFeed={addFeed} onRefresh={loadFeeds} onToggleFeed={toggleFeed} />}
            {activeView === "manual" && <ManualInput onSubmit={handleManualAdd} />}
            {activeView === "plan" && (
              <PlanView
                onGenerateDraft={generateDraft}
                onGeneratePlan={generatePlan}
                onUpdateAgenda={updatePlanAgenda}
                onUpdateTension={updatePlanTension}
                plan={roundtablePlan}
              />
            )}
            {activeView === "draft" && <DraftEditor draft={episodeDraft} lastSavedPath={lastSavedPath} onSaveDraft={saveDraft} />}
            {activeView === "history" && (
              <HistoryView
                drafts={historyDrafts}
                onRefresh={loadHistory}
                onOpenSource={openSource}
                onSelectDraft={openHistoryDraft}
                onBackToList={returnToHistoryList}
                onUpdateDraft={updateHistoryDraft}
                selectedDraft={selectedHistoryDraft}
              />
            )}
            {activeView === "settings" && (
              <SettingsView
                appDataDir={appDataDir}
                modelCatalog={modelCatalog}
                onModelChange={setSelectedModel}
                onProviderChange={(providerId) => {
                  setSelectedProviderId(providerId);
                  const provider = modelCatalog.find((item) => item.id === providerId);
                  const saved = providerSettings.find((item) => item.providerId === providerId);
                  setSelectedModel(provider?.models[0] ?? "");
                  setDraftGenerationMode(saved?.draftGenerationMode ?? "single");
                }}
                draftGenerationMode={draftGenerationMode}
                onDraftGenerationModeChange={setDraftGenerationMode}
                onRefreshFromProvider={refreshModelsFromProvider}
                onRefreshModels={refreshModelCatalog}
                onSaveSettings={saveSettings}
                providerSettings={providerSettings}
                selectedModel={selectedModel}
                selectedProviderId={selectedProviderId}
              />
            )}
          </section>

        </div>
      </section>
      <footer className="appFooter" aria-live="polite">
        <span className={job.status === "failed" ? "statusDot dangerDot" : "statusDot"} />
        <strong>{job.status === "failed" ? "后端异常" : job.status === "running" ? "后端执行中" : "后端状态"}</strong>
        <span>{job.message}</span>
      </footer>
      {job.status === "running" && <BackendActivityModal job={job} mode={draftGenerationMode} />}
    </main>
  );
}

function formatError(error: unknown, fallback: string) {
  console.error(fallback, error);
  if (typeof error === "string") return `${fallback}: ${error}`;
  if (error instanceof Error) return `${fallback}: ${error.message}`;
  return fallback;
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
      const guest = draft.guests.find((item) => item.id === turn.speakerId);
      return `### ${index + 1}. ${guest?.label ?? turn.speakerId}\n\n${turn.text}`;
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
      const guest = draft.guests.find((item) => item.id === turn.speakerId);
      return `<article class="turn"><div><span>${escapeHtml(guest?.label ?? turn.speakerId)}</span><small>${escapeHtml(turn.intent)}</small></div><p>${escapeHtml(turn.text)}</p></article>`;
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
      pageContext.fillStyle = "#080b0f";
      pageContext.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      pageContext.drawImage(canvas, 0, rendered, canvas.width, sourcePageHeight, 0, 0, canvas.width, sourcePageHeight);
      if (page > 0) pdf.addPage();
      const pageData = pageCanvas.toDataURL("image/jpeg", 0.92);
      const remainingHeight = canvas.height - rendered;
      const outputHeight = remainingHeight < sourcePageHeight ? (remainingHeight * imageWidth) / canvas.width : pageHeight - margin * 2;
      pdf.addImage(pageData, "JPEG", margin, margin, imageWidth, outputHeight);
      rendered += sourcePageHeight;
      page += 1;
    }
    return blobToBase64(pdf.output("blob"));
  } finally {
    element.remove();
  }
}

async function saveDraftAs(draft: EpisodeDraft, format: "md" | "html" | "pdf") {
  const baseName = fileSafeName(draft.title);
  const filters = {
    md: [{ name: "Markdown", extensions: ["md"] }],
    html: [{ name: "HTML", extensions: ["html"] }],
    pdf: [{ name: "PDF", extensions: ["pdf"] }]
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

  const content = format === "html" ? draftToHtmlDocument(draft) : draftToMarkdown(draft);
  await writeTextFile(selectedPath, content);
  return selectedPath;
}

function makeFeedId(url: string) {
  return `feed-${url.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || Date.now()}`;
}

function filterHotspots(
  hotspots: HotspotCandidate[],
  filters: { startDate: string; endDate: string; minScore: number; tag: string; source: string }
) {
  return hotspots
    .filter((hotspot) => {
      const publishedAt = hotspot.sources[0]?.publishedAt ?? hotspot.createdAt;
      const dateValue = publishedAt ? new Date(publishedAt).getTime() : new Date(hotspot.createdAt).getTime();
      const start = filters.startDate ? new Date(`${filters.startDate}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY;
      const end = filters.endDate ? new Date(`${filters.endDate}T23:59:59`).getTime() : Number.POSITIVE_INFINITY;
      const matchesTime = Number.isNaN(dateValue) || (dateValue >= start && dateValue <= end);
      const matchesScore = hotspot.score >= filters.minScore;
      const matchesTag = filters.tag === "all" || hotspot.matchedSignals.includes(filters.tag);
      const matchesSource = filters.source === "all" || hotspot.sources.some((source) => source.publisher === filters.source);
      return matchesTime && matchesScore && matchesTag && matchesSource;
    })
    .sort((a, b) => b.score - a.score);
}

function mergeHotspots(hotspots: HotspotCandidate[]) {
  if (hotspots.length === 0) return null;
  if (hotspots.length === 1) return hotspots[0];

  const sources = hotspots.flatMap((hotspot) => hotspot.sources);
  const dedupedSources = sources.filter((source, index) => sources.findIndex((item) => item.url === source.url) === index);
  const signals = hotspots.flatMap((hotspot) => hotspot.matchedSignals);
  const dedupedSignals = Array.from(new Set(signals));
  const score = Math.round(hotspots.reduce((sum, hotspot) => sum + hotspot.score, 0) / hotspots.length);

  return {
    id: `merged-${hotspots.map((hotspot) => hotspot.id).join("-")}`,
    title: `多源圆桌：${hotspots.map((hotspot) => hotspot.title).slice(0, 3).join(" / ")}`,
    summary: hotspots.map((hotspot) => hotspot.summary).join("\n\n"),
    category: hotspots[0].category,
    score,
    status: "shortlisted",
    sourceCount: dedupedSources.length,
    sources: dedupedSources,
    matchedSignals: dedupedSignals,
    createdAt: new Date().toISOString(),
    note: `由 ${hotspots.length} 个候选源合并生成`
  } satisfies HotspotCandidate;
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "success" | "warning" | "danger" | "neutral" }) {
  return (
    <div className={`statusPill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DateRangeControl({
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
  filters: { startDate: string; endDate: string; minScore: number; tag: string; source: string };
  hotspots: HotspotCandidate[];
  onClearFilters: () => void;
  onFiltersChange: (filters: { startDate: string; endDate: string; minScore: number; tag: string; source: string }) => void;
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
        <div className="hotspotGrid">
          {hotspots.map((hotspot) => (
            <article
              className={selectedHotspotIds.includes(hotspot.id) ? "hotspotCard selected" : "hotspotCard"}
              key={hotspot.id}
              onClick={() => {
                onSelectHotspot(hotspot);
                onToggleHotspotSelection(hotspot);
              }}
            >
              <div className={selectedHotspotIds.includes(hotspot.id) ? "selectionBadge isSelected" : "selectionBadge"}>
                {selectedHotspotIds.includes(hotspot.id) ? "已选择" : "未选择"}
              </div>
              <div className="hotspotMeta">
                <span className="sourceName">{primarySourceName(hotspot)}</span>
                <span>{primarySourceDate(hotspot)}</span>
              </div>
              <button className="textOpenButton" onClick={(event) => { event.stopPropagation(); void onOpenSource(hotspot); }} type="button">
                <h3>{hotspot.title}</h3>
              </button>
              <p>{hotspot.summary}</p>
              <footer>
                <span>{hotspot.sourceCount} sources</span>
                <span>{hotspot.category}</span>
              </footer>
            </article>
          ))}
        </div>
      )}
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
  filters: { startDate: string; endDate: string; minScore: number; tag: string; source: string };
  onClearFilters: () => void;
  onFiltersChange: (filters: { startDate: string; endDate: string; minScore: number; tag: string; source: string }) => void;
}) {
  return (
    <section className="filterPanel">
      <div className="filterPanelHeader">
        <div>
          <strong>筛选候选</strong>
          <span>按时间、热度、标签和 RSS 来源收窄工作台卡片</span>
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
          最低热度
          <input min="0" max="100" type="number" value={filters.minScore} onChange={(event) => onFiltersChange({ ...filters, minScore: Number(event.target.value) })} />
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

function ManualInput({ onSubmit }: { onSubmit: (input: { title: string; summary: string; url: string; publisher?: string }) => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [url, setUrl] = useState("");
  const [publisher, setPublisher] = useState("");

  return (
    <form
      className="formPanel"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ title, summary, url, publisher: publisher || undefined });
      }}
    >
      <p className="eyebrow">手动补充</p>
      <h2>补充一个 RSS 未覆盖的热点</h2>
      <label>
        热点标题
        <input onChange={(event) => setTitle(event.target.value)} placeholder="例如：某模型发布、融资、论文或监管事件" value={title} />
      </label>
      <label>
        背景说明
        <textarea onChange={(event) => setSummary(event.target.value)} placeholder="写下你已经知道的事实、疑问和希望圆桌重点讨论的角度。" rows={7} value={summary} />
      </label>
      <label>
        来源链接
        <input onChange={(event) => setUrl(event.target.value)} placeholder="https://..." value={url} />
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
  plan,
  onGenerateDraft,
  onGeneratePlan,
  onUpdateAgenda,
  onUpdateTension
}: {
  plan: RoundtablePlan | null;
  onGenerateDraft: () => void;
  onGeneratePlan: () => void;
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

function DraftEditor({ draft, lastSavedPath, onSaveDraft }: { draft: EpisodeDraft | null; lastSavedPath: string; onSaveDraft: () => void }) {
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
        <button className="primaryButton" onClick={onSaveDraft} type="button">
          <Save size={16} />
          保存草稿
        </button>
      </section>
      {lastSavedPath && <p className="savePath">已保存到：{lastSavedPath}</p>}
      <p className="summary">{draft.summary}</p>
      <div className="dialogueFlow">
        {draft.dialogue.map((turn, index) => {
          const guest = draft.guests.find((item) => item.id === turn.speakerId);
          return (
            <article className="turn" key={`${turn.speakerId}-${index}`}>
              <div>
                <span>{guest?.label}</span>
                <small>{turn.intent}</small>
              </div>
              <p>{turn.text}</p>
            </article>
          );
        })}
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

  async function handleExport(format: "md" | "html" | "pdf") {
    setExportMenuOpen(false);
    setExportStatus({ status: "saving", message: "保存中，请选择文件保存位置。" });
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
          const guest = editableDraft.guests.find((item) => item.id === turn.speakerId);
          return (
            <article className="turn" key={`${turn.speakerId}-${index}`}>
              <div>
                <span>{guest?.label}</span>
                <small>{turn.intent}</small>
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

function BackendActivityModal({ job, mode }: { job: GenerationJob; mode: "single" | "multi_agent" }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [job.id]);

  const progress = activityProgress(job, mode, elapsed);

  return (
    <div className="activityOverlay" role="status" aria-live="polite">
      <div className="activityModal">
        <div className="activitySpinner" />
        <div className="activityContent">
          <strong>{progress.title}</strong>
          <p>{progress.detail}</p>
          <div className="activityProgressTrack">
            <span style={{ width: `${progress.percent}%` }} />
          </div>
          <small>{job.message} · 已等待 {elapsed}s</small>
        </div>
      </div>
    </div>
  );
}

function activityProgress(job: GenerationJob, mode: "single" | "multi_agent", elapsed: number) {
  if (job.type === "draft" && mode === "multi_agent") {
    const round = Math.min(16, Math.max(1, Math.floor(Math.max(0, elapsed - 8) / 6) + 1));
    const detail = elapsed < 8 ? "正在规划圆桌对话轮次" : `正在生成第 ${round} 轮对话`;
    return {
      title: "正在生成圆桌稿",
      detail,
      percent: Math.min(92, 18 + round * 5)
    };
  }

  if (job.type === "draft") {
    return {
      title: "正在生成圆桌稿",
      detail: elapsed < 10 ? "正在整理议程、来源和嘉宾立场" : "正在等待模型返回完整草稿",
      percent: Math.min(88, 22 + elapsed * 3)
    };
  }

  if (job.type === "plan") {
    return {
      title: "正在生成圆桌议程",
      detail: elapsed < 8 ? "正在检查来源和热点背景" : "正在组织议程、争议点和事实风险",
      percent: Math.min(90, 28 + elapsed * 4)
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

  return {
    title: "正在保存",
    detail: "正在写入本地 JSON",
    percent: Math.min(90, 35 + elapsed * 8)
  };
}

function SettingsView({
  appDataDir,
  draftGenerationMode,
  modelCatalog,
  onDraftGenerationModeChange,
  onModelChange,
  onProviderChange,
  onRefreshFromProvider,
  onRefreshModels,
  onSaveSettings,
  providerSettings,
  selectedModel,
  selectedProviderId
}: {
  appDataDir: string;
  draftGenerationMode: "single" | "multi_agent";
  modelCatalog: ModelProvider[];
  onDraftGenerationModeChange: (mode: "single" | "multi_agent") => void;
  onModelChange: (model: string) => void;
  onProviderChange: (providerId: string) => void;
  onRefreshFromProvider: (settings: ProviderSettings) => void;
  onRefreshModels: () => void;
  onSaveSettings: (settings: ProviderSettings) => void;
  providerSettings: ProviderSettings[];
  selectedModel: string;
  selectedProviderId: string;
}) {
  const provider = modelCatalog.find((item) => item.id === selectedProviderId);
  const savedSettings = providerSettings.find((item) => item.providerId === selectedProviderId);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? "");

  useEffect(() => {
    setApiKey(savedSettings?.apiKey ?? "");
    setBaseUrl(savedSettings?.baseUrl ?? provider?.baseUrl ?? "");
  }, [provider?.baseUrl, savedSettings?.apiKey, savedSettings?.baseUrl, selectedProviderId]);

  const currentSettings: ProviderSettings = {
    providerId: selectedProviderId,
    baseUrl,
    apiKey,
    selectedModel,
    draftGenerationMode
  };

  return (
    <div className="formPanel">
      <p className="eyebrow">设置</p>
      <section className="sectionHeader compactHeader">
        <div>
          <h2>模型厂商与模型选择</h2>
          <p className="sectionMeta">默认使用 DeepSeek；启动时会加载内置厂商列表，并在本地已保存 API Key 时刷新当前厂商模型。</p>
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
          onChange={(event) => onDraftGenerationModeChange(event.target.value as "single" | "multi_agent")}
        >
          <option value="single">一个模型直接生成整稿</option>
          <option value="multi_agent">中控调度，多次调用嘉宾独立发言</option>
        </select>
      </label>
      <button className="ghostButton" onClick={() => onSaveSettings(currentSettings)} type="button">
        <Save size={16} />
        保存设置
      </button>
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

export default App;
