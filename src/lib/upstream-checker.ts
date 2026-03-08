import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import type { UpstreamUpdateInfo, UpstreamCommit } from "./types";

const execFile = promisify(execFileCb);

interface InstalledPlugin {
  gitCommitSha: string;
  version: string;
  lastUpdated?: string;
  installPath: string;
}

interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, InstalledPlugin[]>;
}

/**
 * Read installed_plugins.json and extract unique marketplace->SHA mappings.
 * Multiple plugins from the same marketplace share the same git clone,
 * so we deduplicate by marketplace.
 */
export async function getInstalledMarketplaces(): Promise<
  Map<string, { sha: string; plugins: string[] }>
> {
  const pluginsFile = path.join(
    os.homedir(),
    ".claude",
    "plugins",
    "installed_plugins.json",
  );

  try {
    const raw = await fsp.readFile(pluginsFile, "utf-8");
    const data: InstalledPluginsFile = JSON.parse(raw);

    const marketplaces = new Map<
      string,
      { sha: string; plugins: string[] }
    >();

    for (const [key, entries] of Object.entries(data.plugins)) {
      // key format: "pluginName@marketplace"
      const atIndex = key.lastIndexOf("@");
      if (atIndex === -1) continue;

      const pluginName = key.slice(0, atIndex);
      const marketplace = key.slice(atIndex + 1);

      // Use the first entry's SHA (they should all be the same per marketplace)
      const sha = entries[0]?.gitCommitSha;
      if (!sha) continue;

      const existing = marketplaces.get(marketplace);
      if (existing) {
        existing.plugins.push(pluginName);
        // Use the most recent SHA (in case different plugins were updated at different times)
        // Actually they share the same git repo, so any SHA is valid
      } else {
        marketplaces.set(marketplace, { sha, plugins: [pluginName] });
      }
    }

    return marketplaces;
  } catch {
    return new Map();
  }
}

/**
 * Check a single marketplace for updates.
 * Runs git fetch + git log to compare installed SHA vs remote HEAD.
 */
export async function checkMarketplaceUpdates(
  marketplace: string,
  installedSha: string,
  plugins: string[],
): Promise<UpstreamUpdateInfo[]> {
  const repoPath = path.join(
    os.homedir(),
    ".claude",
    "plugins",
    "marketplaces",
    marketplace,
  );

  try {
    // Check if the marketplace repo exists
    await fsp.access(repoPath);
  } catch {
    // Marketplace repo not found
    return plugins.map((p) => ({
      marketplace,
      pluginName: p,
      installedSha,
      latestSha: null,
      commitsAvailable: 0,
      changelog: [],
      hasUpdate: false,
      lastChecked: new Date().toISOString(),
    }));
  }

  try {
    // Fetch latest from remote (timeout 15s)
    await execFile("git", ["fetch", "origin", "--quiet"], {
      cwd: repoPath,
      timeout: 15000,
    });
  } catch {
    // Fetch failed (network issue) — continue with local data
  }

  // Get latest SHA on the default branch
  let latestSha: string | null = null;
  try {
    // Try common branch names
    for (const branch of ["origin/main", "origin/master"]) {
      try {
        const { stdout } = await execFile("git", ["rev-parse", branch], {
          cwd: repoPath,
        });
        latestSha = stdout.trim();
        break;
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }

  if (!latestSha || latestSha === installedSha) {
    return plugins.map((p) => ({
      marketplace,
      pluginName: p,
      installedSha,
      latestSha,
      commitsAvailable: 0,
      changelog: [],
      hasUpdate: false,
      lastChecked: new Date().toISOString(),
    }));
  }

  // Get changelog: commits between installed SHA and latest
  let changelog: UpstreamCommit[] = [];
  try {
    const { stdout } = await execFile(
      "git",
      [
        "log",
        `${installedSha}..${latestSha}`,
        "--format=%h|||%ai|||%an|||%s",
        "--no-merges",
      ],
      { cwd: repoPath },
    );

    changelog = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, date, author, message] = line.split("|||");
        return { sha, date, author, message };
      });
  } catch {
    // SHA might not be an ancestor — treat as unknown
  }

  return plugins.map((p) => ({
    marketplace,
    pluginName: p,
    installedSha,
    latestSha,
    commitsAvailable: changelog.length,
    changelog,
    hasUpdate: changelog.length > 0,
    lastChecked: new Date().toISOString(),
  }));
}

/**
 * Check ALL upstream sources for updates.
 */
export async function checkAllUpstreamUpdates(): Promise<
  UpstreamUpdateInfo[]
> {
  const marketplaces = await getInstalledMarketplaces();
  const results: UpstreamUpdateInfo[] = [];

  for (const [marketplace, { sha, plugins }] of marketplaces) {
    const updates = await checkMarketplaceUpdates(marketplace, sha, plugins);
    results.push(...updates);
  }

  return results;
}
