import fsp from "node:fs/promises";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftSave {
  name: string;
  nodes: unknown[];
  edges: unknown[];
  savedAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DATA_DIR = path.join(process.cwd(), "data");
const DRAFTS_PATH = path.join(DATA_DIR, "drafts.json");
const MAX_DRAFTS = 20;

// ---------------------------------------------------------------------------
// readDrafts — read data/drafts.json (or return empty array)
// ---------------------------------------------------------------------------

export async function readDrafts(): Promise<DraftSave[]> {
  try {
    const raw = await fsp.readFile(DRAFTS_PATH, "utf-8");
    return JSON.parse(raw) as DraftSave[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// writeDrafts — write to data/drafts.json (cap at MAX_DRAFTS)
// ---------------------------------------------------------------------------

export async function writeDrafts(drafts: DraftSave[]): Promise<void> {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const capped = drafts.slice(0, MAX_DRAFTS);
  await fsp.writeFile(DRAFTS_PATH, JSON.stringify(capped, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// upsertDraft — insert or update a draft by name
// ---------------------------------------------------------------------------

export async function upsertDraft(draft: DraftSave): Promise<DraftSave[]> {
  const drafts = await readDrafts();
  const updated = [draft, ...drafts.filter((d) => d.name !== draft.name)].slice(0, MAX_DRAFTS);
  await writeDrafts(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// deleteDraft — remove a draft by name
// ---------------------------------------------------------------------------

export async function deleteDraft(name: string): Promise<DraftSave[]> {
  const drafts = await readDrafts();
  const updated = drafts.filter((d) => d.name !== name);
  await writeDrafts(updated);
  return updated;
}
