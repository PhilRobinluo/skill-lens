"use client";

import { useEffect, useState, useCallback } from "react";
import { Search, Copy, Check, ChevronRight, ChevronDown, ExternalLink, Power } from "lucide-react";

interface SkillItem {
  name: string;
  description: string;
  enabled: boolean;
  tags: { domain: string[] };
}

interface TagGroup {
  name: string;
  skills: SkillItem[];
  expanded: boolean;
}

export default function TrayPage() {
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [tags, setTags] = useState<TagGroup[]>([]);
  const [search, setSearch] = useState("");
  const [copiedName, setCopiedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Hide the main app nav bar
  useEffect(() => {
    const nav = document.querySelector("nav");
    if (nav) nav.style.display = "none";
    const main = document.querySelector("main");
    if (main) main.style.minHeight = "100vh";
    return () => {
      if (nav) nav.style.display = "";
      if (main) main.style.minHeight = "";
    };
  }, []);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const [skillsRes, tagsRes] = await Promise.all([
        fetch("/api/skills"),
        fetch("/api/tags"),
      ]);
      const skillsData = await skillsRes.json();
      const tagsData = await tagsRes.json();

      const skillList: SkillItem[] = (skillsData.skills || []).map((s: any) => ({
        name: s.name,
        description: s.description || "",
        enabled: s.enabled,
        tags: { domain: s.tags?.domain || [] },
      }));

      setSkills(skillList);

      // Build tag groups
      const tagNames: string[] = (tagsData.tags || [])
        .filter((t: any) => t.count > 0)
        .map((t: any) => t.name);

      const groups: TagGroup[] = tagNames.map((tagName) => ({
        name: tagName,
        skills: skillList.filter((s) => s.tags.domain.includes(tagName)),
        expanded: false,
      }));

      // Add "Untagged" group
      const untagged = skillList.filter((s) => s.tags.domain.length === 0);
      if (untagged.length > 0) {
        groups.push({ name: "未标记", skills: untagged, expanded: false });
      }

      setTags(groups);
    } catch (err) {
      console.error("Failed to fetch skills:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Toggle skill enabled/disabled
  const toggleSkill = async (skillName: string, currentEnabled: boolean) => {
    const newEnabled = !currentEnabled;
    // Optimistic update
    setSkills((prev) =>
      prev.map((s) => (s.name === skillName ? { ...s, enabled: newEnabled } : s))
    );
    setTags((prev) =>
      prev.map((g) => ({
        ...g,
        skills: g.skills.map((s) =>
          s.name === skillName ? { ...s, enabled: newEnabled } : s
        ),
      }))
    );

    try {
      await fetch(`/api/skills/${encodeURIComponent(skillName)}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled }),
      });
    } catch {
      // Revert on failure
      setSkills((prev) =>
        prev.map((s) => (s.name === skillName ? { ...s, enabled: currentEnabled } : s))
      );
      setTags((prev) =>
        prev.map((g) => ({
          ...g,
          skills: g.skills.map((s) =>
            s.name === skillName ? { ...s, enabled: currentEnabled } : s
          ),
        }))
      );
    }
  };

  // Copy skill name
  const copyName = async (name: string) => {
    try {
      if (typeof window !== "undefined" && (window as any).electronAPI) {
        await (window as any).electronAPI.copyToClipboard(name);
      } else {
        await navigator.clipboard.writeText(name);
      }
      setCopiedName(name);
      setTimeout(() => setCopiedName(null), 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  // Open main window
  const openMainWindow = () => {
    if (typeof window !== "undefined" && (window as any).electronAPI) {
      (window as any).electronAPI.openMainWindow();
    } else {
      window.open("/", "_blank");
    }
  };

  // Toggle tag group expansion
  const toggleGroup = (tagName: string) => {
    setTags((prev) =>
      prev.map((g) =>
        g.name === tagName ? { ...g, expanded: !g.expanded } : g
      )
    );
  };

  // Filter by search
  const searchLower = search.toLowerCase();
  const filteredTags = tags
    .map((g) => ({
      ...g,
      skills: g.skills.filter(
        (s) =>
          s.name.toLowerCase().includes(searchLower) ||
          s.description.toLowerCase().includes(searchLower)
      ),
    }))
    .filter((g) => g.skills.length > 0);

  const enabledCount = skills.filter((s) => s.enabled).length;
  const disabledCount = skills.filter((s) => !s.enabled).length;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="text-sm">Loading skills...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-50 select-none">
      {/* Header / Search */}
      <div className="flex-none px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="搜索 Skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 pl-8 pr-3 text-sm bg-zinc-900 border border-zinc-800 rounded-md text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700"
            autoFocus
          />
        </div>
      </div>

      {/* Skill List */}
      <div className="flex-1 overflow-y-auto px-1.5">
        {filteredTags.map((group) => (
          <div key={group.name} className="mb-0.5">
            {/* Tag Header */}
            <button
              onClick={() => toggleGroup(group.name)}
              className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 rounded transition-colors"
            >
              {group.expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>{group.name}</span>
              <span className="text-zinc-600 ml-auto">{group.skills.length}</span>
            </button>

            {/* Skills in this group */}
            {group.expanded && (
              <div className="ml-2">
                {group.skills.map((skill) => (
                  <div
                    key={skill.name}
                    className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-zinc-900/60 group/row"
                  >
                    {/* Skill name */}
                    <span
                      className={`flex-1 text-xs truncate ${
                        skill.enabled ? "text-zinc-200" : "text-zinc-600 line-through"
                      }`}
                      title={skill.description || skill.name}
                    >
                      {skill.name}
                    </span>

                    {/* Copy button */}
                    <button
                      onClick={() => copyName(skill.name)}
                      className="flex-none p-1 rounded opacity-0 group-hover/row:opacity-100 hover:bg-zinc-800 transition-all"
                      title="复制名称"
                    >
                      {copiedName === skill.name ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3 text-zinc-500" />
                      )}
                    </button>

                    {/* Toggle switch */}
                    <button
                      onClick={() => toggleSkill(skill.name, skill.enabled)}
                      className={`flex-none p-1 rounded hover:bg-zinc-800 transition-colors ${
                        skill.enabled ? "text-emerald-500" : "text-zinc-600"
                      }`}
                      title={skill.enabled ? "禁用" : "启用"}
                    >
                      <Power className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {filteredTags.length === 0 && (
          <div className="text-center text-zinc-600 text-xs py-8">
            没有匹配的 Skill
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-none px-3 py-2 border-t border-zinc-800/50 flex items-center justify-between">
        <div className="text-xs text-zinc-500">
          <span className="text-emerald-500">{enabledCount}</span> 启用
          <span className="mx-1.5 text-zinc-700">/</span>
          <span className="text-zinc-500">{disabledCount}</span> 禁用
        </div>
        <button
          onClick={openMainWindow}
          className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        >
          打开面板
          <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
