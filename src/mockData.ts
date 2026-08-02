import type { EpisodeDraft, FeedSource, HotspotCandidate, RoundtablePlan } from "./types";

export const feeds: FeedSource[] = [
  {
    id: "openai-blog",
    name: "OpenAI Blog",
    url: "https://openai.com/blog/rss.xml",
    category: "company",
    enabled: true,
    lastFetchedAt: "2026-05-02T09:10:00.000Z",
    lastStatus: "success"
  },
  {
    id: "arxiv-ai",
    name: "arXiv AI",
    url: "https://export.arxiv.org/rss/cs.AI",
    category: "research",
    enabled: true,
    lastFetchedAt: "2026-05-02T09:12:00.000Z",
    lastStatus: "success"
  },
  {
    id: "hf-blog",
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    category: "developer",
    enabled: true,
    lastFetchedAt: "2026-05-01T16:30:00.000Z",
    lastStatus: "success"
  }
];

export const hotspots: HotspotCandidate[] = [
  {
    id: "h-001",
    title: "多模态 agent 工具链开始从 demo 走向生产工作流",
    summary: "多个来源集中讨论了浏览器操作、代码生成、长任务调度和企业权限管理的组合，说明 agent 产品正在从炫技能力转向可审计的工作流。",
    category: "developer",
    score: 92,
    status: "shortlisted",
    sourceCount: 4,
    createdAt: "2026-05-02T10:00:00.000Z",
    matchedSignals: ["agent", "workflow", "enterprise", "tool use"],
    sources: [
      {
        id: "s-001",
        title: "Agent tooling moves toward production",
        url: "https://example.com/agent-tooling",
        publisher: "Example AI",
        publishedAt: "2026-05-01"
      },
      {
        id: "s-002",
        title: "Browser agents and enterprise controls",
        url: "https://example.com/browser-agents",
        publisher: "Example Labs",
        publishedAt: "2026-05-02"
      }
    ]
  },
  {
    id: "h-002",
    title: "开源小模型围绕本地推理和端侧部署继续升温",
    summary: "研究博客、开发者社区和芯片厂商更新共同指向一个趋势：小模型竞争焦点从榜单分数转向延迟、内存、工具兼容和部署体验。",
    category: "research",
    score: 86,
    status: "new",
    sourceCount: 3,
    createdAt: "2026-05-02T11:20:00.000Z",
    matchedSignals: ["small model", "local inference", "edge"],
    sources: [
      {
        id: "s-003",
        title: "Efficient local language models",
        url: "https://example.com/local-models",
        publisher: "Example Research",
        publishedAt: "2026-04-30"
      }
    ]
  }
];

export const plan: RoundtablePlan = {
  id: "p-001",
  hotspotId: "h-001",
  topicTitle: "Agent 工具链进入生产工作流",
  topicSummary: "多个来源显示 agent 产品正在从演示能力转向可审计、可恢复的生产工作流，但真实落地仍取决于权限、安全、稳定性和成本。",
  objective: "解释 agent 从 demo 到生产工作流的信号，拆解技术可行性和商业落地的真实门槛。",
  audiencePromise: "让 AI 从业者在 8 分钟内判断这个热点对产品路线、工程投入和投资叙事的影响。",
  agenda: ["热点扫盲", "第一视角 intuition", "商业影响", "工程难点", "本周可行动判断"],
  tensionPoints: ["agent 能否稳定完成长任务", "企业是否愿意开放浏览器和代码权限", "ROI 是否足以支撑高推理成本"],
  speakingOrder: ["host", "participant", "expert", "investor", "host"],
  sourceRisks: ["部分来源是产品发布，需要避免把营销措辞当成已验证事实。"],
  guests: [
    {
      id: "host",
      label: "主持人",
      role: "扫盲、追问和收束讨论",
      stance: "把热点拆成事实、争议和行动判断",
      speakingStyle: "短句、清晰、善于把术语翻译成人话"
    },
    {
      id: "participant",
      label: "消费者（产品使用者）",
      role: "从真实使用体验、付费意愿和产品落地摩擦解释变化",
      stance: "关注真实工作流里的摩擦、替代成本和可用性",
      speakingStyle: "带一点现场感，强调使用直觉和持续付费判断"
    },
    {
      id: "investor",
      label: "投资人",
      role: "判断商业化、市场结构和资本效率",
      stance: "谨慎看好，但会追问付费意愿和竞争壁垒",
      speakingStyle: "结构化、偏商业判断，不追热点口号"
    },
    {
      id: "expert",
      label: "热点技术人员",
      role: "分析模型、工具调用、权限、安全和评测",
      stance: "看重可靠性、可观测性和失败恢复",
      speakingStyle: "技术准确，但避免论文腔"
    }
  ]
};

export const draft: EpisodeDraft = {
  id: "d-001",
  title: "Agent 从 Demo 到生产工作流：这一周真正值得看的信号",
  summary: "本期圆桌聚焦 agent 工具链的生产化趋势：浏览器操作、代码生成、企业权限和长任务调度正在合流，但稳定性、审计和成本仍是落地门槛。",
  status: "draft",
  planId: plan.id,
  hotspotId: "h-001",
  sources: hotspots[0].sources,
  guests: plan.guests,
  createdAt: "2026-05-02T12:00:00.000Z",
  updatedAt: "2026-05-02T12:10:00.000Z",
  factChecks: ["所有具体能力表述需要回看来源链接。", "不要暗示模拟嘉宾是真实采访对象。"],
  takeaways: [
    "agent 竞争正在从单点能力转向完整工作流。",
    "企业采用的关键不只是模型能力，还有权限、审计和失败恢复。",
    "短期商业化最可能先发生在高价值、强流程的专业岗位。"
  ],
  dialogue: [
    {
      speakerId: "host",
      intent: "open",
      text: "今天我们看一个很容易被说泛的话题：agent。真正的新信号不是又多了一个 demo，而是工具链开始围绕生产工作流补齐。"
    },
    {
      speakerId: "participant",
      intent: "intuition",
      text: "一线直觉是，团队已经不再只问模型能不能点按钮，而是问它能不能在权限边界内持续做事，失败时能不能解释自己卡在哪里。"
    },
    {
      speakerId: "expert",
      intent: "technical",
      text: "技术上最难的是长任务状态管理、工具调用的可观测性和安全沙箱。没有这些，agent 很容易停留在漂亮演示。"
    },
    {
      speakerId: "investor",
      intent: "business",
      text: "商业上我会先看高价值岗位，比如研发、运营分析和内部工具维护。它们有足够高的时间成本，才可能覆盖推理和集成成本。"
    },
    {
      speakerId: "host",
      intent: "summary",
      text: "所以本周结论是：别只看 agent 会不会操作界面，要看它有没有进入可审计、可恢复、可收费的工作流。"
    }
  ]
};
