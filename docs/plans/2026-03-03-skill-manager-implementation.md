# Skill Manager Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Next.js web dashboard that visualizes and manages 110+ Claude Code skills with tagging, grouping, dependency graphs, and pipeline orchestration.

**Architecture:** Next.js 14 full-stack app. Scanner engine reads `~/.claude/skills/`, `plugins/`, and `CLAUDE.md` (all read-only). Metadata stored in project-local `data/skills-registry.json`. chokidar File Watcher + SSE for real-time updates. React Flow for dependency graph visualization.

**Tech Stack:** Next.js 14 (App Router), TypeScript, shadcn/ui, Tailwind CSS, React Flow, Recharts, chokidar, pnpm

**Design Doc:** `docs/plans/2026-03-03-skill-manager-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`

**Step 1: Initialize Next.js project**

Run:
```bash
cd /Users/qihang/opensource/skill-manager
pnpm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-pnpm
```

Expected: Project scaffolded with App Router structure.

**Step 2: Install core dependencies**

Run:
```bash
cd /Users/qihang/opensource/skill-manager
pnpm add @xyflow/react recharts chokidar
pnpm add -D @types/node
```

**Step 3: Initialize shadcn/ui**

Run:
```bash
cd /Users/qihang/opensource/skill-manager
pnpm dlx shadcn@latest init -d
```

**Step 4: Add shadcn components we'll need**

Run:
```bash
cd /Users/qihang/opensource/skill-manager
pnpm dlx shadcn@latest add badge button card dialog input select separator sheet tabs textarea
```

**Step 5: Create data directory and empty registry**

Create `data/skills-registry.json`:
```json
{
  "skills": {},
  "pipelines": {},
  "meta": {
    "lastScan": null,
    "totalSkills": 0,
    "version": 1
  }
}
```

**Step 6: Add data/ to .gitignore exception**

Ensure `data/skills-registry.json` is tracked but not the scanned cache. Add to `.gitignore`:
```
# Keep registry structure, ignore temp files
data/*.tmp
```

**Step 7: Verify dev server starts**

Run:
```bash
cd /Users/qihang/opensource/skill-manager && pnpm dev
```
Expected: localhost:3000 shows Next.js default page.

**Step 8: Git init and first commit**

Run:
```bash
cd /Users/qihang/opensource/skill-manager
git init
git add .
git commit -m "chore: scaffold Next.js project with shadcn/ui and dependencies"
```

---

## Task 2: Type Definitions

**Files:**
- Create: `src/lib/types.ts`

**Step 1: Define all TypeScript interfaces**

Create `src/lib/types.ts`:
```typescript
export type SkillSource = "self-built" | "baoyu" | "plugin-official" | "plugin-community";
export type Frequency = "daily" | "weekly" | "occasional" | "rare";

export interface ClaudeMdRef {
  table: string;
  trigger: string;
}

export interface SkillTags {
  domain: string[];
  frequency: Frequency | null;
  pipeline: string | null;
}

export interface SkillEntry {
  name: string;
  path: string;
  source: SkillSource;
  description: string;
  lineCount: number;
  lastModified: string;
  claudeMdRefs: ClaudeMdRef[];
  tags: SkillTags;
  dependencies: string[];
  notes: string;
}

export interface PipelineStep {
  skill: string;
  role: string;
}

export interface Pipeline {
  description: string;
  steps: PipelineStep[];
}

export interface RegistryMeta {
  lastScan: string | null;
  totalSkills: number;
  version: number;
}

export interface SkillsRegistry {
  skills: Record<string, SkillEntry>;
  pipelines: Record<string, Pipeline>;
  meta: RegistryMeta;
}

export interface DashboardStats {
  totalSkills: number;
  routedSkills: number;
  orphanSkills: number;
  totalPipelines: number;
  domainDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  recentChanges: Array<{ name: string; lastModified: string }>;
}
```

**Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add TypeScript type definitions for skill registry"
```

---

## Task 3: Scanner Engine

**Files:**
- Create: `src/lib/scanner.ts`
- Test: `src/lib/__tests__/scanner.test.ts`

**Step 1: Install test dependencies**

Run:
```bash
cd /Users/qihang/opensource/skill-manager
pnpm add -D vitest @testing-library/react @testing-library/jest-dom
```

Add to `package.json` scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**Step 2: Write failing test for scanSkillsDirectory**

Create `src/lib/__tests__/scanner.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { scanSkillsDirectory, detectSource, parseSkillMd } from "../scanner";

describe("parseSkillMd", () => {
  it("extracts description from SKILL.md content", () => {
    const content = `name: article-workflow
description: 全局写作工作流编排器。从任何项目、任何上下文一键启动完整写作流程。
---
Some body content here`;

    const result = parseSkillMd(content);
    expect(result.description).toContain("全局写作工作流编排器");
  });

  it("handles SKILL.md without frontmatter", () => {
    const content = `# My Skill\n\nThis skill does something useful.\nMore details here.`;
    const result = parseSkillMd(content);
    expect(result.description).toBe("# My Skill\nThis skill does something useful.\nMore details here.");
  });
});

describe("detectSource", () => {
  it("detects baoyu skills", () => {
    expect(detectSource("baoyu-image-gen", "/Users/qihang/.claude/skills/baoyu-image-gen")).toBe("baoyu");
  });

  it("detects self-built skills", () => {
    expect(detectSource("article-workflow", "/Users/qihang/.claude/skills/article-workflow")).toBe("self-built");
  });

  it("detects official plugins", () => {
    expect(detectSource("code-review", "/Users/qihang/.claude/plugins/cache/claude-plugins-official/code-review")).toBe("plugin-official");
  });

  it("detects community plugins", () => {
    expect(detectSource("brainstorming", "/Users/qihang/.claude/plugins/cache/superpowers-marketplace/superpowers")).toBe("plugin-community");
  });
});
```

**Step 3: Run test to verify it fails**

Run: `cd /Users/qihang/opensource/skill-manager && pnpm test`
Expected: FAIL — modules not found.

**Step 4: Implement scanner.ts**

Create `src/lib/scanner.ts`:
```typescript
import fs from "fs";
import path from "path";
import type { SkillEntry, SkillSource, SkillsRegistry } from "./types";

const SKILLS_DIR = path.join(process.env.HOME || "~", ".claude/skills");
const PLUGINS_DIR = path.join(process.env.HOME || "~", ".claude/plugins/cache");
const CLAUDE_MD = path.join(process.env.HOME || "~", ".claude/CLAUDE.md");

export function parseSkillMd(content: string): { description: string } {
  const lines = content.split("\n").filter((l) => l.trim() !== "");

  // Check for frontmatter (---) block
  if (lines[0]?.trim() === "---" || content.startsWith("name:")) {
    // YAML-like frontmatter: extract description field
    const descMatch = content.match(/description:\s*(.+)/);
    if (descMatch) {
      return { description: descMatch[1].trim() };
    }
  }

  // No frontmatter: take first 3 non-empty lines
  const desc = lines.slice(0, 3).join("\n");
  return { description: desc };
}

export function detectSource(name: string, filePath: string): SkillSource {
  if (name.startsWith("baoyu-")) return "baoyu";
  if (filePath.includes("claude-plugins-official")) return "plugin-official";
  if (filePath.includes("superpowers-marketplace")) return "plugin-community";
  return "self-built";
}

function scanSingleSkill(skillDir: string, name: string): SkillEntry | null {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) return null;

  const content = fs.readFileSync(skillMdPath, "utf-8");
  const stat = fs.statSync(skillMdPath);
  const lineCount = content.split("\n").length;
  const { description } = parseSkillMd(content);

  return {
    name,
    path: skillMdPath,
    source: detectSource(name, skillDir),
    description,
    lineCount,
    lastModified: stat.mtime.toISOString(),
    claudeMdRefs: [],
    tags: { domain: [], frequency: null, pipeline: null },
    dependencies: [],
    notes: "",
  };
}

