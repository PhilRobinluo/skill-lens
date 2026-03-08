import { NextResponse } from "next/server";
import { discoverProjects } from "@/lib/project-discovery";

export async function GET(): Promise<NextResponse> {
  try {
    const projects = await discoverProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
