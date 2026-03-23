# Skill 禁用 + CLAUDE.md Profile 切换 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 Skill Manager 支持禁用/启用单个 Skill（文件系统级别），以及在多个 CLAUDE.md 版本之间快速切换。

**Architecture:** 两个独立功能。Skill 禁用通过重命名 `SKILL.md` ↔ `SKILL.md.disabled` 实现，scanner 同时检测两种文件名。CLAUDE.md Profile 通过 `data/claude-md-profiles/` 目录存储多个版本，切换时自动保存当前内容再覆盖 `~/.claude/CLAUDE.md`。

**Tech Stack:** Next.js 16 App Router, TypeScript strict, shadcn/ui Switch 组件, node:fs/promises

---

## Task 1: SkillEntry 类型新增 enabled 字段

**Files:**
- Modify: `src/lib/types.ts:21-37`

**Step 1: 添加 enabled 字段**

在 `SkillEntry` 接口的 `belongsTo` 字段后面加一行：

```typescript
// src/lib/types.ts — SkillEntry 接口末尾（第 36 行 belongsTo 之后）
  /** Whether this skill is currently enabled (SKILL.md exists vs SKILL.md.disabled) */
  enabled: boolean;
```

**Step 2: 验证类型检查**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit 2>&1 | head -30`
Expected: 多处报错 — `enabled` 缺失（buildSkillEntry 等处），这是正常的，下一个 Task 修复。

**Step 3: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add enabled field to SkillEntry type"
```

---

## Task 2: Scanner 支持检测 disabled skill

**Files:**
- Modify: `src/lib/scanner.ts:113-134` (scanUserSkills)
- Modify: `src/lib/scanner.ts:156-180` (findSkillMdFiles)
- Modify: `src/lib/scanner.ts:182-209` (buildSkillEntry)
- Modify: `src/lib/scanner.ts:214-249` (scanProjectSkills)

**Step 1: 修改 buildSkillEntry — 新增 enabled 参数**

```typescript
// src/lib/scanner.ts — buildSkillEntry 签名改为：
async function buildSkillEntry(
  name: string,
  skillDir: string,
  skillMdPath: string,
  belongsTo: string = "global",
  enabled: boolean = true,
): Promise<SkillEntry> {
  const content = await fsp.readFile(skillMdPath, "utf-8");
  const stat = await fsp.stat(skillMdPath);

  return {
    name,
    path: skillDir,
    source: detectSource(name, skillDir),
    description: parseSkillMd(content),
    lineCount: content.split("\n").length,
    createdAt: stat.birthtime.toISOString(),
    lastModified: stat.mtime.toISOString(),
    claudeMdRefs: [],
    tags: {
      domain: [],
      autoTagged: false,
      frequency: null,
    },
    dependencies: [],
    notes: "",
    belongsTo,
    enabled,
  };
}
```

**Step 2: 修改 scanUserSkills — 同时检测 SKILL.md.disabled**

```typescript
// src/lib/scanner.ts — scanUserSkills 循环体改为：
    const skillDir = path.join(skillsDir, entry.name);
    const skillMdPath = path.join(skillDir, "SKILL.md");
    const skillMdDisabledPath = path.join(skillDir, "SKILL.md.disabled");

    const hasEnabled = fs.existsSync(skillMdPath);
    const hasDisabled = fs.existsSync(skillMdDisabledPath);

    if (!hasEnabled && !hasDisabled) continue;

    const actualPath = hasEnabled ? skillMdPath : skillMdDisabledPath;
    const skillEntry = await buildSkillEntry(entry.name, skillDir, actualPath, "global", hasEnabled);
    skills[skillEntry.name] = skillEntry;
```

**Step 3: 修改 findSkillMdFiles — 同时收集 SKILL.md.disabled**

```typescript
// src/lib/scanner.ts — findSkillMdFiles walk 循环中，entry.isFile() 判断改为：
      } else if (entry.isFile() && (entry.name === "SKILL.md" || entry.name === "SKILL.md.disabled")) {
        results.push(fullPath);
      }
```

**Step 4: 修改 scanPluginsCache — 传递 enabled 状态**

