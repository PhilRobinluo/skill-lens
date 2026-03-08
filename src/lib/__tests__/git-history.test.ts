import { describe, it, expect } from "vitest";
import { parseGitLogOutput, getSkillGitHistory } from "../git-history";

// ---------------------------------------------------------------------------
// parseGitLogOutput
// ---------------------------------------------------------------------------
describe("parseGitLogOutput", () => {
  it("parses multi-commit output with numstat correctly", () => {
    const output = [
      "abc1234|||2026-03-01 10:00:00 +0800|||Arthur|||feat: add new feature",
      "10\t5\tSKILL.md",
      "3\t0\tREADME.md",
      "",
      "def5678|||2026-02-15 09:00:00 +0800|||Bob|||fix: typo in docs",
      "1\t1\tSKILL.md",
      "",
    ].join("\n");

    const commits = parseGitLogOutput(output);

    expect(commits).toHaveLength(2);

    // First commit (newest)
    expect(commits[0].sha).toBe("abc1234");
    expect(commits[0].date).toBe("2026-03-01 10:00:00 +0800");
    expect(commits[0].author).toBe("Arthur");
    expect(commits[0].message).toBe("feat: add new feature");
    expect(commits[0].additions).toBe(13);
    expect(commits[0].deletions).toBe(5);

    // Second commit (oldest)
    expect(commits[1].sha).toBe("def5678");
    expect(commits[1].author).toBe("Bob");
    expect(commits[1].additions).toBe(1);
    expect(commits[1].deletions).toBe(1);
  });

  it("handles commit with no numstat lines (e.g. rename only)", () => {
    const output = [
      "aaa1111|||2026-01-01 12:00:00 +0800|||Alice|||chore: rename skill",
      "",
    ].join("\n");

    const commits = parseGitLogOutput(output);

    expect(commits).toHaveLength(1);
    expect(commits[0].sha).toBe("aaa1111");
    expect(commits[0].additions).toBe(0);
    expect(commits[0].deletions).toBe(0);
  });

  it("handles binary files in numstat (- - notation)", () => {
    const output = [
      "bbb2222|||2026-02-01 08:00:00 +0800|||Arthur|||feat: add image",
      "-\t-\tlogo.png",
      "5\t0\tSKILL.md",
      "",
    ].join("\n");

    const commits = parseGitLogOutput(output);

    expect(commits).toHaveLength(1);
    // Binary line should be skipped (0 additions/deletions), only SKILL.md counted
    expect(commits[0].additions).toBe(5);
    expect(commits[0].deletions).toBe(0);
  });

  it("handles message containing separator characters", () => {
    const output = [
      "ccc3333|||2026-01-15 14:00:00 +0800|||Arthur|||fix: use ||| as separator",
      "2\t1\tfile.ts",
      "",
    ].join("\n");

    const commits = parseGitLogOutput(output);

    expect(commits).toHaveLength(1);
    expect(commits[0].message).toBe("fix: use ||| as separator");
  });

  it("returns empty array for empty input", () => {
    expect(parseGitLogOutput("")).toEqual([]);
    expect(parseGitLogOutput("   \n  \n")).toEqual([]);
  });

  it("handles single commit without trailing newline", () => {
    const output =
      "ddd4444|||2026-03-05 16:00:00 +0800|||Arthur|||init\n7\t0\tSKILL.md";

    const commits = parseGitLogOutput(output);

    expect(commits).toHaveLength(1);
    expect(commits[0].sha).toBe("ddd4444");
    expect(commits[0].additions).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// getSkillGitHistory (integration — reads real ~/.claude git repo)
// ---------------------------------------------------------------------------
describe("getSkillGitHistory", () => {
  const GIT_ROOT = `${process.env.HOME}/.claude`;

  it("gets history for skills/ai-task-system (known to exist with >1 commit)", async () => {
    const history = await getSkillGitHistory(GIT_ROOT, "skills/ai-task-system");

    expect(history.totalCommits).toBeGreaterThanOrEqual(1);
    expect(history.createdAt).toBeTruthy();
    expect(history.lastCommitAt).toBeTruthy();
    expect(history.contributors.length).toBeGreaterThanOrEqual(1);
    expect(history.timeline.length).toBe(history.totalCommits);

    // timeline should be newest-first
    if (history.timeline.length >= 2) {
      const first = new Date(history.timeline[0].date).getTime();
      const last = new Date(
        history.timeline[history.timeline.length - 1].date,
      ).getTime();
      expect(first).toBeGreaterThanOrEqual(last);
    }

    // Each commit should have required fields
    for (const commit of history.timeline) {
      expect(commit.sha).toBeTruthy();
      expect(commit.date).toBeTruthy();
      expect(commit.author).toBeTruthy();
      expect(commit.message).toBeTruthy();
      expect(typeof commit.additions).toBe("number");
      expect(typeof commit.deletions).toBe("number");
    }
  });

  it("returns empty history for nonexistent path", async () => {
    const history = await getSkillGitHistory(
      GIT_ROOT,
      "skills/this-skill-does-not-exist-xyz-999",
    );

    expect(history.totalCommits).toBe(0);
    expect(history.createdAt).toBe("");
    expect(history.lastCommitAt).toBe("");
    expect(history.contributors).toEqual([]);
    expect(history.timeline).toEqual([]);
  });

  it("returns empty history for non-git directory", async () => {
    const history = await getSkillGitHistory("/tmp", "nonexistent-path");

    expect(history.totalCommits).toBe(0);
    expect(history.timeline).toEqual([]);
  });
});
