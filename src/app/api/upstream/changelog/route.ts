import { NextResponse } from "next/server";
import {
  checkMarketplaceUpdates,
  getInstalledMarketplaces,
} from "@/lib/upstream-checker";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const marketplace = url.searchParams.get("marketplace");

    if (!marketplace) {
      return NextResponse.json(
        { error: "Missing ?marketplace= parameter" },
        { status: 400 },
      );
    }

    const marketplaces = await getInstalledMarketplaces();
    const info = marketplaces.get(marketplace);

    if (!info) {
      return NextResponse.json(
        { error: `Unknown marketplace: ${marketplace}` },
        { status: 404 },
      );
    }

    const updates = await checkMarketplaceUpdates(
      marketplace,
      info.sha,
      info.plugins,
    );
    // All plugins from the same marketplace share the same changelog
    const changelog = updates[0]?.changelog ?? [];

    return NextResponse.json({
      marketplace,
      installedSha: info.sha,
      commitsAvailable: changelog.length,
      changelog,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
