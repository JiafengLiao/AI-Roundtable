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
  Search,
  Settings,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import {
  addManualHotspot,
  generateEpisodeDraft,
  generateRoundtablePlan,
  getFeeds,
  saveEpisodeDraft,
  saveFeeds,
  searchHotspots
} from "./lib/tauriClient";
import type { EpisodeDraft, FeedSource, GenerationJob, HotspotCandidate, RoundtablePlan } from "./types";

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
  const [job, setJob] = useState<GenerationJob>({
    id: "job-001",
    type: "fetch",
    status: "idle",
    message: "等待连接 Tauri 后端"
  });

  const selectedSources = useMemo(() => selectedHotspot?.sources ?? [], [selectedHotspot]);

  useEffect(() => {
    void loadFeeds();
  }, []);

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
      setSelectedHotspot(result[0] ?? null);
      setRoundtablePlan(null);
      setEpisodeDraft(null);
      setJob({ id: "job-fetch", type: "fetch", status: "succeeded", message: `后端抓取完成，发现 ${result.length} 个候选热点` });
      setActiveView("workbench");
      await loadFeeds();
    } catch (error) {
      setJob({ id: "job-fetch", type: "fetch", status: "failed", message: formatError(error, "RSS 抓取失败") });
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
            <button className="ghostButton" type="button">
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

        <div className="workspace">
          <section className="contentPane">
            {activeView === "workbench" && (
              <Workbench
                hotspots={hotspots}
                selectedHotspot={selectedHotspot}
                onGenerateDraft={generateDraft}
                onGeneratePlan={generatePlan}
                onSelectHotspot={setSelectedHotspot}
                onFetch={runFetch}
              />
            )}
            {activeView === "feeds" && <Feeds feeds={feeds} onRefresh={loadFeeds} onToggleFeed={toggleFeed} />}
            {activeView === "hotspots" && <Hotspots hotspots={hotspots} selectedHotspot={selectedHotspot} onSelectHotspot={setSelectedHotspot} />}
            {activeView === "manual" && <ManualInput onSubmit={handleManualAdd} />}
            {activeView === "plan" && <PlanView plan={roundtablePlan} onGenerateDraft={generateDraft} />}
            {activeView === "draft" && <DraftEditor draft={episodeDraft} lastSavedPath={lastSavedPath} onSaveDraft={saveDraft} />}
            {activeView === "settings" && <SettingsView />}
          </section>

          <aside className="inspector">
            <div className="inspectorHeader">
              <ShieldCheck size={17} />
              <span>来源与事实检查</span>
            </div>
            <div className="sourceList">
              {selectedSources.length === 0 ? (
                <p className="mutedText">选择热点后，这里会显示来自后端的来源链接。</p>
              ) : (
                selectedSources.map((source) => (
                  <a href={source.url} key={source.id} rel="noreferrer" target="_blank">
                    <strong>{source.publisher}</strong>
                    <span>{source.title}</span>
                  </a>
                ))
              )}
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
  selectedHotspot,
  onGeneratePlan,
  onGenerateDraft,
  onSelectHotspot,
  onFetch
}: {
  hotspots: HotspotCandidate[];
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
        <EmptyState title="还没有候选热点" text="点击抓取 RSS，后端会读取本地 RSS 源配置并抓取真实候选。" actionLabel="抓取 RSS" onAction={onFetch} />
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
      <div className="tableLike">
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

function Hotspots({ hotspots, selectedHotspot, onSelectHotspot }: { hotspots: HotspotCandidate[]; selectedHotspot: HotspotCandidate | null; onSelectHotspot: (hotspot: HotspotCandidate) => void }) {
  return (
    <div className="viewStack">
      <section className="sectionHeader">
        <div>
          <p className="eyebrow">候选热点</p>
          <h2>按来源、分数和匹配信号筛选</h2>
        </div>
        <button className="ghostButton" type="button">
          <Search size={16} />
          筛选
        </button>
      </section>
      <div className="tableLike">
        {hotspots.map((hotspot) => (
          <button
            className={selectedHotspot?.id === hotspot.id ? "tableRow buttonRow activeRow" : "tableRow buttonRow"}
            key={hotspot.id}
            onClick={() => onSelectHotspot(hotspot)}
            type="button"
          >
            <strong>{hotspot.title}</strong>
            <span>{hotspot.sourceCount} sources</span>
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

function SettingsView() {
  return (
    <div className="formPanel">
      <p className="eyebrow">设置</p>
      <h2>当前使用 Tauri 后端</h2>
      <label>
        Provider
        <input defaultValue="backend rule generator / future openai-compatible provider" readOnly />
      </label>
      <label>
        本地内容目录
        <input defaultValue="%APPDATA%/com.apd.ai-roundtable-workbench/" readOnly />
      </label>
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
