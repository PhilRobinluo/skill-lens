import { type NextRequest, NextResponse } from "next/server";
import {
  getProfileContent,
  updateProfileContent,
  deleteProfile,
  renameProfile,
} from "@/lib/claude-md-profiles";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    const content = await getProfileContent(decodeURIComponent(name));
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 404 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    const body = (await request.json()) as { content?: string; newName?: string };

    if (body.newName) {
      await renameProfile(decodeURIComponent(name), body.newName.trim());
    }
    if (body.content !== undefined) {
      const targetName = body.newName?.trim() ?? decodeURIComponent(name);
      await updateProfileContent(targetName, body.content);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    await deleteProfile(decodeURIComponent(name));
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = String(err);
    const status = message.includes("active") ? 400 : message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
