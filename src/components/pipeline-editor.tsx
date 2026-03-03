"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PipelineStep, type PipelineStepData } from "./pipeline-step";

interface PipelineEditorProps {
  id: string;
  description: string;
  steps: PipelineStepData[];
  allSkillNames: string[];
  onDelete: (id: string) => void;
  onSave: (
    id: string,
    description: string,
    steps: Array<{ skill: string; role: string }>,
  ) => void;
}

export function PipelineEditor({
  id,
  description: initialDescription,
  steps: initialSteps,
  allSkillNames,
  onDelete,
  onSave,
}: PipelineEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [description, setDescription] = useState(initialDescription);
  const [steps, setSteps] = useState<PipelineStepData[]>(initialSteps);

  // Add-step dialog
  const [addOpen, setAddOpen] = useState(false);
  const [newSkill, setNewSkill] = useState("");
  const [newRole, setNewRole] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Debounced save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from parent when props change (e.g. SSE refresh)
  useEffect(() => {
    setDescription(initialDescription);
  }, [initialDescription]);

  useEffect(() => {
    setSteps(initialSteps);
  }, [initialSteps]);

  const debouncedSave = useCallback(
    (desc: string, s: Array<{ skill: string; role: string }>) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        onSave(id, desc, s);
      }, 500);
    },
    [id, onSave],
  );

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function toApiSteps(
    items: PipelineStepData[],
  ): Array<{ skill: string; role: string }> {
    return items.map((s) => ({ skill: s.skill, role: s.role }));
  }

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setSteps((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id);
        const newIndex = prev.findIndex((s) => s.id === over.id);
        const reordered = arrayMove(prev, oldIndex, newIndex);
        debouncedSave(description, toApiSteps(reordered));
        return reordered;
      });
    }
  }

  function handleDescriptionChange(val: string) {
    setDescription(val);
    debouncedSave(val, toApiSteps(steps));
  }

  function handleDeleteStep(stepId: string) {
    setSteps((prev) => {
      const filtered = prev.filter((s) => s.id !== stepId);
      if (filtered.length > 0) {
        debouncedSave(description, toApiSteps(filtered));
      }
      return filtered;
    });
  }

  function handleRoleChange(stepId: string, newRole: string) {
    setSteps((prev) => {
      const updated = prev.map((s) =>
        s.id === stepId ? { ...s, role: newRole } : s,
      );
      debouncedSave(description, toApiSteps(updated));
      return updated;
    });
  }

  function handleAddStep() {
    if (!newSkill.trim() || !newRole.trim()) return;

    const newStep: PipelineStepData = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      skill: newSkill.trim(),
      role: newRole.trim(),
    };

    setSteps((prev) => {
      const updated = [...prev, newStep];
      debouncedSave(description, toApiSteps(updated));
      return updated;
    });

    setNewSkill("");
    setNewRole("");
    setSkillFilter("");
    setAddOpen(false);
  }

  const filteredSkills = allSkillNames.filter((name) =>
    name.toLowerCase().includes(skillFilter.toLowerCase()),
  );

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{id}</span>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {steps.length} 步骤
            </Badge>
          </div>
          {!collapsed && (
            <Input
              value={description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="描述..."
              className="mt-1 h-7 text-xs text-muted-foreground border-none bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
          onClick={() => onDelete(id)}
          title="删除链路"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Steps row */}
      {!collapsed && (
        <div className="px-4 py-4">
          {steps.length === 0 ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>暂无步骤</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                添加第一个步骤
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-0 overflow-x-auto pb-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={steps.map((s) => s.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {steps.map((step, idx) => (
                    <PipelineStep
                      key={step.id}
                      step={step}
                      onDelete={handleDeleteStep}
                      onRoleChange={handleRoleChange}
                      isLast={idx === steps.length - 1}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Add step button */}
              <Button
                variant="outline"
                size="icon"
                className="ml-2 h-8 w-8 shrink-0 rounded-full"
                onClick={() => setAddOpen(true)}
                title="添加步骤"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add Step Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加步骤</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Skill autocomplete */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Skill</label>
              <div className="relative">
                <Input
                  value={newSkill}
                  onChange={(e) => {
                    setNewSkill(e.target.value);
                    setSkillFilter(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => {
                    // Delay to allow click on suggestion
                    setTimeout(() => setShowSuggestions(false), 200);
                  }}
                  placeholder="搜索 skill 名称..."
                  className="h-9"
                />
                {showSuggestions && skillFilter && filteredSkills.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-40 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
                    {filteredSkills.slice(0, 10).map((name) => (
                      <button
                        key={name}
                        className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setNewSkill(name);
                          setSkillFilter(name);
                          setShowSuggestions(false);
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Role */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">角色</label>
              <Input
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder='例如: "选题", "写作", "发布"'
                className="h-9"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddStep();
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleAddStep}
              disabled={!newSkill.trim() || !newRole.trim()}
              className="w-full sm:w-auto"
            >
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