```typescript
// src/lib/scanner.ts — scanPluginsCache 循环体中 buildSkillEntry 调用改为：
    const isEnabled = path.basename(skillMdPath) === "SKILL.md";
    const skillEntry = await buildSkillEntry(name, skillDir, skillMdPath, "global", isEnabled);
```

**Step 5: 修改 scanProjectSkills — 同时检测 SKILL.md.disabled**

```typescript
// src/lib/scanner.ts — scanProjectSkills 内层循环改为：
      const skillDir = path.join(skillsDir, entry.name);
      const skillMdPath = path.join(skillDir, "SKILL.md");
      const skillMdDisabledPath = path.join(skillDir, "SKILL.md.disabled");

      const hasEnabled = fs.existsSync(skillMdPath);
      const hasDisabled = fs.existsSync(skillMdDisabledPath);

      if (!hasEnabled && !hasDisabled) continue;

      const actualPath = hasEnabled ? skillMdPath : skillMdDisabledPath;
      const key = `project:${project.name}/${entry.name}`;
      const skillEntry = await buildSkillEntry(entry.name, skillDir, actualPath, project.path, hasEnabled);
      skillEntry.name = key;
      skills[key] = skillEntry;
```

**Step 6: scanAll merge 逻辑 — 保留 enabled 状态**

在 `src/lib/scanner.ts:402-415` 的 merge 循环中，**不要**从 existingRegistry 恢复 enabled（enabled 应该从文件系统实时检测），所以不需要改动这里。enabled 始终由 scanner 从文件名判断。

**Step 7: 验证编译**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit 2>&1 | head -20`
Expected: PASS（无类型错误）

**Step 8: Commit**

```bash
git add src/lib/scanner.ts
git commit -m "feat: scanner detects SKILL.md.disabled for disabled skills"
```

---

## Task 3: Toggle API — 重命名 SKILL.md

**Files:**
- Create: `src/app/api/skills/[name]/toggle/route.ts`

**Step 1: 创建 toggle API route**

```typescript
// src/app/api/skills/[name]/toggle/route.ts
import fsp from "node:fs/promises";
import path from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry, writeRegistry } from "@/lib/registry";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const body = (await request.json()) as { enabled: boolean };

    const registry = await readRegistry();
    const skill = registry.skills[decodedName];

    if (!skill) {
      return NextResponse.json(
        { error: `Skill not found: "${decodedName}"` },
        { status: 404 },
      );
    }

    const skillMdPath = path.join(skill.path, "SKILL.md");
    const skillMdDisabledPath = path.join(skill.path, "SKILL.md.disabled");

    if (body.enabled) {
      // Enable: rename SKILL.md.disabled → SKILL.md
      await fsp.rename(skillMdDisabledPath, skillMdPath);
    } else {
      // Disable: rename SKILL.md → SKILL.md.disabled
      await fsp.rename(skillMdPath, skillMdDisabledPath);
    }

    // Update registry
    registry.skills[decodedName].enabled = body.enabled;
    await writeRegistry(registry);

    return NextResponse.json({ success: true, enabled: body.enabled });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
```

**Step 2: 验证编译**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit 2>&1 | head -10`
Expected: PASS

**Step 3: Commit**

```bash
git add src/app/api/skills/\[name\]/toggle/route.ts
git commit -m "feat: add PATCH /api/skills/{name}/toggle endpoint"
```

---

## Task 4: 表格新增 Switch 列

**Files:**
- Modify: `src/components/skills-table/columns.tsx:30-34` (ColumnCallbacks)
- Modify: `src/components/skills-table/columns.tsx:64-274` (getColumns — 在 name 列后插入)

**Step 1: ColumnCallbacks 新增 onToggle**

```typescript
// src/components/skills-table/columns.tsx — ColumnCallbacks 接口新增：
export interface ColumnCallbacks {
  onNameClick: (skill: SkillEntry) => void;
  onDomainChange: (skill: SkillEntry, domains: string[]) => void;
  onToggle: (skill: SkillEntry, enabled: boolean) => void;  // 新增
  allDomains?: string[];
}
```

**Step 2: 在 name 列之后插入 enabled 列**

在 `getColumns` 函数中，第 1 列（name）之后、第 2 列（source）之前插入：

