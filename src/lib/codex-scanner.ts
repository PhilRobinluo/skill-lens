import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

import { PROJECT_SCAN_ROOTS } from "./config";
import { parseSkillMd } from "./scanner";
import type { ProjectInfo, SkillEntry, SkillSource } from "./types";

const execFile = promisify(execFileCb);

export type CodexSkillSource =
  | "user"
  | "system"
  | "plugin"
  | "agent-shared"
  | "project";

export interface CodexSkillEntry {
  name: string;
  path: string;
  skillMdPath: string;
  source: CodexSkillSource;
  sourceLabel: string;
  description: string;
  lineCount: number;
  lastModified: string;
  enabled: boolean;
  hasFrontmatter: boolean;
  hasDescription: boolean;
  pluginName?: string;
  projectPath?: string;
}

export interface CodexSourceSummary {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  count: number;
}

export interface CodexFinding {
  severity: "info" | "warning" | "risk";
  title: string;
  detail: string;
  count?: number;
  examples?: Array<{
    name: string;
    path: string;
    detail?: string;
  }>;
}

export interface CodexScanReport {
  scannedAt: string;
  codexHome: string;
  agentsPath: string;
  agentsContent: string;
  agentsVersion: CodexAgentsVersionStatus;
  configPath: string;
  totals: {
    skills: number;
    enabled: number;
    disabled: number;
    sources: number;
    plugins: number;
    longSkills: number;
    weakDescriptions: number;
    duplicateNames: number;
  };
  sources: CodexSourceSummary[];
  findings: CodexFinding[];
  skills: CodexSkillEntry[];
  duplicates: Array<{ name: string; entries: CodexSkillEntry[] }>;
  recent: CodexSkillEntry[];
}

export interface CodexAgentsVersionStatus {
  gitManaged: boolean;
  gitCwd: string;
  relativePath: string;
  totalCommits: number;
  hasUncommittedChanges: boolean;
  diffPreview: string;
  commits: Array<{
    sha: string;
    date: string;
    author: string;
    message: string;
  }>;
  error?: string;
}

const CODEX_SOURCE_TO_SKILL_SOURCE: Record<CodexSkillSource, SkillSource> = {
  user: "codex-user",
  system: "codex-system",
  plugin: "codex-plugin",
  "agent-shared": "codex-agent-shared",
  project: "codex-project",
};

const home = os.homedir();
const codexHome = process.env.CODEX_HOME ?? path.join(home, ".codex");
const agentsSkillsDir = process.env.AGENTS_SKILLS_DIR ?? path.join(home, ".agents", "skills");

function splitEnvPaths(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function frontmatterInfo(content: string): { hasFrontmatter: boolean; hasDescription: boolean } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { hasFrontmatter: false, hasDescription: false };
  return {
    hasFrontmatter: true,
    hasDescription: /^description:\s*/m.test(match[1]),
  };
}

function pluginLabel(skillDir: string): { label: string; pluginName?: string } {
  const parts = skillDir.split(path.sep);
  const cacheIndex = parts.lastIndexOf("cache");
  if (cacheIndex < 0) return { label: "Codex 插件" };

  const marketplace = parts[cacheIndex + 1];
  const pluginName = parts[cacheIndex + 2];
  if (marketplace === "openai-curated" && pluginName) {
    return { label: `插件: ${pluginName}`, pluginName };
  }
  if (marketplace === "openai-bundled" && pluginName) {
    return { label: `内置插件: ${pluginName}`, pluginName };
  }
  if (marketplace) {
    return { label: `插件缓存: ${marketplace}`, pluginName: marketplace };
  }
  return { label: "Codex 插件" };
}

async function buildEntry(
  name: string,
  skillDir: string,
  skillMdPath: string,
  source: CodexSkillSource,
  sourceLabel: string,
  projectPath?: string,
): Promise<CodexSkillEntry> {
  const content = await fsp.readFile(skillMdPath, "utf-8");
  const stat = await fsp.stat(skillMdPath);
  const info = frontmatterInfo(content);
  const plugin = source === "plugin" ? pluginLabel(skillDir) : null;

  return {
    name,
    path: skillDir,
    skillMdPath,
    source,
    sourceLabel: plugin?.label ?? sourceLabel,
    description: parseSkillMd(content),
    lineCount: content.split("\n").length,
    lastModified: stat.mtime.toISOString(),
    enabled: path.basename(skillMdPath) === "SKILL.md",
    hasFrontmatter: info.hasFrontmatter,
    hasDescription: info.hasDescription,
    pluginName: plugin?.pluginName,
    projectPath,
  };
}

