import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(testDir, "..", "..");
const outputDir = join(tmpdir(), `ai-roundtable-hotspot-tests-${Date.now()}`);
const tscScript = join(projectRoot, "node_modules", "typescript", "bin", "tsc");

execFileSync(
  process.execPath,
  [
    tscScript,
    join(projectRoot, "src", "lib", "hotspotClassification.ts"),
    "--outDir",
    outputDir,
    "--module",
    "ES2022",
    "--moduleResolution",
    "Bundler",
    "--target",
    "ES2022",
    "--skipLibCheck",
    "--strict"
  ],
  { cwd: projectRoot, stdio: "inherit" }
);

process.on("exit", () => {
  if (existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
});

const { inferHotspotDisplayCategory, resolveHotspotDisplayCategory } = await import(pathToFileURL(join(outputDir, "lib", "hotspotClassification.js")));

function hotspot(overrides) {
  return {
    id: "hotspot-1",
    title: "Untitled",
    summary: "",
    category: "other",
    status: "new",
    sourceCount: 1,
    sources: [
      {
        id: "source-1",
        title: "Source title",
        url: "https://example.com",
        publisher: "Example",
        publishedAt: "2026-06-20T00:00:00.000Z"
      }
    ],
    matchedSignals: [],
    createdAt: "2026-06-20T00:00:00.000Z",
    ...overrides
  };
}

test("classifies model capability stories from model signals and product names", () => {
  assert.equal(
    inferHotspotDisplayCategory(
      hotspot({
        category: "company",
        title: "GPT-4o 多模态推理能力更新",
        summary: "上下文窗口扩展到 1M token，benchmark 表现提升",
        matchedSignals: ["model", "reasoning", "multimodal"]
      })
    ),
    "model"
  );
});

test("classifies agent engineering stories from workflow and tool-use language", () => {
  assert.equal(
    inferHotspotDisplayCategory(
      hotspot({
        category: "developer",
        title: "浏览器 Agent 支持自动化任务编排",
        summary: "tool use、workflow 和 LangGraph 集成进入生产环境",
        matchedSignals: ["agent", "workflow", "tool use"]
      })
    ),
    "agent"
  );
});

test("classifies product launches without confusing them with model research", () => {
  assert.equal(
    inferHotspotDisplayCategory(
      hotspot({
        category: "market",
        title: "Cursor 发布团队版订阅功能",
        summary: "新增企业入口、协作功能和商业化套餐",
        matchedSignals: ["product", "launch"]
      })
    ),
    "product"
  );
});

test("classifies funding and acquisition stories as investment", () => {
  assert.equal(
    inferHotspotDisplayCategory(
      hotspot({
        category: "market",
        title: "AI 初创公司完成 B 轮融资",
        summary: "估值提升至 60 亿美元，投资方包括多家基金",
        matchedSignals: ["funding", "valuation"]
      })
    ),
    "investment"
  );
});

test("classifies research stories from arXiv and paper language", () => {
  assert.equal(
    inferHotspotDisplayCategory(
      hotspot({
        category: "research",
        title: "arXiv 新论文提出 RAG 评测基准",
        summary: "研究团队发布 dataset 和实验结果",
        matchedSignals: ["paper", "benchmark"],
        sources: [
          {
            id: "arxiv",
            title: "Paper",
            url: "https://arxiv.org/abs/2606.12345",
            publisher: "arXiv AI",
            publishedAt: "2026-06-20T00:00:00.000Z"
          }
        ]
      })
    ),
    "research"
  );
});

test("uses other for low-confidence stories instead of round-robin fallback", () => {
  assert.equal(
    inferHotspotDisplayCategory(
      hotspot({
        category: "other",
        title: "周末编辑部备忘",
        summary: "需要稍后人工判断是否进入节目",
        matchedSignals: []
      })
    ),
    "other"
  );
});

test("resolveHotspotDisplayCategory prefers persisted displayCategory", () => {
  assert.equal(
    resolveHotspotDisplayCategory(
      hotspot({
        category: "market",
        title: "Cursor 发布团队版订阅功能",
        summary: "新增企业入口、协作功能和商业化套餐",
        matchedSignals: ["product", "launch"],
        displayCategory: "investment"
      })
    ),
    "investment"
  );
});