```typescript
    // 1.5 Enabled toggle
    {
      id: "enabled",
      accessorFn: (row) => row.enabled,
      header: ({ column }) => <TableColumnHeader column={column} title="启用" />,
      cell: ({ row }) => {
        const skill = row.original;
        return (
          <Switch
            size="sm"
            checked={skill.enabled}
            onCheckedChange={(checked) => callbacks.onToggle(skill, checked)}
          />
        );
      },
      enableSorting: false,
      enableGrouping: false,
    },
```

**Step 3: 导入 Switch 组件**

在文件顶部添加：

```typescript
import { Switch } from "@/components/ui/switch";
```

**Step 4: name 列添加禁用样式**

修改 name 列的 cell（第 69-77 行），给禁用的 skill 加删除线和半透明：

```typescript
      cell: ({ row }) => (
        <button
          type="button"
          className={`max-w-[200px] truncate text-left font-mono text-sm hover:underline ${
            !row.original.enabled ? "line-through opacity-50" : ""
          }`}
          onClick={() => callbacks.onNameClick(row.original)}
        >
          {skillDisplayName(row.original.name)}
        </button>
      ),
```

**Step 5: 验证编译**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit 2>&1 | head -20`
Expected: 可能在引用 getColumns 的地方报错（缺少 onToggle 参数），下一步修复。

**Step 6: Commit**

```bash
git add src/components/skills-table/columns.tsx
git commit -m "feat: add enabled toggle column to skills table"
```

---

## Task 5: 技能表格主体连接 toggle 逻辑

**Files:**
- Modify: `src/components/skills-table/skills-table.tsx` — 找到调用 `getColumns` 的地方
- Modify: `src/components/skills-table/table-toolbar.tsx` — COLUMN_LABELS 加"启用"

**Step 1: skills-table.tsx 添加 onToggle 回调**

找到 `getColumns({...})` 调用处，添加 `onToggle` 参数：

```typescript
onToggle: async (skill, enabled) => {
  await fetch(`/api/skills/${encodeURIComponent(skill.name)}/toggle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  // 触发列表刷新 — 使用已有的 onUpdated 或 refresh 回调
  onUpdated();
},
```

**Step 2: table-toolbar.tsx 添加列标签**

找到 `COLUMN_LABELS` 常量，添加：

```typescript
enabled: "启用",
```

**Step 3: 验证编译 + 启动开发服务器测试**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/skills-table/skills-table.tsx src/components/skills-table/table-toolbar.tsx
git commit -m "feat: connect toggle callback in skills table"
```

---

## Task 6: 详情面板（Sheet）添加启用/禁用 Switch

**Files:**
- Modify: `src/components/skill-detail-sheet.tsx`

**Step 1: 导入 Switch**

```typescript
import { Switch } from "@/components/ui/switch";
```

**Step 2: props 新增 onToggle**

在 `SkillDetailSheetProps` 接口中添加：

```typescript
  onToggle: (skill: SkillEntry, enabled: boolean) => void;
```

**Step 3: 在 Sheet 头部区域添加 Switch**

在 `SheetHeader` 内、标题旁边或下方添加：

```tsx
{skill && (
  <div className="flex items-center gap-2 pt-1">
    <Switch
      size="sm"
      checked={skill.enabled}
      onCheckedChange={(checked) => onToggle(skill, checked)}
    />
    <span className={`text-xs ${skill.enabled ? "text-emerald-600" : "text-red-500"}`}>
      {skill.enabled ? "已启用" : "已禁用"}
    </span>
  </div>
)}
```

**Step 4: 在调用 SkillDetailSheet 的地方传入 onToggle prop**

找到父组件中 `<SkillDetailSheet` 的调用，添加 `onToggle` prop。逻辑与 Task 5 的 onToggle 相同。

**Step 5: 验证编译**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/skill-detail-sheet.tsx
git commit -m "feat: add enabled toggle to skill detail sheet"
```

---

## Task 7: 仪表板统计新增"已禁用"数

**Files:**
- Modify: `src/lib/types.ts:166-175` (DashboardStats)
- Modify: `src/app/api/stats/route.ts`
- Modify: `src/app/page.tsx` (仪表板页面)

**Step 1: DashboardStats 新增 disabledSkills 字段**

```typescript
// src/lib/types.ts — DashboardStats 接口添加：
  disabledSkills: number;
```

**Step 2: stats API 计算 disabledSkills**

在 `src/app/api/stats/route.ts` 的 stats 对象构建处添加：

```typescript
const disabledSkills = skills.filter((s) => !s.enabled).length;
// ... 在 stats 对象中添加：
disabledSkills,
```

**Step 3: 仪表板页面展示**

在 `src/app/page.tsx` 中找到统计卡片区域，在现有卡片旁边添加一个"已禁用"卡片。样式参照现有卡片。

**Step 4: 验证编译**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/types.ts src/app/api/stats/route.ts src/app/page.tsx
git commit -m "feat: add disabled skills count to dashboard stats"
```

---

## Task 8: CLAUDE.md Profile — 后端 lib

**Files:**
- Create: `src/lib/claude-md-profiles.ts`

**Step 1: 创建 profile 管理库**

```typescript
// src/lib/claude-md-profiles.ts
import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { CLAUDE_MD_PATH, DATA_DIR } from "./config";

const PROFILES_DIR = path.join(DATA_DIR, "claude-md-profiles");
const META_PATH = path.join(PROFILES_DIR, "_meta.json");

interface ProfileMeta {
  activeProfile: string | null;
  lastSwitched: string | null;
}

export interface ProfileInfo {
  name: string;
  size: number;
  lastModified: string;
  active: boolean;
}

async function ensureProfilesDir(): Promise<void> {
  await fsp.mkdir(PROFILES_DIR, { recursive: true });
}

async function readMeta(): Promise<ProfileMeta> {
  try {
    const raw = await fsp.readFile(META_PATH, "utf-8");
    return JSON.parse(raw) as ProfileMeta;
  } catch {
    return { activeProfile: null, lastSwitched: null };
  }
}

async function writeMeta(meta: ProfileMeta): Promise<void> {
  await ensureProfilesDir();
  await fsp.writeFile(META_PATH, JSON.stringify(meta, null, 2) + "\n", "utf-8");
}

function profilePath(name: string): string {
  return path.join(PROFILES_DIR, `${name}.md`);
}

export async function listProfiles(): Promise<{ profiles: ProfileInfo[]; activeProfile: string | null }> {
  await ensureProfilesDir();
  const meta = await readMeta();
  const entries = await fsp.readdir(PROFILES_DIR, { withFileTypes: true });

  const profiles: ProfileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const name = entry.name.slice(0, -3); // strip .md
    const filePath = path.join(PROFILES_DIR, entry.name);
    const stat = await fsp.stat(filePath);
    profiles.push({
      name,
      size: stat.size,
      lastModified: stat.mtime.toISOString(),
      active: meta.activeProfile === name,
    });
  }

  return { profiles, activeProfile: meta.activeProfile };
}

export async function createProfile(name: string, content?: string): Promise<void> {
  await ensureProfilesDir();
  const filePath = profilePath(name);

  if (fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" already exists`);
  }

  // If no content provided, copy current CLAUDE.md
  const profileContent = content ?? await fsp.readFile(CLAUDE_MD_PATH, "utf-8");
  await fsp.writeFile(filePath, profileContent, "utf-8");
}

export async function getProfileContent(name: string): Promise<string> {
  const filePath = profilePath(name);
  return await fsp.readFile(filePath, "utf-8");
}

export async function updateProfileContent(name: string, content: string): Promise<void> {
  const filePath = profilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" not found`);
  }
  await fsp.writeFile(filePath, content, "utf-8");
}