async function scanDirectSkillDirs(
  root: string,
  source: CodexSkillSource,
  label: string,
  options: { includeDotDirs?: boolean; projectPath?: string } = {},
): Promise<CodexSkillEntry[]> {
  if (!fs.existsSync(root)) return [];

  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: CodexSkillEntry[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "_archived") continue;
    if (!options.includeDotDirs && entry.name.startsWith(".")) continue;

    const skillDir = path.join(root, entry.name);
    const enabledPath = path.join(skillDir, "SKILL.md");
    const disabledPath = path.join(skillDir, "SKILL.md.disabled");
    const skillMdPath = fs.existsSync(enabledPath)
      ? enabledPath
      : fs.existsSync(disabledPath)
        ? disabledPath
        : null;
    if (!skillMdPath) continue;

    skills.push(await buildEntry(entry.name, skillDir, skillMdPath, source, label, options.projectPath));
  }

  return skills;
}

async function countCodexProjectSkillDirs(projectPath: string): Promise<number> {
  const codexSkillsDir = path.join(projectPath, ".codex", "skills");
  const agentSkillsDir = path.join(projectPath, ".agents", "skills");
  const [codexCount, agentCount] = await Promise.all([
    countSkillDirs(codexSkillsDir),
    countSkillDirs(agentSkillsDir),
  ]);
  return codexCount + agentCount;
}

async function countSkillDirs(root: string): Promise<number> {
  if (!fs.existsSync(root)) return 0;
  try {
    const entries = await fsp.readdir(root, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const skillDir = path.join(root, entry.name);
      if (
        fs.existsSync(path.join(skillDir, "SKILL.md")) ||
        fs.existsSync(path.join(skillDir, "SKILL.md.disabled"))
      ) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

async function tryAddCodexProject(
  projectPath: string,
  seen: Set<string>,
  projects: ProjectInfo[],
): Promise<void> {
  const normalizedPath = path.resolve(projectPath);
  if (seen.has(normalizedPath) || !fs.existsSync(normalizedPath)) return;
  seen.add(normalizedPath);

  const hasAgentsMd = fs.existsSync(path.join(normalizedPath, "AGENTS.md"));
  const skillCount = await countCodexProjectSkillDirs(normalizedPath);
  if (!hasAgentsMd && skillCount === 0) return;

  projects.push({
    name: path.basename(normalizedPath),
    path: normalizedPath,
    skillCount,
    hasClaudeMd: fs.existsSync(path.join(normalizedPath, "CLAUDE.md")),
    hasAgentsMd,
    hasSkills: skillCount > 0,
  });
}

async function scanCodexProjectRoot(
  root: string,
  seen: Set<string>,
  projects: ProjectInfo[],
  maxDepth = 3,
  currentDepth = 0,
): Promise<void> {
  if (currentDepth > maxDepth || !fs.existsSync(root)) return;

  await tryAddCodexProject(root, seen, projects);

  let entries: fs.Dirent[];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  const skipDirs = new Set([
    ".git",
    ".next",
    "node_modules",
    "dist",
    "build",
    "Library",
    "Applications",
    "Downloads",
  ]);

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || skipDirs.has(entry.name)) continue;
    await scanCodexProjectRoot(path.join(root, entry.name), seen, projects, maxDepth, currentDepth + 1);
  }
}

export async function discoverCodexProjects(): Promise<ProjectInfo[]> {
  const explicitRoots = splitEnvPaths(process.env.CODEX_PROJECT_SCAN_ROOTS);
  const defaultRoots = [
    process.cwd(),
    path.join(home, "work"),
    ...PROJECT_SCAN_ROOTS,
  ];
  const roots = [...new Set([...explicitRoots, ...defaultRoots].map((root) => path.resolve(root)))];
  const seen = new Set<string>();
  const projects: ProjectInfo[] = [];

  for (const root of roots) {
    await scanCodexProjectRoot(root, seen, projects);
  }

  return projects.sort((a, b) => {
    if (a.skillCount !== b.skillCount) return b.skillCount - a.skillCount;
    return a.name.localeCompare(b.name);
  });
}

async function findSkillMdFiles(root: string): Promise<string[]> {
  if (!fs.existsSync(root)) return [];
  const results: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        await walk(fullPath);
      } else if (entry.isFile() && (entry.name === "SKILL.md" || entry.name === "SKILL.md.disabled")) {
        results.push(fullPath);
      }
    }
  }

  await walk(root);
  return results;
}

