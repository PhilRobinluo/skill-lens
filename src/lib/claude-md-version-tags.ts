import fsp from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./config";

const TAGS_PATH = path.join(DATA_DIR, "claude-md-version-tags.json");

export type VersionTagType = "stable" | "experiment";

export interface VersionTags {
  [sha: string]: VersionTagType;
}

export async function readVersionTags(): Promise<VersionTags> {
  try {
    const raw = await fsp.readFile(TAGS_PATH, "utf-8");
    return JSON.parse(raw) as VersionTags;
  } catch {
    return {};
  }
}

export async function writeVersionTags(tags: VersionTags): Promise<void> {
  await fsp.mkdir(path.dirname(TAGS_PATH), { recursive: true });
  await fsp.writeFile(TAGS_PATH, JSON.stringify(tags, null, 2) + "\n", "utf-8");
}

export async function setVersionTag(sha: string, tag: VersionTagType | null): Promise<VersionTags> {
  const tags = await readVersionTags();
  if (tag === null) {
    delete tags[sha];
  } else {
    tags[sha] = tag;
  }
  await writeVersionTags(tags);
  return tags;
}

export async function getLatestStableSha(tags: VersionTags, orderedShas: string[]): Promise<string | null> {
  for (const sha of orderedShas) {
    if (tags[sha] === "stable") return sha;
  }
  return null;
}
