import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import { type NextRequest, NextResponse } from "next/server";
import { resolveClaudeMdPaths } from "@/lib/claude-md-paths";

const execFile = promisify(execFileCb);

export interface BlameLine {
  lineNumber: number;
  sha: string;
  author: string;
  date: string;
  content: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const projectPath = url.searchParams.get("project");
  const { gitCwd, relativePath } = resolveClaudeMdPaths(projectPath);

  try {
    const { stdout } = await execFile(
      "git",
      ["blame", "--porcelain", relativePath],
      { cwd: gitCwd, maxBuffer: 5 * 1024 * 1024 },
    );

    const lines = stdout.split("\n");
    const blameLines: BlameLine[] = [];

    let currentSha = "";
    let currentAuthor = "";
    let currentDate = "";
    let lineNumber = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.match(/^[0-9a-f]{40}\s/)) {
        const parts = line.split(" ");
        currentSha = parts[0].slice(0, 7);
        lineNumber = parseInt(parts[2], 10);
      } else if (line.startsWith("author ")) {
        currentAuthor = line.slice(7);
      } else if (line.startsWith("author-time ")) {
        const timestamp = parseInt(line.slice(12), 10);
        currentDate = new Date(timestamp * 1000).toISOString();
      } else if (line.startsWith("\t")) {
        blameLines.push({
          lineNumber,
          sha: currentSha,
          author: currentAuthor,
          date: currentDate,
          content: line.slice(1),
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
