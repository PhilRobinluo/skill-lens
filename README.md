# 技能透镜 Skill Lens

**Claude Code Skills 可视化仪表盘** — 扫描、浏览、标签化、编排你的技能库。

> 你可能有 30 个、80 个、甚至 130+ 个 Skills。
> 但你真的知道它们各自在干什么吗？哪些在被用、哪些早已吃灰？
> 它们之间有没有依赖、有没有重复、有没有遗漏？
>
> 技能透镜就是为了回答这些问题而生的。

<!-- TODO: 替换为实际截图 -->
![dashboard](docs/screenshots/dashboard.gif)

---

## 为什么需要它

当你把越来越多的能力封装成 Skills，技能库会不可避免地膨胀。超过 50 个之后，你会开始遇到这些问题：

- **认知失控** — 不记得哪个 Skill 干什么，打标签的比没打的少
- **重复建设** — 新写了一个 Skill，后来发现原来已经有类似的
- **路由断裂** — CLAUDE.md 里引用了 Skill 名，但文件已经改名或删除
- **编排困难** — 想把几个 Skill 组合成工作流，却没有全局视角

技能透镜不是又一个管理工具，它是你的 **Skill 仪表盘** — 像 macOS 的活动监视器一样，让你对整个技能库一目了然。

---

## 核心原则：只读安全（Zero-Touch）

**技能透镜永远不会修改你的 Skill 文件。**

这是最重要的设计原则，没有之一。你的 Skills 是你的核心资产，任何工具都不应该在未经许可的情况下碰它们。

```
你的 Skills 文件                    技能透镜
┌──────────────────┐               ┌──────────────────┐
│ ~/.claude/skills/ │──── 只读扫描 ──▶│ 展示、标签、统计   │
│ ~/.claude/plugins/│               │                  │
│ ~/.claude/CLAUDE.md│               │ data/registry.json│ ◀── 所有编辑写到这里
└──────────────────┘               └──────────────────┘
       永远不碰 ✋                       独立数据文件
```

具体来说：

| 操作 | 读取了什么 | 写入了什么 |
|------|-----------|-----------|
| 启动扫描 | `~/.claude/skills/` 下所有 SKILL.md（只读） | `data/skills-registry.json` |
| 解析路由 | `~/.claude/CLAUDE.md`（只读） | — |
| 频率统计 | `~/.claude/projects/` 下的 .jsonl 日志（只读） | `data/skill-frequency-cache.json` |
| 编辑标签/备注 | — | `data/skills-registry.json` |

**你可以随时删除整个技能透镜文件夹，你的 Skills 纹丝不动。**

---

## 30 秒安装

```bash
curl -fsSL https://raw.githubusercontent.com/arthurai-cai/skill-lens/main/install.sh | bash
```

脚本会自动：
1. 检查依赖（Node.js 18+、pnpm）
2. 克隆到 `~/.claude/skill-lens/`
3. 安装依赖
4. 创建 macOS Dock 启动器（macOS）
5. 启动仪表盘并打开浏览器

没有 Claude Code？也能跑：
```bash
DEMO=1 pnpm dev  # 加载示例数据，体验完整功能
```

---

## 功能一览

### 总览仪表盘

一眼看清全局：技能总数、路由状态、领域分布、来源构成、最近修改。

<!-- TODO: 替换为实际截图 -->
![overview](docs/screenshots/overview.gif)

### Notion 风格表格

借鉴 Notion 的多维表格设计，通过字段进行多维度管理：

- **调用频率** — 自动从 Claude Code 会话日志中统计真实使用频率
- **来源分类** — 自建 / 宝玉系列 / 官方插件 / 社区插件
- **领域标签** — 支持行内编辑，自动推断 + 手动打标
- **筛选 & 排序** — Notion 风格条件筛选器，多字段组合
- **列可见性** — 按需显示/隐藏列

<!-- TODO: 替换为实际截图 -->
![table](docs/screenshots/table.gif)

