import { NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

import { DATA_DIR } from "@/lib/config";

const SNAPSHOTS_FILE = path.join(DATA_DIR, "ai-flow-snapshots.json");

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

// GET: load a single snapshot with full data
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!existsSync(SNAPSHOTS_FILE)) {
    return NextResponse.json({ error: "无快照数据" }, { status: 404 });
  }
  const snapshots = JSON.parse(await readFile(SNAPSHOTS_FILE, "utf-8")) as FlowSnapshot[];
  const snapshot = snapshots.find((s) => s.id === id);
  if (!snapshot) {
    return NextResponse.json({ error: "快照不存在" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}

// DELETE: remove a snapshot
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!existsSync(SNAPSHOTS_FILE)) {
    return NextResponse.json({ error: "无快照数据" }, { status: 404 });
  }
  const snapshots = JSON.parse(await readFile(SNAPSHOTS_FILE, "utf-8")) as FlowSnapshot[];
  const filtered = snapshots.filter((s) => s.id !== id);
  await writeFile(SNAPSHOTS_FILE, JSON.stringify(filtered, null, 2));
  return NextResponse.json({ success: true });
}