export async function activateProfile(name: string): Promise<void> {
  const filePath = profilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" not found`);
  }

  const meta = await readMeta();

  // Auto-save current CLAUDE.md to old active profile (if exists)
  if (meta.activeProfile && fs.existsSync(CLAUDE_MD_PATH)) {
    const currentContent = await fsp.readFile(CLAUDE_MD_PATH, "utf-8");
    const oldProfilePath = profilePath(meta.activeProfile);
    await fsp.writeFile(oldProfilePath, currentContent, "utf-8");
  }

  // Write new profile content to CLAUDE.md
  const newContent = await fsp.readFile(filePath, "utf-8");
  await fsp.writeFile(CLAUDE_MD_PATH, newContent, "utf-8");

  // Update meta
  await writeMeta({
    activeProfile: name,
    lastSwitched: new Date().toISOString(),
  });
}

export async function deleteProfile(name: string): Promise<void> {
  const meta = await readMeta();
  if (meta.activeProfile === name) {
    throw new Error("Cannot delete the active profile");
  }

  const filePath = profilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" not found`);
  }
  await fsp.unlink(filePath);
}

export async function renameProfile(oldName: string, newName: string): Promise<void> {
  const oldPath = profilePath(oldName);
  const newPath = profilePath(newName);

  if (!fs.existsSync(oldPath)) {
    throw new Error(`Profile "${oldName}" not found`);
  }
  if (fs.existsSync(newPath)) {
    throw new Error(`Profile "${newName}" already exists`);
  }

  await fsp.rename(oldPath, newPath);

  // Update meta if renaming the active profile
  const meta = await readMeta();
  if (meta.activeProfile === oldName) {
    await writeMeta({ ...meta, activeProfile: newName });
  }
}
```

**Step 2: 验证编译**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/claude-md-profiles.ts
git commit -m "feat: add claude-md-profiles library for profile CRUD"
```