export function scanSkillsDirectory(): Record<string, SkillEntry> {
  const skills: Record<string, SkillEntry> = {};

  // Scan ~/.claude/skills/
  if (fs.existsSync(SKILLS_DIR)) {
    const entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "_archived") continue;
      if (entry.name.startsWith(".")) continue;

      const skill = scanSingleSkill(path.join(SKILLS_DIR, entry.name), entry.name);
      if (skill) skills[skill.name] = skill;
    }
  }

  // Scan plugins
  if (fs.existsSync(PLUGINS_DIR)) {
    scanPluginsRecursive(PLUGINS_DIR, skills);
  }

  return skills;
}

function scanPluginsRecursive(dir: string, skills: Record<string, SkillEntry>) {
  if (!fs.existsSync(dir)) return;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.join(dir, entry.name);

    // Check if this directory has a SKILL.md
    const skillMdPath = path.join(fullPath, "SKILL.md");
    if (fs.existsSync(skillMdPath)) {
      const skill = scanSingleSkill(fullPath, entry.name);
      if (skill) skills[skill.name] = skill;
    }

    // Check for skills/ subdirectory (plugin structure)
    const skillsSubdir = path.join(fullPath, "skills");
    if (fs.existsSync(skillsSubdir)) {
      scanPluginsRecursive(skillsSubdir, skills);
    }

    // Recurse into version directories (e.g., 4.3.0/)
    if (/^\d+\.\d+/.test(entry.name)) {
      scanPluginsRecursive(fullPath, skills);
    }
  }
}

export function scanAll(existingRegistry?: SkillsRegistry): SkillsRegistry {
  const scannedSkills = scanSkillsDirectory();
  const claudeMdRefs = fs.existsSync(CLAUDE_MD) ? parseClaudeMdRefs(fs.readFileSync(CLAUDE_MD, "utf-8")) : {};

  // Merge: keep manual tags from existing, update auto-scanned fields
  const skills: Record<string, SkillEntry> = {};

  for (const [name, scanned] of Object.entries(scannedSkills)) {
    const existing = existingRegistry?.skills[name];
    skills[name] = {
      ...scanned,
      claudeMdRefs: claudeMdRefs[name] || [],
      // Preserve manual annotations if they exist
      tags: existing?.tags || scanned.tags,
      dependencies: existing?.dependencies || scanned.dependencies,
      notes: existing?.notes || scanned.notes,
    };
  }

  return {
    skills,
    pipelines: existingRegistry?.pipelines || {},
    meta: {
      lastScan: new Date().toISOString(),
      totalSkills: Object.keys(skills).length,
      version: 1,
    },
  };
}

// Stub — implemented in Task 4
function parseClaudeMdRefs(content: string): Record<string, Array<{ table: string; trigger: string }>> {
  // Delegated to claude-md-parser.ts
  const { parseClaudeMd } = require("./claude-md-parser");
  return parseClaudeMd(content);
}
```

**Step 5: Run tests to verify they pass**

Run: `cd /Users/qihang/opensource/skill-manager && pnpm test`
Expected: All scanner tests PASS.

**Step 6: Commit**

```bash
git add src/lib/scanner.ts src/lib/__tests__/scanner.test.ts vitest.config.ts
git commit -m "feat: implement scanner engine for skills directory"
```

---

## Task 4: CLAUDE.md Parser

**Files:**
- Create: `src/lib/claude-md-parser.ts`
- Test: `src/lib/__tests__/claude-md-parser.test.ts`

**Step 1: Write failing test**

Create `src/lib/__tests__/claude-md-parser.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { parseClaudeMd } from "../claude-md-parser";

const SAMPLE_TABLE = `
## 🧭 Obsidian Skill 路由表

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **写笔记/沉淀** | \`obsidian-note-writer-沉淀系统\` | 沉淀、记笔记 |
| **查笔记/搜索** | \`obsidian-note-finder-知识导航\` | 记在哪里、放哪个仓库 |

## ✍️ 写作工作流 Skill 路由

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **写文章** | \`article-workflow\` | /write、写文章 |
`;

