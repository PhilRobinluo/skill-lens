# Upstream Lens — 上游追踪 + Git 历史透视

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 给 Skill Lens 增加两个"镜头"——上游血缘追踪和 Git 历史透视，让每个 skill 的来源、演化、修改状态一目了然。

**Architecture:** 在现有扫描流程末尾追加 enrichment 阶段（分层不混写）。Git 历史通过 `execFile`（非 exec，防注入）调用 git 命令获取，不引入新依赖。上游识别采用"三步漏斗"——硬证据先行，不猜测，找不到就标原创。UI 不加新页面，在表格加列 + 详情面板加 Tab。

**Tech Stack:** Next.js 16 (App Router) / TypeScript strict / shadcn/ui + Tailwind 4 / TanStack Table / vitest

**Branch:** `feat/upstream-lens`

**Key files to understand before starting:**
- `src/lib/types.ts` — 所有类型定义
- `src/lib/scanner.ts` — 扫描逻辑 + `scanAll()`
- `src/lib/registry.ts` — 注册表读写
- `src/lib/config.ts` — 路径配置
- `src/lib/init-server.ts` — 启动初始化单例
- `src/components/skills-table/columns.tsx` — 表格列定义（10 列）
- `src/components/skills-table/table-filter-builder.tsx` — 筛选器
- `src/components/skills-table/table-toolbar.tsx` — 工具栏（COLUMN_LABELS, GROUPING_OPTIONS）
- `src/components/skill-detail-sheet.tsx` — 右侧详情面板
- `src/app/page.tsx` — 仪表盘页
- `src/app/api/stats/route.ts` — 统计 API

---

## Task 1: 数据模型 — types.ts 新增类型

**Files:**
- Modify: `src/lib/types.ts`

**Step 1: 在 types.ts 末尾（DashboardStats 之后）新增上游和 Git 历史类型**

```typescript
// ---------- Upstream Tracking ----------

export type ModificationType = "bugfix" | "capability" | "config";

export interface SkillModification {
  file: string;
  type: ModificationType;
  summary: string;
}

export type UpstreamStatus = "original" | "following" | "modified";

export interface UpstreamInfo {
  origin: string;
  originUrl?: string;
  baseCommitSha?: string;
  forkedAt?: string;
  status: UpstreamStatus;
  localModified: boolean;
  modifications: SkillModification[];
  lastReconciled?: string;
}

// ---------- Git History ----------

export interface GitCommitInfo {
  sha: string;
  date: string;
  author: string;
  message: string;
  additions: number;
  deletions: number;
}

export interface SkillGitHistory {
  totalCommits: number;
  createdAt: string;
  lastCommitAt: string;
  hasUncommittedChanges: boolean;
  contributors: string[];
  timeline: GitCommitInfo[];
}

// ---------- Extended Dashboard Stats ----------

export interface ForkStats {
  totalWithUpstream: number;
  modified: number;
  needsReconciliation: number;
}

export interface EvolutionStats {
  activeThisMonth: number;
  newThisMonth: number;
  mostActive: Array<{ name: string; commits: number }>;
}
```

**Step 2: 在 SkillEntry 接口中 `notes: string;` 后追加**

```typescript
  upstream?: UpstreamInfo;
  gitHistory?: SkillGitHistory;
```

**Step 3: 在 DashboardStats 接口中 `recentChanges` 后追加**

```typescript
  forkStats?: ForkStats;
  evolutionStats?: EvolutionStats;
```

**Step 4: 扩展 FilterableField**

```typescript
export type FilterableField =
  | "name"
  | "source"
  | "status"
  | "domain"
  | "description"
  | "lineCount"
  | "upstream"
  | "commits";
```

**Step 5: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add UpstreamInfo, SkillGitHistory, and extended stats types"
```

---

## Task 2: Git 历史工具库

**Files:**
- Create: `src/lib/git-history.ts`
- Test: `src/lib/__tests__/git-history.test.ts`

**Step 1: 写测试 — git-history.test.ts**

```typescript
import { describe, it, expect } from "vitest";
import { parseGitLogOutput, getSkillGitHistory } from "../git-history";

