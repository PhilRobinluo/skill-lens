import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry, writeRegistry } from "@/lib/registry";
import type { UpstreamInfo } from "@/lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  try {
    const body = (await request.json()) as Partial<UpstreamInfo>;
    const registry = await readRegistry();
    const skill = registry.skills[decodedName];
    if (!skill) return NextResponse.json({ error: "Skill not found" }, { status: 404 });

    skill.upstream = {
      origin: body.origin ?? skill.upstream?.origin ?? "",
      originUrl: body.originUrl ?? skill.upstream?.originUrl,
      baseCommitSha: body.baseCommitSha ?? skill.upstream?.baseCommitSha,
      forkedAt: body.forkedAt ?? skill.upstream?.forkedAt,
      status: body.status ?? skill.upstream?.status ?? "original",
      localModified: body.localModified ?? skill.upstream?.localModified ?? false,
      modifications: body.modifications ?? skill.upstream?.modifications ?? [],
      lastReconciled: body.lastReconciled ?? skill.upstream?.lastReconciled,
    };

    await writeRegistry(registry);
    return NextResponse.json(skill.upstream);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
