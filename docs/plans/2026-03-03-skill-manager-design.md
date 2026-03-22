# Skill Manager 设计文档

> 日期：2026-03-03
> 状态：已批准

## 定位

用户个人用的 Claude Code Skills 可视化管理工具。110+ skills 的标签、分组、依赖关系、编排链路的图形化管理。

## 核心约束

- **只读原则**：对 `~/.claude/skills/`、`plugins/`、`CLAUDE.md` 全部只读，零写入
- **元数据隔离**：所有标签、分组、编排数据存在项目自己的 `data/` 目录

## 项目位置

`$PROJECT_ROOT/`

## 技术栈

| 组件 | 选择 |
|------|------|
| 框架 | Next.js 14 App Router |
| UI | shadcn/ui + Tailwind CSS |
| 图表 | Recharts |
| 依赖图 | React Flow |
| File Watcher | chokidar |
| 实时推送 | Server-Sent Events (SSE) |
| 语言 | TypeScript (strict) |
| 包管理 | pnpm |

## 架构

```
浏览器 (localhost:3000)
    │ HTTP (API Routes) + SSE
    ▼
Next.js 14 App Router
    ├── Scanner 引擎（只读解析）
    ├── File Watcher（chokidar 监听变化）
    └── data/skills-registry.json（自动数据 + 手动标签）
         │ 只读           │ 只读            │ 只读
         ▼                ▼                 ▼
  ~/.claude/skills/  ~/.claude/plugins/  ~/.claude/CLAUDE.md
```

## 数据模型

### skills-registry.json

```jsonc
{
  "skills": {
    "<skill-name>": {
      // 自动扫描
      "name": "string",
      "path": "string",
      "source": "self-built | baoyu | plugin-official | plugin-community",
      "description": "string (SKILL.md 前 3 行)",
      "lineCount": "number",
      "lastModified": "ISO 8601",
      "claudeMdRefs": [{ "table": "string", "trigger": "string" }],

      // 手动标注
      "tags": {
        "domain": ["string"],          // 功能域
        "frequency": "daily | weekly | occasional | rare",
        "pipeline": "string"           // 所属编排体系
      },
      "dependencies": ["string"],
      "notes": "string"
    }
  },

  "pipelines": {
    "<pipeline-name>": {
      "description": "string",
      "steps": [{ "skill": "string", "role": "string" }]
    }
  },

  "meta": {
    "lastScan": "ISO 8601",
    "totalSkills": "number",
    "version": 1
  }
}
```

### 5 个标签维度

| 维度 | 数据来源 | 填充方式 |
|------|---------|---------|
| 功能域 | tags.domain | 手动标注 |
| 使用频率 | tags.frequency | 手动标注 |
| 来源 | source | 自动识别（前缀/目录规则） |
| CLAUDE.md 关联 | claudeMdRefs | 自动解析路由表 |
| 编排体系 | tags.pipeline + pipelines | 手动编排 |

### 来源自动识别规则

- `baoyu-*` 前缀 → "baoyu"
- `plugins/cache/claude-plugins-official/` 下 → "plugin-official"
- `plugins/cache/superpowers-marketplace/` 下 → "plugin-community"
- 其余 → "self-built"

## Scanner 引擎

1. 扫描 `~/.claude/skills/*/SKILL.md`（跳过 `_archived/`）
2. 扫描 `~/.claude/plugins/cache/*/`
3. 解析 `~/.claude/CLAUDE.md` 路由表（正则匹配 markdown table）
4. 自动识别来源
5. 合并手动标注（保留已有 tags/deps/notes 不覆盖）
6. 输出 → `data/skills-registry.json`

## File Watcher

- chokidar 监听 `~/.claude/skills/`、`~/.claude/plugins/`、`~/.claude/CLAUDE.md`
- 事件触发增量扫描 → 更新 registry → SSE 推送前端

## API Routes

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/skills` | GET | 全部 skills（支持筛选） |
| `/api/skills/[name]` | GET | 单个 skill 详情 |
| `/api/skills/[name]/tags` | PATCH | 更新标签 |
| `/api/skills/[name]/deps` | PUT | 设置依赖关系 |
| `/api/skills/[name]/notes` | PATCH | 更新备注 |
| `/api/pipelines` | GET/POST | 获取/创建编排链路 |
| `/api/pipelines/[id]` | PUT/DELETE | 更新/删除编排链路 |
| `/api/stats` | GET | Dashboard 统计 |
| `/api/scan` | POST | 手动触发全量扫描 |
| `/api/events` | GET (SSE) | 实时推送文件变化 |

## 前端页面

### 1. Dashboard 总览 `/`
- 统计卡片（总数、路由规则数、孤立数、编排链路数）
- 功能域分布饼图 + 来源分布柱状图
- 最近变动列表

### 2. Skills 列表 `/skills`
- 搜索 + 多维度筛选（功能域、来源、频率）
- Skill 卡片（名称、描述、标签、来源、CLAUDE.md 状态、依赖）
- 点击展开详情面板（编辑标签、依赖、备注）

### 3. 依赖关系图 `/graph`
- React Flow 交互式节点图
- 三种视图：依赖图、编排链路、CLAUDE.md 关联
- 悬停高亮、点击详情、缩放拖拽
- 孤立节点灰色标注

### 4. 编排管理 `/pipelines`
- 编排链路可视化（步骤流程图）
- 拖拽调整顺序
- 新建/编辑/删除链路

## 目录结构

```
skill-manager/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Dashboard
│   │   ├── skills/page.tsx       # Skills 列表
│   │   ├── graph/page.tsx        # 依赖图
│   │   ├── pipelines/page.tsx    # 编排管理
│   │   └── api/                  # API Routes
│   ├── lib/
│   │   ├── scanner.ts            # 扫描引擎
│   │   ├── watcher.ts            # File Watcher
│   │   ├── registry.ts           # registry 读写
│   │   └── claude-md-parser.ts   # CLAUDE.md 解析器
│   └── components/
│       ├── skill-card.tsx
│       ├── tag-editor.tsx
│       ├── dependency-graph.tsx   # React Flow
│       └── pipeline-editor.tsx    # 编排编辑器
├── data/
│   └── skills-registry.json      # 唯一数据文件
├── package.json
└── tsconfig.json
```