describe("parseGitLogOutput", () => {
  it("parses git log output with numstat into commits", () => {
    const output = [
      "abc1234|||2026-02-28 02:49:24 +0800|||Phil-Mini|||feat: add feature",
      "10\t5\tSKILL.md",
      "",
      "def5678|||2026-01-25 18:38:15 +0800|||Phil|||init: create skill",
      "50\t0\tSKILL.md",
      "",
    ].join("\n");

    const commits = parseGitLogOutput(output);
    expect(commits).toHaveLength(2);
    expect(commits[0].sha).toBe("abc1234");
    expect(commits[0].author).toBe("Phil-Mini");
    expect(commits[0].additions).toBe(10);
    expect(commits[0].deletions).toBe(5);
    expect(commits[1].sha).toBe("def5678");
    expect(commits[1].additions).toBe(50);
  });

  it("handles empty output", () => {
    expect(parseGitLogOutput("")).toHaveLength(0);
    expect(parseGitLogOutput("  \n  ")).toHaveLength(0);
  });
});

describe("getSkillGitHistory", () => {
  it("returns history for a known skill (integration)", async () => {
    const history = await getSkillGitHistory(
      "~/.claude",
      "skills/ai-task-system"
    );
    expect(history.totalCommits).toBeGreaterThan(0);
    expect(history.createdAt).toBeTruthy();
    expect(history.lastCommitAt).toBeTruthy();
    expect(history.contributors.length).toBeGreaterThan(0);
    expect(history.timeline.length).toBeGreaterThan(0);
    expect(history.timeline[0].sha).toBeTruthy();
  });

  it("returns zero history for nonexistent path", async () => {
    const history = await getSkillGitHistory(
      "~/.claude",
      "skills/definitely-nonexistent-skill-xyz"
    );
    expect(history.totalCommits).toBe(0);
    expect(history.timeline).toHaveLength(0);
  });
});
```

**Step 2: 运行测试，确认失败**

```bash
pnpm test src/lib/__tests__/git-history.test.ts
```

Expected: FAIL — module not found

**Step 3: 实现 git-history.ts**

Uses `execFile` (not `exec`) for safety — no shell injection risk.

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitCommitInfo, SkillGitHistory } from "./types";

const execFileAsync = promisify(execFile);

const SEP = "|||";
const LOG_FORMAT = `%h${SEP}%ai${SEP}%an${SEP}%s`;

/**
 * Parse raw git log --numstat output into structured commits.
 * Input format alternates between header lines and numstat lines:
 *   sha|||date|||author|||message
 *   10\t5\tfile.md
 *   (blank line)
 */
export function parseGitLogOutput(output: string): GitCommitInfo[] {
  if (!output.trim()) return [];

  const commits: GitCommitInfo[] = [];
  let current: GitCommitInfo | null = null;

  for (const line of output.split("\n")) {
    if (line.includes(SEP)) {
      if (current) commits.push(current);
      const [sha, date, author, message] = line.split(SEP);
      current = {
        sha: sha ?? "",
        date: date ?? "",
        author: author ?? "",
        message: message ?? "",
        additions: 0,
        deletions: 0,
      };
    } else if (current && line.trim()) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        current.additions += parseInt(parts[0], 10) || 0;
        current.deletions += parseInt(parts[1], 10) || 0;
      }
    }
  }
  if (current) commits.push(current);

  return commits;
}

/**
 * Get git history for a skill directory.
 * @param gitRoot - Git repository root (e.g., ~/.claude)
 * @param relativePath - Relative path to skill dir (e.g., "skills/ai-task-system")
 */
export async function getSkillGitHistory(
  gitRoot: string,
  relativePath: string,
): Promise<SkillGitHistory> {
  const empty: SkillGitHistory = {
    totalCommits: 0,
    createdAt: "",
    lastCommitAt: "",
    hasUncommittedChanges: false,
    contributors: [],
    timeline: [],
  };

  try {
    const { stdout: logOutput } = await execFileAsync(
      "git",
      ["log", "--follow", `--format=${LOG_FORMAT}`, "--numstat", "--", relativePath],
      { cwd: gitRoot, maxBuffer: 1024 * 1024 },
    );

    const commits = parseGitLogOutput(logOutput);
    if (commits.length === 0) return empty;

    // Check for uncommitted changes
    let hasUncommitted = false;
    try {
      const { stdout: diffOutput } = await execFileAsync(
        "git",
        ["diff", "--name-only", "--", relativePath],
        { cwd: gitRoot },
      );
      hasUncommitted = diffOutput.trim().length > 0;
    } catch {
      // ignore
    }

    return {
      totalCommits: commits.length,
      createdAt: commits[commits.length - 1].date,
      lastCommitAt: commits[0].date,
      hasUncommittedChanges: hasUncommitted,
      contributors: [...new Set(commits.map((c) => c.author))],
      timeline: commits,
    };
  } catch {
    return empty;
  }
}
```

