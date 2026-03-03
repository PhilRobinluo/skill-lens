import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import {
  readRegistry,
  writeRegistry,
  updateSkillTags,
  updateSkillDeps,
  updateSkillNotes,
  upsertPipeline,
  deletePipeline,
} from "../registry";

import type { SkillsRegistry, SkillEntry } from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DATA_DIR = path.join(process.cwd(), "data");
const REGISTRY_PATH = path.join(DATA_DIR, "skills-registry.json");

/** Build a minimal SkillEntry for testing. */
function makeSkill(name: string): SkillEntry {
  return {
    name,
    path: `/test/path/${name}`,
    source: "self-built",
    description: `Test skill: ${name}`,
    lineCount: 10,
    lastModified: new Date().toISOString(),
    claudeMdRefs: [],
    tags: { domain: [], frequency: null, pipeline: null },
    dependencies: [],
    notes: "",
  };
}

/** Build a registry with given skills pre-loaded. */
function makeRegistry(skillNames: string[]): SkillsRegistry {
  const skills: Record<string, SkillEntry> = {};
  for (const name of skillNames) {
    skills[name] = makeSkill(name);
  }
  return {
    skills,
    pipelines: {},
    meta: { lastScan: new Date().toISOString(), totalSkills: skillNames.length, version: 1 },
  };
}

// We need to back up and restore the real registry file between tests
let originalContent: string | null = null;

beforeEach(async () => {
  try {
    originalContent = await fsp.readFile(REGISTRY_PATH, "utf-8");
  } catch {
    originalContent = null;
  }
});

afterEach(async () => {
  if (originalContent !== null) {
    await fsp.writeFile(REGISTRY_PATH, originalContent, "utf-8");
  } else {
    // If the file didn't exist before, remove it if it exists now
    try {
      await fsp.unlink(REGISTRY_PATH);
    } catch {
      // File doesn't exist — fine
    }
  }
});

