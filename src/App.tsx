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
  getFeeds,
  saveEpisodeDraft,
  saveFeeds,
  searchHotspots
} from "./lib/tauriClient";
import type { EpisodeDraft, FeedSource, GenerationJob, HotspotCandidate, ModelProvider, RoundtablePlan } from "./types";

const navItems = [
  { id: "workbench", label: "工作台", icon: Activity },
  { id: "feeds", label: "RSS 源", icon: Rss },
  { id: "hotspots", label: "热点候选", icon: Newspaper },
  { id: "manual", label: "手动补充", icon: Plus },
  { id: "plan", label: "圆桌计划", icon: BrainCircuit },
  { id: "draft", label: "稿件编辑", icon: FileEdit },
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
  const [selectedProviderId, setSelectedProviderId] = useState("mock");
  const [selectedModel, setSelectedModel] = useState("backend-rule-generator");
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
  const showInspector = ["workbench", "hotspots", "plan", "draft"].includes(activeView) && Boolean(selectedHotspot);

  useEffect(() => {
    void (async () => {
      try {
        setJob({ id: "job-init", type: "fetch", status: "running", message: "正在连接 Tauri 后端" });
        const [feedResult, catalogResult] = await Promise.all([getFeeds(), getModelCatalog()]);
        setFeeds(feedResult);
        setModelCatalog(catalogResult);
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
      const plan = await generateRoundtablePlan(selectedHotspot);
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
      const plan = roundtablePlan ?? (await generateRoundtablePlan(selectedHotspot));
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
      setJob({ id: "job-save", type: "save", status: "succeeded", message: `草稿已保存：${path}` });
    } catch (error) {
      setJob({ id: "job-save", type: "save", status: "failed", message: formatError(error, "保存草稿失败") });
    }
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
            <button className="ghostButton" onClick={setCurrentWeekRange} type="button">
              <CalendarDays size={16} />
              本周范围
            </button>
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
            {activeView === "plan" && <PlanView plan={roundtablePlan} onGenerateDraft={generateDraft} />}
            {activeView === "draft" && <DraftEditor draft={episodeDraft} lastSavedPath={lastSavedPath} onSaveDraft={saveDraft} />}
            {activeView === "settings" && (
              <SettingsView
                modelCatalog={modelCatalog}
                onModelChange={setSelectedModel}
                onProviderChange={(providerId) => {
                  setSelectedProviderId(providerId);
                  const provider = modelCatalog.find((item) => item.id === providerId);
                  setSelectedModel(provider?.models[0] ?? "");
                }}
                onRefreshModels={refreshModelCatalog}
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
            <button className="miniButton" onClick={() => onToggleFeed(feed.id)} type="button">
              {feed.enabled ? "启用" : "禁用"}
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

function PlanView({ plan, onGenerateDraft }: { plan: RoundtablePlan | null; onGenerateDraft: () => void }) {
  if (!plan) {
    return <EmptyState title="还没有中控计划" text="先选择热点，再点击生成计划。" />;
  }

  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">中控 Agent 计划</p>
          <h2>{plan.objective}</h2>
        </div>
        <button className="primaryButton" onClick={onGenerateDraft} type="button">
          <Sparkles size={16} />
          生成圆桌稿
        </button>
      </section>
      <div className="planColumns">
        <div>
          <h3>议程</h3>
          {plan.agenda.map((item) => (
            <p className="agendaItem" key={item}>{item}</p>
          ))}
        </div>
        <div>
          <h3>争议点</h3>
          {plan.tensionPoints.map((item) => (
            <p className="agendaItem warn" key={item}>{item}</p>
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

function SettingsView({
  modelCatalog,
  onModelChange,
  onProviderChange,
  onRefreshModels,
  selectedModel,
  selectedProviderId
}: {
  modelCatalog: ModelProvider[];
  onModelChange: (model: string) => void;
  onProviderChange: (providerId: string) => void;
  onRefreshModels: () => void;
  selectedModel: string;
  selectedProviderId: string;
}) {
  const provider = modelCatalog.find((item) => item.id === selectedProviderId);

  return (
    <div className="formPanel">
      <p className="eyebrow">设置</p>
      <section className="sectionHeader compactHeader">
        <div>
          <h2>模型厂商与模型选择</h2>
          <p className="sectionMeta">为控制成本，模型列表只在点击更新时刷新；当前生成仍使用后端规则 fallback。</p>
        </div>
        <button className="ghostButton" onClick={onRefreshModels} type="button">
          <RefreshCcw size={16} />
          更新模型
        </button>
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
        <input value={provider?.baseUrl ?? ""} readOnly />
      </label>
      <label>
        本地内容目录
        <input defaultValue="%APPDATA%/com.apd.ai-roundtable-workbench/" readOnly />
      </label>
      <p className="mutedText">
        API Key 后续会接入系统凭据或环境变量；这里先只完成厂商/模型选择和主动刷新入口。
      </p>
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
