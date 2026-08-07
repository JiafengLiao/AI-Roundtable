import type { HotspotDisplayCategoryKey } from "../types";

export const EMBEDDING_MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

export const SCORED_DISPLAY_CATEGORY_KEYS = [
  "model",
  "agent",
  "product",
  "investment",
  "research"
] as const satisfies readonly HotspotDisplayCategoryKey[];

/** Seed phrases per bucket — averaged into centroid embeddings. */
export const HOTSPOT_CATEGORY_PROTOTYPES: Record<
  (typeof SCORED_DISPLAY_CATEGORY_KEYS)[number],
  string[]
> = {
  model: [
    "大语言模型发布与能力升级，上下文窗口与多模态推理 benchmark 评测",
    "GPT Claude Gemini Llama Qwen 模型版本更新与 token 效率",
    "开源模型权重发布与 inference 性能对比",
    "模型评测基准与 reasoning 能力提升"
  ],
  agent: [
    "AI Agent 智能体工程，tool calling 工具调用与任务编排 workflow",
    "浏览器自动化 coding agent 代码生成与 LangGraph 生产部署",
    "多 Agent 协作与 RPA 自动化流水线",
    "Agent 框架集成与 tool use 落地案例"
  ],
  product: [
    "AI 产品发布上线，新功能 release 与企业订阅套餐",
    "Copilot Cursor Notion 应用商业化与团队版入口",
    "SaaS 产品功能更新与用户增长",
    "AI 功能集成到现有软件与应用生态"
  ],
  investment: [
    "AI 公司融资 B 轮 C 轮估值与投资方基金",
    "并购收购上市 IPO 与战略投资",
    "初创企业 fundraise 与 capital 市场动态",
    "融资轮次与估值变化"
  ],
  research: [
    "arXiv 学术论文发布与 AI 研究 benchmark 数据集",
    "RAG 检索增强实验与学术评测基准",
    "高校实验室研究与 paper 新方法",
    "Stanford MIT AI index 学术前沿报告"
  ]
};

/** Minimum cosine similarity to accept a scored category. */
export const EMBEDDING_MIN_SCORE = 0.38;

/** Minimum gap between top-1 and top-2 scores. */
export const EMBEDDING_MIN_MARGIN = 0.035;
