"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Sparkles } from "lucide-react";
import { LoadingSpinner } from "@/components/loading-spinner";
import { SkillDetailSheet } from "@/components/skill-detail-sheet";
import { AITagDialog } from "@/components/ai-tag-dialog";
import { cleanDescriptionSummary, skillDisplayName } from "@/lib/utils";
import { useAutoRefresh } from "@/hooks/use-sse";
import { useSettings } from "@/hooks/use-settings";
import type { SkillEntry } from "@/lib/types";

// ── Constants ──

const UNTAGGED_KEY = "__untagged__";

interface TagInfo {
  name: string;
  count: number;
}

const SOURCE_BADGE_STYLES: Record<string, { label: string; className: string }> = {
  "self-built": {
    label: "自建",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  baoyu: {
    label: "宝玉系列",
    className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  },
  "plugin-official": {
    label: "官方插件",
    className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  },
  "plugin-community": {
    label: "社区插件",
    className: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  },
};

// ── Main Component ──

export default function TagsPage() {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [tagSearch, setTagSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [editMode, setEditMode] = useState(false);

  // Edit mode state
  const [checkedSkills, setCheckedSkills] = useState<Set<string>>(new Set());
  const [originalChecked, setOriginalChecked] = useState<Set<string>>(new Set());

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [mergeSource, setMergeSource] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Detail sheet
  const [detailSkill, setDetailSkill] = useState<SkillEntry | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // AI tag dialog
  const [aiTagOpen, setAiTagOpen] = useState(false);
  const { status: settingsStatus } = useSettings();

  // ── Data fetching ──

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch("/api/tags");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTags(data.tags);
    } catch {
      // silent
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSkills(data.skills);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchTags(), fetchSkills()]);
  }, [fetchTags, fetchSkills]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useAutoRefresh(fetchAll);

  // ── Computed data ──

  // A skill is "untagged" if it has no domain tags or only "未分类"
  const isUntaggedSkill = (s: SkillEntry) => {
    const d = s.tags.domain;
    return d.length === 0 || (d.length === 1 && d[0] === "未分类");
  };

  const untaggedCount = useMemo(
    () => skills.filter(isUntaggedSkill).length,
    [skills],
  );

  // Filter out "未分类" from real tags (it's now virtual)
  const realTags = useMemo(
    () => tags.filter((t) => t.name !== "未分类"),
    [tags],
  );

  const filteredTags = useMemo(() => {
    if (!tagSearch) return realTags;
    const lower = tagSearch.toLowerCase();
    return realTags.filter((t) => t.name.toLowerCase().includes(lower));
  }, [realTags, tagSearch]);

  const isUntaggedSelected = selectedTag === UNTAGGED_KEY;

  // Skills for the right panel
  const taggedSkills = useMemo(() => {
    if (isUntaggedSelected) {
      return skills.filter(isUntaggedSkill);
    }
    if (!selectedTag) return [];
    return skills.filter((s) => s.tags.domain.includes(selectedTag));
  }, [skills, selectedTag, isUntaggedSelected]);

  // Filtered by search
  const displaySkills = useMemo(() => {
    const base = editMode ? skills : taggedSkills;
    if (!skillSearch) return base;
    const lower = skillSearch.toLowerCase();
    return base.filter((s) => s.name.toLowerCase().includes(lower));
  }, [editMode, skills, taggedSkills, skillSearch]);

  const rightPanelTitle = isUntaggedSelected
    ? "未标记"
    : selectedTag
      ? `「${selectedTag}」标签`
      : "";

  const rightPanelCount = isUntaggedSelected
    ? untaggedCount
    : taggedSkills.length;

  // ── Edit mode state sync ──

  useEffect(() => {
    if (!selectedTag || isUntaggedSelected) {
      setCheckedSkills(new Set());
      setOriginalChecked(new Set());
      setEditMode(false);
      return;
    }
    const checked = new Set<string>();
    for (const skill of skills) {
      if (skill.tags.domain.includes(selectedTag)) {
        checked.add(skill.name);
      }
    }
    setCheckedSkills(new Set(checked));
    setOriginalChecked(new Set(checked));
    setSkillSearch("");
    setEditMode(false);
  }, [selectedTag, skills, isUntaggedSelected]);

  // Diff
  const added = useMemo(() => {
    const set = new Set<string>();
    for (const name of checkedSkills) {
      if (!originalChecked.has(name)) set.add(name);
    }
    return set;
  }, [checkedSkills, originalChecked]);

  const removed = useMemo(() => {
    const set = new Set<string>();
    for (const name of originalChecked) {
      if (!checkedSkills.has(name)) set.add(name);
    }
    return set;
  }, [checkedSkills, originalChecked]);

  const hasChanges = added.size > 0 || removed.size > 0;

  // ── Tag CRUD ──

  async function createTag() {
    const name = newTagName.trim();
    if (!name) return;
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", tag: name }),
    });
    setNewTagName("");
    setCreateDialogOpen(false);
    await fetchAll();
  }

  async function renameTag() {
    if (!renameTarget || !renameValue.trim()) return;
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", tag: renameTarget, newTag: renameValue.trim() }),
    });
    if (selectedTag === renameTarget) setSelectedTag(renameValue.trim());
    setRenameDialogOpen(false);
    setRenameTarget(null);
    setRenameValue("");
    await fetchAll();
  }

  async function deleteTag(tag: string) {
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", tag }),
    });
    if (selectedTag === tag) setSelectedTag(null);
    setDeleteConfirmTag(null);
    await fetchAll();
  }

  async function mergeTag() {
    if (!mergeSource || !mergeTarget) return;
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "merge", tag: mergeSource, newTag: mergeTarget }),
    });
    if (selectedTag === mergeSource) setSelectedTag(mergeTarget);
    setMergeDialogOpen(false);
    setMergeSource(null);
    setMergeTarget("");
    await fetchAll();
  }

  // Batch save (edit mode)
  async function saveChanges() {
    if (!selectedTag || isUntaggedSelected || !hasChanges) return;
    setSaving(true);
    try {
      for (const name of added) {
        const skill = skills.find((s) => s.name === name);
        if (!skill) continue;
        const newDomain = [...skill.tags.domain, selectedTag];
        await fetch(`/api/skills/${encodeURIComponent(name)}/tags`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: newDomain }),
        });
      }
      for (const name of removed) {
        const skill = skills.find((s) => s.name === name);
        if (!skill) continue;
        const newDomain = skill.tags.domain.filter((d) => d !== selectedTag);
        await fetch(`/api/skills/${encodeURIComponent(name)}/tags`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain: newDomain }),
        });
      }
      await fetchAll();
    } finally {
      setSaving(false);
    }
  }

  // Quick-tag for untagged skills
  async function quickTag(skillName: string, tagName: string) {
    const skill = skills.find((s) => s.name === skillName);
    if (!skill) return;
    const newDomain = [...skill.tags.domain, tagName];
    await fetch(`/api/skills/${encodeURIComponent(skillName)}/tags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: newDomain }),
    });
    await fetchAll();
  }

  if (loading) return <LoadingSpinner text="加载中..." />;

  return (
    <div className="mx-auto flex h-[calc(100vh-3.5rem)] max-w-7xl flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">标签系统</h1>
          <p className="text-sm text-muted-foreground">
            标签分类与批量操作 — 给技能打标签，整理未标记项，合并重复标签
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAiTagOpen(true)}
            disabled={!settingsStatus?.hasApiKey}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            AI 打标签
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            + 新建标签
          </Button>
        </div>
      </div>

      {/* Main content: left-right split */}
      <div className="flex flex-1 overflow-hidden rounded-md border">
        {/* Left panel: tag list */}
        <div className="flex w-64 shrink-0 flex-col border-r">
          <div className="border-b p-3">
            <Input
              placeholder="搜索标签..."
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {/* Virtual untagged entry — always on top */}
            <div
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent/50 ${
                isUntaggedSelected ? "bg-accent" : ""
              } ${untaggedCount === 0 ? "opacity-40" : ""}`}
              onClick={() => setSelectedTag(UNTAGGED_KEY)}
            >
              <span className={untaggedCount > 0 ? "font-medium" : "text-muted-foreground italic"}>未标记</span>
              <Badge variant={untaggedCount > 0 ? "destructive" : "outline"} className="text-[10px] shrink-0">
                {untaggedCount}
              </Badge>
            </div>
            <Separator />

            {filteredTags.map((tag) => (
              <div
                key={tag.name}
                className={`group flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-accent/50 ${
                  selectedTag === tag.name ? "bg-accent" : ""
                }`}
                onClick={() => setSelectedTag(tag.name)}
              >
                <span className="flex items-center gap-2 truncate">
                  <span className="truncate">{tag.name}</span>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {tag.count}
                  </Badge>
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      &#x22EF;
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenameTarget(tag.name);
                        setRenameValue(tag.name);
                        setRenameDialogOpen(true);
                      }}
                    >
                      重命名
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setMergeSource(tag.name);
                        setMergeTarget("");
                        setMergeDialogOpen(true);
                      }}
                    >
                      合并到...
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmTag(tag.name);
                      }}
                    >
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            {filteredTags.length === 0 && untaggedCount === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                无匹配标签
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedTag ? (
            <>
              {/* Right header */}
              <div className="border-b px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{rightPanelTitle}</h2>
                    <Badge variant="secondary" className="text-xs">
                      {rightPanelCount} 个技能
                    </Badge>
                  </div>
                  {!isUntaggedSelected && (
                    <Button
                      variant={editMode ? "default" : "outline"}
                      size="sm"
                      onClick={() => {
                        if (editMode && hasChanges) {
                          // switching back without saving — reset
                          setCheckedSkills(new Set(originalChecked));
                        }
                        setEditMode(!editMode);
                      }}
                    >
                      {editMode ? "退出编辑" : "编辑"}
                    </Button>
                  )}
                </div>
                {(editMode || isUntaggedSelected) && (
                  <div className="mt-2">
                    <Input
                      placeholder="搜索技能..."
                      value={skillSearch}
                      onChange={(e) => setSkillSearch(e.target.value)}
                      className="h-8 max-w-xs"
                    />
                  </div>
                )}
              </div>

              {/* Skill list */}
              <div className="flex-1 overflow-y-auto">
                {displaySkills.length === 0 && (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    {isUntaggedSelected ? "所有技能都已标记" : "无匹配技能"}
                  </div>
                )}

                {displaySkills.map((skill) => {
                  const skillKey = `${skill.name}::${skill.source}`;
                  const sourceStyle = SOURCE_BADGE_STYLES[skill.source] ?? {
                    label: skill.source,
                    className: "",
                  };

                  // Edit mode: show checkboxes
                  if (editMode && !isUntaggedSelected) {
                    const isChecked = checkedSkills.has(skill.name);
                    return (
                      <label
                        key={skillKey}
                        className="flex cursor-pointer items-center gap-3 border-b px-4 py-2 transition-colors hover:bg-accent/30"
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(checked) => {
                            const next = new Set(checkedSkills);
                            if (checked) next.add(skill.name);
                            else next.delete(skill.name);
                            setCheckedSkills(next);
                          }}
                        />
                        <span className="w-[200px] shrink-0 truncate font-mono text-sm">
                          {skillDisplayName(skill.name)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] ${sourceStyle.className}`}
                        >
                          {sourceStyle.label}
                        </Badge>
                        <span className="flex-1 truncate text-xs text-muted-foreground">
                          {cleanDescriptionSummary(skill.description)}
                        </span>
                      </label>
                    );
                  }

                  // Untagged mode: show quick-tag selector
                  if (isUntaggedSelected) {
                    return (
                      <div
                        key={skillKey}
                        className="flex items-center gap-3 border-b px-4 py-2"
                      >
                        <span
                          className="w-[200px] shrink-0 cursor-pointer truncate font-mono text-sm hover:text-primary hover:underline"
                          onClick={() => { setDetailSkill(skill); setDetailOpen(true); }}
                        >
                          {skillDisplayName(skill.name)}
                        </span>
                        <Badge
                          variant="outline"
                          className={`shrink-0 text-[10px] ${sourceStyle.className}`}
                        >
                          {sourceStyle.label}
                        </Badge>
                        <span className="flex-1 truncate text-xs text-muted-foreground">
                          {cleanDescriptionSummary(skill.description)}
                        </span>
                        <Select onValueChange={(tag) => quickTag(skill.name, tag)}>
                          <SelectTrigger className="h-7 w-[120px] shrink-0 text-xs">
                            <SelectValue placeholder="+ 选标签" />
                          </SelectTrigger>
                          <SelectContent>
                            {realTags.map((t) => (
                              <SelectItem key={t.name} value={t.name} className="text-xs">
                                {t.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }

                  // Browse mode: simple list (clickable → detail sheet)
                  return (
                    <div
                      key={skillKey}
                      className="flex cursor-pointer items-center gap-3 border-b px-4 py-2 transition-colors hover:bg-accent/30"
                      onClick={() => { setDetailSkill(skill); setDetailOpen(true); }}
                    >
                      <span className="w-[200px] shrink-0 truncate font-mono text-sm">
                        {skillDisplayName(skill.name)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`shrink-0 text-[10px] ${sourceStyle.className}`}
                      >
                        {sourceStyle.label}
                      </Badge>
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        {cleanDescriptionSummary(skill.description)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Bottom action bar (edit mode only) */}
              {editMode && hasChanges && (
                <div className="flex items-center justify-between border-t bg-muted/50 px-4 py-3">
                  <span className="text-sm text-muted-foreground">
                    {added.size > 0 && `+${added.size} 添加`}
                    {added.size > 0 && removed.size > 0 && "，"}
                    {removed.size > 0 && `-${removed.size} 移除`}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCheckedSkills(new Set(originalChecked))}
                    >
                      撤销
                    </Button>
                    <Button size="sm" onClick={saveChanges} disabled={saving}>
                      {saving ? "保存中..." : "保存更改"}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              选择左侧标签查看关联技能
            </div>
          )}
        </div>
      </div>

      {/* Create tag dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建标签</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="标签名称"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createTag()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={createTag} disabled={!newTagName.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名标签「{renameTarget}」</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="新名称"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && renameTag()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={renameTag} disabled={!renameValue.trim() || renameValue.trim() === renameTarget}>
              确认重命名
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>合并「{mergeSource}」到...</DialogTitle>
          </DialogHeader>
          <Select value={mergeTarget} onValueChange={setMergeTarget}>
            <SelectTrigger>
              <SelectValue placeholder="选择目标标签" />
            </SelectTrigger>
            <SelectContent>
              {tags
                .filter((t) => t.name !== mergeSource && t.name !== "未分类")
                .map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name} ({t.count})
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={mergeTag} disabled={!mergeTarget}>
              确认合并
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Skill detail sheet */}
      <SkillDetailSheet
        skill={detailSkill}
        allSkillNames={skills.map((s) => s.name)}
        allDomains={realTags.map((t) => t.name)}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdated={fetchAll}
      />

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirmTag} onOpenChange={() => setDeleteConfirmTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            确定要删除标签「{deleteConfirmTag}」吗？此操作会从所有技能中移除该标签。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmTag(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmTag && deleteTag(deleteConfirmTag)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Tag Dialog */}
      <AITagDialog
        open={aiTagOpen}
        onOpenChange={setAiTagOpen}
        untaggedCount={untaggedCount}
        hasApiKey={settingsStatus?.hasApiKey ?? false}
        onApplied={fetchAll}
      />
    </div>
  );
}
