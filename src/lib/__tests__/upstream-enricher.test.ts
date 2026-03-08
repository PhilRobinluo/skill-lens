import { describe, it, expect } from "vitest";
import { detectUpstream, KNOWN_UPSTREAM_SOURCES } from "../upstream-enricher";
import type { SkillEntry } from "../types";

// ---------------------------------------------------------------------------
// Helper — create a SkillEntry with sensible defaults
// ---------------------------------------------------------------------------
function makeSkill(overrides: Partial<SkillEntry>): SkillEntry {
  return {
    name: "test-skill",
    path: "/test/path",
    source: "self-built",
    description: "",
    lineCount: 10,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModified: "2026-01-01T00:00:00.000Z",
    claudeMdRefs: [],
    tags: { domain: [], autoTagged: false, frequency: null },
    dependencies: [],
    notes: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// detectUpstream — pure function tests (no git dependency)
// ---------------------------------------------------------------------------
describe("detectUpstream", () => {
  it("detects baoyu from source field", () => {
    const skill = makeSkill({
      name: "baoyu-image-gen",
      source: "baoyu",
      path: "/Users/test/.claude/skills/baoyu-image-gen",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("baoyu/claude-skills");
    expect(result!.status).toBe("following");
    expect(result!.localModified).toBe(false);
    expect(result!.modifications).toEqual([]);
  });

  it("detects baoyu from name prefix even if source is self-built", () => {
    const skill = makeSkill({
      name: "baoyu-post-to-wechat",
      source: "self-built", // might happen if detection missed
      path: "/Users/test/.claude/skills/baoyu-post-to-wechat",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("baoyu/claude-skills");
  });

  it("detects plugin-official", () => {
    const skill = makeSkill({
      name: "plugin-official/deploy",
      source: "plugin-official",
      path: "/Users/test/.claude/plugins/cache/claude-plugins-official/vercel/1.0.0/skills/deploy",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("anthropic/claude-plugins-official");
    expect(result!.status).toBe("following");
  });

  it("detects plugin-community and extracts marketplace name", () => {
    const skill = makeSkill({
      name: "plugin-community/test-driven-development",
      source: "plugin-community",
      path: "/Users/test/.claude/plugins/cache/superpowers-marketplace/superpowers/4.3.1/skills/test-driven-development",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("superpowers-marketplace/superpowers");
    expect(result!.status).toBe("following");
  });

  it("detects plugin-community with unknown marketplace when path does not match", () => {
    const skill = makeSkill({
      name: "plugin-community/some-skill",
      source: "plugin-community",
      path: "/some/weird/path/some-skill",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("superpowers-marketplace/unknown");
  });

  it("returns null for unknown self-built skill", () => {
    const skill = makeSkill({
      name: "my-custom-skill",
      source: "self-built",
      path: "/Users/test/.claude/skills/my-custom-skill",
    });

    const result = detectUpstream(skill);
    expect(result).toBeNull();
  });

  it("detects from KNOWN_UPSTREAM_SOURCES map", () => {
    const skill = makeSkill({
      name: "geo-optimizer",
      source: "self-built",
      path: "/Users/test/.claude/skills/geo-optimizer",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("aaron-he-zhu/seo-geo-claude-skills");
    expect(result!.status).toBe("following");
  });

  it("detects skill-creator from KNOWN_UPSTREAM_SOURCES map", () => {
    const skill = makeSkill({
      name: "skill-creator",
      source: "self-built",
      path: "/Users/test/.claude/skills/skill-creator",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("anthropic/skill-creator");
  });

  it("prioritizes source-based detection over known forks map", () => {
    // Edge case: plugin-official source takes priority even if name is in known map
    const skill = makeSkill({
      name: "plugin-official/geo-optimizer",
      source: "plugin-official",
      path: "/Users/test/.claude/plugins/cache/claude-plugins-official/geo-optimizer",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    // Should be detected as plugin-official, not from known map
    expect(result!.origin).toBe("anthropic/claude-plugins-official");
  });

  it("prioritizes baoyu detection over known forks map", () => {
    // Edge case: baoyu source takes priority
    const skill = makeSkill({
      name: "baoyu-something",
      source: "baoyu",
      path: "/Users/test/.claude/skills/baoyu-something",
    });

    const result = detectUpstream(skill);
    expect(result).not.toBeNull();
    expect(result!.origin).toBe("baoyu/claude-skills");
  });
});

// ---------------------------------------------------------------------------
// KNOWN_UPSTREAM_SOURCES — sanity check
// ---------------------------------------------------------------------------
describe("KNOWN_UPSTREAM_SOURCES", () => {
  it("contains expected entries", () => {
    expect(KNOWN_UPSTREAM_SOURCES["geo-optimizer"]).toBe(
      "aaron-he-zhu/seo-geo-claude-skills",
    );
    expect(KNOWN_UPSTREAM_SOURCES["skill-creator"]).toBe(
      "anthropic/skill-creator",
    );
  });
});
