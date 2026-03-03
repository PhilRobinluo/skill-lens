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
import Markdown from "react-markdown";
import { useSkillMutations } from "@/hooks/use-skill-mutations";
import { cleanDescriptionFull, skillDisplayName } from "@/lib/utils";
import type { SkillEntry } from "@/lib/types";

interface SkillDetailSheetProps {
  skill: SkillEntry | null;
  allSkillNames: string[];
  allDomains?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

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
  const [notes, setNotes] = useState("");
  const [domainSuggestions, setDomainSuggestions] = useState<string[]>([]);
  const [showDomainSuggestions, setShowDomainSuggestions] = useState(false);
  const [rawContent, setRawContent] = useState<string | null>(null);
  const [rawContentPath, setRawContentPath] = useState<string | null>(null);
  const [rawLoading, setRawLoading] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);

  // Sync from prop
  useEffect(() => {
    if (skill) {
      setDomains(skill.tags.domain.filter((d) => d !== "未分类"));
      setNotes(skill.notes);
      setDomainInput("");
      setRawContent(null);
      setRawContentPath(null);
      setRawError(null);
      setRawLoading(false);
    }
  }, [skill]);

  const { patchTags, debouncedPatchNotes } =
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

  // All existing domains from the registry as suggestions
  const domainPool = useMemo(() => {
    return allDomains ? [...allDomains].sort() : [];
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
            {skillDisplayName(skill.name)}
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
          <SheetDescription asChild>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground">
              <Markdown>{cleanDescriptionFull(skill.description) || "无描述"}</Markdown>
            </div>
          </SheetDescription>
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
              <span className="text-muted-foreground">Created</span>
              <span>{skill.createdAt ? new Date(skill.createdAt).toLocaleDateString() : "—"}</span>
              <span className="text-muted-foreground">Modified</span>
              <span>{new Date(skill.lastModified).toLocaleDateString()}</span>
              <span className="text-muted-foreground">Path</span>
              <span className="flex items-center gap-1.5 break-all font-mono text-xs">
                <span className="flex-1">{skill.path}</span>
                <button
                  type="button"
                  onClick={() => {
                    fetch(`/api/skills/${encodeURIComponent(skill.name)}/open`, {
                      method: "POST",
                    });
                  }}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                  title="在 Finder 中打开"
                >
                  打开
                </button>
              </span>
            </div>
          </section>

          {/* CLAUDE.md References — always visible */}
          <Separator />
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              CLAUDE.md 路由
            </h3>
            {skill.claudeMdRefs.length > 0 ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-3 py-1.5 text-left font-medium">路由表</th>
                      <th className="px-3 py-1.5 text-left font-medium">触发词</th>
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
            ) : (
              <p className="text-sm text-muted-foreground/60 italic">
                未被 CLAUDE.md 路由表引用
              </p>
            )}
          </section>

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
