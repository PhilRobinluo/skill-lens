import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/settings";

// GET — return settings status (never return the key itself)
export async function GET() {
  const settings = await readSettings();
  return NextResponse.json({
    hasApiKey: !!settings.openRouterApiKey,
    aiModel: settings.aiModel,
  });
}

// PUT — save settings
export async function PUT(request: Request) {
  const body = await request.json();
  const current = await readSettings();

  if (typeof body.openRouterApiKey === "string") {
    current.openRouterApiKey = body.openRouterApiKey;
  }
  if (typeof body.aiModel === "string" && body.aiModel) {
    current.aiModel = body.aiModel;
  }

  await writeSettings(current);

  return NextResponse.json({
    hasApiKey: !!current.openRouterApiKey,
    aiModel: current.aiModel,
  });
}