async function scanPluginSkills(root: string): Promise<CodexSkillEntry[]> {
  const skillMdPaths = await findSkillMdFiles(root);
  const skills: CodexSkillEntry[] = [];

  for (const skillMdPath of skillMdPaths) {
    const skillDir = path.dirname(skillMdPath);
    const name = path.basename(skillDir);
    skills.push(await buildEntry(name, skillDir, skillMdPath, "plugin", "Codex 插件"));
  }

  return skills;
}

async function scanProjectSkills(projectRoots: string[]): Promise<CodexSkillEntry[]> {
  const skills: CodexSkillEntry[] = [];
  const seen = new Set<string>();

  for (const projectRoot of projectRoots) {
    if (!projectRoot || seen.has(projectRoot) || !fs.existsSync(projectRoot)) continue;
    seen.add(projectRoot);

    const codexSkillsDir = path.join(projectRoot, ".codex", "skills");
    const agentSkillsDir = path.join(projectRoot, ".agents", "skills");
    skills.push(...await scanDirectSkillDirs(codexSkillsDir, "project", `项目: ${path.basename(projectRoot)}`, { projectPath: projectRoot }));
    skills.push(...await scanDirectSkillDirs(agentSkillsDir, "project", `项目: ${path.basename(projectRoot)}`, { projectPath: projectRoot }));
  }

  return skills;
}

function sourceSummary(key: string, label: string, sourcePath: string, skills: CodexSkillEntry[]): CodexSourceSummary {
  return {
    key,
    label,
    path: sourcePath,
    exists: fs.existsSync(sourcePath),
    count: skills.length,
  };
}

async function getAgentsVersionStatus(agentsPath: string): Promise<CodexAgentsVersionStatus> {
  const gitCwd = path.dirname(agentsPath);
  const relativePath = path.basename(agentsPath);
  const base: CodexAgentsVersionStatus = {
    gitManaged: false,
    gitCwd,
    relativePath,
    totalCommits: 0,
    hasUncommittedChanges: false,
    diffPreview: "",
    commits: [],
  };

  try {
    await execFile("git", ["rev-parse", "--show-toplevel"], { cwd: gitCwd });
  } catch {
    return {
      ...base,
      error: "当前 ~/.codex 不是 git 仓库，所以 AGENTS.md 没有可查询的 git 历史。",
    };
  }

  try {
    const { stdout: statusOutput } = await execFile(
      "git",
      ["status", "--porcelain", "--", relativePath],
      { cwd: gitCwd },
    );
    const { stdout: logOutput } = await execFile(
      "git",
      ["log", "--format=%h|||%ai|||%an|||%s", "--no-merges", "-30", "--", relativePath],
      { cwd: gitCwd },
    );
    let diffPreview = "";
    if (statusOutput.trim()) {
      const { stdout } = await execFile(
        "git",
        ["diff", "--shortstat", "--", relativePath],
        { cwd: gitCwd },
      ).catch(() => ({ stdout: "" }));
      diffPreview = stdout.trim();
    }

    const commits = logOutput
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, date, author, message] = line.split("|||");
        return { sha, date, author, message };
      });

    return {
      ...base,
      gitManaged: true,
      totalCommits: commits.length,
      hasUncommittedChanges: statusOutput.trim().length > 0,
      diffPreview,
      commits,
    };
  } catch (err) {
    return {
      ...base,
      gitManaged: true,
      error: String(err),
    };
  }
}

