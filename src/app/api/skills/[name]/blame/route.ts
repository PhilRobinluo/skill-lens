import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSkillGitLocation, resolveSkillFromRequest } from "@/lib/skill-resolver";

const execFile = promisify(execFileCb);

interface BlameLine {
  lineNumber: number;
  sha: string;
  author: string;
  date: string;
  content: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  try {
    const { name } = await params;
    const skill = await resolveSkillFromRequest(request, name);

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    // Parse ?file= query param, default to SKILL.md
    const url = new URL(request.url);
    const fileParam = url.searchParams.get("file") || "SKILL.md";
    const filePath = path.resolve(skill.path, fileParam);

    // Security: path traversal check
    const skillDir = skill.path.endsWith(path.sep) ? skill.path : skill.path + path.sep;
    if (!filePath.startsWith(skillDir) && filePath !== skill.path) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const gitLocation = await getSkillGitLocation(filePath);
    if (!gitLocation) {
      return NextResponse.json({ error: "Blame only available for files inside a git repository" }, { status: 400 });
    }

    const { stdout } = await execFile(
      "git",
      ["blame", "--porcelain", gitLocation.relativePath],
      { cwd: gitLocation.gitRoot, maxBuffer: 5 * 1024 * 1024 },
    );

    const lines = stdout.split("\n");
    const blameLines: BlameLine[] = [];

    let currentSha = "";
    let currentAuthor = "";
    let currentDate = "";
    let lineNumber = 0;

    for (const line of lines) {
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
      name: skill.name,
      file: fileParam,
      totalLines: blameLines.length,
      lines: blameLines,
    });
  } catch (err) {
    const message = String(err);
    if (message.includes("no such path")) {
      return NextResponse.json({ error: "File not tracked by git" }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
