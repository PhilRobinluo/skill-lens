"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SkillEntry } from "@/lib/types";

interface SkillCardProps {
  skill: SkillEntry;
  onClick: () => void;
}

const SOURCE_STYLES: Record<string, { label: string; className: string }> = {
  "self-built": {
    label: "self-built",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  baoyu: {
    label: "baoyu",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  },
  "plugin-official": {
    label: "official",
    className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  "plugin-community": {
    label: "community",
    className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  },
};

const FREQUENCY_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  occasional: "Occasional",
  rare: "Rare",
};

export function SkillCard({ skill, onClick }: SkillCardProps) {
  const sourceStyle = SOURCE_STYLES[skill.source] ?? {
    label: skill.source,
    className: "",
  };
  const isRouted = skill.claudeMdRefs.length > 0;

  return (
    <Card
      className="cursor-pointer transition-colors hover:bg-accent/50"
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-tight">
            {skill.name}
          </CardTitle>
          <span
            className="shrink-0 text-base"
            title={isRouted ? "Routed in CLAUDE.md" : "Orphan — not referenced"}
          >
            {isRouted ? (
              <span className="text-green-600 dark:text-green-400">&#10003;</span>
            ) : (
              <span className="text-red-500 dark:text-red-400">&#10007;</span>
            )}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Description */}
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {skill.description || "No description"}
        </p>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Source badge */}
          <Badge
            variant="outline"
            className={`text-[10px] ${sourceStyle.className}`}
          >
            {sourceStyle.label}
          </Badge>

          {/* Domain tags */}
          {skill.tags.domain.map((d) => (
            <Badge key={d} variant="secondary" className="text-[10px]">
              {d}
            </Badge>
          ))}

          {/* Frequency */}
          {skill.tags.frequency && (
            <Badge variant="outline" className="text-[10px]">
              {FREQUENCY_LABELS[skill.tags.frequency] ?? skill.tags.frequency}
            </Badge>
          )}

          {/* Dependencies count */}
          {skill.dependencies.length > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {skill.dependencies.length} dep{skill.dependencies.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
