import { describe, it, expect } from "vitest";
import { parseSkillMd, detectSource, scanSkillsDirectory } from "../scanner";

// ---------------------------------------------------------------------------
// parseSkillMd
// ---------------------------------------------------------------------------
describe("parseSkillMd", () => {
  it("extracts description from YAML frontmatter", () => {
    const content = [
      "---",
      "name: my-skill",
      "description: This is a great skill that does things.",
      "---",
      "",
      "# My Skill",
      "",
      "Body text here.",
    ].join("\n");

    expect(parseSkillMd(content)).toBe(
      "This is a great skill that does things.",
    );
  });

  it("extracts multiline description from YAML frontmatter (pipe style)", () => {
    const content = [
      "---",
      "name: ai-task-system",
      "description: |",
      "  First line of description.",
      "  Second line of description.",
      "",
      "trigger: |",
      "  something",
      "---",
      "",
      "# Body",
    ].join("\n");

    const result = parseSkillMd(content);
    expect(result).toContain("First line of description.");
    expect(result).toContain("Second line of description.");
  });

  it("falls back to first 3 non-empty lines when no frontmatter", () => {
    const content = [
      "",
      "# My Skill",
      "",
      "Does amazing things.",
      "Also does other things.",
      "And even more things.",
      "This should be excluded.",
    ].join("\n");

    const result = parseSkillMd(content);
    expect(result).toContain("# My Skill");
    expect(result).toContain("Does amazing things.");
    expect(result).toContain("Also does other things.");
    expect(result).not.toContain("This should be excluded.");
  });

  it("falls back to first 3 non-empty lines when frontmatter has no description", () => {
    const content = [
      "---",
      "name: some-skill",
      "---",
      "",
      "# Some Skill",
      "",
      "Line one.",
      "Line two.",
      "Line three.",
      "Line four.",
    ].join("\n");

    const result = parseSkillMd(content);
    expect(result).toContain("# Some Skill");
    expect(result).toContain("Line one.");
    expect(result).toContain("Line two.");
    expect(result).not.toContain("Line four.");
  });

  it("handles empty content", () => {
    expect(parseSkillMd("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// detectSource
// ---------------------------------------------------------------------------
describe("detectSource", () => {
  it('returns "baoyu" for baoyu-* prefix', () => {
    expect(detectSource("baoyu-image-gen", "/any/path")).toBe("baoyu");
  });

  it('returns "plugin-official" when path contains claude-plugins-official', () => {
    expect(
      detectSource(
        "deploy",
        "/Users/qihang/.claude/plugins/cache/claude-plugins-official/vercel/1.0.0/skills/deploy",
      ),
    ).toBe("plugin-official");
  });

  it('returns "plugin-community" when path contains superpowers-marketplace', () => {
    expect(
      detectSource(
        "test-driven-development",
        "/Users/qihang/.claude/plugins/cache/superpowers-marketplace/superpowers/4.3.1/skills/test-driven-development",
      ),
    ).toBe("plugin-community");
  });

  it('returns "self-built" for everything else', () => {
    expect(
      detectSource(
        "ai-task-system",
        "/Users/qihang/.claude/skills/ai-task-system",
      ),
    ).toBe("self-built");
  });

  it('prioritises "baoyu" over path-based detection', () => {
    // Edge case: a baoyu skill somehow in the official plugins dir
    expect(
      detectSource(
        "baoyu-something",
        "/Users/qihang/.claude/plugins/cache/claude-plugins-official/baoyu-something",
      ),
    ).toBe("baoyu");
  });
});

// ---------------------------------------------------------------------------
// scanSkillsDirectory (integration — reads real filesystem)
// ---------------------------------------------------------------------------
describe("scanSkillsDirectory", () => {
  it("scans real ~/.claude/skills/ and returns skill entries", async () => {
    const skills = await scanSkillsDirectory();

    // We know at least ai-task-system exists
    expect(skills["ai-task-system"]).toBeDefined();

    const entry = skills["ai-task-system"];
    expect(entry.name).toBe("ai-task-system");
    expect(entry.path).toContain(".claude/skills/ai-task-system");
    expect(entry.source).toBe("self-built");
    expect(entry.description.length).toBeGreaterThan(0);
    expect(entry.lineCount).toBeGreaterThan(0);
    expect(entry.lastModified).toBeTruthy();
  });

  it("detects baoyu skills correctly", async () => {
    const skills = await scanSkillsDirectory();

    const baoyuSkills = Object.values(skills).filter(
      (s) => s.source === "baoyu",
    );
    expect(baoyuSkills.length).toBeGreaterThan(0);

    for (const s of baoyuSkills) {
      expect(s.name).toMatch(/^baoyu-/);
    }
  });

  it("skips _archived directory", async () => {
    const skills = await scanSkillsDirectory();

    const archivedSkills = Object.values(skills).filter((s) =>
      s.path.includes("_archived"),
    );
    expect(archivedSkills).toHaveLength(0);
  });

  it("scans plugins/cache/ for SKILL.md files", async () => {
    const skills = await scanSkillsDirectory();

    const pluginSkills = Object.values(skills).filter(
      (s) => s.source === "plugin-official" || s.source === "plugin-community",
    );
    // We know there are official and community plugins in the cache
    expect(pluginSkills.length).toBeGreaterThan(0);
  });
});
