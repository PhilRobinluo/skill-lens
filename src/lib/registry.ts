import fsp from "node:fs/promises";
import path from "node:path";

import type { SkillsRegistry, SkillTags } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(process.cwd(), "data");
const REGISTRY_PATH = path.join(DATA_DIR, "skills-registry.json");

function emptyRegistry(): SkillsRegistry {
  return {
    skills: {},
    meta: {
      lastScan: null,
      totalSkills: 0,
      version: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// readRegistry — read data/skills-registry.json (or return empty default)
// ---------------------------------------------------------------------------
export async function readRegistry(): Promise<SkillsRegistry> {
  try {
    const raw = await fsp.readFile(REGISTRY_PATH, "utf-8");
    return JSON.parse(raw) as SkillsRegistry;
  } catch {
    // File doesn't exist or is invalid JSON — return empty default
    return emptyRegistry();
  }
}

// ---------------------------------------------------------------------------
// writeRegistry — write to data/skills-registry.json
// ---------------------------------------------------------------------------
export async function writeRegistry(registry: SkillsRegistry): Promise<void> {
  // Ensure data/ directory exists
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.writeFile(REGISTRY_PATH, JSON.stringify(registry, null, 2) + "\n", "utf-8");
}

// ---------------------------------------------------------------------------
// updateSkillTags — update tags for a skill
// ---------------------------------------------------------------------------
export async function updateSkillTags(
  name: string,
  tags: Partial<SkillTags>,
): Promise<SkillsRegistry> {
  const registry = await readRegistry();

  if (!registry.skills[name]) {
    throw new Error(`Skill not found: "${name}"`);
  }

  registry.skills[name].tags = {
    ...registry.skills[name].tags,
    ...tags,
  };

  await writeRegistry(registry);
  return registry;
}

// ---------------------------------------------------------------------------
// updateSkillDeps — update dependencies for a skill
// ---------------------------------------------------------------------------
export async function updateSkillDeps(
  name: string,
  dependencies: string[],
): Promise<SkillsRegistry> {
  const registry = await readRegistry();

  if (!registry.skills[name]) {
    throw new Error(`Skill not found: "${name}"`);
  }

  registry.skills[name].dependencies = dependencies;

  await writeRegistry(registry);
  return registry;
}

// ---------------------------------------------------------------------------
// updateSkillNotes — update notes for a skill
// ---------------------------------------------------------------------------
export async function updateSkillNotes(
  name: string,
  notes: string,
): Promise<SkillsRegistry> {
  const registry = await readRegistry();

  if (!registry.skills[name]) {
    throw new Error(`Skill not found: "${name}"`);
  }

  registry.skills[name].notes = notes;

  await writeRegistry(registry);
  return registry;
}

