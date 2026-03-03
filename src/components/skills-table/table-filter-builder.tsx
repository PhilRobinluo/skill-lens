"use client";

import { useState } from "react";
import { Filter, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  FilterCondition,
  FilterState,
  FilterableField,
  FilterOperator,
  FilterLogic,
  SkillEntry,
} from "@/lib/types";

const FIELD_OPTIONS: Array<{ value: FilterableField; label: string; type: "text" | "enum" | "number" | "multi" }> = [
  { value: "name", label: "名称", type: "text" },
  { value: "source", label: "来源", type: "enum" },
  { value: "status", label: "路由状态", type: "enum" },
  { value: "domain", label: "领域", type: "multi" },
  { value: "description", label: "描述", type: "text" },
  { value: "lineCount", label: "行数", type: "number" },
];

function getFieldType(field: FilterableField) {
  return FIELD_OPTIONS.find((f) => f.value === field)?.type ?? "text";
}

const OPERATORS_BY_TYPE: Record<string, Array<{ value: FilterOperator; label: string }>> = {
  text: [
    { value: "contains", label: "包含" },
    { value: "not_contains", label: "不包含" },
    { value: "is_empty", label: "为空" },
    { value: "is_not_empty", label: "不为空" },
  ],
  enum: [
    { value: "equals", label: "等于" },
    { value: "not_equals", label: "不等于" },
  ],
  number: [
    { value: "equals", label: "等于" },
    { value: "gt", label: "大于" },
    { value: "lt", label: "小于" },
  ],
  multi: [
    { value: "contains", label: "包含" },
    { value: "not_contains", label: "不包含" },
    { value: "is_empty", label: "为空" },
    { value: "is_not_empty", label: "不为空" },
  ],
};

const VALUE_OPTIONS: Partial<Record<FilterableField, Array<{ value: string; label: string }>>> = {
  source: [
    { value: "self-built", label: "自建" },
    { value: "baoyu", label: "宝玉系列" },
    { value: "plugin-official", label: "官方插件" },
    { value: "plugin-community", label: "社区插件" },
  ],
  status: [
    { value: "routed", label: "已路由" },
    { value: "orphan", label: "孤立" },
  ],
};

let nextId = 0;
function makeCondition(field: FilterableField = "name"): FilterCondition {
  const type = getFieldType(field);
  const defaultOp = OPERATORS_BY_TYPE[type]?.[0]?.value ?? "contains";
  return { id: String(++nextId), field, operator: defaultOp, value: "" };
}

// ---------- Filter Logic ----------

function getFieldValue(skill: SkillEntry, field: FilterableField): string {
  switch (field) {
    case "name": return skill.name;
    case "source": return skill.source;
    case "status": return skill.claudeMdRefs.length > 0 ? "routed" : "orphan";
    case "domain": return skill.tags.domain.join(", ");
    case "description": return skill.description;
    case "lineCount": return String(skill.lineCount);
  }
}

function matchCondition(skill: SkillEntry, cond: FilterCondition): boolean {
  const val = getFieldValue(skill, cond.field).toLowerCase();
  const target = cond.value.toLowerCase();

  switch (cond.operator) {
    case "contains": return val.includes(target);
    case "not_contains": return !val.includes(target);
    case "is_empty": return val === "";
    case "is_not_empty": return val !== "";
    case "equals": return val === target;
    case "not_equals": return val !== target;
    case "gt": return Number(val) > Number(target);
    case "lt": return Number(val) < Number(target);
  }
}

export function filterSkills(skills: SkillEntry[], state: FilterState): SkillEntry[] {
  if (state.conditions.length === 0) return skills;

  return skills.filter((skill) => {
    if (state.logic === "and") {
      return state.conditions.every((c) => matchCondition(skill, c));
    }
    return state.conditions.some((c) => matchCondition(skill, c));
  });
}

// ---------- UI Component ----------

interface TableFilterBuilderProps {
  filterState: FilterState;
  onChange: (state: FilterState) => void;
}

export function TableFilterBuilder({ filterState, onChange }: TableFilterBuilderProps) {
  const [open, setOpen] = useState(false);

  const activeCount = filterState.conditions.length;

  function addCondition() {
    onChange({
      ...filterState,
      conditions: [...filterState.conditions, makeCondition()],
    });
  }

  function removeCondition(id: string) {
    onChange({
      ...filterState,
      conditions: filterState.conditions.filter((c) => c.id !== id),
    });
  }

  function updateCondition(id: string, updates: Partial<FilterCondition>) {
    onChange({
      ...filterState,
      conditions: filterState.conditions.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...updates };
        // Reset operator & value when field changes
        if (updates.field && updates.field !== c.field) {
          const type = getFieldType(updates.field);
          updated.operator = OPERATORS_BY_TYPE[type]?.[0]?.value ?? "contains";
          updated.value = "";
        }
        return updated;
      }),
    });
  }

  function setLogic(logic: FilterLogic) {
    onChange({ ...filterState, logic });
  }

  function clearAll() {
    onChange({ conditions: [], logic: "and" });
  }

  const needsValue = (op: FilterOperator) =>
    op !== "is_empty" && op !== "is_not_empty";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          筛选
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 text-[10px]">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] p-3" align="start">
        <div className="space-y-2">
          {filterState.conditions.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>条件之间</span>
              <Select value={filterState.logic} onValueChange={(v) => setLogic(v as FilterLogic)}>
                <SelectTrigger className="h-6 w-[60px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="and" className="text-xs">且</SelectItem>
                  <SelectItem value="or" className="text-xs">或</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {filterState.conditions.map((cond) => {
            const fieldType = getFieldType(cond.field);
            const operators = OPERATORS_BY_TYPE[fieldType] ?? [];
            const valueOpts = VALUE_OPTIONS[cond.field];

            return (
              <div key={cond.id} className="flex items-center gap-1.5">
                {/* Field */}
                <Select
                  value={cond.field}
                  onValueChange={(v) => updateCondition(cond.id, { field: v as FilterableField })}
                >
                  <SelectTrigger className="h-7 w-[90px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value} className="text-xs">
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Operator */}
                <Select
                  value={cond.operator}
                  onValueChange={(v) => updateCondition(cond.id, { operator: v as FilterOperator })}
                >
                  <SelectTrigger className="h-7 w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {operators.map((op) => (
                      <SelectItem key={op.value} value={op.value} className="text-xs">
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Value */}
                {needsValue(cond.operator) && (
                  valueOpts ? (
                    <Select
                      value={cond.value}
                      onValueChange={(v) => updateCondition(cond.id, { value: v })}
                    >
                      <SelectTrigger className="h-7 flex-1 text-xs">
                        <SelectValue placeholder="选择..." />
                      </SelectTrigger>
                      <SelectContent>
                        {valueOpts.map((v) => (
                          <SelectItem key={v.value} value={v.value} className="text-xs">
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={cond.value}
                      onChange={(e) => updateCondition(cond.id, { value: e.target.value })}
                      placeholder="输入值..."
                      className="h-7 flex-1 text-xs"
                    />
                  )
                )}

                {/* Delete */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeCondition(cond.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}

          <div className="flex items-center gap-2 pt-1">
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addCondition}>
              <Plus className="h-3 w-3" />
              添加条件
            </Button>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={clearAll}>
                清除全部
              </Button>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
