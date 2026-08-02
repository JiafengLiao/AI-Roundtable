import type { FeedCategory, HotspotCandidate } from "../types";

export type HotspotDisplayCategoryKey = "model" | "agent" | "product" | "investment" | "research" | "other";

type ScoredCategoryKey = Exclude<HotspotDisplayCategoryKey, "other">;

const scoredCategoryKeys: ScoredCategoryKey[] = ["model", "agent", "product", "investment", "research"];

const categoryPriors: Record<FeedCategory, Partial<Record<ScoredCategoryKey, number>>> = {
  company: { model: 1, product: 1 },
  developer: { agent: 1, model: 1 },
  market: { product: 1, investment: 1 },
  other: {},
  policy: { product: 1 },
  research: { research: 2 }
};

const categoryKeywords: Record<ScoredCategoryKey, string[]> = {
  agent: [
    "agent",
    "agents",
    "agentic",
    "automation",
    "automate",
    "browser",
    "code generation",
    "coding agent",
    "langgraph",
    "orchestration",
    "rpa",
    "task",
    "tool calling",
    "tool use",
    "workflow",
    "agent 工程",
    "代码生成",
    "工具调用",
    "工具链",
    "浏览器操作",
    "任务代理",
    "任务编排",
    "生产环境",
    "自动化",
    "智能体"
  ],
  investment: [
    "acquisition",
    "funding",
    "fundraise",
    "ipo",
    "investment",
    "investor",
    "merger",
    "round",
    "valuation",
    "估值",
    "并购",
    "基金",
    "融资",
    "上市",
    "收购",
    "投资",
    "投资方",
    "轮融资"
  ],
  model: [
    "benchmark",
    "claude",
    "context",
    "gemini",
    "gpt",
    "inference",
    "llama",
    "model",
    "multimodal",
    "qwen",
    "reasoning",
    "token",
    "上下文",
    "多模态",
    "基准",
    "模型",
    "推理",
    "能力",
    "评测"
  ],
  product: [
    "app",
    "commercial",
    "copilot",
    "cursor",
    "feature",
    "launch",
    "notion",
    "product",
    "release",
    "subscription",
    "workflow app",
    "产品",
    "产品动态",
    "发布",
    "功能",
    "商业化",
    "套餐",
    "入口",
    "团队版",
    "应用",
    "订阅"
  ],
  research: [
    "ai index",
    "arxiv",
    "benchmark",
    "dataset",
    "experiment",
    "mit",
    "paper",
    "rag",
    "research",
    "stanford",
    "学术",
    "基准",
    "论文",
    "评测基准",
    "实验",
    "数据集",
    "研究"
  ]
};

function countMatches(text: string, keywords: string[]): number {
  return keywords.reduce((count, keyword) => {
    return text.includes(keyword.toLowerCase()) ? count + 1 : count;
  }, 0);
}

function normalizeText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function inferHotspotDisplayCategory(hotspot: HotspotCandidate): HotspotDisplayCategoryKey {
  const scores = Object.fromEntries(scoredCategoryKeys.map((key) => [key, 0])) as Record<ScoredCategoryKey, number>;
  const signalText = normalizeText(hotspot.matchedSignals);
  const contentText = normalizeText([hotspot.title, hotspot.summary, hotspot.note]);
  const sourceText = normalizeText(hotspot.sources.flatMap((source) => [source.publisher, source.title, source.url]));

  Object.entries(categoryPriors[hotspot.category] ?? {}).forEach(([key, score]) => {
    scores[key as ScoredCategoryKey] += score ?? 0;
  });

  scoredCategoryKeys.forEach((key) => {
    const keywords = categoryKeywords[key];
    scores[key] += countMatches(signalText, keywords) * 3;
    scores[key] += countMatches(contentText, keywords) * 2;
    scores[key] += countMatches(sourceText, keywords);
  });

  const ranked = scoredCategoryKeys
    .map((key) => ({ key, score: scores[key] }))
    .sort((left, right) => right.score - left.score);

  const [best, second] = ranked;
  if (!best || best.score < 3) {
    return "other";
  }

  if (second && best.score === second.score) {
    return "other";
  }

  return best.key;
}
