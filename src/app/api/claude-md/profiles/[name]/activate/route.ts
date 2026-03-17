import { type NextRequest, NextResponse } from "next/server";
import { activateProfile } from "@/lib/claude-md-profiles";

export async function PUT(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    await activateProfile(decodeURIComponent(name));
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
