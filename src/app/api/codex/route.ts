import { NextResponse } from "next/server";

import { scanCodexSkills } from "@/lib/codex-scanner";

export async function GET(): Promise<NextResponse> {
  try {
    const report = await scanCodexSkills();
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