---

## Task 9: CLAUDE.md Profile — API routes

**Files:**
- Create: `src/app/api/claude-md/profiles/route.ts` (GET list + POST create)
- Create: `src/app/api/claude-md/profiles/[name]/route.ts` (GET + PUT + DELETE)
- Create: `src/app/api/claude-md/profiles/[name]/activate/route.ts` (PUT)

**Step 1: 创建 profiles list + create route**

```typescript
// src/app/api/claude-md/profiles/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { listProfiles, createProfile } from "@/lib/claude-md-profiles";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await listProfiles();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { name: string; content?: string };
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Profile name is required" }, { status: 400 });
    }
    await createProfile(body.name.trim(), body.content);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = String(err);
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**Step 2: 创建 profile CRUD route**

```typescript
// src/app/api/claude-md/profiles/[name]/route.ts
import { type NextRequest, NextResponse } from "next/server";
import {
  getProfileContent,
  updateProfileContent,
  deleteProfile,
  renameProfile,
} from "@/lib/claude-md-profiles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    const content = await getProfileContent(decodeURIComponent(name));
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 404 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    const body = (await request.json()) as { content?: string; newName?: string };

    if (body.newName) {
      await renameProfile(decodeURIComponent(name), body.newName.trim());
    }
    if (body.content !== undefined) {
      const targetName = body.newName?.trim() ?? decodeURIComponent(name);
      await updateProfileContent(targetName, body.content);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    await deleteProfile(decodeURIComponent(name));
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = String(err);
    const status = message.includes("active") ? 400 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
```

**Step 3: 创建 activate route**

```typescript
// src/app/api/claude-md/profiles/[name]/activate/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { activateProfile } from "@/lib/claude-md-profiles";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    await activateProfile(decodeURIComponent(name));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

**Step 4: 验证编译**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/claude-md/profiles/
git commit -m "feat: add CLAUDE.md profile API routes (CRUD + activate)"
```

---

## Task 10: CLAUDE.md 页面 — Profile 选择器 UI

**Files:**
- Modify: `src/app/orchestration/claude-md/page.tsx:379-500` (state + header area)

**Step 1: 添加 profile 相关 state**

在 `ClaudeMdPage` 函数的 state 声明区（约第 382-432 行）添加：

```typescript
  // Profile system
  const [profiles, setProfiles] = useState<Array<{ name: string; active: boolean; size: number }>>([]);
  const [activeProfile, setActiveProfile] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showProfileManager, setShowProfileManager] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
```

**Step 2: 添加 profile fetch 函数**

```typescript
  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch("/api/claude-md/profiles");
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles);
        setActiveProfile(data.activeProfile);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);
