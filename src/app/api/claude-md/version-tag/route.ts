import { type NextRequest, NextResponse } from "next/server";
import { setVersionTag, readVersionTags, type VersionTagType } from "@/lib/claude-md-version-tags";

export async function GET(): Promise<NextResponse> {
  try {
    const tags = await readVersionTags();
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { sha: string; tag: VersionTagType | null };
    if (!body.sha) {
      return NextResponse.json({ error: "SHA is required" }, { status: 400 });
    }
    const tags = await setVersionTag(body.sha, body.tag);
    return NextResponse.json({ tags });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
