import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";
import { ensureInitialized } from "@/lib/init-server";
import { readRegistry } from "@/lib/registry";

const execFile = promisify(execFileCb);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  await ensureInitialized();

  const url = new URL(request.url);
  const sha = url.searchParams.get("sha");

  if (!sha || !/^[0-9a-f]{4,40}$/i.test(sha)) {
    return NextResponse.json({ error: "Invalid or missing ?sha= parameter" }, { status: 400 });
  }

  try {
    const { name } = await params;
    const decodedName = decodeURIComponent(name);
    const registry = await readRegistry();

    const skill =
      registry.skills[decodedName] ??
      Object.values(registry.skills).find((entry) => entry.name === decodedName);

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const claudeDir = path.join(os.homedir(), ".claude");
    if (!skill.path.startsWith(claudeDir)) {
      return NextResponse.json({ error: "Diff only available for skills under ~/.claude" }, { status: 400 });
    }

    const relativePath = path.relative(claudeDir, skill.path);

    // Get commit details
    const { stdout: showOutput } = await execFile(
      "git",
      ["show", sha, "--format=%H%n%ai%n%an%n%B", "--stat", "--", `${relativePath}/`],
      { cwd: claudeDir, maxBuffer: 2 * 1024 * 1024 },
    );

    // Get the diff
    const { stdout: diffOutput } = await execFile(
      "git",
      ["show", sha, "--format=", "-p", "--", `${relativePath}/`],
      { cwd: claudeDir, maxBuffer: 2 * 1024 * 1024 },
    );

    const showLines = showOutput.split("\n");
    const fullSha = showLines[0] || sha;
    const date = showLines[1] || "";
    const author = showLines[2] || "";
    const messageLines: string[] = [];
    for (let i = 3; i < showLines.length; i++) {
      const line = showLines[i];
      if (line.match(/^\s+\S.*\|/) || line.match(/^\d+ files? changed/)) break;
      messageLines.push(line);
    }
    const message = messageLines.join("\n").trim();

    let additions = 0;
    let deletions = 0;
    for (const line of diffOutput.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) additions++;
      if (line.startsWith("-") && !line.startsWith("---")) deletions++;
    }

    return NextResponse.json({
      sha: fullSha.slice(0, 7),
      fullSha,
      date,
      author,
      message,
      additions,
      deletions,
      diff: diffOutput,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
