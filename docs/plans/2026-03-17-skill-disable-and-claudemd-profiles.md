# Skill 禁用 + CLAUDE.md 版本管理

> 设计日期：2026-03-17
> 状态：✅ 已完成

---

## 背景

Arthur 的 Skill 数量已超过 130 个，Claude Code 每次会话都加载全部 Skill，造成上下文压力。需要：

1. **Skill 禁用**：真正让 Claude Code 不加载某些 Skill（自建 + 插件都要支持）
2. **CLAUDE.md 版本管理**：在 Git 历史中标记/恢复版本，用于调试

---

## 功能一：Skill 禁用 ✅

### 实现方式：重命名 SKILL.md

- **禁用**：`SKILL.md` → `SKILL.md.disabled`
- **启用**：`SKILL.md.disabled` → `SKILL.md`
- Claude Code 扫描不到 `SKILL.md` = 该 Skill 不会被加载

### 数据模型

`SkillEntry` 新增字段：

```typescript
interface SkillEntry {
  // ... 现有字段
  enabled: boolean;  // true=正常, false=已禁用
}
```

### API

| 方法 | 路径 | 用途 |
|------|------|------|
| PATCH | `/api/skills/{name}/toggle` | 切换启用/禁用 |

### 前端 UI

- 表格新增 Switch 列，禁用行显示删除线+半透明
- 详情面板 Sheet 顶部加 Switch
- 仪表板统计卡片新增"已禁用"

---

## 功能二：CLAUDE.md 版本标记与恢复 ✅

### 设计决策

~~最初设计为独立的 Profile 系统（多个文件并行管理）~~，经讨论后改为**融合到 Git 历史**：

- **Profile 概念与 Git 历史概念重叠**，会造成"这次 commit 是实验还是正式？"的混乱
- 改为在 Git commit 上打标签（⭐正式版 / 🧪实验版），复用已有的版本时间线

### 实现方式

- **标签存储**：`data/claude-md-version-tags.json`（SHA → "stable" | "experiment" 映射）
- **恢复机制**：`git show SHA:CLAUDE.md` 读取历史内容 → 写入当前文件

### API

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/claude-md/version-tag` | 读取所有标签 |
| PATCH | `/api/claude-md/version-tag` | 设置/清除标签 `{ sha, tag }` |
| PUT | `/api/claude-md/restore` | 恢复到指定版本 `{ sha }` |

### 前端 UI

在编排 → CLAUDE.md 页面的历史侧边栏，每个 commit 条目增加：
- 标签徽章（⭐正式版 / 🧪实验版）
- 标记按钮（循环切换：无 → 正式 → 实验 → 无）
- 恢复按钮（一键恢复该版本内容）

---

## 后续计划

- **英文版本** — 国际化支持，方便开源推广
- **性能优化** — 当前 130+ skill 加载速度较慢
- CLI 脚本支持（不开 web app 也能操作）
- 批量禁用/启用
