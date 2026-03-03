"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSkillMutations } from "@/hooks/use-skill-mutations";
import type { SkillEntry, Frequency } from "@/lib/types";

interface SkillDetailSheetProps {
  skill: SkillEntry | null;
  allSkillNames: string[];
  allDomains?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export const DOMAIN_SUGGESTIONS = [
  "写作", "笔记", "安全", "网络", "任务", "图像",
  "发布", "分析", "设备", "工具", "视频", "投资",
];

export const FREQUENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "unset", label: "Unset" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "occasional", label: "Occasional" },
  { value: "rare", label: "Rare" },
];

export const SOURCE_LABELS: Record<string, string> = {
  "self-built": "自建",
  baoyu: "宝玉系列",
  "plugin-official": "官方插件",
  "plugin-community": "社区插件",
};

export function SkillDetailSheet({
  skill,
  allSkillNames,
  allDomains,
  open,
  onOpenChange,
  onUpdated,
}: SkillDetailSheetProps) {
  // Local editable state
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [frequency, setFrequency] = useState<string>("unset");
  const [deps, setDeps] = useState<string[]>([]);
  const [depInput, setDepInput] = useState("");
  const [notes, setNotes] = useState("");
  const [depSuggestions, setDepSuggestions] = useState<string[]>([]);
  const [domainSuggestions, setDomainSuggestions] = useState<string[]>([]);
  const [showDepSuggestions, setShowDepSuggestions] = useState(false);
  const [showDomainSuggestions, setShowDomainSuggestions] = useState(false);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [rawContentPath, setRawContentPath] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);

  // Sync from prop
  useEffect(() => {
    if (skill) {
      setDomains(skill.tags.domain);
      setFrequency(skill.tags.frequency ?? "unset");
      setDeps(skill.dependencies);
      setNotes(skill.notes);
      setDomainInput("");
      setDepInput("");
      setRawContent(null);
      setRawContentPath(null);
      setRawError(null);
      setRawLoading(false);
    }
  }, [skill]);

  const { patchTags, putDeps, debouncedPatchNotes } =
    useSkillMutations({ skillName: skill?.name ?? null, onUpdated });

  // Handlers
  function addDomain(d: string) {
    const trimmed = d.trim();
    if (!trimmed || domains.includes(trimmed)) return;
    const next = [...domains, trimmed];
    setDomains(next);
    setDomainInput("");
    setShowDomainSuggestions(false);
    patchTags({ domain: next });
  }

  function removeDomain(d: string) {
    const next = domains.filter((x) => x !== d);
    setDomains(next);
    patchTags({ domain: next });
  }

  // Merge static suggestions with actual existing domains from all skills
  const domainPool = useMemo(() => {
    const set = new Set(DOMAIN_SUGGESTIONS);
    if (allDomains) for (const d of allDomains) set.add(d);
    return Array.from(set).sort();
  }, [allDomains]);

  function handleDomainInputChange(val: string) {
    setDomainInput(val);
    const filtered = domainPool.filter(
      (s) => (!val.trim() || s.includes(val)) && !domains.includes(s),
    );
    setDomainSuggestions(filtered);
    setShowDomainSuggestions(filtered.length > 0);
  }

  function handleDomainKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDomain(domainInput);
    }
  }

  function addDep(d: string) {
    const trimmed = d.trim();
    if (!trimmed || deps.includes(trimmed)) return;
    const next = [...deps, trimmed];
    setDeps(next);
    setDepInput("");
    setShowDepSuggestions(false);
    putDeps(next);
  }

  function removeDep(d: string) {
    const next = deps.filter((x) => x !== d);
    setDeps(next);
    putDeps(next);
  }

  function handleDepInputChange(val: string) {
    setDepInput(val);
    if (val.trim()) {
      const filtered = allSkillNames.filter(
        (s) =>
          s.toLowerCase().includes(val.toLowerCase()) &&
          !deps.includes(s) &&
          s !== skill?.name,
      );
      setDepSuggestions(filtered.slice(0, 8));
      setShowDepSuggestions(filtered.length > 0);
    } else {
      setShowDepSuggestions(false);
    }
  }

  function handleDepKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDep(depInput);
    }
  }

  function handleFrequencyChange(value: string) {
    setFrequency(value);
    patchTags({
      frequency: value === "unset" ? null : (value as Frequency),
    });
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    debouncedPatchNotes(value);
  }

  async function handleLoadRawContent() {
    if (!skill || rawLoading || rawContent) return;

    setRawLoading(true);
    setRawError(null);

    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(skill.name)}/content`,
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        content: string;
        path: string;
      };
      setRawContent(data.content);
      setRawContentPath(data.path);
    } catch (err) {
      setRawError(String(err));
    } finally {
      setRawLoading(false);
    }
  }

  if (!skill) return null;

  const isRouted = skill.claudeMdRefs.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-lg">
            {skill.name}
            {isRouted ? (
              <span className="text-green-600 dark:text-green-400" title="Routed">
                &#10003;
              </span>
            ) : (
              <span className="text-red-500 dark:text-red-400" title="Orphan">
                &#10007;
              </span>
            )}
          </SheetTitle>
          <SheetDescription>{skill.description || "No description"}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-8">
          {/* Read-only info */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Info</h3>
            <div className="grid grid-cols-2 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">Source</span>
              <span>{SOURCE_LABELS[skill.source] ?? skill.source}</span>
              <span className="text-muted-foreground">Lines</span>
              <span>{skill.lineCount}</span>
              <span className="text-muted-foreground">Modified</span>
              <span>{new Date(skill.lastModified).toLocaleDateString()}</span>
              <span className="text-muted-foreground">Path</span>
              <span className="break-all font-mono text-xs">{skill.path}</span>
            </div>
          </section>

          {/* CLAUDE.md References */}
          {skill.claudeMdRefs.length > 0 && (
            <>
              <Separator />
              <section className="space-y-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  CLAUDE.md References
                </h3>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="px-3 py-1.5 text-left font-medium">Table</th>
                        <th className="px-3 py-1.5 text-left font-medium">Trigger</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skill.claudeMdRefs.map((ref, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-1.5">{ref.table}</td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {ref.trigger}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          <Separator />

          {/* Editable: Domain Tags */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Domain Tags
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {domains.map((d) => (
                <Badge key={d} variant="secondary" className="gap-1 pr-1">
                  {d}
                  <button
                    onClick={() => removeDomain(d)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remove ${d}`}
                  >
                    <span className="text-xs">&times;</span>
                  </button>
                </Badge>
              ))}
            </div>
            <div className="relative">
              <Input
                placeholder="Add domain tag..."
                value={domainInput}
                onChange={(e) => handleDomainInputChange(e.target.value)}
                onKeyDown={handleDomainKeyDown}
                onBlur={() =>
                  setTimeout(() => setShowDomainSuggestions(false), 150)
                }
                onFocus={() => {
                  const filtered = domainPool.filter(
                    (s) => (!domainInput.trim() || s.includes(domainInput)) && !domains.includes(s),
                  );
                  setDomainSuggestions(filtered);
                  setShowDomainSuggestions(filtered.length > 0);
                }}
                className="h-8 text-sm"
              />
              {showDomainSuggestions && domainSuggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md">
                  {domainSuggestions.map((s) => (
                    <button
                      key={s}
                      className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addDomain(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Editable: Frequency */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Frequency
            </h3>
            <Select value={frequency} onValueChange={handleFrequencyChange}>
              <SelectTrigger className="h-8 w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>

          {/* Editable: Dependencies */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Dependencies
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {deps.map((d) => (
                <Badge key={d} variant="outline" className="gap-1 pr-1">
                  {d}
                  <button
                    onClick={() => removeDep(d)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    aria-label={`Remove ${d}`}
                  >
                    <span className="text-xs">&times;</span>
                  </button>
                </Badge>
              ))}
              {deps.length === 0 && (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </div>
            <div className="relative">
              <Input
                placeholder="Add dependency..."
                value={depInput}
                onChange={(e) => handleDepInputChange(e.target.value)}
                onKeyDown={handleDepKeyDown}
                onBlur={() =>
                  setTimeout(() => setShowDepSuggestions(false), 150)
                }
                onFocus={() => {
                  if (depInput.trim()) {
                    const filtered = allSkillNames.filter(
                      (s) =>
                        s.toLowerCase().includes(depInput.toLowerCase()) &&
                        !deps.includes(s) &&
                        s !== skill?.name,
                    );
                    setDepSuggestions(filtered.slice(0, 8));
                    setShowDepSuggestions(filtered.length > 0);
                  }
                }}
                className="h-8 text-sm"
              />
              {showDepSuggestions && depSuggestions.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                  {depSuggestions.map((s) => (
                    <button
                      key={s}
                      className="w-full rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addDep(s);
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Editable: Notes */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Notes
            </h3>
            <Textarea
              placeholder="Add notes about this skill..."
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              className="min-h-[80px] text-sm"
            />
          </section>

          <Separator />

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                SKILL.md 原文
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleLoadRawContent}
                disabled={rawLoading || rawContent !== null}
              >
                {rawLoading ? "加载中..." : rawContent ? "已加载" : "查看原文"}
              </Button>
            </div>

            {rawError && (
              <p className="text-xs text-red-500">{rawError}</p>
            )}

            {rawContentPath && (
              <p className="break-all font-mono text-xs text-muted-foreground">
                {rawContentPath}
              </p>
            )}

            {rawContent && (
              <pre className="max-h-[360px] overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-5">
                <code>{rawContent}</code>
              </pre>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
