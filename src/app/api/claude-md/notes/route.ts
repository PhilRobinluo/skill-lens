import fsp from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// Store version notes alongside the registry data
const NOTES_PATH = path.join(process.cwd(), "data", "claude-md-notes.json");

async function readNotes(): Promise<Record<string, string>> {
  try {
    const raw = await fsp.readFile(NOTES_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeNotes(notes: Record<string, string>): Promise<void> {
  await fsp.mkdir(path.dirname(NOTES_PATH), { recursive: true });
  await fsp.writeFile(NOTES_PATH, JSON.stringify(notes, null, 2), "utf-8");
}

// GET — read all notes
export async function GET(): Promise<NextResponse> {
  const notes = await readNotes();
  return NextResponse.json({ notes });
}

// PATCH — update a single note { sha: string, note: string }
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const sha = typeof body.sha === "string" ? body.sha.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";

    if (!sha || !/^[0-9a-f]{4,40}$/i.test(sha)) {
      return NextResponse.json({ error: "Invalid SHA" }, { status: 400 });
    }

    const notes = await readNotes();

    if (note) {
      notes[sha] = note;
    } else {
      delete notes[sha];
    }

    await writeNotes(notes);
    return NextResponse.json({ success: true, notes });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
