import { NextResponse } from "next/server";
import { scanSkillFrequency } from "@/lib/frequency-scanner";

export async function GET(): Promise<NextResponse> {
  try {
    const stats = await scanSkillFrequency();
    return NextResponse.json(stats);
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 },
    );
  }
}