**Step 4: 运行测试，确认通过**

```bash
pnpm test src/lib/__tests__/git-history.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/git-history.ts src/lib/__tests__/git-history.test.ts
git commit -m "feat: add git-history utility for skill commit timeline"
```

---

## Task 3: 上游识别 — upstream-enricher.ts

**Files:**
- Create: `src/lib/upstream-enricher.ts`
- Test: `src/lib/__tests__/upstream-enricher.test.ts`

**Step 1: 写测试**

```typescript
import { describe, it, expect } from "vitest";
import { detectUpstream, KNOWN_UPSTREAM_SOURCES } from "../upstream-enricher";
import type { SkillEntry } from "../types";

function makeSkill(overrides: Partial<SkillEntry>): SkillEntry {
  return {
    name: "test-skill",
    path: "/test/path",
    source: "self-built",
    description: "",
    lineCount: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModified: "2026-01-01T00:00:00.000Z",
    claudeMdRefs: [],
    tags: { domain: [], autoTagged: false, frequency: null },
    dependencies: [],
    notes: "",
    ...overrides,
  };
}

describe("detectUpstream", () => {
  it("detects baoyu upstream from source field", () => {
    const skill = makeSkill({ name: "baoyu-image-gen", source: "baoyu" });
    const upstream = detectUpstream(skill);
    expect(upstream).not.toBeNull();
    expect(upstream!.origin).toContain("baoyu");
    expect(upstream!.status).toBe("following");
  });

  it("detects plugin-official upstream", () => {
    const skill = makeSkill({
      name: "plugin-official/deploy",
      source: "plugin-official",
      path: "/home/.claude/plugins/cache/claude-plugins-official/vercel/1.0.0/skills/deploy",
    });
    const upstream = detectUpstream(skill);
    expect(upstream).not.toBeNull();
    expect(upstream!.origin).toBe("anthropic/claude-plugins-official");
  });

  it("detects plugin-community upstream", () => {
    const skill = makeSkill({
      name: "plugin-community/tdd",
      source: "plugin-community",
      path: "/home/.claude/plugins/cache/superpowers-marketplace/superpowers/4.3.0/skills/tdd",
    });
    const upstream = detectUpstream(skill);
    expect(upstream).not.toBeNull();
    expect(upstream!.origin).toContain("superpowers");
  });

  it("returns null for unknown self-built skills", () => {
    const skill = makeSkill({ name: "my-custom-skill", source: "self-built" });
    expect(detectUpstream(skill)).toBeNull();
  });

  it("detects known upstream from curated map", () => {
    const skill = makeSkill({ name: "geo-optimizer", source: "self-built" });
    const upstream = detectUpstream(skill);
    if (KNOWN_UPSTREAM_SOURCES["geo-optimizer"]) {
      expect(upstream).not.toBeNull();
      expect(upstream!.origin).toContain("aaron-he-zhu");
    }
  });
});
```

**Step 2: 运行测试，确认失败**

```bash
pnpm test src/lib/__tests__/upstream-enricher.test.ts
```

**Step 3: 实现 upstream-enricher.ts**

