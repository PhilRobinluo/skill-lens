/**
 * CLAUDE.md parser — extracts skill routing-table references.
 *
 * Parses CLAUDE.md content and returns a map of skill names to their
 * routing-table references (table name + trigger keywords).
 */

/**
 * Determine whether a `## ...` header line is a routing-table header.
 *
 * Routing headers contain "路由" (route) or "Skill" in the title text,
 * e.g.:
 *   ## 🧭 Obsidian Skill 路由表（2026-02-05 新增）
 *   ## 🎯 任务系统 Skill 路由（2026-02-09 新增）
 *   ## 📋 Notion 协作路由（2026-02-28 新增）
 */
function isRoutingHeader(line: string): boolean {
  // Must start with `## ` (h2)
  if (!line.startsWith("## ")) return false;
  const title = line.slice(3);
  return title.includes("路由") || title.includes("Skill");
}

/**
 * Extract a clean table name from a routing header line.
 *
 * Strips:
 *   - The leading `## `
 *   - Emoji characters (Unicode blocks: U+1F000–U+1FAFF, variation selectors, etc.)
 *   - Parenthesized annotations like `（2026-02-05 新增）`
 *   - Leading/trailing whitespace
 *
 * Examples:
 *   "## 🧭 Obsidian Skill 路由表（2026-02-05 新增）" → "Obsidian Skill 路由表"
 *   "## ✍️ 写作工作流 Skill 路由"                   → "写作工作流 Skill 路由"
 */
function extractTableName(headerLine: string): string {
  let name = headerLine.slice(3); // Remove "## "

  // Remove parenthesized annotations (both Chinese and ASCII parens)
  name = name.replace(/[（(][^）)]*[）)]/g, "");

  // Remove emojis and variation selectors
  // Covers most emoji ranges including modifiers, skin tones, etc.
  name = name.replace(
    /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu,
    "",
  );

  return name.trim();
}

/**
 * Extract all backtick-wrapped skill names from a table cell string.
 *
 * Handles cells like:
 *   "`skill-name`"                     → ["skill-name"]
 *   "`Notion:search` / `Notion:find`"  → ["Notion:search", "Notion:find"]
 */
function extractSkillNames(cell: string): string[] {
  const matches = cell.match(/`([^`]+)`/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}

/**
 * Parse CLAUDE.md content and extract skill routing references.
 *
 * Scans for `## ` headers that look like routing tables (containing
 * "路由" or "Skill"), then reads table rows underneath to find
 * backtick-wrapped skill names and their trigger keywords.
 *
 * Returns a map: skill name → array of { table, trigger } references.
 */
export function parseClaudeMd(
  content: string,
): Record<string, Array<{ table: string; trigger: string }>> {
  if (!content.trim()) return {};

  const result: Record<string, Array<{ table: string; trigger: string }>> = {};
  const lines = content.split("\n");

  let currentTable: string | null = null;

  for (const line of lines) {
    // Check for h2 header
    if (line.startsWith("## ")) {
      if (isRoutingHeader(line)) {
        currentTable = extractTableName(line);
      } else {
        // Non-routing h2 header — reset context
        currentTable = null;
      }
      continue;
    }

    // If we're not inside a routing table, skip
    if (!currentTable) continue;

    // Skip non-table-row lines (must start with `|`)
    if (!line.startsWith("|")) continue;

    // Split into cells
    const cells = line.split("|").map((c) => c.trim());
    // A proper row split by `|` gives: ["", cell1, cell2, cell3, ""]
    // We need at least 4 cells (header separator rows have dashes)
    if (cells.length < 4) continue;

    // Skip the header row and separator row
    // Header row: contains "用户意图" / "调用的 Skill" / "触发词"
    // Separator row: contains only dashes and colons like "------|"
    const secondCell = cells[2]; // The "调用的 Skill" column
    if (!secondCell || secondCell.includes("---") || secondCell.includes("调用的")) continue;

    // Extract skill names from the second column (cells[2])
    const skillNames = extractSkillNames(secondCell);
    if (skillNames.length === 0) continue;

    // Third column is trigger keywords (cells[3])
    const trigger = cells[3]?.trim() || "";
    if (!trigger) continue;

    for (const skillName of skillNames) {
      if (!result[skillName]) {
        result[skillName] = [];
      }
      result[skillName].push({ table: currentTable, trigger });
    }
  }

  return result;
}