function buildFindings(report: Omit<CodexScanReport, "findings">): CodexFinding[] {
  const findings: CodexFinding[] = [];
  const weakDescriptions = report.skills.filter((skill) => {
    const description = skill.description.trim();
    return !skill.hasDescription || description.length < 40 || !/(触发|Use when|必须|强制|when|适用)/i.test(description);
  });
  const longSkills = report.skills.filter((skill) => skill.lineCount > 240);

  if (!fs.existsSync(report.agentsPath)) {
    findings.push({
      severity: "risk",
      title: "缺少全局 AGENTS.md",
      detail: "Codex 的全局协作规则入口不存在，skill 触发和项目规则会少一个总入口。",
      examples: [{
        name: "全局 AGENTS.md",
        path: report.agentsPath,
        detail: "未找到这个文件",
      }],
    });
  }

  if (report.totals.weakDescriptions > 0) {
    findings.push({
      severity: "warning",
      title: "有 skill 的 description 偏弱",
      detail: "这些 skill 可能不容易被 Codex 自动触发，建议补强触发词、适用场景和不用的后果。",
      count: report.totals.weakDescriptions,
      examples: weakDescriptions.slice(0, 6).map((skill) => ({
        name: skill.name,
        path: skill.skillMdPath,
        detail: skill.hasDescription ? "description 过短或缺少触发条件" : "缺少 description 字段",
      })),
    });
  }

  if (report.totals.longSkills > 0) {
    findings.push({
      severity: "warning",
      title: "有 skill 过长",
      detail: "超过 240 行的 SKILL.md 可能把太多参考资料塞进入口，应考虑拆到 references 或 scripts。",
      count: report.totals.longSkills,
      examples: longSkills.slice(0, 6).map((skill) => ({
        name: skill.name,
        path: skill.skillMdPath,
        detail: `${skill.lineCount} 行`,
      })),
    });
  }

  if (report.totals.duplicateNames > 0) {
    findings.push({
      severity: "info",
      title: "存在同名 skill",
      detail: "同名不一定是错，但需要确认系统、插件、自建版本之间的优先级和职责边界。",
      count: report.totals.duplicateNames,
      examples: report.duplicates.slice(0, 6).map((duplicate) => ({
        name: duplicate.name,
        path: duplicate.entries.map((entry) => entry.sourceLabel).join(" / "),
        detail: `${duplicate.entries.length} 个来源`,
      })),
    });
  }

  if (report.totals.plugins > 0) {
    findings.push({
      severity: "info",
      title: "已识别 Codex 插件 skill",
      detail: "插件缓存已经能被单独盘点，下一步可以做插件来源、版本和自建 skill 冲突分析。",
      count: report.totals.plugins,
      examples: report.skills
        .filter((skill) => skill.source === "plugin")
        .slice(0, 6)
        .map((skill) => ({
          name: skill.name,
          path: skill.skillMdPath,
          detail: skill.sourceLabel,
        })),
    });
  }

  return findings;
}

function inferCodexDomains(skill: CodexSkillEntry): string[] {
  const text = `${skill.name}\n${skill.description}`.slice(0, 700);
  const domains = new Set<string>();

  if (/notion|Notion/.test(text)) domains.add("Notion");
  if (/obsidian|笔记|知识库|markdown/i.test(text)) domains.add("笔记");
  if (/写作|文章|标题|公众号|发布|wechat|x\/twitter/i.test(text)) domains.add("写作/发布");
  if (/image|图像|图片|封面|配图|视觉|生图/i.test(text)) domains.add("图像/设计");
  if (/lark|飞书|会议|日历|审批|Base|表格/i.test(text)) domains.add("飞书");
  if (/vercel|next\.js|react|frontend|deploy|部署|build/i.test(text)) domains.add("开发/部署");
  if (/security|安全|审计|权限|防护/i.test(text)) domains.add("安全");
  if (/task|任务|自动化|automation|workflow/i.test(text)) domains.add("任务/自动化");
  if (/concept|学习|课程|teacher|解释|方法论/i.test(text)) domains.add("学习/方法");
  if (skill.source === "system") domains.add("系统");
  if (skill.source === "plugin") domains.add("插件");

  return Array.from(domains);
}