```typescript
import type { SkillEntry, UpstreamInfo, SkillsRegistry } from "./types";
import { getSkillGitHistory } from "./git-history";
import path from "node:path";
import os from "node:os";

/**
 * Curated map of self-built skills with known upstream origins.
 * This is the "hard evidence" registry — only add entries you are certain about.
 */
export const KNOWN_UPSTREAM_SOURCES: Record<string, { origin: string; originUrl?: string }> = {
  "geo-optimizer": {
    origin: "aaron-he-zhu/seo-geo-claude-skills",
    originUrl: "https://github.com/aaron-he-zhu/seo-geo-claude-skills",
  },
  "skill-creator": {
    origin: "anthropic/skill-creator",
    originUrl: "https://github.com/anthropics/claude-code",
  },
};

const CLAUDE_DIR = path.join(os.homedir(), ".claude");

/**
 * Three-step funnel to detect upstream for a skill:
 * 1. Source type → plugin-official / plugin-community
 * 2. Name prefix → baoyu-*
 * 3. KNOWN_UPSTREAM_SOURCES curated map
 * Returns null if no evidence found (= original).
 */
export function detectUpstream(skill: SkillEntry): UpstreamInfo | null {
  // Step 1: Plugin sources
  if (skill.source === "plugin-official") {
    return {
      origin: "anthropic/claude-plugins-official",
      originUrl: "https://github.com/anthropics/claude-code",
      status: "following",
      localModified: false,
      modifications: [],
    };
  }

  if (skill.source === "plugin-community") {
    const match = skill.path.match(/superpowers-marketplace\/([^/]+)/);
    const origin = match ? `superpowers/${match[1]}` : "community/unknown";
    return {
      origin,
      originUrl: "https://github.com/anthropics/claude-code-superpower-skills",
      status: "following",
      localModified: false,
      modifications: [],
    };
  }

  // Step 2: baoyu prefix
  if (skill.source === "baoyu" || skill.name.startsWith("baoyu-")) {
    return {
      origin: "baoyu/claude-skills",
      status: "following",
      localModified: false,
      modifications: [],
    };
  }

  // Step 3: Curated map
  const baseName = skill.name.replace(/^(?:plugin-official|plugin-community)\//, "");
  const known = KNOWN_UPSTREAM_SOURCES[baseName];
  if (known) {
    return {
      origin: known.origin,
      originUrl: known.originUrl,
      status: "following",
      localModified: false,
      modifications: [],
    };
  }

  return null;
}

/**
 * Enrich all skills with upstream info + git history.
 * Preserves manual upstream data (modifications, lastReconciled) from existing registry.
 */
export async function enrichUpstreamAndHistory(
  registry: SkillsRegistry,
  existingRegistry?: SkillsRegistry,
): Promise<void> {
  for (const [key, skill] of Object.entries(registry.skills)) {
    const detected = detectUpstream(skill);
    const existingUpstream = existingRegistry?.skills[key]?.upstream;

    if (detected) {
      skill.upstream = {
        ...detected,
        modifications: existingUpstream?.modifications ?? [],
        lastReconciled: existingUpstream?.lastReconciled,
        baseCommitSha: existingUpstream?.baseCommitSha,
        forkedAt: existingUpstream?.forkedAt,
      };
    } else if (existingUpstream) {
      skill.upstream = existingUpstream;
    }

    // Git history — only for skills inside the ~/.claude git repo
    if (skill.path.startsWith(CLAUDE_DIR)) {
      const relativePath = path.relative(CLAUDE_DIR, skill.path);
      const history = await getSkillGitHistory(CLAUDE_DIR, relativePath);
      skill.gitHistory = history;

      // If has upstream AND multiple commits → mark as modified
      if (skill.upstream && history.totalCommits > 1) {
        skill.upstream.localModified = true;
        skill.upstream.status = "modified";
      }
    }
  }
}
```

**Step 4: 运行测试，确认通过**

```bash
pnpm test src/lib/__tests__/upstream-enricher.test.ts
```

**Step 5: Commit**

```bash
git add src/lib/upstream-enricher.ts src/lib/__tests__/upstream-enricher.test.ts
git commit -m "feat: add upstream-enricher with three-step funnel detection"
```

---

## Task 4: 接入扫描流程

**Files:**
- Modify: `src/lib/scanner.ts`

**Step 1: 在 scanner.ts 顶部导入 enricher**

```typescript
import { enrichUpstreamAndHistory } from "./upstream-enricher";
```

**Step 2: 在 scanAll() 的 merge 循环（L322-L333）中保留 upstream 字段**

在 `skills[key].notes = existingEntry.notes;` (L330) 后追加：

```typescript
        skills[key].upstream = existingEntry.upstream;
```

**Step 3: 在 scanAll() 的 auto-infer tags 循环之后、`const registry` 之前（~L345）追加：**

```typescript
  // Enrich with upstream info and git history
  await enrichUpstreamAndHistory(registry, existingRegistry);
```

注意：这行要放在 `const registry: SkillsRegistry = {` 之后改为先构建 registry 再 enrich。更准确地说，把 enrichment 调用放在 `return registry;` 之前：

```typescript
  const registry: SkillsRegistry = {
    skills,
    meta: { ... },
  };

  // Enrich with upstream info and git history
  await enrichUpstreamAndHistory(registry, existingRegistry);

  return registry;
```

**Step 4: 运行全部测试**

```bash
pnpm test
```

Expected: ALL PASS

**Step 5: Build 验证**

```bash
pnpm build
```

**Step 6: Commit**

```bash
git add src/lib/scanner.ts
git commit -m "feat: integrate upstream enricher into scanAll pipeline"
```

---

## Task 5: API — Git 历史 + 上游编辑

**Files:**
- Create: `src/app/api/skills/[name]/history/route.ts`
- Create: `src/app/api/skills/[name]/upstream/route.ts`

