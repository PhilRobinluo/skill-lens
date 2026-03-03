import type { SkillEntry } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeType = "skill" | "domain";

export interface GraphNode {
  id: string;
  name: string;
  nodeType: NodeType;
  description: string;
  source: string;
  domains: string[];
  lineCount: number;
  val: number;
  color: string;
}

export interface GraphLink {
  source: string;
  target: string;
  type: "domain" | "dependency";
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const SOURCE_COLORS: Record<string, string> = {
  "self-built": "#6366f1",
  baoyu: "#8b5cf6",
  "plugin-official": "#3b82f6",
  "plugin-community": "#10b981",
};

// Distinct warm/earthy colors for domain hub nodes
const DOMAIN_COLORS = [
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
  "#06b6d4", // cyan
  "#a855f7", // purple
  "#10b981", // emerald
  "#e11d48", // rose
  "#0ea5e9", // sky
  "#d946ef", // fuchsia
];

// ---------------------------------------------------------------------------
// Build graph data with domain hub nodes
// ---------------------------------------------------------------------------

export function buildGraphData(skills: SkillEntry[]): GraphData {
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const skillSet = new Set(skills.map((s) => s.name));

  // 1. Collect all domains and their members
  const domainMap = new Map<string, string[]>();
  for (const skill of skills) {
    for (const domain of skill.tags.domain) {
      if (!domainMap.has(domain)) domainMap.set(domain, []);
      domainMap.get(domain)!.push(skill.name);
    }
  }

  // 2. Create domain hub nodes
  let colorIdx = 0;
  const domainColorMap = new Map<string, string>();
  for (const [domain, members] of domainMap) {
    const color = DOMAIN_COLORS[colorIdx % DOMAIN_COLORS.length];
    colorIdx++;
    domainColorMap.set(domain, color);

    nodes.push({
      id: `domain:${domain}`,
      name: domain,
      nodeType: "domain",
      description: `${members.length} 个技能`,
      source: "",
      domains: [domain],
      lineCount: 0,
      val: Math.min(20, Math.max(6, members.length * 1.2)), // Capped hub size
      color,
    });
  }

  // 3. Create skill nodes
  for (const skill of skills) {
    nodes.push({
      id: skill.name,
      name: skill.name,
      nodeType: "skill",
      description: skill.description,
      source: skill.source,
      domains: skill.tags.domain,
      lineCount: skill.lineCount,
      val: Math.max(2, Math.log2(skill.lineCount + 1) * 1.5),
      color: SOURCE_COLORS[skill.source] ?? "#6366f1",
    });

    // 4. Link skill → domain hub
    for (const domain of skill.tags.domain) {
      links.push({
        source: skill.name,
        target: `domain:${domain}`,
        type: "domain",
      });
    }
  }

  // 5. Dependency links (skill → skill)
  for (const skill of skills) {
    for (const dep of skill.dependencies) {
      if (skillSet.has(dep)) {
        links.push({
          source: skill.name,
          target: dep,
          type: "dependency",
        });
      }
    }
  }

  return { nodes, links };
}
