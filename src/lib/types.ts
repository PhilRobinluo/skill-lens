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
  pipeline: string | null;
}

export interface SkillEntry {
  name: string;
  path: string;
  source: SkillSource;
  description: string;
  lineCount: number;
  lastModified: string;
  claudeMdRefs: ClaudeMdRef[];
  tags: SkillTags;
  dependencies: string[];
  notes: string;
}

export interface PipelineStep {
  skill: string;
  role: string;
}

export interface Pipeline {
  description: string;
  steps: PipelineStep[];
}

export interface RegistryMeta {
  lastScan: string | null;
  totalSkills: number;
  version: number;
}

export interface SkillsRegistry {
  skills: Record<string, SkillEntry>;
  pipelines: Record<string, Pipeline>;
  meta: RegistryMeta;
}

export interface DashboardStats {
  totalSkills: number;
  routedSkills: number;
  orphanSkills: number;
  totalPipelines: number;
  domainDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  recentChanges: Array<{ name: string; lastModified: string }>;
}