export function codexReportToSkillEntries(report: CodexScanReport): SkillEntry[] {
  return report.skills.map((skill) => ({
    name: skill.source === "plugin" && skill.pluginName
      ? `codex-plugin/${skill.pluginName}/${skill.name}`
      : `codex-${skill.source}/${skill.name}`,
    path: skill.path,
    source: CODEX_SOURCE_TO_SKILL_SOURCE[skill.source],
    description: skill.description,
    lineCount: skill.lineCount,
    createdAt: skill.lastModified,
    lastModified: skill.lastModified,
    claudeMdRefs: [],
    tags: {
      domain: inferCodexDomains(skill),
      autoTagged: true,
      frequency: null,
    },
    dependencies: [],
    notes: skill.sourceLabel,
    belongsTo: skill.projectPath ?? "global",
    enabled: skill.enabled,
  }));
}

export async function scanCodexSkills(): Promise<CodexScanReport> {
  const userSkillsDir = path.join(codexHome, "skills");
  const systemSkillsDir = path.join(codexHome, "skills", ".system");
  const pluginsCacheDir = path.join(codexHome, "plugins", "cache");
  const agentsPath = path.join(codexHome, "AGENTS.md");
  const configPath = path.join(codexHome, "config.toml");
  const projectRoots = (await discoverCodexProjects()).map((project) => project.path);
  const agentsContent = fs.existsSync(agentsPath)
    ? await fsp.readFile(agentsPath, "utf-8").catch(() => "")
    : "";
  const agentsVersion = await getAgentsVersionStatus(agentsPath);

  const systemSkills = await scanDirectSkillDirs(systemSkillsDir, "system", "Codex 系统", { includeDotDirs: true });
  const userSkills = await scanDirectSkillDirs(userSkillsDir, "user", "Codex 自建");
  const pluginSkills = await scanPluginSkills(pluginsCacheDir);
  const sharedAgentSkills = await scanDirectSkillDirs(agentsSkillsDir, "agent-shared", "Agents 共享");
  const projectSkills = await scanProjectSkills(projectRoots);
  const skills = [...userSkills, ...systemSkills, ...pluginSkills, ...sharedAgentSkills, ...projectSkills];

  const duplicateMap = new Map<string, CodexSkillEntry[]>();
  for (const skill of skills) {
    const list = duplicateMap.get(skill.name) ?? [];
    list.push(skill);
    duplicateMap.set(skill.name, list);
  }
  const duplicates = Array.from(duplicateMap.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([name, entries]) => ({ name, entries }));

  const weakDescriptions = skills.filter((skill) => {
    const description = skill.description.trim();
    return !skill.hasDescription || description.length < 40 || !/(触发|Use when|必须|强制|when|适用)/i.test(description);
  });
  const longSkills = skills.filter((skill) => skill.lineCount > 240);

  const sources = [
    sourceSummary("user", "Codex 自建 skills", userSkillsDir, userSkills),
    sourceSummary("system", "Codex 系统 skills", systemSkillsDir, systemSkills),
    sourceSummary("plugin", "Codex 插件缓存", pluginsCacheDir, pluginSkills),
    sourceSummary("agent-shared", "Agents 共享 skills", agentsSkillsDir, sharedAgentSkills),
    sourceSummary("project", "项目级 Codex skills", projectRoots.join(", ") || "未配置 CODEX_PROJECT_SCAN_ROOTS", projectSkills),
  ];

  const baseReport: Omit<CodexScanReport, "findings"> = {
    scannedAt: new Date().toISOString(),
    codexHome,
    agentsPath,
    agentsContent,
    agentsVersion,
    configPath,
    totals: {
      skills: skills.length,
      enabled: skills.filter((skill) => skill.enabled).length,
      disabled: skills.filter((skill) => !skill.enabled).length,
      sources: sources.filter((source) => source.exists || source.count > 0).length,
      plugins: pluginSkills.length,
      longSkills: longSkills.length,
      weakDescriptions: weakDescriptions.length,
      duplicateNames: duplicates.length,
    },
    sources,
    skills: skills.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()),
    duplicates,
    recent: [...skills]
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 12),
  };

  return {
    ...baseReport,
    findings: buildFindings(baseReport),
  };
}