describe("parseClaudeMd", () => {
  it("extracts skill references from routing tables", () => {
    const refs = parseClaudeMd(SAMPLE_TABLE);

    expect(refs["obsidian-note-writer-沉淀系统"]).toBeDefined();
    expect(refs["obsidian-note-writer-沉淀系统"][0].table).toBe("Obsidian Skill 路由表");
    expect(refs["obsidian-note-writer-沉淀系统"][0].trigger).toContain("沉淀");

    expect(refs["article-workflow"]).toBeDefined();
    expect(refs["article-workflow"][0].table).toBe("写作工作流 Skill 路由");
  });

  it("returns empty for skills not in routing tables", () => {
    const refs = parseClaudeMd(SAMPLE_TABLE);
    expect(refs["some-unknown-skill"]).toBeUndefined();
  });
});
```

**Step 2: Run test — should fail**

Run: `cd /Users/qihang/opensource/skill-manager && pnpm test`

**Step 3: Implement parser**

Create `src/lib/claude-md-parser.ts`:
```typescript
import type { ClaudeMdRef } from "./types";

export function parseClaudeMd(content: string): Record<string, ClaudeMdRef[]> {
  const refs: Record<string, ClaudeMdRef[]> = {};
  const lines = content.split("\n");

  let currentTableName = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect section headers (## 🧭 Obsidian Skill 路由表)
    const headerMatch = line.match(/^##\s+.?\s*(.+路由.*)/);
    if (headerMatch) {
      currentTableName = headerMatch[1].replace(/（.*?）/, "").trim();
      continue;
    }

    // Also match simpler headers
    const simpleHeaderMatch = line.match(/^##\s+.?\s*(.+Skill.+)/);
    if (simpleHeaderMatch && !currentTableName) {
      currentTableName = simpleHeaderMatch[1].trim();
      continue;
    }

    // Detect table rows with skill references (backtick-wrapped skill names)
    const skillMatch = line.match(/\|\s*\*\*.*?\*\*\s*\|\s*`([^`]+)`\s*\|\s*(.+)\s*\|/);
    if (skillMatch && currentTableName) {
      const skillName = skillMatch[1];
      const trigger = skillMatch[2].trim();

      if (!refs[skillName]) refs[skillName] = [];
      refs[skillName].push({
        table: currentTableName,
        trigger,
      });
    }

    // Reset table context on empty line or new non-table section
    if (line.trim() === "" && i > 0 && !lines[i - 1]?.includes("|")) {
      // Keep currentTableName through table gaps
    }
    if (line.startsWith("## ") && !line.includes("路由") && !line.includes("Skill")) {
      currentTableName = "";
    }
  }

  return refs;
}
```

**Step 4: Run tests — should pass**

Run: `cd /Users/qihang/opensource/skill-manager && pnpm test`

**Step 5: Commit**

```bash
git add src/lib/claude-md-parser.ts src/lib/__tests__/claude-md-parser.test.ts
git commit -m "feat: implement CLAUDE.md routing table parser"
```

---

## Task 5: Registry Read/Write

**Files:**
- Create: `src/lib/registry.ts`

**Step 1: Implement registry module**

Create `src/lib/registry.ts`:
```typescript
import fs from "fs";
import path from "path";
import type { SkillsRegistry, SkillEntry, Pipeline } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const REGISTRY_PATH = path.join(DATA_DIR, "skills-registry.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function readRegistry(): SkillsRegistry {
  ensureDataDir();
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { skills: {}, pipelines: {}, meta: { lastScan: null, totalSkills: 0, version: 1 } };
  }
  const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
  return JSON.parse(raw) as SkillsRegistry;
}

export function writeRegistry(registry: SkillsRegistry): void {
  ensureDataDir();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), "utf-8");
}

export function updateSkillTags(name: string, tags: Partial<SkillEntry["tags"]>): SkillsRegistry {
  const registry = readRegistry();
  const skill = registry.skills[name];
  if (!skill) throw new Error(`Skill "${name}" not found`);

  skill.tags = { ...skill.tags, ...tags };
  writeRegistry(registry);
  return registry;
}

export function updateSkillDeps(name: string, dependencies: string[]): SkillsRegistry {
  const registry = readRegistry();
  const skill = registry.skills[name];
  if (!skill) throw new Error(`Skill "${name}" not found`);

  skill.dependencies = dependencies;
  writeRegistry(registry);
  return registry;
}

export function updateSkillNotes(name: string, notes: string): SkillsRegistry {
  const registry = readRegistry();
  const skill = registry.skills[name];
  if (!skill) throw new Error(`Skill "${name}" not found`);

  skill.notes = notes;
  writeRegistry(registry);
  return registry;
}

export function upsertPipeline(id: string, pipeline: Pipeline): SkillsRegistry {
  const registry = readRegistry();
  registry.pipelines[id] = pipeline;
  writeRegistry(registry);
  return registry;
}

export function deletePipeline(id: string): SkillsRegistry {
  const registry = readRegistry();
  delete registry.pipelines[id];
  writeRegistry(registry);
  return registry;
}
```

**Step 2: Commit**

```bash
git add src/lib/registry.ts
git commit -m "feat: implement registry read/write with tag/dep/pipeline CRUD"
```

---

## Task 6: File Watcher + SSE

**Files:**
- Create: `src/lib/watcher.ts`
- Create: `src/app/api/events/route.ts`
- Create: `src/app/api/scan/route.ts`

**Step 1: Implement watcher**

Create `src/lib/watcher.ts`:
```typescript
import chokidar from "chokidar";
import path from "path";
import { scanAll } from "./scanner";
import { readRegistry, writeRegistry } from "./registry";

const SKILLS_DIR = path.join(process.env.HOME || "~", ".claude/skills");
const PLUGINS_DIR = path.join(process.env.HOME || "~", ".claude/plugins");
const CLAUDE_MD = path.join(process.env.HOME || "~", ".claude/CLAUDE.md");

type ChangeListener = (event: { type: string; path: string; timestamp: string }) => void;

let watcher: chokidar.FSWatcher | null = null;
const listeners = new Set<ChangeListener>();

export function addChangeListener(listener: ChangeListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyListeners(type: string, filePath: string) {
  const event = { type, path: filePath, timestamp: new Date().toISOString() };
  for (const listener of listeners) {
    listener(event);
  }
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedRescan(eventType: string, filePath: string) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const existing = readRegistry();
    const updated = scanAll(existing);
    writeRegistry(updated);
    notifyListeners(eventType, filePath);
  }, 500);
}

export function startWatcher() {
  if (watcher) return;

  watcher = chokidar.watch(
    [SKILLS_DIR, PLUGINS_DIR, CLAUDE_MD],
    {
      ignoreInitial: true,
      depth: 4,
      ignored: ["**/node_modules/**", "**/_archived/**"],
    }
  );

  watcher
    .on("add", (p) => debouncedRescan("add", p))
    .on("change", (p) => debouncedRescan("change", p))
    .on("unlink", (p) => debouncedRescan("unlink", p));

  console.log("[Watcher] Monitoring skills directory for changes...");
}

export function stopWatcher() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}
```

**Step 2: Implement SSE endpoint**

Create `src/app/api/events/route.ts`:
```typescript
import { addChangeListener } from "@/lib/watcher";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send heartbeat every 30s
      const heartbeat = setInterval(() => {
        send({ type: "heartbeat", timestamp: new Date().toISOString() });
      }, 30000);

      const removeListener = addChangeListener((event) => {
        send(event);
      });

      // Initial ping
      send({ type: "connected", timestamp: new Date().toISOString() });

      // Cleanup on close (handled by AbortController in practice)
      const cleanup = () => {
        clearInterval(heartbeat);
        removeListener();
      };

      // Store cleanup for potential abort
      (controller as unknown as Record<string, unknown>)._cleanup = cleanup;
    },
    cancel() {
      // Stream was cancelled by client
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

**Step 3: Implement manual scan endpoint**

Create `src/app/api/scan/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { scanAll } from "@/lib/scanner";
import { readRegistry, writeRegistry } from "@/lib/registry";

export async function POST() {
  const existing = readRegistry();
  const updated = scanAll(existing);
  writeRegistry(updated);

  return NextResponse.json({
    success: true,
    totalSkills: updated.meta.totalSkills,
    lastScan: updated.meta.lastScan,
  });
}
```

**Step 4: Initialize watcher on server start**

Create `src/lib/init-server.ts`:
```typescript
import { startWatcher } from "./watcher";
import { scanAll } from "./scanner";
import { readRegistry, writeRegistry } from "./registry";

let initialized = false;

export function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  // Initial scan
  const existing = readRegistry();
  const updated = scanAll(existing);
  writeRegistry(updated);

  // Start file watcher
  startWatcher();

  console.log(`[Init] Scanned ${updated.meta.totalSkills} skills`);
}
```

**Step 5: Commit**

```bash
git add src/lib/watcher.ts src/lib/init-server.ts src/app/api/events/route.ts src/app/api/scan/route.ts
git commit -m "feat: implement file watcher with SSE real-time push"
```

---

## Task 7: API Routes (CRUD)

**Files:**
- Create: `src/app/api/skills/route.ts`
- Create: `src/app/api/skills/[name]/route.ts`
- Create: `src/app/api/skills/[name]/tags/route.ts`
- Create: `src/app/api/skills/[name]/deps/route.ts`
- Create: `src/app/api/skills/[name]/notes/route.ts`
- Create: `src/app/api/pipelines/route.ts`
- Create: `src/app/api/pipelines/[id]/route.ts`
- Create: `src/app/api/stats/route.ts`

**Step 1: Skills list + detail endpoints**

Create `src/app/api/skills/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { readRegistry } from "@/lib/registry";
import { ensureInitialized } from "@/lib/init-server";

export async function GET(request: NextRequest) {
  ensureInitialized();
  const registry = readRegistry();
  const params = request.nextUrl.searchParams;

  let skills = Object.values(registry.skills);

  // Filter by domain tag
  const domain = params.get("domain");
  if (domain) {
    skills = skills.filter((s) => s.tags.domain.includes(domain));
  }

  // Filter by source
  const source = params.get("source");
  if (source) {
    skills = skills.filter((s) => s.source === source);
  }

  // Filter by frequency
  const frequency = params.get("frequency");
  if (frequency) {
    skills = skills.filter((s) => s.tags.frequency === frequency);
  }

  // Filter by pipeline
  const pipeline = params.get("pipeline");
  if (pipeline) {
    skills = skills.filter((s) => s.tags.pipeline === pipeline);
  }

  // Search by name or description
  const q = params.get("q");
  if (q) {
    const lower = q.toLowerCase();
    skills = skills.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower)
    );
  }

  // Sort by lastModified desc
  skills.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());

  return NextResponse.json(skills);
}
```

Create `src/app/api/skills/[name]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { readRegistry } from "@/lib/registry";
import { ensureInitialized } from "@/lib/init-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  ensureInitialized();
  const { name } = await params;
  const registry = readRegistry();
  const skill = registry.skills[name];

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json(skill);
}
```

**Step 2: Tags, deps, notes endpoints**

Create `src/app/api/skills/[name]/tags/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateSkillTags } from "@/lib/registry";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const body = await req.json();
  const registry = updateSkillTags(name, body);
  return NextResponse.json(registry.skills[name]);
}
```

Create `src/app/api/skills/[name]/deps/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateSkillDeps } from "@/lib/registry";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { dependencies } = await req.json();
  const registry = updateSkillDeps(name, dependencies);
  return NextResponse.json(registry.skills[name]);
}
```

Create `src/app/api/skills/[name]/notes/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { updateSkillNotes } from "@/lib/registry";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { notes } = await req.json();
  const registry = updateSkillNotes(name, notes);
  return NextResponse.json(registry.skills[name]);
}
```

**Step 3: Pipelines endpoints**

Create `src/app/api/pipelines/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { readRegistry, upsertPipeline } from "@/lib/registry";
import { ensureInitialized } from "@/lib/init-server";