**Step 1: 创建 history API — `src/app/api/skills/[name]/history/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";
import type { SkillGitHistory } from "@/lib/types";

const EMPTY_HISTORY: SkillGitHistory = {
  totalCommits: 0,
  createdAt: "",
  lastCommitAt: "",
  hasUncommittedChanges: false,
  contributors: [],
  timeline: [],
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    const registry = await readRegistry();
    const skill = registry.skills[decodedName];

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    return NextResponse.json(skill.gitHistory ?? EMPTY_HISTORY);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

**Step 2: 创建 upstream API — `src/app/api/skills/[name]/upstream/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry, writeRegistry } from "@/lib/registry";
import type { UpstreamInfo } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    const body = (await request.json()) as Partial<UpstreamInfo>;
    const registry = await readRegistry();
    const skill = registry.skills[decodedName];

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    skill.upstream = {
      origin: body.origin ?? skill.upstream?.origin ?? "",
      originUrl: body.originUrl ?? skill.upstream?.originUrl,
      baseCommitSha: body.baseCommitSha ?? skill.upstream?.baseCommitSha,
      forkedAt: body.forkedAt ?? skill.upstream?.forkedAt,
      status: body.status ?? skill.upstream?.status ?? "original",
      localModified: body.localModified ?? skill.upstream?.localModified ?? false,
      modifications: body.modifications ?? skill.upstream?.modifications ?? [],
      lastReconciled: body.lastReconciled ?? skill.upstream?.lastReconciled,
    };

    await writeRegistry(registry);
    return NextResponse.json(skill.upstream);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add "src/app/api/skills/[name]/history/route.ts" "src/app/api/skills/[name]/upstream/route.ts"
git commit -m "feat: add /api/skills/[name]/history and /upstream endpoints"
```

---

## Task 6: Stats API 扩展

**Files:**
- Modify: `src/app/api/stats/route.ts`

**Step 1: 在现有 `recentChanges` 计算之后、`const stats` 构造之前，追加 fork + evolution 计算**

```typescript
    // Fork stats
    const skillsWithUpstream = skills.filter((s) => s.upstream);
    const modifiedForks = skillsWithUpstream.filter(
      (s) => s.upstream?.status === "modified",
    );
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const needsReconciliation = skillsWithUpstream.filter((s) => {
      if (!s.upstream?.lastReconciled) return true;
      return new Date(s.upstream.lastReconciled).getTime() < thirtyDaysAgo;
    });

    // Evolution stats
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const activeThisMonth = skills.filter(
      (s) => s.gitHistory && new Date(s.gitHistory.lastCommitAt) >= monthStart,
    );
    const newThisMonth = skills.filter(
      (s) => s.gitHistory && new Date(s.gitHistory.createdAt) >= monthStart,
    );
    const mostActive = skills
      .filter((s) => s.gitHistory && s.gitHistory.totalCommits > 1)
      .sort((a, b) => (b.gitHistory?.totalCommits ?? 0) - (a.gitHistory?.totalCommits ?? 0))
      .slice(0, 5)
      .map((s) => ({ name: s.name, commits: s.gitHistory!.totalCommits }));
```

**Step 2: 在 stats 对象的 `recentChanges,` 后追加**

```typescript
      forkStats: {
        totalWithUpstream: skillsWithUpstream.length,
        modified: modifiedForks.length,
        needsReconciliation: needsReconciliation.length,
      },
      evolutionStats: {
        activeThisMonth: activeThisMonth.length,
        newThisMonth: newThisMonth.length,
        mostActive,
      },
```

**Step 3: Build 验证**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add src/app/api/stats/route.ts
git commit -m "feat: extend stats API with forkStats and evolutionStats"
```

---

## Task 7: 表格新增 3 列

**Files:**
- Modify: `src/components/skills-table/columns.tsx`
- Modify: `src/components/skills-table/table-toolbar.tsx`
- Modify: `src/components/skills-table/table-filter-builder.tsx`

**Step 1: columns.tsx — 在 callStats 列（#7, ~L171）之后、createdAt 列（#8）之前插入 3 列**

