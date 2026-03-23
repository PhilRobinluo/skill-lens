# Skill Lens — Electron macOS App 设计

> 日期：2026-03-22
> 分支：feat/electron-app

## 目标

将现有 Skill Lens webapp 包装为 macOS 桌面应用，新增菜单栏常驻面板，提供快速操作入口。

## 架构

```
Electron 主进程 (electron/main.ts)
├── Tray (菜单栏图标，常驻右上角)
│   └── Tray Window (轻量面板, ~400x560)
│       └── 加载 /tray 路由
└── Main Window (完整窗口, 1200x800)
    └── 加载现有 Next.js 应用 (/)
```

### 运行流程

1. Electron 启动 → 内嵌 Next.js server (port 3939)
2. 创建 Tray 图标 (常驻菜单栏)
3. 点击 Tray → 弹出轻量面板
4. 面板中点"打开完整窗口" → 创建/显示主窗口

## 菜单栏面板设计

```
┌─ Skill Lens ──────────────────────┐
│ 🔍 搜索 Skill...                  │
│                                    │
│ ▸ 写作 (8)                         │
│   ✅ article-workflow    [📋] [⏻]  │
│   ✅ headline-generator  [📋] [⏻]  │
│   ⬜ 心象图改写大师       [📋] [⏻]  │
│                                    │
│ ▸ Notion (5)                       │
│   ✅ Notion综合协作系统   [📋] [⏻]  │
│                                    │
│ ▸ 设备 (4)                         │
│   ...                              │
│                                    │
│ ▸ 未标记 (12)                      │
│   ...                              │
│────────────────────────────────────│
│ 📊 98 启用 / 31 禁用    [打开面板]  │
└────────────────────────────────────┘
```

### 交互

- **搜索框**：实时过滤 skill 名称/描述
- **标签折叠**：点击标签名展开/收起该分类
- **📋 复制按钮**：点击复制 skill 名称到剪贴板（用于在 Claude Code 中 `/skill-name` 快速调用）
- **⏻ 开关按钮**：启用/禁用 skill（调用现有 `/api/skills/[name]/toggle`）
- **打开面板**：打开完整窗口显示现有 webapp

## 改动范围

### 新增文件

```
electron/
├── main.ts          # Electron 主进程
├── preload.ts       # 预加载脚本
└── tsconfig.json    # Electron 独立 TS 配置

src/app/tray/
└── page.tsx         # 菜单栏面板页面（新路由）

src/components/
└── tray-panel.tsx   # 面板组件

resources/
├── iconTemplate.png     # macOS 菜单栏图标 (22x22)
└── iconTemplate@2x.png  # Retina (44x44)
```

### 修改文件

```
package.json         # 添加 electron 依赖 + 构建脚本
next.config.ts       # output: 'standalone' 配置
```

### 不修改

现有所有页面、API、组件 — 零侵入。

## 技术选型

| 需求 | 方案 |
|------|------|
| Electron 集成 | `electron` + `electron-builder` |
| 菜单栏 | Electron `Tray` + `BrowserWindow` |
| Next.js 嵌入 | 内嵌 standalone server |
| 图标 | macOS Template Image (自动适配深色/浅色) |
| 打包 | `electron-builder` → .dmg |

## 运行命令

```bash
pnpm electron:dev    # 开发模式（Next.js dev + Electron）
pnpm electron:build  # 打包为 .dmg
pnpm dev             # 原有 web 模式仍可用
```