export async function GET() {
  ensureInitialized();
  const registry = readRegistry();
  return NextResponse.json(registry.pipelines);
}

export async function POST(req: NextRequest) {
  const { id, ...pipeline } = await req.json();
  const registry = upsertPipeline(id, pipeline);
  return NextResponse.json(registry.pipelines[id]);
}
```

Create `src/app/api/pipelines/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { upsertPipeline, deletePipeline } from "@/lib/registry";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pipeline = await req.json();
  const registry = upsertPipeline(id, pipeline);
  return NextResponse.json(registry.pipelines[id]);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deletePipeline(id);
  return NextResponse.json({ success: true });
}
```

**Step 4: Stats endpoint**

Create `src/app/api/stats/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { readRegistry } from "@/lib/registry";
import { ensureInitialized } from "@/lib/init-server";
import type { DashboardStats } from "@/lib/types";

export async function GET() {
  ensureInitialized();
  const registry = readRegistry();
  const skills = Object.values(registry.skills);

  const domainDistribution: Record<string, number> = {};
  const sourceDistribution: Record<string, number> = {};
  let orphanCount = 0;

  for (const skill of skills) {
    // Domain
    if (skill.tags.domain.length === 0) {
      domainDistribution["未分类"] = (domainDistribution["未分类"] || 0) + 1;
    } else {
      for (const d of skill.tags.domain) {
        domainDistribution[d] = (domainDistribution[d] || 0) + 1;
      }
    }

    // Source
    sourceDistribution[skill.source] = (sourceDistribution[skill.source] || 0) + 1;

    // Orphan (no CLAUDE.md refs and no dependencies)
    if (skill.claudeMdRefs.length === 0 && skill.dependencies.length === 0) {
      orphanCount++;
    }
  }

  const stats: DashboardStats = {
    totalSkills: skills.length,
    routedSkills: skills.filter((s) => s.claudeMdRefs.length > 0).length,
    orphanSkills: orphanCount,
    totalPipelines: Object.keys(registry.pipelines).length,
    domainDistribution,
    sourceDistribution,
    recentChanges: skills
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 10)
      .map((s) => ({ name: s.name, lastModified: s.lastModified })),
  };

  return NextResponse.json(stats);
}
```

**Step 5: Commit**

```bash
git add src/app/api/
git commit -m "feat: implement all API routes for skills, pipelines, and stats"
```

---

## Task 8: Dashboard Page

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/components/nav.tsx`
- Create: `src/components/stats-cards.tsx`
- Create: `src/hooks/use-sse.ts`

