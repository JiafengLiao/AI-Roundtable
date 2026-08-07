import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

async function compileModule() {
  const outputDir = await mkdtemp(join(tmpdir(), "ai-roundtable-plan-tests-"));
  const result = spawnSync(
    "node",
    [
      "node_modules/typescript/bin/tsc",
      "src/lib/roundtablePlan.ts",
      "--target",
      "ES2022",
      "--module",
      "ES2022",
      "--moduleResolution",
      "node",
      "--outDir",
      outputDir,
      "--skipLibCheck"
    ],
    { cwd: resolve("."), encoding: "utf8" }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return {
    cleanup: () => rm(outputDir, { force: true, recursive: true }),
    modulePath: join(outputDir, "lib", "roundtablePlan.js")
  };
}

test("getPlanTopicDisplay prefers model-generated plan topic metadata", async () => {
  const compiled = await compileModule();
  try {
    const { getPlanTopicDisplay } = await import(pathToFileURL(compiled.modulePath));
    const display = getPlanTopicDisplay(
      {
        id: "plan-1",
        hotspotId: "hotspot-1",
        topicTitle: "模型提炼主题",
        topicSummary: "模型提炼摘要",
        objective: "讨论目标",
        audiencePromise: "听众收益",
        guests: [],
        agenda: [],
        tensionPoints: [],
        speakingOrder: [],
        sourceRisks: []
      },
      {
        id: "hotspot-1",
        title: "RSS 标题",
        summary: "RSS 摘要",
        category: "developer",
        status: "new",
        sourceCount: 1,
        sources: [],
        matchedSignals: [],
        createdAt: "2026-07-01T00:00:00.000Z"
      }
    );

    assert.equal(display.title, "模型提炼主题");
    assert.equal(display.summary, "模型提炼摘要");
  } finally {
    await compiled.cleanup();
  }
});

test("getPlanTopicDisplay waits for model topic metadata on old plans", async () => {
  const compiled = await compileModule();
  try {
    const { getPlanTopicDisplay } = await import(pathToFileURL(compiled.modulePath));
    const display = getPlanTopicDisplay(
      {
        id: "plan-1",
        hotspotId: "hotspot-1",
        objective: "讨论目标",
        audiencePromise: "听众收益",
        guests: [],
        agenda: [],
        tensionPoints: [],
        speakingOrder: [],
        sourceRisks: []
      },
      {
        id: "hotspot-1",
        title: "RSS 标题",
        summary: "RSS 摘要",
        category: "developer",
        status: "new",
        sourceCount: 1,
        sources: [],
        matchedSignals: [],
        createdAt: "2026-07-01T00:00:00.000Z"
      }
    );

    assert.equal(display.title, "Agent 工具链进入生产化拐点");
    assert.equal(display.summary, "让 AI 从业者在 8 分钟内判断这个热点对产品路线、工程投入和投资叙事的影响。");
  } finally {
    await compiled.cleanup();
  }
});

test("getPlanTopicDisplay does not show raw hotspot copy before model planning", async () => {
  const compiled = await compileModule();
  try {
    const { getPlanTopicDisplay } = await import(pathToFileURL(compiled.modulePath));
    const display = getPlanTopicDisplay(
      null,
      {
        id: "hotspot-1",
        title: "RSS 原始标题",
        summary: "RSS 原始摘要",
        category: "developer",
        status: "new",
        sourceCount: 1,
        sources: [],
        matchedSignals: [],
        createdAt: "2026-07-01T00:00:00.000Z"
      },
      "等待模型提炼主题",
      "生成圆桌议程后显示模型总结。"
    );

    assert.equal(display.title, "等待模型提炼主题");
    assert.equal(display.summary, "生成圆桌议程后显示模型总结。");
  } finally {
    await compiled.cleanup();
  }
});

test("getPlanTopicDisplay waits for model topic metadata on multi-article plans", async () => {
  const compiled = await compileModule();
  try {
    const { getPlanTopicDisplay } = await import(pathToFileURL(compiled.modulePath));
    const display = getPlanTopicDisplay(
      {
        id: "plan-1",
        hotspotId: "merged-1",
        objective: "模型规划目标",
        audiencePromise: "模型规划摘要",
        guests: [],
        agenda: [],
        tensionPoints: [],
        speakingOrder: [],
        sourceRisks: []
      },
      {
        id: "merged-1",
        title: "多源圆桌：RSS 标题 A / RSS 标题 B",
        summary: "RSS 摘要 A\n\nRSS 摘要 B",
        category: "developer",
        status: "shortlisted",
        sourceCount: 2,
        sources: [{ id: "a", title: "A", url: "https://example.com/a", publisher: "A" }],
        matchedSignals: [],
        createdAt: "2026-07-01T00:00:00.000Z"
      },
      "等待模型提炼主题",
      "生成圆桌议程后显示模型总结。"
    );

    assert.equal(display.title, "等待模型提炼主题");
    assert.equal(display.summary, "生成圆桌议程后显示模型总结。");
  } finally {
    await compiled.cleanup();
  }
});

test("getPlanTopicDisplay keeps model-generated summary under 300 characters", async () => {
  const compiled = await compileModule();
  try {
    const { getPlanTopicDisplay } = await import(pathToFileURL(compiled.modulePath));
    const longSummary = "这是一段模型生成的摘要。".repeat(40);
    const display = getPlanTopicDisplay(
      {
        id: "plan-1",
        hotspotId: "hotspot-1",
        topicTitle: "模型主题",
        topicSummary: longSummary,
        objective: "模型规划目标",
        audiencePromise: "模型规划摘要",
        guests: [],
        agenda: [],
        tensionPoints: [],
        speakingOrder: [],
        sourceRisks: []
      },
      {
        id: "hotspot-1",
        title: "RSS 标题",
        summary: "RSS 摘要",
        category: "developer",
        status: "new",
        sourceCount: 1,
        sources: [],
        matchedSignals: [],
        createdAt: "2026-07-01T00:00:00.000Z"
      }
    );

    assert.ok(display.summary.length <= 300);
  } finally {
    await compiled.cleanup();
  }
});
