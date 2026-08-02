import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const appSource = readFileSync(join("src", "App.tsx"), "utf8");

test("hotspot library empty state does not render placeholder RSS articles", () => {
  assert.equal(appSource.includes("const fallbackTopics"), false);
  assert.equal(appSource.includes("return [];"), true);
  assert.equal(appSource.includes("还没有抓取 RSS"), true);
});
