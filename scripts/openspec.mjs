#!/usr/bin/env node
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const ARTIFACTS = [
  {
    id: "proposal",
    file: "proposal.md",
    dependencies: [],
    template: "# <change-name>\n\n## Why\n\n## What\n\n## Impact\n",
    instruction: "Write the change proposal: why it is needed, what changes, and the expected impact."
  },
  {
    id: "design",
    file: "design.md",
    dependencies: ["proposal"],
    template: "# Design\n\n## Overview\n\n## Decisions\n\n## Verification\n",
    instruction: "Write the implementation design, key decisions, compatibility notes, and verification approach."
  },
  {
    id: "tasks",
    file: "tasks.md",
    dependencies: ["proposal", "design"],
    template: "# Tasks\n\n- [ ] Review existing behavior.\n- [ ] Implement the change.\n- [ ] Verify the behavior.\n",
    instruction: "Write an implementation checklist with concrete, verifiable tasks."
  }
];

function usage() {
  return [
    "Usage:",
    "  openspec new change <name>",
    "  openspec status --change <name> [--json]",
    "  openspec instructions <artifact-id> --change <name> --json"
  ].join("\n");
}

function parseFlag(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function planningHome(cwd) {
  return resolve(cwd, ".openspec");
}

function changeRoot(cwd, change) {
  return join(planningHome(cwd), "changes", change);
}

async function ensureChangeScaffold(cwd, change) {
  const root = changeRoot(cwd, change);
  await mkdir(root, { recursive: true });
  for (const artifact of ARTIFACTS) {
    const path = join(root, artifact.file);
    if (!(await exists(path))) {
      await writeFile(path, artifact.template.replace("<change-name>", change), "utf8");
    }
  }
  return root;
}

async function artifactStatus(root, artifact) {
  const path = join(root, artifact.file);
  const content = await readOptional(path);
  const done = content.trim().length > 0 && content !== artifact.template;
  return {
    id: artifact.id,
    path,
    status: done ? "done" : "pending",
    dependencies: artifact.dependencies
  };
}

async function status(cwd, change, json) {
  if (!change) throw new Error("Missing --change <name>");
  const root = changeRoot(cwd, change);
  const artifactPaths = Object.fromEntries(ARTIFACTS.map((artifact) => [artifact.id, join(root, artifact.file)]));
  const artifacts = await Promise.all(ARTIFACTS.map((artifact) => artifactStatus(root, artifact)));
  const payload = {
    change,
    planningHome: planningHome(cwd),
    changeRoot: root,
    artifactPaths,
    applyRequires: ["tasks"],
    artifacts,
    actionContext: {
      cwd,
      localShim: true
    }
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`Change: ${change}\n`);
  for (const artifact of artifacts) {
    process.stdout.write(`- ${artifact.id}: ${artifact.status}\n`);
  }
}

async function instructions(cwd, artifactId, change, json) {
  if (!change) throw new Error("Missing --change <name>");
  const artifact = ARTIFACTS.find((item) => item.id === artifactId);
  if (!artifact) throw new Error(`Unknown artifact: ${artifactId}`);

  const root = changeRoot(cwd, change);
  const dependencies = {};
  for (const dependencyId of artifact.dependencies) {
    const dependency = ARTIFACTS.find((item) => item.id === dependencyId);
    if (dependency) {
      dependencies[dependencyId] = await readOptional(join(root, dependency.file));
    }
  }

  const payload = {
    artifactId,
    context: "AI Roundtable is a local-first Tauri, React, TypeScript workbench.",
    rules: [
      "Keep changes small and local-first.",
      "Do not alter backend commands or storage formats unless required."
    ],
    template: artifact.template.replace("<change-name>", change),
    instruction: artifact.instruction,
    resolvedOutputPath: join(root, artifact.file),
    dependencies
  };

  if (json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${payload.instruction}\n\n${payload.template}`);
}

async function main() {
  const args = process.argv.slice(2);
  const [command, subcommandOrArtifact, maybeName] = args;
  const cwd = process.cwd();

  if (command === "new" && subcommandOrArtifact === "change" && maybeName) {
    const root = await ensureChangeScaffold(cwd, maybeName);
    process.stdout.write(`Created change ${maybeName} at ${root}\n`);
    return;
  }

  if (command === "status") {
    await status(cwd, parseFlag(args, "--change"), args.includes("--json"));
    return;
  }

  if (command === "instructions" && subcommandOrArtifact) {
    await instructions(cwd, subcommandOrArtifact, parseFlag(args, "--change"), args.includes("--json"));
    return;
  }

  throw new Error(usage());
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
