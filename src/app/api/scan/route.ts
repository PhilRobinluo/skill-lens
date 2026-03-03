import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { scanAll } from "@/lib/scanner";
import { readRegistry, writeRegistry } from "@/lib/registry";

export async function POST(): Promise<NextResponse> {
  await ensureInitialized();

  try {
    const existing = await readRegistry();
    const updated = await scanAll(existing);
    await writeRegistry(updated);

    return NextResponse.json({
      success: true,
      stats: {
        totalSkills: updated.meta.totalSkills,
        version: updated.meta.version,
        lastScan: updated.meta.lastScan,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err) },
      { status: 500 },
    );
  }
}
