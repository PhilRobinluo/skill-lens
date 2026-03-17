import fsp from "node:fs/promises";
import fs from "node:fs";
import path from "node:path";
import { CLAUDE_MD_PATH, DATA_DIR } from "./config";

const PROFILES_DIR = path.join(DATA_DIR, "claude-md-profiles");
const META_PATH = path.join(PROFILES_DIR, "_meta.json");

interface ProfileMeta {
  activeProfile: string | null;
  lastSwitched: string | null;
}

export interface ProfileInfo {
  name: string;
  size: number;
  lastModified: string;
  active: boolean;
}

async function ensureProfilesDir(): Promise<void> {
  await fsp.mkdir(PROFILES_DIR, { recursive: true });
}

async function readMeta(): Promise<ProfileMeta> {
  try {
    const raw = await fsp.readFile(META_PATH, "utf-8");
    return JSON.parse(raw) as ProfileMeta;
  } catch {
    return { activeProfile: null, lastSwitched: null };
  }
}

async function writeMeta(meta: ProfileMeta): Promise<void> {
  await ensureProfilesDir();
  await fsp.writeFile(META_PATH, JSON.stringify(meta, null, 2) + "\n", "utf-8");
}

function profilePath(name: string): string {
  return path.join(PROFILES_DIR, `${name}.md`);
}

export async function listProfiles(): Promise<{ profiles: ProfileInfo[]; activeProfile: string | null }> {
  await ensureProfilesDir();
  const meta = await readMeta();
  const entries = await fsp.readdir(PROFILES_DIR, { withFileTypes: true });

  const profiles: ProfileInfo[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const name = entry.name.slice(0, -3);
    const filePath = path.join(PROFILES_DIR, entry.name);
    const stat = await fsp.stat(filePath);
    profiles.push({
      name,
      size: stat.size,
      lastModified: stat.mtime.toISOString(),
      active: meta.activeProfile === name,
    });
  }

  return { profiles, activeProfile: meta.activeProfile };
}

export async function createProfile(name: string, content?: string): Promise<void> {
  await ensureProfilesDir();
  const filePath = profilePath(name);

  if (fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" already exists`);
  }

  const profileContent = content ?? await fsp.readFile(CLAUDE_MD_PATH, "utf-8");
  await fsp.writeFile(filePath, profileContent, "utf-8");
}

export async function getProfileContent(name: string): Promise<string> {
  const filePath = profilePath(name);
  return await fsp.readFile(filePath, "utf-8");
}

export async function updateProfileContent(name: string, content: string): Promise<void> {
  const filePath = profilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" not found`);
  }
  await fsp.writeFile(filePath, content, "utf-8");
}

export async function activateProfile(name: string): Promise<void> {
  const filePath = profilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" not found`);
  }

  const meta = await readMeta();

  // Auto-save current CLAUDE.md to old active profile (if exists)
  if (meta.activeProfile && fs.existsSync(CLAUDE_MD_PATH)) {
    const currentContent = await fsp.readFile(CLAUDE_MD_PATH, "utf-8");
    const oldProfilePath = profilePath(meta.activeProfile);
    await fsp.writeFile(oldProfilePath, currentContent, "utf-8");
  }

  // Write new profile content to CLAUDE.md
  const newContent = await fsp.readFile(filePath, "utf-8");
  await fsp.writeFile(CLAUDE_MD_PATH, newContent, "utf-8");

  await writeMeta({
    activeProfile: name,
    lastSwitched: new Date().toISOString(),
  });
}

export async function deleteProfile(name: string): Promise<void> {
  const meta = await readMeta();
  if (meta.activeProfile === name) {
    throw new Error("Cannot delete the active profile");
  }

  const filePath = profilePath(name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile "${name}" not found`);
  }
  await fsp.unlink(filePath);
}

export async function renameProfile(oldName: string, newName: string): Promise<void> {
  const oldPath = profilePath(oldName);
  const newPath = profilePath(newName);

  if (!fs.existsSync(oldPath)) {
    throw new Error(`Profile "${oldName}" not found`);
  }
  if (fs.existsSync(newPath)) {
    throw new Error(`Profile "${newName}" already exists`);
  }

  await fsp.rename(oldPath, newPath);

  const meta = await readMeta();
  if (meta.activeProfile === oldName) {
    await writeMeta({ ...meta, activeProfile: newName });
  }
}
