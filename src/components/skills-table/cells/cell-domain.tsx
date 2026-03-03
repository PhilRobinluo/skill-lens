"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SkillEntry } from "@/lib/types";

interface CellDomainProps {
  skill: SkillEntry;
  allDomains?: string[];
  onChange: (domains: string[]) => void;
}

export function CellDomain({ skill, allDomains, onChange }: CellDomainProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const domains = skill.tags.domain;

  // All existing domains from the registry as suggestions
  const allSuggestions = useMemo(() => {
    return allDomains ? [...allDomains].sort() : [];
  }, [allDomains]);

  function addDomain(d: string) {
    const trimmed = d.trim();
    if (!trimmed || domains.includes(trimmed)) return;
    const next = [...domains, trimmed];
    onChange(next);
    setInput("");
  }

  function removeDomain(d: string) {
    onChange(domains.filter((x) => x !== d));
  }

  const filtered = input.trim()
    ? allSuggestions.filter((s) => s.includes(input) && !domains.includes(s))
    : allSuggestions.filter((s) => !domains.includes(s));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex min-h-[24px] flex-wrap gap-1 rounded px-1 py-0.5 text-left hover:bg-accent/50"
        >
          {domains.length > 0 ? (
            domains.map((d) => (
              <Badge key={d} variant="secondary" className="text-[10px]">
                {d}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-muted-foreground">添加标签...</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex flex-wrap gap-1 mb-2">
          {domains.map((d) => (
            <Badge key={d} variant="secondary" className="gap-1 pr-1 text-[10px]">
              {d}
              <button
                onClick={() => removeDomain(d)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <span className="text-xs">&times;</span>
              </button>
            </Badge>
          ))}
        </div>
        <Input
          placeholder="输入或选择标签..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDomain(input);
            }
          }}
          className="h-7 text-xs mb-1"
          autoFocus
        />
        {filtered.length > 0 && (
          <div className="max-h-32 overflow-y-auto">
            {filtered.map((s) => (
              <button
                key={s}
                className="w-full rounded-sm px-2 py-1 text-left text-xs hover:bg-accent"
                onClick={() => addDomain(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