// ---------------------------------------------------------------------------
// readRegistry
// ---------------------------------------------------------------------------
describe("readRegistry", () => {
  it("reads existing registry file", async () => {
    const testReg = makeRegistry(["skill-a"]);
    await fsp.writeFile(REGISTRY_PATH, JSON.stringify(testReg, null, 2), "utf-8");

    const result = await readRegistry();
    expect(result.skills["skill-a"]).toBeDefined();
    expect(result.skills["skill-a"].name).toBe("skill-a");
  });

  it("returns empty default when file does not exist", async () => {
    // Remove the file temporarily
    try {
      await fsp.unlink(REGISTRY_PATH);
    } catch {
      // Already doesn't exist
    }

    const result = await readRegistry();
    expect(result.skills).toEqual({});
    expect(result.pipelines).toEqual({});
    expect(result.meta.lastScan).toBeNull();
    expect(result.meta.totalSkills).toBe(0);
    expect(result.meta.version).toBe(1);
  });

  it("returns empty default when file contains invalid JSON", async () => {
    await fsp.writeFile(REGISTRY_PATH, "NOT VALID JSON {{{", "utf-8");

    const result = await readRegistry();
    expect(result.skills).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// writeRegistry
// ---------------------------------------------------------------------------
describe("writeRegistry", () => {
  it("writes registry to disk", async () => {
    const reg = makeRegistry(["test-skill"]);
    await writeRegistry(reg);

    const raw = await fsp.readFile(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.skills["test-skill"]).toBeDefined();
    expect(parsed.skills["test-skill"].name).toBe("test-skill");
  });

  it("creates data directory if it does not exist", async () => {
    // We know data/ already exists in the project, so this is more of a
    // safety test for the mkdir call. The implementation uses { recursive: true }
    // so it won't fail even if the directory already exists.
    const reg = makeRegistry([]);
    await writeRegistry(reg);

    expect(fs.existsSync(DATA_DIR)).toBe(true);
  });

  it("produces formatted JSON with trailing newline", async () => {
    const reg = makeRegistry(["fmt-test"]);
    await writeRegistry(reg);

    const raw = await fsp.readFile(REGISTRY_PATH, "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
    // Should be indented (not minified)
    expect(raw).toContain("  ");
  });
});

// ---------------------------------------------------------------------------
// updateSkillTags
// ---------------------------------------------------------------------------
describe("updateSkillTags", () => {
  it("updates tags for an existing skill", async () => {
    const reg = makeRegistry(["my-skill"]);
    await writeRegistry(reg);

    const updated = await updateSkillTags("my-skill", {
      domain: ["obsidian", "notes"],
      frequency: "daily",
    });

    expect(updated.skills["my-skill"].tags.domain).toEqual(["obsidian", "notes"]);
    expect(updated.skills["my-skill"].tags.frequency).toBe("daily");
    // pipeline should remain null (not overwritten)
    expect(updated.skills["my-skill"].tags.pipeline).toBeNull();

    // Verify it was persisted
    const reRead = await readRegistry();
    expect(reRead.skills["my-skill"].tags.domain).toEqual(["obsidian", "notes"]);
  });

  it("throws error when skill not found", async () => {
    const reg = makeRegistry(["existing-skill"]);
    await writeRegistry(reg);

    await expect(
      updateSkillTags("nonexistent-skill", { domain: ["test"] }),
    ).rejects.toThrow('Skill not found: "nonexistent-skill"');
  });
});

// ---------------------------------------------------------------------------
// updateSkillDeps
// ---------------------------------------------------------------------------
describe("updateSkillDeps", () => {
  it("updates dependencies for an existing skill", async () => {
    const reg = makeRegistry(["main-skill", "dep-skill"]);
    await writeRegistry(reg);

    const updated = await updateSkillDeps("main-skill", ["dep-skill"]);

    expect(updated.skills["main-skill"].dependencies).toEqual(["dep-skill"]);

    // Verify persistence
    const reRead = await readRegistry();
    expect(reRead.skills["main-skill"].dependencies).toEqual(["dep-skill"]);
  });

  it("throws error when skill not found", async () => {
    const reg = makeRegistry([]);
    await writeRegistry(reg);

    await expect(
      updateSkillDeps("ghost-skill", ["dep"]),
    ).rejects.toThrow('Skill not found: "ghost-skill"');
  });
});

// ---------------------------------------------------------------------------
// updateSkillNotes
// ---------------------------------------------------------------------------
describe("updateSkillNotes", () => {
  it("updates notes for an existing skill", async () => {
    const reg = makeRegistry(["noted-skill"]);
    await writeRegistry(reg);

    const updated = await updateSkillNotes("noted-skill", "This is a note about the skill.");

    expect(updated.skills["noted-skill"].notes).toBe("This is a note about the skill.");

    // Verify persistence
    const reRead = await readRegistry();
    expect(reRead.skills["noted-skill"].notes).toBe("This is a note about the skill.");
  });

  it("throws error when skill not found", async () => {
    const reg = makeRegistry([]);
    await writeRegistry(reg);

    await expect(
      updateSkillNotes("missing", "note"),
    ).rejects.toThrow('Skill not found: "missing"');
  });
});

// ---------------------------------------------------------------------------
// upsertPipeline
// ---------------------------------------------------------------------------
describe("upsertPipeline", () => {
  it("creates a new pipeline", async () => {
    const reg = makeRegistry([]);
    await writeRegistry(reg);

    const updated = await upsertPipeline("write-publish", {
      description: "Write and publish articles",
      steps: [
        { skill: "article-workflow", role: "writer" },
        { skill: "wechat-publish-helper", role: "publisher" },
      ],
    });

    expect(updated.pipelines["write-publish"]).toBeDefined();
    expect(updated.pipelines["write-publish"].steps).toHaveLength(2);

    // Verify persistence
    const reRead = await readRegistry();
    expect(reRead.pipelines["write-publish"].description).toBe("Write and publish articles");
  });

  it("updates an existing pipeline", async () => {
    const reg = makeRegistry([]);
    reg.pipelines["existing"] = {
      description: "Old description",
      steps: [{ skill: "old-skill", role: "old-role" }],
    };
    await writeRegistry(reg);

    const updated = await upsertPipeline("existing", {
      description: "New description",
      steps: [{ skill: "new-skill", role: "new-role" }],
    });

    expect(updated.pipelines["existing"].description).toBe("New description");
    expect(updated.pipelines["existing"].steps[0].skill).toBe("new-skill");
  });
});

// ---------------------------------------------------------------------------
// deletePipeline
// ---------------------------------------------------------------------------
describe("deletePipeline", () => {
  it("deletes an existing pipeline", async () => {
    const reg = makeRegistry([]);
    reg.pipelines["to-delete"] = {
      description: "Will be deleted",
      steps: [],
    };
    await writeRegistry(reg);

    const updated = await deletePipeline("to-delete");

    expect(updated.pipelines["to-delete"]).toBeUndefined();

    // Verify persistence
    const reRead = await readRegistry();
    expect(reRead.pipelines["to-delete"]).toBeUndefined();
  });

  it("throws error when pipeline not found", async () => {
    const reg = makeRegistry([]);
    await writeRegistry(reg);

    await expect(
      deletePipeline("nonexistent"),
    ).rejects.toThrow('Pipeline not found: "nonexistent"');
  });
});
