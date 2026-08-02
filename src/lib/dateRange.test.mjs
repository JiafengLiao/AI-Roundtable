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
const outputDir = join(tmpdir(), `ai-roundtable-date-range-tests-${Date.now()}`);
const tscScript = join(projectRoot, "node_modules", "typescript", "bin", "tsc");

execFileSync(
  process.execPath,
  [
    tscScript,
    join(projectRoot, "src", "lib", "dateRange.ts"),
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

const { normalizeDateRange } = await import(pathToFileURL(join(outputDir, "dateRange.js")));

test("keeps the end date within 30 days when the start date changes", () => {
  assert.deepEqual(
    normalizeDateRange({ startDate: "2026-06-01", endDate: "2026-07-15" }, "startDate"),
    { startDate: "2026-06-01", endDate: "2026-07-01" }
  );
});

test("keeps the start date within 30 days when the end date changes", () => {
  assert.deepEqual(
    normalizeDateRange({ startDate: "2026-06-01", endDate: "2026-07-15" }, "endDate"),
    { startDate: "2026-06-15", endDate: "2026-07-15" }
  );
});

test("corrects inverted ranges based on the date the user changed", () => {
  assert.deepEqual(
    normalizeDateRange({ startDate: "2026-06-20", endDate: "2026-06-10" }, "startDate"),
    { startDate: "2026-06-20", endDate: "2026-06-20" }
  );
  assert.deepEqual(
    normalizeDateRange({ startDate: "2026-06-20", endDate: "2026-06-10" }, "endDate"),
    { startDate: "2026-06-10", endDate: "2026-06-10" }
  );
});
