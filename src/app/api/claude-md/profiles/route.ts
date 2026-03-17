import { type NextRequest, NextResponse } from "next/server";
import { listProfiles, createProfile } from "@/lib/claude-md-profiles";

export async function GET(): Promise<NextResponse> {
  try {
    const result = await listProfiles();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { name: string; content?: string };
    if (!body.name || !body.name.trim()) {
      return NextResponse.json({ error: "Profile name is required" }, { status: 400 });
    }
    await createProfile(body.name.trim(), body.content);
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = String(err);
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
