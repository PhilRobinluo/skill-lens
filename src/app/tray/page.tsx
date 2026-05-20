"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Library,
  Pencil,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import type { DashboardStats, SkillEntry, SkillRuntime } from "@/lib/types";

interface SkillsResponse {
  skills?: SkillEntry[];
  total?: number;
}

interface SkillContentResponse {
  content?: string;
  lineCount?: number;
  error?: string;
}

interface ElectronBridge {
  copyToClipboard: (text: string) => Promise<void>;
  openMainWindow: () => Promise<void>;
  setTrayExpanded?: (expanded: boolean) => Promise<void>;
}

type WindowWithElectron = Window & {
  electronAPI?: ElectronBridge;
};

const RUNTIMES: Array<{ value: SkillRuntime; label: string }> = [
  { value: "codex", label: "Codex" },
  { value: "claude", label: "Claude" },
];

function runtimeLabel(runtime: SkillRuntime) {
  return runtime === "codex" ? "Codex" : "Claude";
}

export default function TrayPage() {
  const [runtime, setRuntime] = useState<SkillRuntime>("codex");
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [search, setSearch] = useState("");
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [skillContent, setSkillContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);

  useEffect(() => {
    const nav = document.querySelector("nav");
    const main = document.querySelector("main");
    const previousNavDisplay = nav instanceof HTMLElement ? nav.style.display : "";
    const previousMainMinHeight = main instanceof HTMLElement ? main.style.minHeight : "";

    if (nav instanceof HTMLElement) nav.style.display = "none";
    if (main instanceof HTMLElement) main.style.minHeight = "100vh";

    return () => {
      if (nav instanceof HTMLElement) nav.style.display = previousNavDisplay;
      if (main instanceof HTMLElement) main.style.minHeight = previousMainMinHeight;
    };
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("skill-lens-tray-runtime");
    if (saved === "claude" || saved === "codex") setRuntime(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("skill-lens-tray-runtime", runtime);
  }, [runtime]);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const params = new URLSearchParams({ runtime });
      const [skillsRes, statsRes] = await Promise.all([
        fetch(`/api/skills?${params.toString()}`),
        fetch(`/api/stats?${params.toString()}`),
      ]);

      if (!skillsRes.ok) throw new Error(`skills ${skillsRes.status}`);
      if (!statsRes.ok) throw new Error(`stats ${statsRes.status}`);

      const skillsData = (await skillsRes.json()) as SkillsResponse;
      const statsData = (await statsRes.json()) as DashboardStats;
      setSkills(skillsData.skills ?? []);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [runtime]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setSelectedSkill(null);
    setSkillContent("");
  }, [runtime]);

  useEffect(() => {
    document.title = selectedSkill ? "skill-lens-tray-expanded" : "skill-lens-tray-collapsed";

    const electronAPI = (window as WindowWithElectron).electronAPI;
    electronAPI?.setTrayExpanded?.(Boolean(selectedSkill));
  }, [selectedSkill]);

  useEffect(() => {
    return () => {
      document.title = "skill-lens-tray-collapsed";
      const electronAPI = (window as WindowWithElectron).electronAPI;
      electronAPI?.setTrayExpanded?.(false);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadContent(skill: SkillEntry) {
      setContentLoading(true);
      setSkillContent("");
      try {
        const params = new URLSearchParams({ runtime });
        const response = await fetch(
          `/api/skills/${encodeURIComponent(skill.name)}/content?${params.toString()}`,
        );
        const data = (await response.json()) as SkillContentResponse;
        if (!cancelled) {
          setSkillContent(response.ok ? data.content ?? "" : data.error ?? "无法读取 SKILL.md");
        }
      } catch (err) {
        if (!cancelled) setSkillContent(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setContentLoading(false);
      }
    }

    if (selectedSkill) loadContent(selectedSkill);

    return () => {
      cancelled = true;
    };
  }, [runtime, selectedSkill]);

  const copyName = async (name: string) => {
    try {
      const electronAPI = (window as WindowWithElectron).electronAPI;
      if (electronAPI) {
        await electronAPI.copyToClipboard(name);
      } else {
        await navigator.clipboard.writeText(name);
      }
      setCopiedName(name);
      setTimeout(() => setCopiedName(null), 1200);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const openMainWindow = () => {
    const electronAPI = (window as WindowWithElectron).electronAPI;
    if (electronAPI) {
      electronAPI.openMainWindow();
    } else {
      window.open("/", "_blank");
    }
  };

  const openSkill = async (skill: SkillEntry, file?: string) => {
    try {
      await fetch(`/api/skills/${encodeURIComponent(skill.name)}/open?runtime=${runtime}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: file ? JSON.stringify({ file }) : undefined,
      });
    } catch (err) {
      console.error("Open skill failed:", err);
    }
  };

  const visibleSkills = useMemo(() => {
    const query = search.trim().toLowerCase();
    const pool = query
      ? skills.filter((skill) => {
          const blob = [
            skill.name,
            skill.description,
            skill.source,
            skill.tags.domain.join(" "),
            skill.tags.frequency ?? "",
          ].join(" ").toLowerCase();
          return blob.includes(query);
        })
      : skills;

    return pool.slice(0, 12);
  }, [skills, search]);

  const topDomains = useMemo(() => {
    const distribution = stats?.domainDistribution ?? {};
    return Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [stats]);

  const routedLabel = runtime === "codex" ? "可见" : "路由";
  const total = stats?.totalSkills ?? skills.length;
  const routed = stats?.routedSkills ?? skills.filter((skill) => skill.enabled).length;
  const disabled = stats?.disabledSkills ?? skills.filter((skill) => !skill.enabled).length;
  const untagged = stats?.domainDistribution?.["未分类"] ?? 0;

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
        正在读取 {runtimeLabel(runtime)} 技能...
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-50">
      <section className="flex h-screen w-[420px] flex-none flex-col border-r border-zinc-800/70">
        <header className="flex-none border-b border-zinc-800/70 px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-300" />
                <h1 className="text-sm font-semibold tracking-normal">Skill Lens</h1>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">菜单栏快速面板</p>
            </div>

            <div className="flex rounded-md border border-zinc-800 bg-zinc-900 p-0.5">
              {RUNTIMES.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setRuntime(option.value)}
                  className={`h-7 min-w-16 rounded px-2 text-xs transition-colors ${
                    runtime === option.value
                      ? "bg-zinc-100 text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <Metric label="总数" value={total} />
            <Metric label={routedLabel} value={routed} tone="cyan" />
            <Metric label="未分类" value={untagged} tone="amber" />
            <Metric label="禁用" value={disabled} tone="rose" />
          </div>
        </header>

        <section className="flex-none border-b border-zinc-800/70 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder={`搜索 ${runtimeLabel(runtime)} skill...`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-md border border-zinc-800 bg-zinc-900 pl-8 pr-3 text-sm text-zinc-100 outline-none transition focus:border-cyan-500/70"
              autoFocus
            />
          </div>
        </section>

        <main className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {error ? (
            <div className="mx-2 rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">
              读取失败：{error}
            </div>
          ) : (
            <>
              {topDomains.length > 0 && !search.trim() && (
                <div className="mb-2 px-2">
                  <div className="mb-1.5 text-xs text-zinc-500">高频领域</div>
                  <div className="flex flex-wrap gap-1.5">
                    {topDomains.map(([domain, count]) => (
                      <button
                        key={domain}
                        onClick={() => setSearch(domain === "未分类" ? "" : domain)}
                        className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:border-cyan-500/60 hover:text-cyan-100"
                      >
                        {domain}
                        <span className="ml-1 text-zinc-600">{count}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                {visibleSkills.map((skill) => (
                  <SkillRow
                    key={`${skill.source}:${skill.name}:${skill.path}`}
                    skill={skill}
                    copied={copiedName === skill.name}
                    selected={selectedSkill?.path === skill.path}
                    onSelect={() => setSelectedSkill(skill)}
                    onOpenFolder={() => openSkill(skill)}
                    onCopy={() => copyName(skill.name)}
                  />
                ))}
              </div>

              {visibleSkills.length === 0 && (
                <div className="flex h-40 flex-col items-center justify-center text-center text-xs text-zinc-600">
                  <Library className="mb-2 h-5 w-5" />
                  没有匹配的 Skill
                </div>
              )}
            </>
          )}
        </main>

        <footer className="flex flex-none items-center justify-between border-t border-zinc-800/70 px-3 py-2">
          <button
            onClick={fetchData}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            刷新
          </button>
          <button
            onClick={openMainWindow}
            className="flex h-8 items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 text-xs font-medium text-zinc-950 hover:bg-cyan-100"
          >
            打开完整面板
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        </footer>
      </section>

      {selectedSkill && (
        <SkillDetailPane
          skill={selectedSkill}
          runtime={runtime}
          content={skillContent}
          copied={copiedName === selectedSkill.name}
          loading={contentLoading}
          onClose={() => setSelectedSkill(null)}
          onCopy={() => copyName(selectedSkill.name)}
          onOpenFile={() => openSkill(selectedSkill, "SKILL.md")}
          onOpenFolder={() => openSkill(selectedSkill)}
          onOpenMainWindow={openMainWindow}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: number;
  tone?: "zinc" | "cyan" | "amber" | "rose";
}) {
  const toneClass = {
    zinc: "text-zinc-100",
    cyan: "text-cyan-200",
    amber: "text-amber-200",
    rose: "text-rose-200",
  }[tone];

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1.5">
      <div className={`text-base font-semibold leading-none ${toneClass}`}>{value}</div>
      <div className="mt-1 text-[11px] text-zinc-500">{label}</div>
    </div>
  );
}

function SkillRow({
  skill,
  copied,
  selected,
  onSelect,
  onOpenFolder,
  onCopy,
}: {
  skill: SkillEntry;
  copied: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpenFolder: () => void;
  onCopy: () => void;
}) {
  const domains = skill.tags.domain.slice(0, 2);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect();
      }}
      className={`group flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-zinc-900 ${
        selected ? "bg-zinc-900 ring-1 ring-cyan-500/50" : ""
      }`}
    >
      <div className={`mt-1 h-2 w-2 flex-none rounded-full ${skill.enabled ? "bg-emerald-400" : "bg-zinc-700"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className={`truncate text-sm font-medium ${skill.enabled ? "text-zinc-100" : "text-zinc-500"}`}>
            {skill.name}
          </div>
          <span className="flex-none rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">
            {skill.source.replace("codex-", "")}
          </span>
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500">
          {skill.description || "暂无描述"}
        </p>
        {domains.length > 0 && (
          <div className="mt-1 flex gap-1">
            {domains.map((domain) => (
              <span key={domain} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                {domain}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mt-0.5 flex flex-none gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          onClick={(event) => {
            event.stopPropagation();
            onOpenFolder();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
          title="在 Finder 中显示"
        >
          <FolderOpen className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onCopy();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
          title="复制 Skill 名称"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

function SkillDetailPane({
  skill,
  runtime,
  content,
  copied,
  loading,
  onClose,
  onCopy,
  onOpenFile,
  onOpenFolder,
  onOpenMainWindow,
}: {
  skill: SkillEntry;
  runtime: SkillRuntime;
  content: string;
  copied: boolean;
  loading: boolean;
  onClose: () => void;
  onCopy: () => void;
  onOpenFile: () => void;
  onOpenFolder: () => void;
  onOpenMainWindow: () => void;
}) {
  const domains = skill.tags.domain;
  const preview = content.trim().slice(0, 2200);

  return (
      <aside className="flex h-screen w-[340px] flex-none flex-col bg-zinc-950">
        <header className="flex-none border-b border-zinc-800/70 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-medium text-zinc-500">Skill 详情</div>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100"
              title="关闭"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-start gap-2">
            <div className={`mt-1.5 h-2.5 w-2.5 flex-none rounded-full ${skill.enabled ? "bg-emerald-400" : "bg-zinc-700"}`} />
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-base font-semibold leading-snug text-zinc-50">{skill.name}</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">{skill.description || "暂无描述"}</p>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <DetailPill label="来源" value={skill.source.replace("codex-", "")} />
            <DetailPill label="行数" value={`${skill.lineCount || "-"} 行`} />
            <DetailPill label="状态" value={skill.enabled ? "启用" : "禁用"} />
            <DetailPill label="运行时" value={runtimeLabel(runtime)} />
          </div>

          {domains.length > 0 && (
            <section className="mb-3">
              <div className="mb-1.5 text-xs text-zinc-500">领域标签</div>
              <div className="flex flex-wrap gap-1.5">
                {domains.map((domain) => (
                  <span key={domain} className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-xs text-zinc-300">
                    {domain}
                  </span>
                ))}
              </div>
            </section>
          )}

          <section className="mb-3">
            <div className="mb-1.5 text-xs text-zinc-500">位置</div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-[11px] leading-5 text-zinc-400">
              {skill.path}
            </div>
          </section>

          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
              <FileText className="h-3.5 w-3.5" />
              SKILL.md 预览
            </div>
            <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-zinc-800 bg-zinc-900/80 p-3 text-[11px] leading-5 text-zinc-300">
              {loading ? "正在读取..." : preview || "没有可预览内容"}
            </pre>
          </section>
        </main>

        <footer className="grid flex-none grid-cols-4 gap-1.5 border-t border-zinc-800/70 px-3 py-2">
          <button
            onClick={onOpenFile}
            className="flex h-8 items-center justify-center gap-1 rounded-md bg-zinc-100 text-xs font-medium text-zinc-950 hover:bg-cyan-100"
            title="用编辑器打开 SKILL.md"
          >
            <Pencil className="h-3.5 w-3.5" />
            编辑
          </button>
          <button
            onClick={onOpenFolder}
            className="flex h-8 items-center justify-center gap-1 rounded-md px-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            title="在 Finder 中显示"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            文件
          </button>
          <button
            onClick={onCopy}
            className="flex h-8 items-center justify-center gap-1 rounded-md px-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            title="复制 Skill 名称"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
            复制
          </button>
          <button
            onClick={onOpenMainWindow}
            className="flex h-8 items-center justify-center gap-1 rounded-md px-1 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
            title="打开完整面板"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            完整
          </button>
        </footer>
      </aside>
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/80 px-2.5 py-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-xs font-medium text-zinc-200">{value}</div>
    </div>
  );
}
