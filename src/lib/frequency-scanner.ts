import fs from "node:fs";
import fsp from "node:fs/promises";
import readline from "node:readline";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillCallStats {
  total: number;
  last30d: number;
  lastUsed: string | null;
}

interface CacheEntry {
  data: Record<string, SkillCallStats>;
  timestamp: number;
  fileMtimes: Record<string, number>;
}

import { PROJECTS_DIR, DATA_DIR } from "./config";
import path from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_PATH = path.join(DATA_DIR, "skill-frequency-cache.json");
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

async function readCache(): Promise<CacheEntry | null> {
  try {
    const raw = await fsp.readFile(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(entry: CacheEntry): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(CACHE_PATH, JSON.stringify(entry), "utf-8");
}

// ---------------------------------------------------------------------------
// Find all .jsonl transcript files
// ---------------------------------------------------------------------------

async function findJsonlFiles(): Promise<string[]> {
  const results: string[] = [];

  if (!fs.existsSync(PROJECTS_DIR)) return results;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 3) return; // Don't recurse too deep
    let entries: fs.Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        results.push(fullPath);
      }
    }
  }

  await walk(PROJECTS_DIR, 0);
  return results;
}

// ---------------------------------------------------------------------------
// Parse a single .jsonl file for Skill tool calls
// ---------------------------------------------------------------------------

// Pattern to match Skill tool invocations in transcript JSONL
const SKILL_PATTERN = /"name"\s*:\s*"Skill"/;
const SKILL_INPUT_PATTERN = /"skill"\s*:\s*"([^"]+)"/;

async function parseJsonlFile(
  filePath: string,
): Promise<Array<{ skill: string; timestamp: number }>> {
  const results: Array<{ skill: string; timestamp: number }> = [];

  const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let fileMtime: number;
  try {
    const stat = await fsp.stat(filePath);
    fileMtime = stat.mtimeMs;
  } catch {
    return results;
  }

  for await (const line of rl) {
    if (!SKILL_PATTERN.test(line)) continue;

    const match = line.match(SKILL_INPUT_PATTERN);
    if (!match) continue;

    const skillName = match[1];

    // Try to extract timestamp from the JSONL line
    let timestamp = fileMtime; // Fallback to file mtime
    const tsMatch = line.match(/"timestamp"\s*:\s*"([^"]+)"/);
    if (tsMatch) {
      const parsed = new Date(tsMatch[1]).getTime();
      if (!isNaN(parsed)) timestamp = parsed;
    }

    results.push({ skill: skillName, timestamp });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main scan function
// ---------------------------------------------------------------------------

export async function scanSkillFrequency(): Promise<Record<string, SkillCallStats>> {
  // Check cache freshness
  const cache = await readCache();
  if (cache && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    // Check if any files have changed
    const files = await findJsonlFiles();
    let cacheValid = true;

    for (const file of files) {
      try {
        const stat = await fsp.stat(file);
        if ((cache.fileMtimes[file] ?? 0) < stat.mtimeMs) {
          cacheValid = false;
          break;
        }
      } catch {
        cacheValid = false;
        break;
      }
    }

    if (cacheValid) return cache.data;
  }

  // Full scan
  const files = await findJsonlFiles();
  const allCalls: Array<{ skill: string; timestamp: number }> = [];
  const fileMtimes: Record<string, number> = {};

  for (const file of files) {
    try {
      const stat = await fsp.stat(file);
      fileMtimes[file] = stat.mtimeMs;
    } catch {
      continue;
    }

    const calls = await parseJsonlFile(file);
    allCalls.push(...calls);
  }

  // Aggregate stats
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const stats: Record<string, SkillCallStats> = {};

  for (const call of allCalls) {
    if (!stats[call.skill]) {
      stats[call.skill] = { total: 0, last30d: 0, lastUsed: null };
    }

    const entry = stats[call.skill];
    entry.total++;

    if (call.timestamp >= thirtyDaysAgo) {
      entry.last30d++;
    }

    if (!entry.lastUsed || call.timestamp > new Date(entry.lastUsed).getTime()) {
      entry.lastUsed = new Date(call.timestamp).toISOString();
    }
  }

  // Write cache
  await writeCache({
    data: stats,
    timestamp: Date.now(),
    fileMtimes,
  });

  return stats;
}
