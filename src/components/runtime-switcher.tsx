"use client";

import { Button } from "@/components/ui/button";
import { useScope } from "@/contexts/scope-context";
import type { SkillRuntime } from "@/lib/types";

const OPTIONS: Array<{ value: SkillRuntime; label: string }> = [
  { value: "claude", label: "Claude" },
  { value: "codex", label: "Codex" },
];

export function RuntimeSwitcher() {
  const { runtime, setRuntime } = useScope();

  return (
    <div className="flex rounded-md border bg-background p-0.5">
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="xs"
          variant={runtime === option.value ? "default" : "ghost"}
          className="h-7 gap-1.5 px-2"
          onClick={() => setRuntime(option.value)}
        >
          {option.value === "claude" ? <ClaudeMark /> : <CodexMark />}
          {option.label}
        </Button>
      ))}
    </div>
  );
}

function ClaudeMark() {
  return (
    <span
      className="relative inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#D97757]/15 text-[#D97757]"
      aria-hidden="true"
    >
      <span className="absolute h-0.5 w-3 rounded-full bg-current" />
      <span className="absolute h-0.5 w-3 rotate-60 rounded-full bg-current" />
      <span className="absolute h-0.5 w-3 -rotate-60 rounded-full bg-current" />
    </span>
  );
}

function CodexMark() {
  return (
    <span
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-zinc-950 text-[9px] font-semibold leading-none text-white dark:bg-white dark:text-zinc-950"
      aria-hidden="true"
    >
      C
    </span>
  );
}
