import type {
  SkillEntry,
  SkillsRegistry,
  UpstreamInfo,
  UpstreamStatus,
} from "./types";
import { getSkillGitHistory } from "./git-history";
import os from "node:os";

// ---------------------------------------------------------------------------
// KNOWN_UPSTREAM_SOURCES — curated map of known forks (name → repo)
// ---------------------------------------------------------------------------
export const KNOWN_UPSTREAM_SOURCES: Record<string, string> = {
  "geo-optimizer": "aaron-he-zhu/seo-geo-claude-skills",
  "skill-creator": "anthropic/skill-creator",
};

// ---------------------------------------------------------------------------
// detectUpstream — three-step funnel to identify upstream origin
// ---------------------------------------------------------------------------

/**
 * Detect the upstream origin of a skill using a three-step funnel:
 *   1. Source-based: plugin-official → anthropic repo; plugin-community → marketplace repo
 *   2. Baoyu detection: source === "baoyu" or name starts with "baoyu-"
 *   3. Known forks map lookup
 *
 * Returns null if no upstream is detected (i.e. truly self-built).
 */
export function detectUpstream(skill: SkillEntry): UpstreamInfo | null {
  // Step 1: Plugin source detection
  if (skill.source === "plugin-official") {
    return makeUpstreamInfo("anthropic/claude-plugins-official");
  }

  if (skill.source === "plugin-community") {
    // Extract marketplace name from path: .../superpowers-marketplace/NAME/...
    const match = skill.path.match(/superpowers-marketplace\/([^/]+)/);
    const marketplaceName = match ? match[1] : "unknown";
    return makeUpstreamInfo(`superpowers-marketplace/${marketplaceName}`);
  }

  // Step 2: Baoyu detection — source field OR name prefix
  if (skill.source === "baoyu" || skill.name.startsWith("baoyu-")) {
    return makeUpstreamInfo("baoyu/claude-skills");
  }

  // Step 3: Known forks map
  // Strip source prefix for lookup (e.g. "plugin-official/deploy" → "deploy")
  const baseName = skill.name.replace(
    /^(?:plugin-official|plugin-community)\//,
    "",
  );
  if (KNOWN_UPSTREAM_SOURCES[baseName]) {
    return makeUpstreamInfo(KNOWN_UPSTREAM_SOURCES[baseName]);
  }

  // No match — truly self-built
  return null;
}

function makeUpstreamInfo(origin: string): UpstreamInfo {
  return {
    origin,
    status: "following" as UpstreamStatus,
    localModified: false,
    modifications: [],
  };
}

// ---------------------------------------------------------------------------
// enrichUpstreamAndHistory — async enrichment for the full registry
// ---------------------------------------------------------------------------

/**
 * Enrich every skill in the registry with upstream info and git history.
 *
 * - Calls `detectUpstream()` for each skill
 * - Merges with existing manual data (modifications, lastReconciled) from
 *   the previous registry snapshot
 * - Calls `getSkillGitHistory()` for skills under ~/.claude
 * - If upstream exists AND totalCommits > 1, marks skill as "modified"
 */
export async function enrichUpstreamAndHistory(
  registry: SkillsRegistry,
  existingRegistry?: SkillsRegistry,
): Promise<void> {
  const home = os.homedir();
  const claudePrefix = `${home}/.claude`;

  for (const skill of Object.values(registry.skills)) {
    // --- Upstream detection ---
    const detected = detectUpstream(skill);

    if (detected) {
      // Merge with existing manual upstream data if available
      const existing = existingRegistry?.skills[skill.name]?.upstream;
      if (existing) {
        detected.modifications = existing.modifications ?? [];
        detected.lastReconciled = existing.lastReconciled;
        detected.baseCommitSha = existing.baseCommitSha;
        detected.forkedAt = existing.forkedAt;
        detected.originUrl = existing.originUrl;
      }

      skill.upstream = detected;
    }

    // --- Git history ---
    // Only run git log for skills under ~/.claude (not temp dirs, etc.)
    if (skill.path.startsWith(claudePrefix)) {
      try {
        const history = await getSkillGitHistory(skill.path);
        if (history) {
          skill.gitHistory = history;

          // If upstream exists AND more than 1 commit → mark as modified
          if (skill.upstream && history.totalCommits > 1) {
            skill.upstream.status = "modified";
            skill.upstream.localModified = true;
          }
        }
      } catch {
        // Git not available or not a git repo — skip silently
      }
    }
  }
}
