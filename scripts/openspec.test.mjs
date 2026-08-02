import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const cliPath = resolve("scripts/openspec.mjs");

function runCli(cwd, args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8"
  });
}

test("openspec shim creates a change and reports JSON status", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ai-roundtable-openspec-"));

  const created = runCli(workspace, ["new", "change", "sample-change"]);
  assert.equal(created.status, 0, created.stderr);

  const proposal = join(workspace, ".openspec", "changes", "sample-change", "proposal.md");
  await writeFile(proposal, "# sample-change\n");

  const status = runCli(workspace, ["status", "--change", "sample-change", "--json"]);
  assert.equal(status.status, 0, status.stderr);

  const payload = JSON.parse(status.stdout);
  assert.equal(payload.change, "sample-change");
  assert.deepEqual(payload.applyRequires, ["tasks"]);
  assert.equal(payload.artifacts.find((artifact) => artifact.id === "proposal").status, "done");
  assert.equal(payload.artifacts.find((artifact) => artifact.id === "design").status, "pending");
  assert.equal(payload.artifacts.find((artifact) => artifact.id === "tasks").status, "pending");
});

test("openspec shim returns artifact instructions with resolved output path", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "ai-roundtable-openspec-"));
  await mkdir(join(workspace, ".openspec", "changes", "sample-change"), { recursive: true });

  const result = runCli(workspace, ["instructions", "tasks", "--change", "sample-change", "--json"]);
  assert.equal(result.status, 0, result.stderr);

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.artifactId, "tasks");
  assert.equal(payload.resolvedOutputPath.endsWith(join(".openspec", "changes", "sample-change", "tasks.md")), true);
  assert.match(payload.template, /# Tasks/);
  assert.match(payload.instruction, /implementation checklist/i);
});
