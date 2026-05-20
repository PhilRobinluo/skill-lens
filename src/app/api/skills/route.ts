import fs from "node:fs";
import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";
import { filterByScope } from "@/lib/utils";
import type { SkillEntry } from "@/lib/types";
import { codexReportToSkillEntries, scanCodexSkills } from "@/lib/codex-scanner";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url);

    // Extract filter params
    const scope = url.searchParams.get("scope");
    const runtime = url.searchParams.get("runtime") ?? "claude";
    const domain = url.searchParams.get("domain");
    const source = url.searchParams.get("source");
    const frequency = url.searchParams.get("frequency");
    const q = url.searchParams.get("q")?.toLowerCase();

    let skills: SkillEntry[];
    if (runtime === "codex") {
      const report = await scanCodexSkills();
      skills = filterByScope(codexReportToSkillEntries(report), scope);
    } else {
      await ensureInitialized();
      const registry = await readRegistry();
      // Filter out skills whose directories no longer exist on disk
      // (skip check for remote skills — their paths are not local)
      skills = filterByScope(
        Object.values(registry.skills).filter(
          (s) => fs.existsSync(s.path),
        ),
        scope,
      );
    }

    // Apply filters
    if (domain) {
      skills = skills.filter((s) => s.tags.domain.includes(domain));
    }
    if (source) {
      skills = skills.filter((s) => s.source === source);
    }
    if (frequency) {
      skills = skills.filter((s) => s.tags.frequency === frequency);
    }
    if (q) {
      skills = skills.filter(
        (s: SkillEntry) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.notes.toLowerCase().includes(q),
      );
    }

    // Sort by lastModified descending
    skills.sort(
      (a, b) =>
        new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime(),
    );

    return NextResponse.json({ skills, total: skills.length });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