```typescript
    // 7.5 Upstream status
    {
      id: "upstream",
      accessorFn: (row) => row.upstream?.status ?? "original",
      header: ({ column }) => <TableColumnHeader column={column} title="上游" />,
      cell: ({ row }) => {
        const upstream = row.original.upstream;
        if (!upstream) {
          return <span className="text-xs text-muted-foreground/50">—</span>;
        }
        if (upstream.status === "modified") {
          return (
            <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
              🔀 已修改
            </Badge>
          );
        }
        return (
          <Badge variant="outline" className="text-[10px] bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300">
            📌 跟随
          </Badge>
        );
      },
      filterFn: "equals",
    },
    // 7.6 Commits count
    {
      id: "commits",
      accessorFn: (row) => row.gitHistory?.totalCommits ?? 0,
      header: ({ column }) => <TableColumnHeader column={column} title="Commits" />,
      cell: ({ row }) => {
        const count = row.original.gitHistory?.totalCommits ?? 0;
        if (count === 0) return <span className="text-xs text-muted-foreground/50">—</span>;
        return <span className="text-sm tabular-nums">{count}</span>;
      },
    },
    // 7.7 Activity level
    {
      id: "activity",
      accessorFn: (row) => {
        if (!row.gitHistory?.lastCommitAt) return 0;
        const days = Math.floor((Date.now() - new Date(row.gitHistory.lastCommitAt).getTime()) / 86400000);
        if (days <= 7) return 3;
        if (days <= 30) return 2;
        if (days <= 90) return 1;
        return 0;
      },
      header: ({ column }) => <TableColumnHeader column={column} title="活跃度" />,
      cell: ({ row }) => {
        const history = row.original.gitHistory;
        if (!history || history.totalCommits === 0) {
          return <span className="text-xs text-muted-foreground/50">—</span>;
        }
        const days = Math.floor((Date.now() - new Date(history.lastCommitAt).getTime()) / 86400000);
        if (days <= 7) return <span title={`${days}天前`}>🔥</span>;
        if (days <= 30) return <span title={`${days}天前`}>⚡</span>;
        if (days <= 90) return <span title={`${days}天前`}>💤</span>;
        return <span title={`${days}天前`}>⚪</span>;
      },
    },
```

**Step 2: table-toolbar.tsx — COLUMN_LABELS 追加 3 行（在 `notes: "备注"` 前）**

```typescript
  upstream: "上游",
  commits: "Commits",
  activity: "活跃度",
```

GROUPING_OPTIONS 追加：

```typescript
  { value: "upstream", label: "按上游状态" },
```

**Step 3: table-filter-builder.tsx — FIELD_OPTIONS 追加（在 lineCount 行后）**

```typescript
  { value: "upstream", label: "上游状态", type: "enum" },
  { value: "commits", label: "Commits", type: "number" },
```

VALUE_OPTIONS 追加：

```typescript
  upstream: [
    { value: "original", label: "原创" },
    { value: "following", label: "跟随上游" },
    { value: "modified", label: "已修改" },
  ],
```

getFieldValue switch 追加：

```typescript
    case "upstream": return skill.upstream?.status ?? "original";
    case "commits": return String(skill.gitHistory?.totalCommits ?? 0);
```

**Step 4: Build 验证**

```bash
pnpm build
```

**Step 5: Commit**

```bash
git add src/components/skills-table/columns.tsx src/components/skills-table/table-toolbar.tsx src/components/skills-table/table-filter-builder.tsx
git commit -m "feat: add upstream, commits, activity columns to skills table"
```

---

## Task 8: 详情面板 Tab 化

**Files:**
- Modify: `src/components/skill-detail-sheet.tsx`

This is the largest change. The existing panel content moves into an "概览" tab. Two new tabs are added: "时间线" and "上游".

**Step 1: 新增 imports**

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { SkillGitHistory, ModificationType } from "@/lib/types";
```

**Step 2: 新增 state（在现有 state 声明区域）**

```typescript
  const [activeTab, setActiveTab] = useState("overview");
  const [gitHistory, setGitHistory] = useState<SkillGitHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
```

**Step 3: 在 useEffect (sync from prop) 中追加 reset**

```typescript
      setActiveTab("overview");
      setGitHistory(null);
      setHistoryLoading(false);
