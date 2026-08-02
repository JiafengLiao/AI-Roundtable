import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

async function compileModule() {
  const outputDir = await mkdtemp(join(tmpdir(), "ai-roundtable-selection-tests-"));
  const result = spawnSync(
    "node",
    [
      "node_modules/typescript/bin/tsc",
      "src/lib/workflowSelection.ts",
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
    modulePath: join(outputDir, "lib", "workflowSelection.js")
  };
}

function hotspot(id, title, sourceId = id) {
  return {
    id,
    title,
    summary: `${title} summary`,
    category: "developer",
    score: 80,
    status: "new",
    sourceCount: 1,
    sources: [
      {
        id: sourceId,
        title,
        url: `https://example.com/${sourceId}`,
        publisher: "Example",
        publishedAt: "2026-06-25"
      }
    ],
    matchedSignals: [],
    createdAt: "2026-06-25T00:00:00.000Z"
  };
}

test("RSS fetch completion focuses the first visible hotspot without selecting it for generation", async () => {
  const compiled = await compileModule();
  try {
    const { getPostFetchSelectionState } = await import(pathToFileURL(compiled.modulePath));
    const first = hotspot("first", "First");
    const second = hotspot("second", "Second");

    const state = getPostFetchSelectionState([first, second], [second]);

    assert.equal(state.focusedHotspot?.id, "second");
    assert.deepEqual(state.selectedHotspotIds, []);
  } finally {
    await compiled.cleanup();
  }
});

test("category generation selects every article in the category", async () => {
  const compiled = await compileModule();
  try {
    const { getCategoryGenerationSelection } = await import(pathToFileURL(compiled.modulePath));
    const first = hotspot("first", "First");
    const second = hotspot("second", "Second");

    const state = getCategoryGenerationSelection([
      { title: "First", summary: "", source: "", date: "", selected: false, hotspot: first },
      { title: "Second", summary: "", source: "", date: "", selected: false, hotspot: second }
    ]);

    assert.equal(state.focusedHotspot?.id, "first");
    assert.deepEqual(state.selectedHotspotIds, ["first", "second"]);
  } finally {
    await compiled.cleanup();
  }
});

test("category generation ignores duplicate article ids but keeps ordering", async () => {
  const compiled = await compileModule();
  try {
    const { getCategoryGenerationSelection } = await import(pathToFileURL(compiled.modulePath));
    const first = hotspot("first", "First");
    const duplicate = hotspot("first", "First duplicate", "first-alt");
    const second = hotspot("second", "Second");

    const state = getCategoryGenerationSelection([
      { title: "First", summary: "", source: "", date: "", selected: false, hotspot: first },
      { title: "First duplicate", summary: "", source: "", date: "", selected: false, hotspot: duplicate },
      { title: "Second", summary: "", source: "", date: "", selected: false, hotspot: second }
    ]);

    assert.deepEqual(state.selectedHotspotIds, ["first", "second"]);
  } finally {
    await compiled.cleanup();
  }
});
