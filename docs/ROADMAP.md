# Skill Lens 开发路线图

> 最后更新：2026-03-09

## 已确认计划

### P1: AI 编排分析

- 引入 AI 自动分析 Skill 之间的依赖关系、调用链、最优编排结构
- 目标：草稿画布不再只靠手动连线，AI 读取所有 SKILL.md 内容后生成结构图
- 当前痛点：手动编排缺乏全局视角，Skill 之间的隐式依赖难以人工梳理

### P2: 路由表深度分析

- 当前只能解析全局 `~/.claude/CLAUDE.md` 的路由表
- 需支持解析项目级 CLAUDE.md 的路由引用，展示"哪些 Skill 在哪些项目被路由"
- 跨项目路由冲突检测（同名 Skill 在不同项目路由不同）

### P3: 暗色模式

- 当前只有浅色主题，长时间监控使用刺眼
- 实现亮/暗双主题切换（shadcn/ui + Tailwind `dark:` 前缀）
- 跟随系统偏好 + 手动切换按钮

### P4: OpenClaw Skill 监控

- 将 Skill Lens 扩展为同时支持 Claude Code 和 OpenClaw 的 Skill 管理工具
- 兼容性评估结论：**高度兼容，可在同一项目内实现**（详见下方评估）
- 实现方式：新增 OpenClaw 扫描源，复用现有 UI/注册表/标签系统

---

## OpenClaw 兼容性评估

**结论：在现有项目内扩展，不需要另起项目。**

两个工具的 Skill 体系高度相似：

| 对比维度 | Claude Code | OpenClaw |
|---------|------------|----------|
| Skill 格式 | `SKILL.md`（Markdown） | `SKILL.md`（YAML frontmatter + Markdown） |
| 全局 Skill 目录 | `~/.claude/skills/` | `~/.openclaw/skills/` |
| 项目级 Skill | `.claude/skills/` | `<workspace>/skills/` |
| 插件/社区 Skill | `~/.claude/plugins/cache/` | ClawHub 注册表 + bundled skills |
| 全局指令文件 | `~/.claude/CLAUDE.md` | `SOUL.md`（核心人格 + 规则） |
| 项目指令文件 | `./CLAUDE.md` | 项目根目录配置 |
| 配置文件 | 环境变量 + settings.json | `~/.openclaw/openclaw.json` |
| 优先级 | 项目 > 全局 | workspace > local > bundled |

**实现难度：低（约 2-3 天工作量）**

需要改动的点：
1. `config.ts` — 新增 `OPENCLAW_SKILL_DIRS` 配置（`~/.openclaw/skills/`）
2. `scanner.ts` — 新增 OpenClaw 扫描逻辑（目录结构一样，只是路径不同）
3. `types.ts` — `source` 字段新增 `"openclaw-builtin" | "openclaw-community"` 等值
4. `claude-md-parser.ts` — 新增 `SOUL.md` 解析（格式类似，路由规则可能不同）
5. 前端 — 仪表板统计增加 OpenClaw 分类，来源筛选增加选项

不需要改动的点（直接复用）：
- 注册表系统（skills-registry.json）
- 标签/领域/管道系统
- 表格/列表/分组视图
- 草稿画布
- 搜索/筛选/排序
- Git 版本管理

---

## 跨平台远期展望

未来可进一步扩展到其他 AI 编码工具：

| 工具 | 兼容难度 | 指令格式 | 目录 |
|------|---------|---------|------|
| Cursor | 低 | `.mdc`（YAML + MD） | `.cursor/rules/` |
| Windsurf | 低 | `.md`（可选 YAML） | `.windsurf/rules/` |
| Roo Code | 低 | `.md` | `.roo/rules/` |
| GitHub Copilot | 低 | `.instructions.md` | `.github/instructions/` |
| Continue.dev | 中 | `.md` + JSON 配置 | `.continue/rules/` |
| Aider | 高 | YAML + 单文件 | 无目录结构 |

共同点：**全部使用 Markdown 为核心格式**，差异仅在 frontmatter 字段和目录约定。

新兴标准 [AGENTS.md](https://agents.md/) 可作为通用导出格式（已被 Google Gemini CLI、OpenAI Codex、Cursor、Windsurf、Aider 等工具支持）。

---

## 后续方向（未排期）

- 自动频率统计（基于 hook 调用日志，而非手动标记）
- 草稿导出为 CLAUDE.md 路由表片段
- 技能健康度评分（描述完整性、是否被路由、行数合理性）
- 批量操作（批量打标签、批量设管道）
- CLAUDE.md 软编排：路由表编辑 + 草稿画布融合
- Skill 导出：一键将 Claude Code Skill 转换为 Cursor/Windsurf/Roo 格式
