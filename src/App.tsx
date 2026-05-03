import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bot,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  FileEdit,
  Newspaper,
  Plus,
  Radio,
  RefreshCcw,
  Rss,
  Save,
  Settings,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import {
  addManualHotspot,
  generateEpisodeDraft,
  generateRoundtablePlan,
  getModelCatalog,
  getProviderSettings,
  getFeeds,
  listEpisodeDrafts,
  refreshModelCatalog as refreshModelCatalogFromBackend,
  saveEpisodeDraft,
  saveFeeds,
  saveProviderSettings,
  searchHotspots
} from "./lib/tauriClient";
import type { EpisodeDraft, FeedSource, GenerationJob, HotspotCandidate, ModelProvider, ProviderSettings, RoundtablePlan } from "./types";

const navItems = [
  { id: "workbench", label: "工作台", icon: Activity },
  { id: "feeds", label: "RSS 源", icon: Rss },
  { id: "hotspots", label: "热点候选", icon: Newspaper },
  { id: "manual", label: "手动补充", icon: Plus },
  { id: "plan", label: "圆桌计划", icon: BrainCircuit },
  { id: "draft", label: "稿件编辑", icon: FileEdit },
  { id: "history", label: "圆桌历史", icon: CheckCircle2 },
  { id: "settings", label: "设置", icon: Settings }
];

