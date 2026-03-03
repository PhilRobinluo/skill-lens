"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

interface TagInfo {
  name: string;
  count: number;
}

interface TagManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function TagManager({ open, onOpenChange, onUpdated }: TagManagerProps) {
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [newTagValue, setNewTagValue] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tags");
      if (res.ok) {
        const data = (await res.json()) as { tags: TagInfo[] };
        setTags(data.tags);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchTags();
  }, [open, fetchTags]);

  async function handleCreate() {
    const tag = newTagValue.trim();
    if (!tag) return;
    setCreateError(null);

    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", tag }),
    });

    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setCreateError(data.error ?? "创建失败");
      return;
    }

    setNewTagValue("");
    fetchTags();
    onUpdated();
  }

  async function handleRename(oldTag: string) {
    const newTag = editValue.trim();
    if (!newTag || newTag === oldTag) {
      setEditingTag(null);
      return;
    }

    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rename", tag: oldTag, newTag }),
    });

    setEditingTag(null);
    setEditValue("");
    fetchTags();
    onUpdated();
  }

  async function handleDelete(tag: string) {
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", tag }),
    });

    fetchTags();
    onUpdated();
  }

  async function handleMerge(fromTag: string, intoTag: string) {
    await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "merge", tag: fromTag, newTag: intoTag }),
    });

    fetchTags();
    onUpdated();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>标签管理</SheetTitle>
          <SheetDescription>
            全局管理领域标签：重命名、删除、合并。修改会应用到所有使用该标签的技能。
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 px-4 pb-8">
          {/* Create new tag */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="输入新标签名..."
              value={newTagValue}
              onChange={(e) => {
                setNewTagValue(e.target.value);
                setCreateError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              className="h-8 flex-1 text-sm"
            />
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs"
              disabled={!newTagValue.trim()}
              onClick={handleCreate}
            >
              新建
            </Button>
          </div>
          {createError && (
            <p className="text-xs text-red-500">{createError}</p>
          )}

          <Separator className="my-2" />

          {loading && <p className="text-sm text-muted-foreground">加载中...</p>}

          {!loading && tags.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无标签</p>
          )}

          {tags.map((tag) => (
            <div
              key={tag.name}
              className="flex items-center gap-2 rounded-md border px-3 py-2"
            >
              {editingTag === tag.name ? (
                // Editing mode
                <div className="flex flex-1 items-center gap-2">
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(tag.name);
                      if (e.key === "Escape") setEditingTag(null);
                    }}
                    className="h-7 flex-1 text-sm"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    onClick={() => handleRename(tag.name)}
                  >
                    确定
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setEditingTag(null)}
                  >
                    取消
                  </Button>
                </div>
              ) : (
                // Display mode
                <>
                  <Badge variant="secondary" className="text-xs">
                    {tag.name}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {tag.count} 个技能
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[11px] text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                      onClick={() => {
                        setEditingTag(tag.name);
                        setEditValue(tag.name);
                      }}
                    >
                      重命名
                    </button>
                    <Separator orientation="vertical" className="h-3" />
                    <button
                      type="button"
                      className="rounded px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                      onClick={() => handleDelete(tag.name)}
                    >
                      删除
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}

          {tags.length > 1 && (
            <>
              <Separator className="my-4" />
              <MergeSection tags={tags} onMerge={handleMerge} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Merge UI: select two tags and merge them
function MergeSection({
  tags,
  onMerge,
}: {
  tags: TagInfo[];
  onMerge: (from: string, into: string) => void;
}) {
  const [fromTag, setFromTag] = useState("");
  const [intoTag, setIntoTag] = useState("");

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-muted-foreground">合并标签</h3>
      <p className="text-xs text-muted-foreground">
        将一个标签合并到另一个，所有使用旧标签的技能会自动改为新标签。
      </p>
      <div className="flex items-center gap-2">
        <select
          value={fromTag}
          onChange={(e) => setFromTag(e.target.value)}
          className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">选择旧标签...</option>
          {tags.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.count})
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">→</span>
        <select
          value={intoTag}
          onChange={(e) => setIntoTag(e.target.value)}
          className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
        >
          <option value="">选择新标签...</option>
          {tags.filter((t) => t.name !== fromTag).map((t) => (
            <option key={t.name} value={t.name}>
              {t.name} ({t.count})
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          disabled={!fromTag || !intoTag || fromTag === intoTag}
          onClick={() => {
            onMerge(fromTag, intoTag);
            setFromTag("");
            setIntoTag("");
          }}
        >
          合并
        </Button>
      </div>
    </div>
  );
}