```

**Step 4: 添加 loadGitHistory 函数（在 handleLoadRawContent 旁边）**

```typescript
  async function loadGitHistory() {
    if (!skill || historyLoading || gitHistory) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/skills/${encodeURIComponent(skill.name)}/history`);
      if (res.ok) {
        setGitHistory(await res.json());
      }
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  }
```

**Step 5: 将 `<div className="space-y-6 px-4 pb-8">` 整块替换为 Tabs 结构**

```tsx
<div className="px-4 pb-8">
  <Tabs value={activeTab} onValueChange={(v) => {
    setActiveTab(v);
    if (v === "timeline" && !gitHistory) loadGitHistory();
  }}>
    <TabsList className="w-full">
      <TabsTrigger value="overview" className="flex-1">概览</TabsTrigger>
      <TabsTrigger value="timeline" className="flex-1">时间线</TabsTrigger>
      <TabsTrigger value="upstream" className="flex-1">上游</TabsTrigger>
    </TabsList>

    <TabsContent value="overview" className="space-y-6 pt-4">
      {/* ===== 原有所有 section 原封不动放在这里 ===== */}
    </TabsContent>

    <TabsContent value="timeline" className="pt-4">
      <TimelineTab history={gitHistory} loading={historyLoading} />
    </TabsContent>

    <TabsContent value="upstream" className="pt-4">
      <UpstreamTab skill={skill} onUpdated={onUpdated} />
    </TabsContent>
  </Tabs>
</div>
```

**Step 6: 在文件底部添加 TimelineTab 组件**

```tsx
function TimelineTab({ history, loading }: { history: SkillGitHistory | null; loading: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">加载中...</p>;
  if (!history || history.totalCommits === 0) {
    return <p className="text-sm text-muted-foreground/60 italic">无 Git 历史记录</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{history.totalCommits} commits</span>
        <span>{history.contributors.join(", ")}</span>
        {history.hasUncommittedChanges && (
          <Badge variant="outline" className="text-[10px] text-amber-600">未提交改动</Badge>
        )}
      </div>
      <div className="relative border-l-2 border-muted pl-4 space-y-4">
        {history.timeline.map((commit, i) => (
          <div key={commit.sha} className="relative">
            <div className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background ${
              i === history.timeline.length - 1 ? "bg-green-500" : "bg-primary"
            }`} />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{commit.message}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <code className="font-mono">{commit.sha}</code>
                <span>{commit.author}</span>
                <span>{new Date(commit.date).toLocaleDateString("zh-CN")}</span>
                {(commit.additions > 0 || commit.deletions > 0) && (
                  <span>
                    <span className="text-green-600">+{commit.additions}</span>
                    {" "}
                    <span className="text-red-500">-{commit.deletions}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 7: 在文件底部添加 UpstreamTab 组件**

```tsx
function UpstreamTab({ skill, onUpdated }: { skill: SkillEntry; onUpdated: () => void }) {
  const upstream = skill.upstream;

  if (!upstream) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground/60 italic">原创技能，无上游来源</p>
        <p className="text-xs text-muted-foreground">
          如果此技能基于外部项目，可在详情中手动设置上游信息。
        </p>
      </div>
    );
  }

  const MOD_LABELS: Record<ModificationType, { label: string; className: string }> = {
    bugfix: { label: "临时补丁", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" },
    capability: { label: "核心能力", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
    config: { label: "环境适配", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300" },
  };

  async function markReconciled() {
    await fetch(`/api/skills/${encodeURIComponent(skill.name)}/upstream`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lastReconciled: new Date().toISOString() }),
    });
    onUpdated();
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">上游来源</h3>
        <div className="grid grid-cols-2 gap-y-1.5 text-sm">
          <span className="text-muted-foreground">来源</span>
          <span className="font-mono text-xs">{upstream.origin}</span>
          {upstream.originUrl && (
            <>
              <span className="text-muted-foreground">URL</span>
              <a href={upstream.originUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline dark:text-blue-400">
                {upstream.originUrl}
              </a>
            </>
          )}
          <span className="text-muted-foreground">状态</span>
          <span>
            {upstream.status === "modified" ? "🔀 已修改" :
             upstream.status === "following" ? "📌 跟随上游" : "— 原创"}
          </span>
          <span className="text-muted-foreground">上次对账</span>
          <span className="flex items-center gap-2">
            {upstream.lastReconciled
              ? new Date(upstream.lastReconciled).toLocaleDateString("zh-CN")
              : "从未对账"}
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={markReconciled}>
              标记已对账
            </Button>
          </span>
        </div>
      </section>

      {upstream.modifications.length > 0 && (
        <section className="space-y-2">
          <Separator />
          <h3 className="text-sm font-semibold text-muted-foreground">本地修改</h3>
          <div className="space-y-2">
            {upstream.modifications.map((mod, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Badge variant="outline" className={`shrink-0 text-[10px] ${MOD_LABELS[mod.type].className}`}>
                  {MOD_LABELS[mod.type].label}
                </Badge>
                <div>
                  <p>{mod.summary}</p>
                  <p className="font-mono text-xs text-muted-foreground">{mod.file}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

**Step 8: Build 验证**

```bash
pnpm build
```

**Step 9: Commit**

```bash
git add src/components/skill-detail-sheet.tsx
git commit -m "feat: add timeline and upstream tabs to skill detail sheet"
```

---

## Task 9: 仪表盘新增卡片

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: 在导入区追加 Separator**

```typescript
import { Separator } from "@/components/ui/separator";
```

**Step 2: 在 Row 2 charts `</div>` 之后、`<HealthReportCard>` 之前插入**

```tsx
      {/* Row 2.3: Fork Health + Evolution */}
      {stats.forkStats && stats.evolutionStats && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fork 健康度</CardTitle>
              <CardDescription>上游追踪与对账状态</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{stats.forkStats.totalWithUpstream}</p>
                  <p className="text-xs text-muted-foreground">有上游</p>
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums text-amber-500">{stats.forkStats.modified}</p>
                  <p className="text-xs text-muted-foreground">已修改</p>
                </div>
                <div>
                  <p className={`text-2xl font-bold tabular-nums ${stats.forkStats.needsReconciliation > 0 ? "text-red-500" : ""}`}>
                    {stats.forkStats.needsReconciliation}
                  </p>
                  <p className="text-xs text-muted-foreground">需对账</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">技能演化</CardTitle>
              <CardDescription>本月活跃度概览</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">本月活跃</span>
                <span className="font-bold tabular-nums">{stats.evolutionStats.activeThisMonth} 个</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">本月新建</span>
                <span className="font-bold tabular-nums">{stats.evolutionStats.newThisMonth} 个</span>
              </div>
              {stats.evolutionStats.mostActive.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">最活跃 Top 5</p>
                    {stats.evolutionStats.mostActive.map((s) => (
                      <div key={s.name} className="flex items-center justify-between text-sm">
                        <span className="max-w-[180px] truncate font-mono text-xs">{skillDisplayName(s.name)}</span>
                        <span className="tabular-nums text-xs text-muted-foreground">{s.commits} commits</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
```

**Step 3: Build 验证**

```bash
pnpm build
```

**Step 4: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add fork health and evolution cards to dashboard"
```

---

## Task 10: 端到端验证

**Step 1: 运行全部测试**

```bash
pnpm test
```

Expected: ALL PASS

**Step 2: 启动 dev server 手动验证**

```bash
pnpm dev
```

打开 http://localhost:3000 验证清单：

- [ ] **仪表盘**：Fork 健康度卡片显示数字（有上游/已修改/需对账）
- [ ] **仪表盘**：技能演化卡片显示本月活跃数 + Top 5
- [ ] **技能库表格**：上游列显示 📌/🔀/— 三种状态
- [ ] **技能库表格**：Commits 列显示数字
- [ ] **技能库表格**：活跃度列显示 🔥/⚡/💤/⚪
- [ ] **筛选**：按"上游状态 = 已修改"筛选正常
- [ ] **分组**：按上游状态分组正常
- [ ] **详情面板 baoyu-image-gen**：3 个 tab（概览/时间线/上游）
- [ ] **时间线 tab**：显示 commit 时间线
- [ ] **上游 tab**：显示 baoyu/claude-skills 来源 + 📌 跟随
- [ ] **详情面板 clash-manager**：时间线显示 8 个 commits
- [ ] **上游 tab 对账**：点击"标记已对账"后日期更新

**Step 3: 最终 build**

```bash
pnpm build
```

**Step 4: 查看所有 commit**

```bash
git log --oneline feat/upstream-lens --not main
```

---

## 文件变更总结

| 文件 | 动作 | Task |
|------|------|------|
| `src/lib/types.ts` | 修改 | 1 |
| `src/lib/git-history.ts` | **新建** | 2 |
| `src/lib/__tests__/git-history.test.ts` | **新建** | 2 |
| `src/lib/upstream-enricher.ts` | **新建** | 3 |
| `src/lib/__tests__/upstream-enricher.test.ts` | **新建** | 3 |
| `src/lib/scanner.ts` | 修改 | 4 |
| `src/app/api/skills/[name]/history/route.ts` | **新建** | 5 |
| `src/app/api/skills/[name]/upstream/route.ts` | **新建** | 5 |
| `src/app/api/stats/route.ts` | 修改 | 6 |
| `src/components/skills-table/columns.tsx` | 修改 | 7 |
| `src/components/skills-table/table-toolbar.tsx` | 修改 | 7 |
| `src/components/skills-table/table-filter-builder.tsx` | 修改 | 7 |
| `src/components/skill-detail-sheet.tsx` | 修改 | 8 |
| `src/app/page.tsx` | 修改 | 9 |

**新建 6 个文件，修改 8 个文件，预计 10 个 commit。**
