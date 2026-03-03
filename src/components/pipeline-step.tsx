"use client";

import { useState, useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export interface PipelineStepData {
  id: string;
  skill: string;
  role: string;
}

interface PipelineStepProps {
  step: PipelineStepData;
  onDelete: (id: string) => void;
  onRoleChange: (id: string, newRole: string) => void;
  isLast: boolean;
}

export function PipelineStep({
  step,
  onDelete,
  onRoleChange,
  isLast,
}: PipelineStepProps) {
  const [editingRole, setEditingRole] = useState(false);
  const [roleValue, setRoleValue] = useState(step.role);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (editingRole && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingRole]);

  function commitRole() {
    const trimmed = roleValue.trim();
    if (trimmed && trimmed !== step.role) {
      onRoleChange(step.id, trimmed);
    } else {
      setRoleValue(step.role);
    }
    setEditingRole(false);
  }

  return (
    <div className="flex items-center gap-0 shrink-0">
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 shadow-sm transition-shadow ${
          isDragging
            ? "z-50 shadow-lg ring-2 ring-primary/30 opacity-90"
            : "hover:shadow-md"
        }`}
      >
        {/* Drag handle */}
        <button
          className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Skill name */}
        <span className="text-sm font-medium whitespace-nowrap">
          {step.skill}
        </span>

        {/* Role label (click to edit) */}
        {editingRole ? (
          <Input
            ref={inputRef}
            value={roleValue}
            onChange={(e) => setRoleValue(e.target.value)}
            onBlur={commitRole}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRole();
              if (e.key === "Escape") {
                setRoleValue(step.role);
                setEditingRole(false);
              }
            }}
            className="h-6 w-20 text-xs px-1.5"
          />
        ) : (
          <Badge
            variant="secondary"
            className="cursor-pointer text-xs hover:bg-secondary/80"
            onClick={() => setEditingRole(true)}
            title="点击编辑角色"
          >
            {step.role}
          </Badge>
        )}

        {/* Delete button */}
        <button
          onClick={() => onDelete(step.id)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          title="删除步骤"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Arrow connector */}
      {!isLast && (
        <span className="mx-1 text-muted-foreground text-lg select-none">
          →
        </span>
      )}
    </div>
  );
}
