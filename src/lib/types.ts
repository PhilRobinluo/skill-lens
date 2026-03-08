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
  upstream?: UpstreamInfo;
  gitHistory?: SkillGitHistory;
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
  | "lineCount"
  | "upstream"
  | "commits";

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

// ---------- Settings ----------

export interface AppSettings {
  openRouterApiKey: string;
  aiModel: string;
}

export interface SettingsStatus {
  hasApiKey: boolean;
  aiModel: string;
}

// ---------- AI: Health Report ----------

export interface HealthReportResponse {
  report: string;
  generatedAt: string;
}

// ---------- AI: Auto Tagging ----------

export interface TagSuggestion {
  skillName: string;
  suggestedDomains: string[];
  confidence: "high" | "medium" | "low";
  reason: string;
}

export interface AutoTagResponse {
  suggestions: TagSuggestion[];
}

// ---------- AI: Flow Generation ----------

export interface GeneratedFlowNode {
  skillName: string;
  label: string;
  x: number;
  y: number;
}

export interface GeneratedFlowEdge {
  source: string;
  target: string;
  label?: string;
}

export interface FlowGenerationResponse {
  nodes: GeneratedFlowNode[];
  edges: GeneratedFlowEdge[];
  summary: string;
}

// ---------- Dashboard ----------

export interface DashboardStats {
  totalSkills: number;
  routedSkills: number;
  orphanSkills: number;
  domainDistribution: Record<string, number>;
  sourceDistribution: Record<string, number>;
  recentChanges: Array<{ name: string; lastModified: string }>;
  forkStats?: ForkStats;
  evolutionStats?: EvolutionStats;
}

// ---------- Upstream Tracking ----------

export type ModificationType = "bugfix" | "capability" | "config";

export interface SkillModification {
  file: string;
  type: ModificationType;
  summary: string;
}

export type UpstreamStatus = "original" | "following" | "modified";

export interface UpstreamInfo {
  origin: string;
  originUrl?: string;
  baseCommitSha?: string;
  forkedAt?: string;
  status: UpstreamStatus;
  localModified: boolean;
  modifications: SkillModification[];
  lastReconciled?: string;
}

// ---------- Git History ----------

export interface GitCommitInfo {
  sha: string;
  date: string;
  author: string;
  message: string;
  additions: number;
  deletions: number;
}

export interface SkillGitHistory {
  totalCommits: number;
  createdAt: string;
  lastCommitAt: string;
  hasUncommittedChanges: boolean;
  contributors: string[];
  timeline: GitCommitInfo[];
}

// ---------- File Browser ----------

export interface FileNode {
  name: string;
  relativePath: string;
  type: "file" | "directory";
  size?: number;
  lastModified?: string;
  children?: FileNode[];
}

// ---------- Extended Dashboard Stats ----------

export interface ForkStats {
  totalWithUpstream: number;
  modified: number;
  needsReconciliation: number;
}

export interface EvolutionStats {
  activeThisMonth: number;
  newThisMonth: number;
  mostActive: Array<{ name: string; commits: number }>;
}

// ---------- Upstream Update Detection ----------

export interface UpstreamUpdateInfo {
  marketplace: string;
  pluginName: string;
  installedSha: string;
  latestSha: string | null;
  commitsAvailable: number;
  changelog: UpstreamCommit[];
  hasUpdate: boolean;
  lastChecked: string;
}

export interface UpstreamCommit {
  sha: string;
  date: string;
  author: string;
  message: string;
}
