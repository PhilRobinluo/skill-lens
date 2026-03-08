import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";

const execFile = promisify(execFileCb);

export interface BlameLine {
  lineNumber: number;
  sha: string;
  author: string;
  date: string;
  content: string;
}

export async function GET(): Promise<NextResponse> {
  const claudeDir = path.join(os.homedir(), ".claude");

  try {
    // Use porcelain format for easy parsing
    const { stdout } = await execFile(
      "git",
      ["blame", "--porcelain", "CLAUDE.md"],
      { cwd: claudeDir, maxBuffer: 5 * 1024 * 1024 },
    );

    const lines = stdout.split("\n");
    const blameLines: BlameLine[] = [];

    let currentSha = "";
    let currentAuthor = "";
    let currentDate = "";
    let lineNumber = 0;

    // Parse porcelain format
    // First line of each block: SHA origLine finalLine [numLines]
    // Then header lines starting with field names
    // Then a tab-prefixed content line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.match(/^[0-9a-f]{40}\s/)) {
        // SHA line: hash origLine finalLine [numLines]
        const parts = line.split(" ");
        currentSha = parts[0].slice(0, 7);
        lineNumber = parseInt(parts[2], 10);
      } else if (line.startsWith("author ")) {
        currentAuthor = line.slice(7);
      } else if (line.startsWith("author-time ")) {
        const timestamp = parseInt(line.slice(12), 10);
        currentDate = new Date(timestamp * 1000).toISOString();
      } else if (line.startsWith("\t")) {
        // Content line (tab-prefixed)
        blameLines.push({
          lineNumber,
          sha: currentSha,
          author: currentAuthor,
          date: currentDate,
          content: line.slice(1), // remove leading tab
        });
      }
    }

    return NextResponse.json({
      totalLines: blameLines.length,
      lines: blameLines,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
