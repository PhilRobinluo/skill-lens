import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry, writeRegistry } from "@/lib/registry";

/** GET /api/tags — list all unique domain tags with skill counts */
export async function GET(): Promise<NextResponse> {
  await ensureInitialized();

  const registry = await readRegistry();
  const tagMap = new Map<string, number>();

  for (const skill of Object.values(registry.skills)) {
    for (const d of skill.tags.domain) {
      tagMap.set(d, (tagMap.get(d) ?? 0) + 1);
    }
  }

  // Include custom tags (count = 0 if not used by any skill)
  for (const ct of registry.meta.customTags ?? []) {
    if (!tagMap.has(ct)) {
      tagMap.set(ct, 0);
    }
  }

  const tags = Array.from(tagMap.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({ tags });
}

interface BulkTagAction {
  action: "create" | "rename" | "delete" | "merge";
  tag: string;
  newTag?: string; // for rename and merge
}

/** POST /api/tags — bulk tag operations (create / rename / delete / merge) */
export async function POST(request: Request): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const body = (await request.json()) as BulkTagAction;
    const registry = await readRegistry();
    let changed = 0;

    // Ensure customTags array exists
    if (!registry.meta.customTags) {
      registry.meta.customTags = [];
    }

    if (body.action === "create") {
      const tag = body.tag.trim();
      if (!tag) {
        return NextResponse.json({ error: "Tag name is empty" }, { status: 400 });
      }
      // Check if already exists (in skills or custom tags)
      const existsInSkills = Object.values(registry.skills).some((s) =>
        s.tags.domain.includes(tag),
      );
      const existsInCustom = registry.meta.customTags.includes(tag);
      if (existsInSkills || existsInCustom) {
        return NextResponse.json({ error: "Tag already exists" }, { status: 409 });
      }
      registry.meta.customTags.push(tag);
      changed = 1;
    } else if (body.action === "rename" && body.newTag) {
      const newTag = body.newTag.trim();
      if (!newTag) {
        return NextResponse.json({ error: "New tag name is empty" }, { status: 400 });
      }
      for (const skill of Object.values(registry.skills)) {
        const idx = skill.tags.domain.indexOf(body.tag);
        if (idx !== -1) {
          skill.tags.domain[idx] = newTag;
          skill.tags.domain = [...new Set(skill.tags.domain)];
          changed++;
        }
      }
      // Also rename in customTags
      const ctIdx = registry.meta.customTags.indexOf(body.tag);
      if (ctIdx !== -1) {
        registry.meta.customTags[ctIdx] = newTag;
        registry.meta.customTags = [...new Set(registry.meta.customTags)];
      }
    } else if (body.action === "delete") {
      for (const skill of Object.values(registry.skills)) {
        const before = skill.tags.domain.length;
        skill.tags.domain = skill.tags.domain.filter((d) => d !== body.tag);
        if (skill.tags.domain.length < before) changed++;
      }
      // Also remove from customTags
      registry.meta.customTags = registry.meta.customTags.filter((t) => t !== body.tag);
    } else if (body.action === "merge" && body.newTag) {
      const newTag = body.newTag.trim();
      for (const skill of Object.values(registry.skills)) {
        const idx = skill.tags.domain.indexOf(body.tag);
        if (idx !== -1) {
          skill.tags.domain[idx] = newTag;
          skill.tags.domain = [...new Set(skill.tags.domain)];
          changed++;
        }
      }
      // Remove merged tag from customTags, add target if not there
      registry.meta.customTags = registry.meta.customTags.filter((t) => t !== body.tag);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await writeRegistry(registry);
    return NextResponse.json({ ok: true, changed });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
