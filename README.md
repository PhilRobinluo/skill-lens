# 技能透镜 Skill Lens

一个本地运行的 AI Skill 管理面板。它把 Claude Code 和 Codex 的 skill、规则文件、标签、来源和治理问题放到同一个 Web UI 里看清楚。

现在主线是网页版，不再把桌面 App 当作主要交付形态。

## 现在解决什么问题

当 skill 越来越多之后，真正麻烦的不是“有没有文件”，而是：

| 问题 | Skill Lens 怎么处理 |
| --- | --- |
| Claude 和 Codex 混在一起 | 顶部 Runtime 一键切换，整站数据跟随切换 |
| 全局 skill 和项目 skill 混在一起 | 视角分成“全局 Skill”和“按项目的 Skill” |
| Codex 不该看 CLAUDE.md | Codex 规则页读取 `~/.codex/AGENTS.md` |
| 旧远程/OpenClaw 配置有风险 | OpenClaw 入口和远程实例代码已移除 |
| 治理提示太抽象 | 治理卡片展示具体 skill 名称、路径和原因 |
| Codex 插件 skill 点详情 404 | 详情页通过 runtime-aware resolver 读取真实 skill 路径 |
| 规则文件没有版本历史 | 检测 Git 状态，提示如何给 `~/.codex/AGENTS.md` 或 `~/.claude/CLAUDE.md` 做版本管理 |

## 快速开始

```bash
git clone https://github.com/PhilRobinluo/skill-lens.git
cd skill-lens
pnpm install
pnpm dev
```

默认访问：

```text
http://localhost:3000
```

本地开发时也可以指定端口：

```bash
pnpm dev -p 3939
```

## 主要页面

| 页面 | 用途 |
| --- | --- |
| `/` | 总览仪表盘，按当前 Runtime 和视角统计 skill 生态 |
| `/skills` | 多维表格，搜索、筛选、排序、打开详情 |
| `/tags` | 标签系统，Claude 可编辑，Codex 默认以只读盘点为主 |
| `/codex` | Codex 专属事实页，展示 Codex skill 来源、插件缓存、治理提示和 AGENTS.md 入口 |
| `/orchestration/claude-md` | 规则文件视图。Claude 模式看 `CLAUDE.md`，Codex 模式看 `AGENTS.md` |

已经移除的低价值入口：

- 卡片视图
- 调用关系页
- 依赖分析页
- 草稿画布
- OpenClaw 远程实例管理
- Dock 快捷方式安装入口

## Claude / Codex 双模式

Skill Lens 现在把 Claude 和 Codex 当作两个并列的运行时。

切到 Claude：

- 扫描 `~/.claude/skills`
- 读取 `CLAUDE.md`
- 保留标签、禁用、备注等原有管理能力
- 继续支持项目级 `.claude/skills`

切到 Codex：

- 扫描 `~/.codex/skills`
- 扫描 `~/.codex/skills/.system`
- 扫描 `~/.codex/plugins/cache`
- 扫描 `~/.agents/skills`
- 发现项目级 `.codex/skills` 和 `.agents/skills`
- 规则入口切换为 `~/.codex/AGENTS.md`

这意味着顶部 Runtime 一切换，仪表盘、技能表、标签、项目视角和详情页都会跟着切换。

## 视角逻辑

现在只保留两个清晰概念：

| 视角 | 含义 |
| --- | --- |
| 全局 Skill | 只看当前 Runtime 的全局 skill 和全局规则文件 |
| 项目 Skill | 只看选中项目自己的 skill 和规则入口 |

以前的“全部项目”“项目 + 全局”这类混合视角容易制造误解，已经收敛掉。

## Codex 规则和 Git 管理

Codex 模式下，规则页看的是：

```text
~/.codex/AGENTS.md
```

版本历史依赖 Git。如果 `~/.codex` 还没有 Git 仓库，Skill Lens 会提示原因和操作方式。

推荐做法：

```bash
cd ~/.codex
git init
git add AGENTS.md skills/
git commit -m "初始化 Codex 规则和 skills"
```

之后每次改全局规则或自建 skill：

```bash
cd ~/.codex
git add AGENTS.md skills/
git commit -m "更新 Codex 规则"
```

这样规则页才能显示历史版本、未提交状态和最近提交。

## AI 功能

AI 功能通过本地设置里的 OpenRouter Key 调用，Key 只保存在本机数据文件里。

当前保留：

- AI 打标签
- 路由分析
- 规则分析
- 工作流/编排分析 API

Codex 模式下，真实 skill 文件默认按只读盘点处理，避免误写插件缓存或系统 skill。

## 隐私和安全

- 默认只读扫描 skill 和规则文件。
- 标签、备注、AI 快照等产品数据保存在项目 `data/` 下。
- 不上传 skill 内容。
- 不再保留 OpenClaw SSH 实例配置入口。
- 提交前可运行隐私检查脚本：

```bash
./scripts/privacy-check.sh
```

## 开发命令

```bash
pnpm dev          # 启动开发服务器
pnpm lint         # ESLint
pnpm exec tsc --noEmit
pnpm build        # Next.js production build
pnpm test         # Vitest
```

## 最近一次收口验证

本轮 Codex/Codex skill 管理升级完成后，通过了：

```text
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

并在本地开发服务中验证过 `/codex`、`/skills` 和 Codex plugin skill 详情相关 API 的关键问题。

## 技术栈

- Next.js 16
- TypeScript
- React 19
- Tailwind CSS
- shadcn/ui 风格组件
- TanStack Table
- Recharts
- React Markdown
- Vitest

## License

MIT
