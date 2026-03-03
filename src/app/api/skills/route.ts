import { type NextRequest, NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";
import type { SkillEntry } from "@/lib/types";

export async function GET(request: NextRequest): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const registry = await readRegistry();
    const url = new URL(request.url);

    // Extract filter params
    const domain = url.searchParams.get("domain");
    const source = url.searchParams.get("source");
    const frequency = url.searchParams.get("frequency");
    const q = url.searchParams.get("q")?.toLowerCase();

    let skills = Object.values(registry.skills);

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