**Step 1: Create SSE hook for real-time updates**

Create `src/hooks/use-sse.ts`:
```typescript
"use client";

import { useEffect, useCallback, useRef } from "react";

export function useSSE(onEvent: (data: Record<string, unknown>) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onEventRef.current(data);
    };

    es.onerror = () => {
      // Auto-reconnect is built into EventSource
    };

    return () => es.close();
  }, []);
}

export function useAutoRefresh(refetch: () => void) {
  useSSE(
    useCallback(
      (data: Record<string, unknown>) => {
        if (data.type !== "heartbeat") {
          refetch();
        }
      },
      [refetch]
    )
  );
}
```

**Step 2: Create navigation component**

Create `src/components/nav.tsx`:
```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/skills", label: "Skills" },
  { href: "/graph", label: "依赖图" },
  { href: "/pipelines", label: "编排" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b bg-background">
      <div className="container flex h-14 items-center gap-6 px-6">
        <span className="font-semibold text-lg">Skill Manager</span>
        <div className="flex gap-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "text-sm transition-colors hover:text-foreground",
                pathname === item.href ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground">watching</span>
        </div>
      </div>
    </nav>
  );
}
```

**Step 3: Update layout**

Modify `src/app/layout.tsx` to include Nav component and clean styling.

**Step 4: Implement Dashboard page**

