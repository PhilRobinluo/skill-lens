export type SkillSource =
  | "self-built"
  | "baoyu"
  | "plugin-official"
  | "plugin-community";

export type Frequency = "daily" | "weekly" | "occasional" | "rare";

export interface ClaudeMdRef {
  table: string;
  trigger: string;
}

export interface SkillTags {
  domain: string[];
  autoTagged: boolean;
  frequency: Frequency | null;
}

export interface SkillEntry {
  name: string;
  path: string;
  source: SkillSource;
  description: string;
  lineCount: number;
  createdAt: string;
  lastModified: string;
  claudeMdRefs: ClaudeMdRef[];
  tags: SkillTags;
  dependencies: string[];
  notes: string;
}

export interface RegistryMeta {
  lastScan: string | null;
  totalSkills: number;
  version: number;
  customTags?: string[];
}

export interface SkillsRegistry {
  skills: Record<string, SkillEntry>;
  meta: RegistryMeta;
}

// ---------- Table Filter Types ----------

export type FilterOperator =
  | "contains"
  | "not_contains"
  | "is_empty"
  | "is_not_empty"
  | "equals"
  | "not_equals"
  | "gt"
  | "lt";

export type FilterableField =
  | "name"
  | "source"
  | "status"
  | "domain"
  | "description"
  | "lineCount";

export interface FilterCondition {
  id: string;
  field: FilterableField;
  operator: FilterOperator;
  value: string;
}

export type FilterLogic = "and" | "or";

export interface FilterState {
  conditions: FilterCondition[];
  logic: FilterLogic;
}

// ---------- Dashboard ----------

export interface DashboardStats {
  totalSkills: number;
  routedSkills: number;
  orphanSkills: number;
  domainDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  recentChanges: Array<{ name: string; lastModified: string }>;
}
