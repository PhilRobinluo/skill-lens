import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { GitCommitInfo, SkillGitHistory } from "./types";

const execFile = promisify(execFileCb);

// ---------------------------------------------------------------------------
// parseGitLogOutput — parse raw `git log --format=... --numstat` output
// ---------------------------------------------------------------------------

const SEPARATOR = "|||";

/**
 * Parse the output of:
 *   git log --format="%h|||%ai|||%an|||%s" --numstat -- <path>
 *
 * Each commit block looks like:
 *   sha|||date|||author|||message
 *   10\t5\tfile1
 *   3\t0\tfile2
 *   <blank line>
 */
export function parseGitLogOutput(output: string): GitCommitInfo[] {
  if (!output.trim()) return [];

  const commits: GitCommitInfo[] = [];
  const lines = output.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Skip blank lines between commits
    if (!line.trim()) {
      i++;
      continue;
    }

    // Expect a header line with our separator
    if (!line.includes(SEPARATOR)) {
      i++;
      continue;
    }

    const parts = line.split(SEPARATOR);
    if (parts.length < 4) {
      i++;
      continue;
    }

    const [sha, date, author, ...messageParts] = parts;
    const message = messageParts.join(SEPARATOR); // in case message contains |||

    let additions = 0;
    let deletions = 0;
    i++;

    // Consume numstat lines until blank line or next header or EOF
    while (i < lines.length) {
      const numLine = lines[i];
      if (!numLine.trim()) {
        i++;
        break;
      }
      // numstat lines look like: "10\t5\tfilename" or "-\t-\tbinary"
      const numMatch = numLine.match(/^(\d+|-)\t(\d+|-)\t/);
      if (numMatch) {
        if (numMatch[1] !== "-") additions += parseInt(numMatch[1], 10);
        if (numMatch[2] !== "-") deletions += parseInt(numMatch[2], 10);
        i++;
      } else {
        // Not a numstat line — must be next header, don't consume
        break;
      }
    }

    commits.push({
      sha: sha.trim(),
      date: date.trim(),
      author: author.trim(),
      message: message.trim(),
      additions,
      deletions,
    });
  }

  return commits;
}

// ---------------------------------------------------------------------------
// getSkillGitHistory — full history for a skill directory
// ---------------------------------------------------------------------------

export async function getSkillGitHistory(
  gitRoot: string,
  relativePath: string,
): Promise<SkillGitHistory> {
  // 1. Get commit log with numstat
  let logOutput = "";
  try {
    const { stdout } = await execFile(
      "git",
      [
        "log",
        "--format=%h|||%ai|||%an|||%s",
        "--numstat",
        "--",
        relativePath,
      ],
      { cwd: gitRoot, maxBuffer: 10 * 1024 * 1024 },
    );
    logOutput = stdout;
  } catch {
    // git log fails → path has no commits or not a git repo
    return {
      totalCommits: 0,
      createdAt: "",
      lastCommitAt: "",
      hasUncommittedChanges: false,
      contributors: [],
      timeline: [],
    };
  }

  const timeline = parseGitLogOutput(logOutput);

  if (timeline.length === 0) {
    return {
      totalCommits: 0,
      createdAt: "",
      lastCommitAt: "",
      hasUncommittedChanges: false,
      contributors: [],
      timeline: [],
    };
  }

  // 2. Check uncommitted changes
  let hasUncommittedChanges = false;
  try {
    const { stdout: diffOut } = await execFile(
      "git",
      ["diff", "--name-only", "--", relativePath],
      { cwd: gitRoot },
    );
    // Also check staged changes
    const { stdout: diffStagedOut } = await execFile(
      "git",
      ["diff", "--name-only", "--staged", "--", relativePath],
      { cwd: gitRoot },
    );
    hasUncommittedChanges =
      diffOut.trim().length > 0 || diffStagedOut.trim().length > 0;
  } catch {
    // ignore — default to false
  }

  // 3. Build result
  // timeline is newest-first from git log
  const contributors = [...new Set(timeline.map((c) => c.author))];

  return {
    totalCommits: timeline.length,
    createdAt: timeline[timeline.length - 1].date,
    lastCommitAt: timeline[0].date,
    hasUncommittedChanges,
    contributors,
    timeline,
  };
}