Implement `src/app/page.tsx` with:
- 4 stat cards (total, routed, orphan, pipelines) using shadcn Card
- Recharts PieChart for domain distribution
- Recharts BarChart for source distribution
- Recent changes list
- Fetch from `/api/stats`
- useAutoRefresh for real-time updates

**Step 5: Verify dashboard renders**

Run: `cd /Users/qihang/opensource/skill-manager && pnpm dev`
Open localhost:3000 — should show stats from scanned skills.

**Step 6: Commit**

```bash
git add src/
git commit -m "feat: implement Dashboard page with stats and charts"
```

---

## Task 9: Skills List Page

**Files:**
- Create: `src/app/skills/page.tsx`
- Create: `src/components/skill-card.tsx`
- Create: `src/components/tag-editor.tsx`
- Create: `src/components/skill-detail-sheet.tsx`

**Step 1: Implement SkillCard component**

Displays: name, description (truncated), source badge, domain tags, frequency indicator, CLAUDE.md status, dependency count.

**Step 2: Implement TagEditor component**

- Multi-select for domain tags (predefined list + custom)
- Single-select for frequency
- Single-select for pipeline
- Save via PATCH `/api/skills/[name]/tags`

**Step 3: Implement SkillDetailSheet**

shadcn Sheet (side panel) showing full skill detail:
- All auto-scanned info
- Editable tags (TagEditor)
- Editable dependencies (autocomplete from all skill names)
- Editable notes (textarea)
- CLAUDE.md references list