function App() {
  const [activeView, setActiveView] = useState("workbench");
  const [feeds, setFeeds] = useState<FeedSource[]>([]);
  const [hotspots, setHotspots] = useState<HotspotCandidate[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<HotspotCandidate | null>(null);
  const [roundtablePlan, setRoundtablePlan] = useState<RoundtablePlan | null>(null);
  const [episodeDraft, setEpisodeDraft] = useState<EpisodeDraft | null>(null);
  const [lastSavedPath, setLastSavedPath] = useState("");
  const [filters, setFilters] = useState({
    startDate: "",
    endDate: "",
    minScore: 0,
    tag: "all",
    source: "all"
  });
  const [modelCatalog, setModelCatalog] = useState<ModelProvider[]>([]);
  const [providerSettings, setProviderSettings] = useState<ProviderSettings[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState("mock");
  const [selectedModel, setSelectedModel] = useState("backend-rule-generator");
  const [historyDrafts, setHistoryDrafts] = useState<EpisodeDraft[]>([]);
  const [selectedHistoryDraft, setSelectedHistoryDraft] = useState<EpisodeDraft | null>(null);
  const [job, setJob] = useState<GenerationJob>({
    id: "job-001",
    type: "fetch",
    status: "idle",
    message: "等待连接 Tauri 后端"
  });

  const selectedSources = useMemo(() => selectedHotspot?.sources ?? [], [selectedHotspot]);
  const filteredHotspots = useMemo(() => filterHotspots(hotspots, filters), [hotspots, filters]);
  const availableTags = useMemo(() => Array.from(new Set(hotspots.flatMap((hotspot) => hotspot.matchedSignals))).sort(), [hotspots]);
  const availableSources = useMemo(
    () => Array.from(new Set(hotspots.flatMap((hotspot) => hotspot.sources.map((source) => source.publisher)))).sort(),
    [hotspots]
  );
  const showInspector = ["workbench", "plan", "draft"].includes(activeView) && Boolean(selectedHotspot);

  useEffect(() => {
    void (async () => {
      try {
        setJob({ id: "job-init", type: "fetch", status: "running", message: "正在连接 Tauri 后端" });
        const [feedResult, catalogResult, settingsResult, historyResult] = await Promise.all([
          getFeeds(),
          getModelCatalog(),
          getProviderSettings(),
          listEpisodeDrafts()
        ]);
        setFeeds(feedResult);
        setModelCatalog(catalogResult);
        setProviderSettings(settingsResult);
        setHistoryDrafts(historyResult);
        const provider = catalogResult.find((item) => item.id === "mock") ?? catalogResult[0];
        if (provider) {
          setSelectedProviderId(provider.id);
          setSelectedModel(provider.models[0] ?? "");
        }
        setJob({ id: "job-init", type: "fetch", status: "succeeded", message: `后端已连接，已加载 ${feedResult.length} 个 RSS 源` });
      } catch (error) {
        setJob({ id: "job-init", type: "fetch", status: "failed", message: formatError(error, "无法连接 Tauri 后端，请使用 npm.cmd run tauri:dev 打开桌面窗口") });
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedHotspot && !filteredHotspots.some((hotspot) => hotspot.id === selectedHotspot.id)) {
      setSelectedHotspot(filteredHotspots[0] ?? null);
    }
  }, [filteredHotspots, selectedHotspot]);

  async function loadFeeds() {
    try {
      setJob({ id: "job-feeds", type: "fetch", status: "running", message: "正在读取本地 RSS 源配置" });
      const result = await getFeeds();
      setFeeds(result);
      setJob({ id: "job-feeds", type: "fetch", status: "succeeded", message: `已加载 ${result.length} 个 RSS 源` });
    } catch (error) {
      setJob({ id: "job-feeds", type: "fetch", status: "failed", message: formatError(error, "无法连接 Tauri 后端，请使用 npm.cmd run tauri:dev 打开桌面窗口") });
    }
  }

  async function runFetch() {
    try {
      setJob({ id: "job-fetch", type: "fetch", status: "running", message: "正在由 Rust 后端抓取 RSS，可能需要几十秒" });
      const result = await searchHotspots();
      setHotspots(result);
      const nextFiltered = filterHotspots(result, filters);
      setSelectedHotspot(nextFiltered[0] ?? result[0] ?? null);
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
    const today = new Date();
    const day = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - day + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    setFilters((current) => ({
      ...current,
      startDate: toDateInputValue(monday),
      endDate: toDateInputValue(sunday)
    }));
    setJob({ id: "job-week", type: "fetch", status: "succeeded", message: "已设置为本周时间范围，可继续筛选候选热点" });
  }

  function updateDateRange(startDate: string, endDate: string) {
    setFilters((current) => ({ ...current, startDate, endDate }));
    setJob({ id: "job-date-range", type: "fetch", status: "succeeded", message: "日期范围已更新，可继续抓取或筛选热点" });
  }

  function clearFilters() {
    setFilters({ startDate: "", endDate: "", minScore: 0, tag: "all", source: "all" });
  }

  async function refreshModelCatalog() {
    try {
      setJob({ id: "job-models", type: "fetch", status: "running", message: "正在更新厂商和模型选项" });
      const catalog = await getModelCatalog();
      setModelCatalog(catalog);
      const provider = catalog.find((item) => item.id === selectedProviderId) ?? catalog[0];
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

  async function handleManualAdd(input: { title: string; summary: string; url: string; publisher?: string }) {
    try {
      setJob({ id: "job-manual", type: "save", status: "running", message: "正在写入手动补充热点" });
      const candidate = await addManualHotspot({ ...input, category: "other" });
      setHotspots((current) => [candidate, ...current.filter((item) => item.id !== candidate.id)]);
      setSelectedHotspot(candidate);
      setJob({ id: "job-manual", type: "save", status: "succeeded", message: "手动热点已写入本地候选池" });
      setActiveView("workbench");
    } catch (error) {
      setJob({ id: "job-manual", type: "save", status: "failed", message: formatError(error, "手动热点写入失败") });
    }
  }

  async function generatePlan() {
    if (!selectedHotspot) {
      setJob({ id: "job-plan", type: "plan", status: "failed", message: "请先选择一个热点候选" });
      return;
    }

    try {
      setJob({ id: "job-plan", type: "plan", status: "running", message: "Rust 后端正在生成中控 agent 计划" });
      const plan = await generateRoundtablePlan(selectedHotspot, currentProviderSettings());
      setRoundtablePlan(plan);
      setEpisodeDraft(null);
      setJob({ id: "job-plan", type: "plan", status: "succeeded", message: "中控 agent 计划已由后端生成" });
      setActiveView("plan");
    } catch (error) {
      setJob({ id: "job-plan", type: "plan", status: "failed", message: formatError(error, "生成计划失败") });
    }
  }

  async function generateDraft() {
    if (!selectedHotspot) {
      setJob({ id: "job-draft", type: "draft", status: "failed", message: "请先选择一个热点候选" });
      return;
    }

    try {
      setJob({ id: "job-draft", type: "draft", status: "running", message: "正在生成圆桌稿" });
      const plan = roundtablePlan ?? (await generateRoundtablePlan(selectedHotspot, currentProviderSettings()));
      const draft = await generateEpisodeDraft(plan, selectedHotspot);
      setRoundtablePlan(plan);
      setEpisodeDraft(draft);
      setLastSavedPath("");
      setJob({ id: "job-draft", type: "draft", status: "succeeded", message: "圆桌稿已由后端生成，可编辑审核" });
      setActiveView("draft");
    } catch (error) {
      setJob({ id: "job-draft", type: "draft", status: "failed", message: formatError(error, "生成稿件失败") });
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
      setModelCatalog(catalog);
      const provider = catalog.find((item) => item.id === settings.providerId);
      if (provider) {
        setSelectedModel(provider.models[0] ?? "");
      }
      setJob({ id: "job-models", type: "fetch", status: "succeeded", message: "模型列表已更新" });
    } catch (error) {
      setJob({ id: "job-models", type: "fetch", status: "failed", message: formatError(error, "更新模型列表失败") });
    }
  }

  async function saveSettings(settings: ProviderSettings) {
    try {
      const saved = await saveProviderSettings(settings);
      setProviderSettings(saved);
      setJob({ id: "job-settings", type: "save", status: "succeeded", message: "API Key 与模型设置已保存到本地" });
    } catch (error) {
      setJob({ id: "job-settings", type: "save", status: "failed", message: formatError(error, "保存模型设置失败") });
    }
  }

  function currentProviderSettings(): ProviderSettings {
    const provider = modelCatalog.find((item) => item.id === selectedProviderId);
    const saved = providerSettings.find((item) => item.providerId === selectedProviderId);
    return {
      providerId: selectedProviderId,
      baseUrl: saved?.baseUrl ?? provider?.baseUrl ?? "local",
      apiKey: saved?.apiKey,
      selectedModel
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
            <strong>APD</strong>
            <span>AI Roundtable</span>
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
        <header className="topbar">
          <div>
            <p className="eyebrow">Windows 本地内容生产工具</p>
            <h1>每周 AI 热点圆桌工作台</h1>
          </div>
          <div className="topbarActions">
            <DateRangeControl
              endDate={filters.endDate}
              onSetCurrentWeek={setCurrentWeekRange}
              onUpdate={updateDateRange}
              startDate={filters.startDate}
            />
            <button className="primaryButton" disabled={job.status === "running"} onClick={runFetch} type="button">
              <RefreshCcw size={16} />
              {job.status === "running" && job.type === "fetch" ? "抓取中" : "抓取 RSS"}
            </button>
          </div>
        </header>

        <section className="statusStrip" aria-live="polite">
          <StatusPill label="后端状态" value={job.message} tone={job.status === "failed" ? "danger" : job.status === "running" ? "warning" : "success"} />
          <StatusPill label="RSS 源" value={`${feeds.length} 个`} tone="neutral" />
          <StatusPill label="候选热点" value={`${hotspots.length} 条`} tone="neutral" />
          <StatusPill label="草稿状态" value={episodeDraft?.status ?? "未生成"} tone="warning" />
        </section>

        <div className={showInspector ? "workspace" : "workspace fullWorkspace"}>
          <section className="contentPane">
            {activeView === "workbench" && (
              <Workbench
                hotspots={filteredHotspots}
                totalHotspots={hotspots.length}
                selectedHotspot={selectedHotspot}
                onGenerateDraft={generateDraft}
                onGeneratePlan={generatePlan}
                onSelectHotspot={setSelectedHotspot}
                onFetch={runFetch}
              />
            )}
            {activeView === "feeds" && <Feeds feeds={feeds} onRefresh={loadFeeds} onToggleFeed={toggleFeed} />}
            {activeView === "hotspots" && (
              <Hotspots
                availableSources={availableSources}
                availableTags={availableTags}
                filters={filters}
                hotspots={filteredHotspots}
                onClearFilters={clearFilters}
                onFiltersChange={setFilters}
                onSelectHotspot={setSelectedHotspot}
                selectedHotspot={selectedHotspot}
                totalHotspots={hotspots.length}
              />
            )}
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
                onSelectDraft={setSelectedHistoryDraft}
                selectedDraft={selectedHistoryDraft}
              />
            )}
            {activeView === "settings" && (
              <SettingsView
                modelCatalog={modelCatalog}
                onModelChange={setSelectedModel}
                onProviderChange={(providerId) => {
                  setSelectedProviderId(providerId);
                  const provider = modelCatalog.find((item) => item.id === providerId);
                  setSelectedModel(provider?.models[0] ?? "");
                }}
                onRefreshFromProvider={refreshModelsFromProvider}
                onRefreshModels={refreshModelCatalog}
                onSaveSettings={saveSettings}
                providerSettings={providerSettings}
                selectedModel={selectedModel}
                selectedProviderId={selectedProviderId}
              />
            )}
          </section>

          {showInspector && <SourceInspector sources={selectedSources} />}
        </div>
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

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
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
  hotspots,
  totalHotspots,
  selectedHotspot,
  onGeneratePlan,
  onGenerateDraft,
  onSelectHotspot,
  onFetch
}: {
  hotspots: HotspotCandidate[];
  totalHotspots: number;
  selectedHotspot: HotspotCandidate | null;
  onGeneratePlan: () => void;
  onGenerateDraft: () => void;
  onSelectHotspot: (hotspot: HotspotCandidate) => void;
  onFetch: () => void;
}) {
  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">本周短名单</p>
          <h2>从真实 RSS 抓取到圆桌稿</h2>
          <p className="sectionMeta">当前显示 {hotspots.length} / {totalHotspots} 条候选</p>
        </div>
        <div className="buttonGroup">
          <button className="ghostButton" disabled={!selectedHotspot} onClick={onGeneratePlan} type="button">
            <Bot size={16} />
            生成计划
          </button>
          <button className="primaryButton" disabled={!selectedHotspot} onClick={onGenerateDraft} type="button">
            <Sparkles size={16} />
            生成稿件
          </button>
        </div>
      </section>

      {hotspots.length === 0 ? (
        <EmptyState title="还没有候选热点" text="点击抓取 RSS，后端会读取本地 RSS 源配置并抓取真实候选；如果已抓取过，请检查筛选条件。" actionLabel="抓取 RSS" onAction={onFetch} />
      ) : (
        <div className="hotspotGrid">
          {hotspots.map((hotspot) => (
            <button
              className={selectedHotspot?.id === hotspot.id ? "hotspotCard selected" : "hotspotCard"}
              key={hotspot.id}
              onClick={() => onSelectHotspot(hotspot)}
              type="button"
            >
              <div>
                <span className="score">{hotspot.score}</span>
                <span className="tag">{hotspot.category}</span>
              </div>
              <h3>{hotspot.title}</h3>
              <p>{hotspot.summary}</p>
              <footer>
                <span>{hotspot.sourceCount} sources</span>
                <span>{hotspot.status}</span>
              </footer>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Feeds({ feeds, onRefresh, onToggleFeed }: { feeds: FeedSource[]; onRefresh: () => void; onToggleFeed: (feedId: string) => void }) {
  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">RSS 管理</p>
          <h2>本地 JSON 中的可信来源池</h2>
        </div>
        <button className="ghostButton" onClick={onRefresh} type="button">
          <RefreshCcw size={16} />
          重新读取
        </button>
      </section>
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
            <button aria-pressed={feed.enabled} className={feed.enabled ? "switch isOn" : "switch"} onClick={() => onToggleFeed(feed.id)} type="button">
              <span />
              <strong>{feed.enabled ? "启用" : "禁用"}</strong>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Hotspots({
  availableSources,
  availableTags,
  filters,
  hotspots,
  onClearFilters,
  onFiltersChange,
  selectedHotspot,
  onSelectHotspot,
  totalHotspots
}: {
  availableSources: string[];
  availableTags: string[];
  filters: { startDate: string; endDate: string; minScore: number; tag: string; source: string };
  hotspots: HotspotCandidate[];
  onClearFilters: () => void;
  onFiltersChange: (filters: { startDate: string; endDate: string; minScore: number; tag: string; source: string }) => void;
  selectedHotspot: HotspotCandidate | null;
  onSelectHotspot: (hotspot: HotspotCandidate) => void;
  totalHotspots: number;
}) {
  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">候选热点</p>
          <h2>按时间、热度、标签和 RSS 来源筛选</h2>
          <p className="sectionMeta">当前显示 {hotspots.length} / {totalHotspots} 条候选</p>
        </div>
        <button className="ghostButton" onClick={onClearFilters} type="button">
          <RefreshCcw size={16} />
          清空筛选
        </button>
      </section>
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
      <div className="dataTable hotspotTable">
        <div className="tableHeader">
          <span>标题</span>
          <span>来源</span>
          <span>热度</span>
          <span>标签</span>
        </div>
        {hotspots.map((hotspot) => (
          <button
            className={selectedHotspot?.id === hotspot.id ? "tableRow buttonRow activeRow" : "tableRow buttonRow"}
            key={hotspot.id}
            onClick={() => onSelectHotspot(hotspot)}
            type="button"
          >
            <strong>{hotspot.title}</strong>
            <span>{hotspot.sources.map((source) => source.publisher).join("、")}</span>
            <span>{hotspot.score}</span>
            <span>{hotspot.matchedSignals.slice(0, 3).join(", ")}</span>
          </button>
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
    return <EmptyState title="还没有中控计划" text="先选择热点，再点击生成议程。" actionLabel="生成议程" onAction={onGeneratePlan} />;
  }

  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">中控 Agent 计划</p>
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
    return <EmptyState title="还没有圆桌稿" text="先选择热点，生成中控计划，再生成稿件。" />;
  }

  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">稿件编辑</p>
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

function SourceInspector({ sources }: { sources: HotspotCandidate["sources"] }) {
  return (
    <aside className="inspector">
      <div className="inspectorHeader">
        <ShieldCheck size={17} />
        <span>来源与事实检查</span>
      </div>
      <div className="sourceList">
        {sources.map((source) => (
          <article className="sourceItem" key={source.id}>
            <strong>{source.publisher}</strong>
            <span>{source.title}</span>
            {source.publishedAt && <small>{source.publishedAt}</small>}
            <a href={source.url} rel="noreferrer" target="_blank">打开来源</a>
          </article>
        ))}
      </div>
      <div className="checklist">
        <label>
          <input type="checkbox" defaultChecked />
          模拟嘉宾声明清晰
        </label>
        <label>
          <input type="checkbox" />
          事实数字已回查来源
        </label>
        <label>
          <input type="checkbox" />
          商业判断与技术判断不重复
        </label>
      </div>
    </aside>
  );
}

function HistoryView({
  drafts,
  onRefresh,
  onSelectDraft,
  selectedDraft
}: {
  drafts: EpisodeDraft[];
  onRefresh: () => void;
  onSelectDraft: (draft: EpisodeDraft) => void;
  selectedDraft: EpisodeDraft | null;
}) {
  return (
    <div className="historyLayout">
      <section className="viewStack">
        <section className="sectionHeader">
          <div>
            <p className="eyebrow">圆桌历史</p>
            <h2>过去保存的圆桌草稿</h2>
            <p className="sectionMeta">共 {drafts.length} 篇，点击左侧列表查看详情。</p>
          </div>
          <button className="ghostButton" onClick={onRefresh} type="button">
            <RefreshCcw size={16} />
            刷新
          </button>
        </section>
        <div className="historyList">
          {drafts.length === 0 ? (
            <EmptyState title="还没有历史圆桌" text="保存草稿后，这里会显示过去的圆桌列表。" />
          ) : (
            drafts.map((draft) => (
              <button className={selectedDraft?.id === draft.id ? "historyItem activeRow" : "historyItem"} key={draft.id} onClick={() => onSelectDraft(draft)} type="button">
                <strong>{draft.title}</strong>
                <span>{draft.updatedAt}</span>
                <small>{draft.status}</small>
              </button>
            ))
          )}
        </div>
      </section>
      <section className="historyDetail">
        {selectedDraft ? (
          <DraftEditor draft={selectedDraft} lastSavedPath="" onSaveDraft={() => undefined} />
        ) : (
          <EmptyState title="选择一篇圆桌" text="点击左侧历史列表后，会在这里显示完整圆桌内容。" />
        )}
      </section>
    </div>
  );
}

function SettingsView({
  modelCatalog,
  onModelChange,
  onProviderChange,
  onRefreshFromProvider,
  onRefreshModels,
  onSaveSettings,
  providerSettings,
  selectedModel,
  selectedProviderId
}: {
  modelCatalog: ModelProvider[];
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
    selectedModel
  };

  return (
    <div className="formPanel">
      <p className="eyebrow">设置</p>
      <section className="sectionHeader compactHeader">
        <div>
          <h2>模型厂商与模型选择</h2>
          <p className="sectionMeta">为控制成本，模型列表只在点击更新时刷新；当前生成仍使用后端规则 fallback。</p>
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
      <button className="ghostButton" onClick={() => onSaveSettings(currentSettings)} type="button">
        <Save size={16} />
        保存设置
      </button>
      <label>
        本地内容目录
        <input defaultValue="%APPDATA%/com.apd.ai-roundtable-workbench/" readOnly />
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
