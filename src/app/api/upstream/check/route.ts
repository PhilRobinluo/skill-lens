import { NextResponse } from "next/server";
import { checkAllUpstreamUpdates } from "@/lib/upstream-checker";

export async function GET(): Promise<NextResponse> {
  try {
    const updates = await checkAllUpstreamUpdates();

    const summary = {
      totalSources: updates.length,
      updatesAvailable: updates.filter((u) => u.hasUpdate).length,
      lastChecked: new Date().toISOString(),
    };

    return NextResponse.json({ summary, updates });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