```

**Step 3: 添加 switchProfile + saveAsProfile 函数**

```typescript
  const switchProfile = async (name: string) => {
    setProfileLoading(true);
    try {
      const res = await fetch(`/api/claude-md/profiles/${encodeURIComponent(name)}/activate`, {
        method: "PUT",
      });
      if (res.ok) {
        await fetchProfiles();
        await fetchAll(); // 刷新页面内容（blame/history 等）
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const saveAsProfile = async () => {
    if (!newProfileName.trim()) return;
    try {
      const res = await fetch("/api/claude-md/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProfileName.trim() }),
      });
      if (res.ok) {
        setNewProfileName("");
        await fetchProfiles();
      }
    } catch { /* ignore */ }
  };

  const deleteProfileHandler = async (name: string) => {
    try {
      await fetch(`/api/claude-md/profiles/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      await fetchProfiles();
    } catch { /* ignore */ }
  };
```

**Step 4: 在页面 Header 区域（第 891-925 行）添加 Profile 工具条**

在 `{/* Header */}` 的 div 内部，`<h1>` 和 `<p>` 之间，或者在 header div 的右侧区域添加 Profile 选择器：

```tsx
{/* Profile selector — 只在全局 scope 时显示 */}
{!activeFile && (
  <div className="flex items-center gap-2">
    <select
      className="h-8 rounded-md border bg-background px-2 text-sm"
      value={activeProfile ?? ""}
      onChange={(e) => e.target.value && switchProfile(e.target.value)}
      disabled={profileLoading}
    >
      <option value="" disabled>选择 Profile</option>
      {profiles.map((p) => (
        <option key={p.name} value={p.name}>
          {p.name} {p.active ? "✓" : ""}
        </option>
      ))}
    </select>

    <Button
      size="sm"
      variant="outline"
      onClick={() => setShowProfileManager(true)}
    >
      管理
    </Button>
  </div>
)}
```

**Step 5: 添加 Profile 管理 Dialog**

在页面 return 的末尾（`</div>` 之前）添加一个简单的管理弹窗。使用 shadcn/ui Dialog 组件。弹窗内容包括：
- 新建 Profile：Input + Button
- Profile 列表：每个带删除按钮
- 关闭按钮

需要导入 Dialog 相关组件：
```typescript
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
```

```tsx
{/* Profile Manager Dialog */}
<Dialog open={showProfileManager} onOpenChange={setShowProfileManager}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>管理 CLAUDE.md Profile</DialogTitle>
    </DialogHeader>
    <div className="space-y-4">
      {/* Create new */}
      <div className="flex gap-2">
        <Input
          placeholder="新 Profile 名称"
          value={newProfileName}
          onChange={(e) => setNewProfileName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveAsProfile()}
        />
        <Button onClick={saveAsProfile} disabled={!newProfileName.trim()}>
          保存当前为
        </Button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {profiles.map((p) => (
          <div key={p.name} className="flex items-center justify-between rounded-md border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{p.name}</span>
              {p.active && <Badge variant="default" className="text-[10px]">当前</Badge>}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500 hover:text-red-700"
              disabled={p.active}
              onClick={() => deleteProfileHandler(p.name)}
            >
              删除
            </Button>
          </div>
        ))}
        {profiles.length === 0 && (
          <p className="text-sm text-muted-foreground">暂无 Profile。点击「保存当前为」创建第一个。</p>
        )}
      </div>
    </div>
  </DialogContent>
</Dialog>
```

**Step 6: 验证编译**

Run: `cd $PROJECT_ROOT && pnpm tsc --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add src/app/orchestration/claude-md/page.tsx
git commit -m "feat: add CLAUDE.md profile selector and manager UI"
```

---

## Task 11: 端到端验证

**Step 1: 启动开发服务器**

Run: `cd $PROJECT_ROOT && pnpm dev`

**Step 2: 测试 Skill 禁用**

1. 打开 http://localhost:3000/skills
2. 找到一个不重要的 skill（如 `fork-id-copy`），点击 Switch 禁用
3. 确认表格行变灰 + 删除线
4. 检查文件系统：`ls ~/.claude/skills/fork-id-copy/` 应看到 `SKILL.md.disabled`
5. 再次点击 Switch 启用，确认 `SKILL.md` 恢复

**Step 3: 测试 CLAUDE.md Profile**

1. 打开 http://localhost:3000/orchestration/claude-md
2. 点击"管理"按钮，输入"full"创建第一个 Profile
3. 再手动编辑 `~/.claude/CLAUDE.md`（删除几行）
4. 创建第二个 Profile 叫"minimal"
5. 在下拉菜单中切换回"full"，确认页面内容更新

**Step 4: 构建验证**

Run: `cd $PROJECT_ROOT && pnpm build`
Expected: PASS

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: skill disable + CLAUDE.md profiles — complete implementation"
```
