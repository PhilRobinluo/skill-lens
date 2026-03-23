import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseClaudeMd } from "../claude-md-parser";

// ---------------------------------------------------------------------------
// Basic routing table parsing
// ---------------------------------------------------------------------------
describe("parseClaudeMd", () => {
  it("extracts skill names and triggers from a single routing table", () => {
    const content = `
## 🧭 Obsidian Skill 路由表

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **写笔记/沉淀** | \`obsidian-note-writer-沉淀系统\` | 沉淀、记笔记 |
| **查笔记/搜索** | \`obsidian-note-finder-知识导航\` | 记在哪里 |
`;

    const result = parseClaudeMd(content);

    expect(result["obsidian-note-writer-沉淀系统"]).toEqual([
      { table: "Obsidian Skill 路由表", trigger: "沉淀、记笔记" },
    ]);

    expect(result["obsidian-note-finder-知识导航"]).toEqual([
      { table: "Obsidian Skill 路由表", trigger: "记在哪里" },
    ]);
  });

  it("extracts from multiple routing tables", () => {
    const content = `
## 🧭 Obsidian Skill 路由表

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **写笔记/沉淀** | \`obsidian-note-writer-沉淀系统\` | 沉淀、记笔记 |

## ✍️ 写作工作流 Skill 路由

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **写文章** | \`article-workflow\` | /write、写文章 |
`;

    const result = parseClaudeMd(content);

    expect(result["obsidian-note-writer-沉淀系统"]).toEqual([
      { table: "Obsidian Skill 路由表", trigger: "沉淀、记笔记" },
    ]);

    expect(result["article-workflow"]).toEqual([
      { table: "写作工作流 Skill 路由", trigger: "/write、写文章" },
    ]);
  });

  it("handles a skill appearing in multiple tables", () => {
    const content = `
## 🧭 第一个路由表

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **用途A** | \`shared-skill\` | 触发词A |

## 🎯 第二个 Skill 路由

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **用途B** | \`shared-skill\` | 触发词B |
`;

    const result = parseClaudeMd(content);

    expect(result["shared-skill"]).toHaveLength(2);
    expect(result["shared-skill"]).toEqual([
      { table: "第一个路由表", trigger: "触发词A" },
      { table: "第二个 Skill 路由", trigger: "触发词B" },
    ]);
  });

  it("ignores non-routing sections", () => {
    const content = `
## 🎯 核心互动原则

Some text here with \`code-in-backticks\` that should NOT be parsed.

| 不是路由表 | 只是普通表格 | 备注 |
|-----------|------------|------|
| row1 | \`not-a-skill\` | something |

## 🧭 Obsidian Skill 路由表

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **写笔记** | \`real-skill\` | 写笔记 |

## 🔑 关键领悟

More non-routing content here.
`;

    const result = parseClaudeMd(content);

    expect(result["not-a-skill"]).toBeUndefined();
    expect(result["real-skill"]).toEqual([
      { table: "Obsidian Skill 路由表", trigger: "写笔记" },
    ]);
  });

  it("returns empty object for content with no routing tables", () => {
    const content = `
# Just a regular CLAUDE.md

Some instructions here.

## Preferences

- Use TypeScript
- Use pnpm
`;

    const result = parseClaudeMd(content);
    expect(result).toEqual({});
  });

  it("returns empty object for empty content", () => {
    expect(parseClaudeMd("")).toEqual({});
  });

  it("handles table rows without backtick-wrapped skill names", () => {
    const content = `
## 🧭 测试路由表

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **写笔记** | \`valid-skill\` | 写笔记 |
| **查预测市场** | 调用 Polymarket CLI/MCP 获取数据 | Polymarket |
`;

    const result = parseClaudeMd(content);
    expect(result["valid-skill"]).toBeDefined();
    // Row without backtick should be skipped
    expect(Object.keys(result)).toHaveLength(1);
  });

  it("handles routing tables with variant headers (路由 or Skill in title)", () => {
    const content = `
## 🛡️ 安全防护 Skill 路由（2026-02-17 新增）

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **AI 产品加防御** | \`prompt-bulletproof\` | 加防御、防提示词泄露 |

## 🌐 设备与网络 Skill 路由（2026-03-01 更新）

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **Clash 代理配置** | \`clash-manager\` | 网络慢、代理、VPN |
`;

    const result = parseClaudeMd(content);

    expect(result["prompt-bulletproof"]).toEqual([
      { table: "安全防护 Skill 路由", trigger: "加防御、防提示词泄露" },
    ]);

    expect(result["clash-manager"]).toEqual([
      { table: "设备与网络 Skill 路由", trigger: "网络慢、代理、VPN" },
    ]);
  });

  it("stops collecting from a routing table when a new non-routing ## header appears", () => {
    const content = `
## 🧭 Obsidian Skill 路由表

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **写笔记** | \`obsidian-writer\` | 写笔记 |

## 🔑 关键领悟

| 不相关 | \`not-a-skill\` | 不是触发词 |

## 🎯 任务系统 Skill 路由

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **任务管理** | \`ai-task-system\` | 任务、待办 |
`;

    const result = parseClaudeMd(content);

    expect(result["obsidian-writer"]).toBeDefined();
    expect(result["ai-task-system"]).toBeDefined();
    expect(result["not-a-skill"]).toBeUndefined();
  });

  it("handles table rows with Notion-style skill references (Skill:action)", () => {
    const content = `
## 📋 Notion 协作路由

| 用户意图 | 调用的 Skill | 触发词 |
|----------|-------------|--------|
| **操作 Notion 数据库** | \`Notion综合协作系统\` | 创建任务 |
| **搜索/查找 Notion** | \`Notion:search\` / \`Notion:find\` | 搜 Notion |
`;

    const result = parseClaudeMd(content);

    expect(result["Notion综合协作系统"]).toEqual([
      { table: "Notion 协作路由", trigger: "创建任务" },
    ]);

    // Multiple skills in one cell — should capture the first backtick-wrapped one
    expect(result["Notion:search"]).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Integration test with real CLAUDE.md
  // ---------------------------------------------------------------------------
  it("parses real ~/.claude/CLAUDE.md and finds known skills", () => {
    const claudeMdPath = path.join(os.homedir(), ".claude", "CLAUDE.md");
    if (!fs.existsSync(claudeMdPath)) {
      // Skip if no CLAUDE.md exists (CI environments)
      return;
    }

    const content = fs.readFileSync(claudeMdPath, "utf-8");
    const result = parseClaudeMd(content);

    // We know these skills are in the user's CLAUDE.md routing tables
    expect(result["obsidian-note-writer-沉淀系统"]).toBeDefined();
    expect(result["ai-task-system"]).toBeDefined();
    expect(result["article-workflow"]).toBeDefined();
    expect(result["clash-manager"]).toBeDefined();
    expect(result["prompt-bulletproof"]).toBeDefined();

    // Check structure
    for (const refs of Object.values(result)) {
      expect(Array.isArray(refs)).toBe(true);
      for (const ref of refs) {
        expect(ref).toHaveProperty("table");
        expect(ref).toHaveProperty("trigger");
        expect(typeof ref.table).toBe("string");
        expect(typeof ref.trigger).toBe("string");
        expect(ref.table.length).toBeGreaterThan(0);
        expect(ref.trigger.length).toBeGreaterThan(0);
      }
    }
  });
});
