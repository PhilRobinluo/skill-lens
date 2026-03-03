"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D from "react-force-graph-3d";
import * as THREE from "three";
import { Search, PanelLeftOpen, PanelLeftClose, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { SkillDetailSheet } from "@/components/skill-detail-sheet";
import { buildGraphData, type GraphNode } from "@/lib/graph-data";
import type { SkillEntry } from "@/lib/types";

const SOURCE_LABELS: Record<string, string> = {
  "self-built": "自建",
  baoyu: "宝玉系列",
  "plugin-official": "官方插件",
  "plugin-community": "社区插件",
};

const SOURCE_COLORS: Record<string, string> = {
  "self-built": "#6366f1",
  baoyu: "#8b5cf6",
  "plugin-official": "#3b82f6",
  "plugin-community": "#10b981",
};

interface SkillGraph3DProps {
  skills: SkillEntry[];
  allSkillNames: string[];
  onUpdated: () => void;
}

// ---------------------------------------------------------------------------
// Sprite text helper
// ---------------------------------------------------------------------------

function createTextSprite(
  text: string,
  color: string,
  fontSize: number,
  bgColor?: string,
  scale?: number,
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  const font = `bold ${fontSize}px sans-serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const textWidth = metrics.width;

  const padX = 14;
  const padY = 10;
  canvas.width = textWidth + padX * 2;
  canvas.height = fontSize + padY * 2;

  if (bgColor) {
    const r = 8;
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(canvas.width - r, 0);
    ctx.quadraticCurveTo(canvas.width, 0, canvas.width, r);
    ctx.lineTo(canvas.width, canvas.height - r);
    ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - r, canvas.height);
    ctx.lineTo(r, canvas.height);
    ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.SpriteMaterial({
    map: texture,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = 999;

  const sf = scale ?? 0.15;
  sprite.scale.set(canvas.width * sf, canvas.height * sf, 1);

  return sprite;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SkillGraph3D({ skills, allSkillNames, onUpdated }: SkillGraph3DProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [searchQuery, setSearchQuery] = useState("");

  // Filter state — multi-select
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set());
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [domainSearch, setDomainSearch] = useState("");

  // Detail sheet
  const [selectedSkill, setSelectedSkill] = useState<SkillEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Domain info panel
  const [selectedDomain, setSelectedDomain] = useState<{ name: string; skills: SkillEntry[] } | null>(null);

  // Resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Collect domain stats for filter
  const domainStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of skills) {
      for (const d of s.tags.domain) {
        map.set(d, (map.get(d) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [skills]);

  // All domains for sheet
  const allDomains = useMemo(() => domainStats.map((d) => d.name), [domainStats]);

  // Filter skills
  const filteredSkills = useMemo(() => {
    let result = skills;
    if (selectedSources.size > 0) {
      result = result.filter((s) => selectedSources.has(s.source));
    }
    if (selectedDomains.size > 0) {
      result = result.filter((s) => s.tags.domain.some((d) => selectedDomains.has(d)));
    }
    return result;
  }, [skills, selectedSources, selectedDomains]);

  const activeFilterCount = selectedSources.size + selectedDomains.size;

  // Build graph
  const graphData = useMemo(() => buildGraphData(filteredSkills), [filteredSkills]);

  // Configure d3-force
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-80).distanceMax(300);
    fg.d3Force("link")?.distance((link: { type: string }) =>
      link.type === "dependency" ? 50 : 35,
    );
    fg.d3Force("center")?.strength(0.8);
  }, [graphData]);

  // Highlight
  const highlightedNodes = useMemo(() => {
    if (!searchQuery.trim()) return new Set<string>();
    const q = searchQuery.toLowerCase();
    return new Set(
      graphData.nodes.filter((n) => n.name.toLowerCase().includes(q)).map((n) => n.id),
    );
  }, [graphData.nodes, searchQuery]);

  // Toggle helpers
  function toggleSource(source: string) {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  }

  function toggleDomain(domain: string) {
    setSelectedDomains((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function clearAllFilters() {
    setSelectedSources(new Set());
    setSelectedDomains(new Set());
  }

  // Node click handler
  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.nodeType === "skill") {
        const skill = skills.find((s) => s.name === node.id);
        if (skill) {
          setSelectedSkill(skill);
          setSelectedDomain(null);
          setSheetOpen(true);
        }
      } else if (node.nodeType === "domain") {
        const domainName = node.name;
        const seen = new Set<string>();
        const domainSkills = skills.filter((s) => {
          if (!s.tags.domain.includes(domainName)) return false;
          if (seen.has(s.name)) return false;
          seen.add(s.name);
          return true;
        });
        setSelectedDomain({ name: domainName, skills: domainSkills });
        setSelectedSkill(null);
        setSheetOpen(false);
      }
    },
    [skills],
  );

  // Custom node renderer
  const nodeThreeObject = useCallback(
    (node: GraphNode) => {
      const group = new THREE.Group();

      const radius = node.nodeType === "domain"
        ? Math.min(10, Math.max(4, node.val * 0.6))
        : Math.min(5, Math.max(1.5, node.val * 0.6));
      const geometry = new THREE.SphereGeometry(radius, 16, 16);

      let nodeColor = node.color;
      if (highlightedNodes.size > 0) {
        nodeColor = highlightedNodes.has(node.id)
          ? "#f59e0b"
          : node.color + "40";
      }

      const material = new THREE.MeshLambertMaterial({
        color: nodeColor,
        transparent: true,
        opacity: node.nodeType === "domain" ? 0.85 : 0.7,
      });
      const sphere = new THREE.Mesh(geometry, material);
      group.add(sphere);

      const label = node.nodeType === "domain"
        ? `【${node.name}】`
        : node.name;
      const textColor = node.nodeType === "domain" ? "#ffffff" : "#e0e0e0";
      const textSize = node.nodeType === "domain" ? 42 : 24;
      const bgColor = node.nodeType === "domain"
        ? "rgba(0,0,0,0.75)"
        : "rgba(0,0,0,0.5)";
      const scaleFactor = node.nodeType === "domain" ? 0.18 : 0.1;
      const sprite = createTextSprite(label, textColor, textSize, bgColor, scaleFactor);
      if (node.nodeType === "domain") {
        sprite.position.set(0, radius + 4, 0);
      } else {
        sprite.position.set(0, -(radius + 2), 0);
      }
      group.add(sprite);

      return group;
    },
    [highlightedNodes],
  );

  const linkColor = useCallback((link: { type: string }) => {
    return link.type === "dependency" ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.12)";
  }, []);

  const linkWidth = useCallback((link: { type: string }) => {
    return link.type === "dependency" ? 1.5 : 0.3;
  }, []);

  // Filtered domain list for sidebar search
  const filteredDomainStats = useMemo(() => {
    if (!domainSearch.trim()) return domainStats;
    const q = domainSearch.toLowerCase();
    return domainStats.filter((d) => d.name.toLowerCase().includes(q));
  }, [domainStats, domainSearch]);

  return (
    <div className="relative h-full w-full" ref={containerRef}>
      {/* Top toolbar — search + sidebar toggle + stats */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 bg-background/90 backdrop-blur"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          title={sidebarOpen ? "收起筛选" : "展开筛选"}
        >
          {sidebarOpen
            ? <PanelLeftClose className="h-3.5 w-3.5" />
            : <PanelLeftOpen className="h-3.5 w-3.5" />
          }
        </Button>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索高亮..."
            className="h-8 w-[160px] pl-7 text-xs bg-background/90 backdrop-blur"
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border bg-background/90 backdrop-blur px-2 py-1">
          <span className="text-[10px] text-muted-foreground">
            {graphData.nodes.filter((n) => n.nodeType === "skill").length} 技能
            {" · "}
            {graphData.nodes.filter((n) => n.nodeType === "domain").length} 领域
            {" · "}
            {graphData.links.length} 连线
          </span>
        </div>

        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={clearAllFilters}
          >
            清除 {activeFilterCount} 个筛选
          </Button>
        )}
      </div>

      {/* Left sidebar — filter panel */}
      <div
        className={`absolute top-14 left-3 z-10 flex flex-col rounded-md border bg-background/95 backdrop-blur shadow-lg transition-all duration-200 ${
          sidebarOpen ? "w-[220px] max-h-[calc(100vh-8rem)] opacity-100" : "w-0 max-h-0 opacity-0 overflow-hidden border-0"
        }`}
      >
        {sidebarOpen && (
          <div className="flex flex-col overflow-hidden">
            {/* Source section */}
            <div className="px-3 pt-3 pb-2">
              <h3 className="text-[11px] font-semibold text-muted-foreground mb-2">来源</h3>
              <div className="space-y-1.5">
                {Object.entries(SOURCE_LABELS).map(([key, label]) => {
                  const count = skills.filter((s) => s.source === key).length;
                  const checked = selectedSources.has(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSource(key)}
                        className="h-3.5 w-3.5"
                      />
                      <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: SOURCE_COLORS[key] }}
                      />
                      <span className="text-xs flex-1">{label}</span>
                      <span className="text-[10px] text-muted-foreground">{count}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Domain section */}
            <div className="px-3 pt-2 pb-3 flex flex-col min-h-0 flex-1">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] font-semibold text-muted-foreground">领域标签</h3>
                {selectedDomains.size > 0 && (
                  <button
                    type="button"
                    className="text-[10px] text-blue-500 hover:underline"
                    onClick={() => setSelectedDomains(new Set())}
                  >
                    全部清除
                  </button>
                )}
              </div>

              <Input
                placeholder="搜索标签..."
                value={domainSearch}
                onChange={(e) => setDomainSearch(e.target.value)}
                className="h-6 text-[11px] mb-2"
              />

              <div className="overflow-y-auto flex-1 max-h-[40vh] space-y-0.5">
                {filteredDomainStats.map((d) => {
                  const checked = selectedDomains.has(d.name);
                  return (
                    <label
                      key={d.name}
                      className="flex items-center gap-2 cursor-pointer rounded px-1 py-0.5 hover:bg-accent/50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleDomain(d.name)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs flex-1 truncate">{d.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{d.count}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legend — bottom left */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-md border bg-background/90 backdrop-blur px-3 py-1.5">
        {Object.entries(SOURCE_COLORS).map(([source, color]) => (
          <div key={source} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-[10px] text-muted-foreground">{SOURCE_LABELS[source]}</span>
          </div>
        ))}
      </div>

      {/* Domain info panel */}
      {selectedDomain && (
        <div className="absolute top-3 right-3 z-10 w-[300px] max-h-[calc(100vh-7rem)] overflow-y-auto rounded-md border bg-background/95 backdrop-blur p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold">{selectedDomain.name}</h3>
              <Badge variant="secondary" className="text-[10px]">{selectedDomain.skills.length} 个技能</Badge>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDomain(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            {selectedDomain.skills.map((skill) => (
              <button
                key={skill.name}
                type="button"
                className="flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left hover:bg-accent/50 transition-colors"
                onClick={() => {
                  setSelectedSkill(skill);
                  setSheetOpen(true);
                }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{skill.name}</p>
                  <p className="text-[10px] text-muted-foreground line-clamp-1">{skill.description || "无描述"}</p>
                </div>
                <Badge variant="outline" className="text-[9px] shrink-0">
                  {SOURCE_LABELS[skill.source] ?? skill.source}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 3D Graph */}
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeThreeObject={(node: GraphNode) => nodeThreeObject(node)}
        nodeThreeObjectExtend={false}
        linkColor={(link: { type: string }) => linkColor(link)}
        linkWidth={(link: { type: string }) => linkWidth(link)}
        linkOpacity={0.6}
        backgroundColor="hsl(0, 0%, 4%)"
        onNodeClick={(node: GraphNode) => handleNodeClick(node)}
        enableNodeDrag
        warmupTicks={50}
        cooldownTicks={100}
      />

      {/* Skill Detail Sheet */}
      <SkillDetailSheet
        skill={selectedSkill}
        allSkillNames={allSkillNames}
        allDomains={allDomains}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onUpdated={onUpdated}
      />
    </div>
  );
}