### 3D 知识图谱

用 3D 力导向图展示技能之间的关系网络。球体 = 技能，颜色 = 来源，大球 = 领域中心节点，连线 = 共享领域或显式依赖。

可以旋转、缩放、搜索高亮、按来源/领域过滤。点击任意节点查看详情。

<!-- TODO: 替换为实际截图 -->
![graph](docs/screenshots/graph.gif)

### 草稿画布

自由拖拽 Skills 到画布上，连线、分组、编排。适合在规划工作流或重组技能体系时使用。

- 从侧边栏拖拽或点击添加
- 节点间连线（自动箭头）
- 分组节点（可缩放、可重命名）
- 多份草稿保存/切换

<!-- TODO: 替换为实际截图 -->
![draft](docs/screenshots/draft.gif)

### 更多视图

除了表格，还有列表视图（卡片网格）和分组视图（按领域折叠展开），视图偏好自动记住。

---

## 配置

### 自定义扫描路径

默认扫描 `~/.claude/skills/` 和 `~/.claude/plugins/cache/`。如果你的 Skills 在别的位置：

```bash
SKILL_DIRS=/path/to/skills,/another/path pnpm dev
```

### 所有环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SKILL_DIRS` | `~/.claude/skills` | 技能目录（逗号分隔多个） |
| `PLUGINS_CACHE_DIR` | `~/.claude/plugins/cache` | 插件缓存目录 |
| `CLAUDE_MD_PATH` | `~/.claude/CLAUDE.md` | CLAUDE.md 路径 |
| `PROJECTS_DIR` | `~/.claude/projects` | 会话日志目录（频率统计用） |
| `DEMO` | — | 设为 `1` 启用 Demo 模式 |

---

## 技术栈

| 层 | 选择 |
|---|---|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript (strict) |
| UI | shadcn/ui + Tailwind CSS |
| 表格 | @tanstack/react-table |
| 画布 | @xyflow/react (React Flow) |
| 3D 图谱 | react-force-graph-3d + Three.js |
| 图表 | recharts |
| 文件监控 | chokidar |

---

## 参与共建

技能透镜是一个人启动的项目，但它解决的是所有 Claude Code 重度用户的共性问题。如果你也在管理大量 Skills，欢迎一起来建设。

### 可以贡献什么

- **新视图** — 还有什么角度能帮助理解技能库？Timeline？依赖树？使用热力图？
- **智能分析** — 自动检测重复 Skill、未路由 Skill、描述缺失等"健康度"指标
- **导入/导出** — 支持从其他工具导入 Skill 元数据，或导出为 CLAUDE.md 片段
- **多语言** — 目前 UI 是中文，欢迎贡献 i18n
- **Bug 修复 & 优化** — 总有改进空间

### 贡献流程

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/your-feature`)
3. 提交更改 (`git commit -m 'Add your feature'`)
4. 推送到分支 (`git push origin feature/your-feature`)
5. 创建 Pull Request

### 开发指南

```bash
git clone https://github.com/arthurai-cai/skill-lens.git
cd skill-lens
pnpm install
pnpm dev       # 启动开发服务器 http://localhost:3000
pnpm test      # 运行测试
pnpm build     # 类型检查 + 构建
```

项目结构清晰：`src/app/` 是页面，`src/components/` 是组件，`src/lib/` 是核心逻辑。新增页面只需在 `src/app/` 下建目录，然后在 `src/components/nav.tsx` 加导航链接。

---

## Roadmap

- [ ] Demo 模式完善 — 无需真实 Skills 也能完整体验
- [ ] Skill 健康度评分 — 描述完整性、路由状态、行数合理性
- [ ] 草稿导出为 CLAUDE.md 路由表片段
- [ ] 批量操作 — 批量打标签、批量修改领域
- [ ] 插件系统 — 自定义分析维度

---

## License

[MIT](LICENSE)

---

> **技能透镜** — 让你对自己的 AI 能力库，真正做到心中有数。