**Step 4: Implement Skills list page**

- Search input
- Filter dropdowns (domain, source, frequency)
- Grid of SkillCards
- Click card → open SkillDetailSheet
- Fetch from `/api/skills` with query params
- useAutoRefresh

**Step 5: Verify skills page**

Open localhost:3000/skills — should show all 110+ skills with filtering.

**Step 6: Commit**

```bash
git add src/
git commit -m "feat: implement Skills list page with filtering and detail editor"
```

---

## Task 10: Dependency Graph Page

**Files:**
- Create: `src/app/graph/page.tsx`
- Create: `src/components/dependency-graph.tsx`

**Step 1: Implement DependencyGraph component**

Using React Flow (`@xyflow/react`):
- Each skill = a node
- Dependencies = edges (arrows)
- Node color by source (self-built=blue, baoyu=purple, plugin=green)
- Orphan nodes in gray
- Auto-layout using dagre or elk
- Three view tabs: "依赖图" / "编排链路" / "CLAUDE.md 关联"

**Step 2: Install layout library**

Run:
```bash
cd /Users/qihang/opensource/skill-manager
pnpm add @dagrejs/dagre
```

**Step 3: Implement graph page**

- Fetch skills from `/api/skills`
- Build nodes + edges from dependencies
- React Flow canvas with controls (zoom, fit, fullscreen)
- Click node → navigate to `/skills?selected=<name>`
- Hover node → highlight connected nodes

**Step 4: Verify graph renders**

Open localhost:3000/graph — should show node graph.

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: implement dependency graph page with React Flow"
```

---

## Task 11: Pipeline Editor Page

**Files:**
- Create: `src/app/pipelines/page.tsx`
- Create: `src/components/pipeline-editor.tsx`
- Create: `src/components/pipeline-step.tsx`

**Step 1: Implement PipelineStep component**

Draggable step card showing skill name + role label.

**Step 2: Implement PipelineEditor component**

- Horizontal flow of PipelineStep cards connected by arrows
- Drag to reorder
- "+" button to add skill to pipeline (autocomplete dropdown)
- Edit role label inline
- Save/Delete buttons
- Uses HTML5 Drag and Drop or dnd-kit

**Step 3: Install drag-and-drop library**

Run:
```bash
cd /Users/qihang/opensource/skill-manager
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Step 4: Implement pipelines page**

- List all pipelines
- Click to expand/edit
- "New Pipeline" button → create dialog
- Each pipeline shows as horizontal flow
- CRUD via `/api/pipelines`

**Step 5: Verify pipeline page**

Open localhost:3000/pipelines — should show pipeline editor.

**Step 6: Commit**

```bash
git add src/
git commit -m "feat: implement pipeline editor with drag-and-drop"
```

---

## Task 12: Polish & Integration

**Step 1: Add loading states and error boundaries**

- Skeleton loaders for all data-fetching pages
- Error boundary components with retry buttons

**Step 2: Add responsive design**

- Mobile-friendly navigation (hamburger menu)
- Responsive grid for skill cards

**Step 3: Initial scan prompt**

On first visit (empty registry), show "Scan Now" button prominently.

**Step 4: Final integration test**

1. `pnpm dev` → open localhost:3000
2. Dashboard shows correct stats
3. Skills page lists all skills, filters work
4. Edit tags on a skill → persists after refresh
5. Graph page shows dependency visualization
6. Pipeline page allows create/edit/delete
7. Modify a SKILL.md file → SSE triggers auto-refresh

**Step 5: Commit**

```bash
git add .
git commit -m "feat: polish UI with loading states, responsive design, and integration"
```
