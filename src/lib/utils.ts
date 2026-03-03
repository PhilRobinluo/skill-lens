import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ---------------------------------------------------------------------------
// Skill name display — strip source prefix for UI display
// ---------------------------------------------------------------------------

/**
 * Strip source prefix from skill name for display purposes.
 * Registry keys for plugin skills are like "plugin-official/deploy" or
 * "plugin-community/brainstorming", but the UI should show just "deploy".
 */
export function skillDisplayName(name: string): string {
  return name.replace(/^(?:plugin-official|plugin-community)\//, "");
}

// ---------------------------------------------------------------------------
// Description cleaning — display-only, never mutates SKILL.md files
// ---------------------------------------------------------------------------

/**
 * Extract a clean one-line summary for list/table views.
 * Strips YAML frontmatter noise, warning lines, emoji prefixes.
 */
export function cleanDescriptionSummary(raw: string): string {
  if (!raw) return "无描述";

  let text = raw;

  // Strip YAML frontmatter artifacts that leaked in
  text = text.replace(/^---[\s\S]*?---\s*/m, "");
  // Handle inline frontmatter-like: "--- name: xxx description: yyy"
  text = text.replace(/^---\s+name:\s*\S+\s+description:\s*["']?/m, "");
  text = text.replace(/^name:\s*\S+\s*/m, "");
  text = text.replace(/^description:\s*\|?\s*/m, "");

  // Split into lines
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // Find the first "meaningful" line — skip ⛔/⚠️ warning-only lines
  const summaryLine = lines.find((line) => {
    // Skip lines that are purely warnings/triggers/rules
    if (/^[⛔⚠️🔴❌🚫]/.test(line)) return false;
    if (/^(触发词|TRIGGER|DO NOT|不调用|不触发)[：:]/.test(line)) return false;
    return true;
  });

  if (!summaryLine) return lines[0] || "无描述";

  // Clean up the line: strip leading【】brackets, markdown bold
  let clean = summaryLine
    .replace(/^\*\*(.+?)\*\*[：:\s]*/, "$1：") // **强制规则**: → 强制规则：
    .replace(/^#+\s*/, ""); // # Heading → Heading

  return clean;
}

/**
 * Clean up full description for Markdown rendering in detail views.
 * Strips YAML noise, splits long blobs at semantic boundaries,
 * normalizes line breaks. Display-only — never mutates source files.
 */
export function cleanDescriptionFull(raw: string): string {
  if (!raw) return "";

  let text = raw;

  // Strip YAML frontmatter artifacts
  text = text.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
  text = text.replace(/^---\s+name:\s*\S+\s+description:\s*["']?/m, "");
  text = text.replace(/^name:\s*\S+\s*\n?/m, "");
  text = text.replace(/^description:\s*\|?\s*\n?/m, "");

  // Split long single-line blobs at semantic boundaries
  // e.g. "...talking. Use when..." → "...talking.\n\n**适用场景：** Use when..."
  text = structureLongDescription(text);

  // Convert single \n between content into proper markdown breaks
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);

    if (
      line.trim().length > 0 &&
      i + 1 < lines.length &&
      lines[i + 1].trim().length > 0 &&
      !line.trim().startsWith("-") &&
      !lines[i + 1].trim().startsWith("-") &&
      !line.trim().startsWith("#")
    ) {
      result.push("");
    }
  }

  return result.join("\n").trim();
}

/**
 * Break a long single-paragraph description into structured sections.
 * Detects common patterns like "Use when...", "Triggers include...",
 * "Focuses on...", and inserts line breaks with bold labels.
 */
function structureLongDescription(text: string): string {
  // Only process single-line or nearly-single-line blobs (> 120 chars without line breaks)
  const hasStructure = text.split("\n").filter((l) => l.trim()).length > 3;
  if (hasStructure) return text;

  // Flatten to single line for processing
  let flat = text.replace(/\n/g, " ").replace(/\s{2,}/g, " ").trim();

  // Define semantic break points: pattern → label
  const breakPoints: [RegExp, string][] = [
    // English patterns
    [/\.\s+Use when\b/i, ".\n\n**适用场景：**"],
    [/\.\s+Use this (?:skill |tool )?when\b/i, ".\n\n**适用场景：**"],
    [/\.\s+Triggers? include\b/i, ".\n\n**触发词：**"],
    [/\.\s+Focuses on\b/i, ".\n\n**核心能力：**"],
    [/\.\s+Supports?\b/i, ".\n\n**支持：**"],
    [/\.\s+Automatically\b/i, ".\n\n**自动行为：**"],
    [/\.\s+Examples?:/i, ".\n\n**示例：**"],
    // Chinese patterns
    [/[。！]\s*⛔\s*/,  "。\n\n⛔ "],
    [/[。！]\s*⚠️\s*/, "。\n\n⚠️ "],
    [/[。！]\s*触发词[：:]\s*/, "。\n\n**触发词：**"],
    [/[。！]\s*不调用\s*=\s*/, "。\n\n**不调用 =** "],
    [/[。！]\s*支持[：:]\s*/, "。\n\n**支持：**"],
  ];

  for (const [pattern, replacement] of breakPoints) {
    flat = flat.replace(pattern, replacement);
  }

  return flat;
}
