import { NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { execFileSync } from "child_process";
import path from "path";

import { DATA_DIR } from "@/lib/config";

const SNAPSHOTS_DIR = DATA_DIR;
const SNAPSHOTS_FILE = path.join(SNAPSHOTS_DIR, "ai-flow-snapshots.json");

interface FlowSnapshot {
  id: string;
  gitSha: string;
  gitMessage: string;
  timestamp: string;
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
  workflows: Record<string, unknown>[];
  summary: string;
}

async function readSnapshots(): Promise<FlowSnapshot[]> {
  if (!existsSync(SNAPSHOTS_FILE)) return [];
  const raw = await readFile(SNAPSHOTS_FILE, "utf-8");
  return JSON.parse(raw);
}

async function writeSnapshots(snapshots: FlowSnapshot[]): Promise<void> {
  if (!existsSync(SNAPSHOTS_DIR)) await mkdir(SNAPSHOTS_DIR, { recursive: true });
  await writeFile(SNAPSHOTS_FILE, JSON.stringify(snapshots, null, 2));
}

// GET: list all snapshots (返回 meta 信息，不含完整 nodes/edges)
export async function GET() {
  const snapshots = await readSnapshots();
  const meta = snapshots.map(s => ({
    id: s.id,
    gitSha: s.gitSha,
    gitMessage: s.gitMessage,
    timestamp: s.timestamp,
    summary: s.summary,
    nodeCount: s.nodes.length,
    edgeCount: s.edges.length,
  }));
  return NextResponse.json(meta);
}

// POST: save new snapshot
export async function POST(request: Request) {
  const body = await request.json() as Partial<FlowSnapshot>;
  const { nodes, edges, workflows, summary } = body;

  // Get current git HEAD info
  let gitSha = "unknown";
  let gitMessage = "";
  try {
    gitSha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf-8" }).trim();
    gitMessage = execFileSync("git", ["log", "-1", "--format=%s"], { encoding: "utf-8" }).trim();
  } catch {
    // not a git repo, that's ok
  }

  const snapshot: FlowSnapshot = {
    id: `snap-${Date.now()}`,
    gitSha,
    gitMessage,
    timestamp: new Date().toISOString(),
    nodes: nodes ?? [],
    edges: edges ?? [],
    workflows: workflows || [],
    summary: summary || "",
  };

  const snapshots = await readSnapshots();
  snapshots.unshift(snapshot); // newest first
  // Keep max 20 snapshots
  if (snapshots.length > 20) snapshots.length = 20;
  await writeSnapshots(snapshots);

  return NextResponse.json(snapshot);
}
