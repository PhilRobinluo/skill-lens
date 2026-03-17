# Skill 禁用 + CLAUDE.md Profile 快速切换

> 设计日期：2026-03-17
> 状态：已批准，待实施

---

## 背景

Arthur 的 Skill 数量已超过 130 个，Claude Code 每次会话都加载全部 Skill，造成上下文压力。需要：

1. **Skill 禁用**：真正让 Claude Code 不加载某些 Skill（自建 + 插件都要支持）
2. **CLAUDE.md Profile 切换**：维护多个版本的 CLAUDE.md，快速切换用于调试

---

## 功能一：Skill 禁用

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

### Scanner 变更

- `scanUserSkills()` / `scanPluginsCache()` / `scanProjectSkills()`：同时检测 `SKILL.md` 和 `SKILL.md.disabled`
- 找到 `SKILL.md.disabled` 时：读取内容获取 description 等信息，`enabled = false`
- `buildSkillEntry()` 新增 `enabled` 参数

### API

| 方法 | 路径 | 用途 |
|------|------|------|
| PATCH | `/api/skills/{name}/toggle` | 切换启用/禁用 |

请求体：`{ enabled: boolean }`

实现逻辑：
1. 从注册表找到 skill 的 `path`
2. `enabled: false` → rename `SKILL.md` → `SKILL.md.disabled`
3. `enabled: true` → rename `SKILL.md.disabled` → `SKILL.md`
4. 更新注册表 + 触发 SSE 通知前端

### 前端 UI

**表格视图**：
- 新增"状态"列，放 Switch 开关
- 禁用的 Skill：整行半透明 + 名称删除线
- 点击开关立即调 API（可逆操作，无需确认弹窗）

**筛选**：
- `FilterableField` 的 `"status"` 字段赋予实际含义：启用 / 禁用
- 默认显示全部

**详情面板（Sheet）**：
- 顶部加 Switch + 状态文字（🟢 已启用 / 🔴 已禁用）

**仪表板**：
- 统计卡片新增"已禁用：X 个"

### 注意事项

- 插件更新后 SKILL.md 可能被恢复，需要重新禁用（可接受的 trade-off）
- 批量禁用暂不做，后续按需添加

---

## 功能二：CLAUDE.md Profile 快速切换

### 存储

```
data/
├── claude-md-profiles/
│   ├── _meta.json          # 当前激活 profile 信息
│   ├── full.md             # Profile: 完整版
│   ├── minimal.md          # Profile: 精简版
│   └── debug.md            # Profile: 调试版
```

`_meta.json` 结构：
```json
{
  "activeProfile": "full",
  "lastSwitched": "2026-03-17T10:00:00Z"
}
```

### 切换逻辑

1. 自动保存当前 `~/.claude/CLAUDE.md` 内容到旧 profile 文件
2. 把目标 profile 内容写入 `~/.claude/CLAUDE.md`
3. 更新 `_meta.json`

### API

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/claude-md/profiles` | 列出所有 profile + 当前激活 |
| POST | `/api/claude-md/profiles` | 新建 profile `{ name, content? }` |
| GET | `/api/claude-md/profiles/{name}` | 获取 profile 内容 |
| PUT | `/api/claude-md/profiles/{name}` | 更新 profile 内容 |
| PUT | `/api/claude-md/profiles/{name}/activate` | 切换到该 profile |
| DELETE | `/api/claude-md/profiles/{name}` | 删除 profile |

POST 新建时如果没传 `content`，默认复制当前 `~/.claude/CLAUDE.md` 的内容。

### 前端 UI

**入口**：编排 → CLAUDE.md 页面顶部

```
CLAUDE.md 软编排    [当前: full ▾]  [💾 保存为新 Profile]  [⚙️ 管理]
```

- **下拉选择器**：列出 profile 列表，当前激活打勾，点击即切换
- **保存按钮**：存当前内容为新 profile
- **管理按钮**：Dialog 支持重命名 / 删除

**切换后**：页面自动刷新（内容、blame、路由表、AI 流程图全部更新）

### 作用域

Profile 系统只管**全局 `~/.claude/CLAUDE.md`**，与 Scope 选择器（全局/项目）互不干扰。

---

## 未来扩展

- CLI 脚本支持（不开 web app 也能操作）
- 批量禁用/启用
- Profile 对比（diff 两个版本）
