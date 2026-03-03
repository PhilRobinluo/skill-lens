"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
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
import type { SkillEntry, Frequency } from "@/lib/types";

interface SkillDetailSheetProps {
  skill: SkillEntry | null;
  allSkillNames: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

const DOMAIN_SUGGESTIONS = [
  "写作", "笔记", "安全", "网络", "任务", "图像",
  "发布", "分析", "设备", "工具", "视频", "投资",
];

const FREQUENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "unset", label: "Unset" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "occasional", label: "Occasional" },
  { value: "rare", label: "Rare" },
];

const SOURCE_LABELS: Record<string, string> = {
  "self-built": "Self-built",
  baoyu: "Baoyu",
  "plugin-official": "Plugin (Official)",
  "plugin-community": "Plugin (Community)",
};

function useDebounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number,
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const debounced = useCallback(
    (...args: unknown[]) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => fnRef.current(...args), delay);
    },
    [delay],
  ) as T;

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return debounced;
}

export function SkillDetailSheet({
  skill,
  allSkillNames,
  open,
  onOpenChange,
  onUpdated,
}: SkillDetailSheetProps) {
  // Local editable state
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [frequency, setFrequency] = useState<string>("unset");
  const [pipeline, setPipeline] = useState("");
  const [deps, setDeps] = useState<string[]>([]);
  const [depInput, setDepInput] = useState("");
  const [notes, setNotes] = useState("");
  const [depSuggestions, setDepSuggestions] = useState<string[]>([]);
  const [domainSuggestions, setDomainSuggestions] = useState<string[]>([]);
  const [showDepSuggestions, setShowDepSuggestions] = useState(false);
  const [showDomainSuggestions, setShowDomainSuggestions] = useState(false);

  // Sync from prop
  useEffect(() => {
    if (skill) {
      setDomains(skill.tags.domain);
      setFrequency(skill.tags.frequency ?? "unset");
      setPipeline(skill.tags.pipeline ?? "");
      setDeps(skill.dependencies);
      setNotes(skill.notes);
      setDomainInput("");
      setDepInput("");
    }
  }, [skill]);

  // API helpers
  const patchTags = useCallback(
    async (body: Record<string, unknown>) => {
      if (!skill) return;
      await fetch(`/api/skills/${encodeURIComponent(skill.name)}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onUpdated();
    },
    [skill, onUpdated],
  );

  const putDeps = useCallback(
    async (dependencies: string[]) => {
      if (!skill) return;
      await fetch(`/api/skills/${encodeURIComponent(skill.name)}/deps`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dependencies }),
      });
      onUpdated();
    },
    [skill, onUpdated],
  );

  const patchNotes = useCallback(
    async (notesValue: string) => {
      if (!skill) return;
      await fetch(`/api/skills/${encodeURIComponent(skill.name)}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue }),
      });
      onUpdated();
    },
    [skill, onUpdated],
  );

  const debouncedPatchNotes = useDebounce(
    (value: unknown) => patchNotes(value as string),
    800,
  );

  const debouncedPatchPipeline = useDebounce(
    (value: unknown) => patchTags({ pipeline: value as string }),
    800,
  );

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

  function handleDomainInputChange(val: string) {
    setDomainInput(val);
    if (val.trim()) {
      const filtered = DOMAIN_SUGGESTIONS.filter(
        (s) => s.includes(val) && !domains.includes(s),
      );
      setDomainSuggestions(filtered);
      setShowDomainSuggestions(filtered.length > 0);
    } else {
      setShowDomainSuggestions(false);
    }
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

  function handlePipelineChange(value: string) {
    setPipeline(value);
    debouncedPatchPipeline(value || null);
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    debouncedPatchNotes(value);
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
                  if (domainInput.trim()) {
                    const filtered = DOMAIN_SUGGESTIONS.filter(
                      (s) => s.includes(domainInput) && !domains.includes(s),
                    );
                    setShowDomainSuggestions(filtered.length > 0);
                    setDomainSuggestions(filtered);
                  }
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

          {/* Editable: Pipeline */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Pipeline
            </h3>
            <Input
              placeholder="Pipeline name..."
              value={pipeline}
              onChange={(e) => handlePipelineChange(e.target.value)}
              className="h-8 text-sm"
            />
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
