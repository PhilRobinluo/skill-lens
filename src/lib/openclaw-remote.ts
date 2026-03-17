import { execFileSync } from "node:child_process";

import type { OpenClawSshConfig, SkillEntry } from "./types";
import { parseSkillMd } from "./scanner";

// ---------------------------------------------------------------------------
// SSH helper — build ssh command args from config
// ---------------------------------------------------------------------------
function sshBaseArgs(config: OpenClawSshConfig): string[] {
  const args: string[] = [
    "-o", "ConnectTimeout=5",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "BatchMode=yes",
  ];

  if (config.port !== 22) {
    args.push("-p", String(config.port));
  }
  if (config.keyPath) {
    args.push("-i", config.keyPath);
  }

  const target = config.user ? `${config.user}@${config.host}` : config.host;
  args.push(target);

  return args;
}

/**
 * Wrap a command with sudo -u if runAsUser is set.
 * Uses plain sudo (no -i) — paths must be absolute (see resolveRemoteTilde).
 */
function wrapCmd(config: OpenClawSshConfig, cmd: string): string {
  if (config.runAsUser) {
    const escaped = cmd.replace(/'/g, "'\\''");
    return `sudo -u ${config.runAsUser} sh -c '${escaped}'`;
  }
  return cmd;
}

/**
 * Run a raw SSH command (no sudo wrapper). Used for path resolution etc.
 */
function runSshRaw(config: OpenClawSshConfig, remoteCmd: string): string {
  const args = [...sshBaseArgs(config), remoteCmd];
  return execFileSync("ssh", args, {
    encoding: "utf-8",
    timeout: 10_000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

export function runSsh(config: OpenClawSshConfig, remoteCmd: string): string {
  const args = [...sshBaseArgs(config), wrapCmd(config, remoteCmd)];
  return execFileSync("ssh", args, {
    encoding: "utf-8",
    timeout: 30_000,
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
}

/**
 * Resolve ~ in a remote path to an absolute path.
 * Uses POSIX `eval echo ~username` which works for any user without sudo.
 * - If runAsUser is set: resolves ~runAsUser (e.g. ~maowu → /Users/maowu)
 * - Otherwise: resolves ~ (SSH user's home)
 */
export function resolveRemoteTilde(config: OpenClawSshConfig, remotePath: string): string {
  if (!remotePath.startsWith("~")) return remotePath;

  try {
    const tildeExpr = config.runAsUser ? `~${config.runAsUser}` : "~";
    const home = runSshRaw(config, `eval echo ${tildeExpr}`);
    if (home && !home.startsWith("~")) {
      return remotePath.replace(/^~/, home);
    }
  } catch {
    // fallback to original path
  }
  return remotePath;
}

// ---------------------------------------------------------------------------
// testConnection — check SSH connectivity
// ---------------------------------------------------------------------------
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  /** milliseconds */
  latencyMs?: number;
  /** number of skills found (on success) */
  skillCount?: number;
}

export function testConnection(
  config: OpenClawSshConfig,
): ConnectionTestResult {
  const start = Date.now();
  try {
    // Test basic SSH + sudo access, and count skills in one go
    const output = runSsh(config, "echo ok");
    const latencyMs = Date.now() - start;
    if (output.includes("ok")) {
      // Also try to discover skills directories
      try {
        const dirs = discoverSkillsDirs(config);
        let total = 0;
        for (const dir of dirs) {
          const count = runSsh(config, `ls -1d ${dir}/*/ 2>/dev/null | wc -l`);
          total += parseInt(count.trim(), 10) || 0;
        }
        return {
          success: true,
          message: `连接成功，发现 ${dirs.length} 个 Skills 目录`,
          latencyMs,
          skillCount: total,
        };
      } catch {
        return { success: true, message: "连接成功", latencyMs };
      }
    }
    return { success: false, message: `意外输出: ${output}` };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Permission denied")) {
      return { success: false, message: "认证失败：权限被拒绝", latencyMs };
    }
    if (msg.includes("Connection refused")) {
      return { success: false, message: "连接被拒绝：请检查主机和端口", latencyMs };
    }
    if (msg.includes("timed out") || msg.includes("Timeout")) {
      return { success: false, message: "连接超时：请检查主机地址和网络", latencyMs };
    }
    if (msg.includes("Could not resolve hostname")) {
      return { success: false, message: "无法解析主机名", latencyMs };
    }
    if (msg.includes("sudo")) {
      return { success: false, message: "sudo 执行失败：请检查运行用户配置", latencyMs };
    }
    return { success: false, message: `连接失败: ${msg.slice(0, 200)}`, latencyMs };
  }
}

// ---------------------------------------------------------------------------
// discoverSkillsDirs — auto-find all skills directories under ~/.openclaw/
// ---------------------------------------------------------------------------
function discoverSkillsDirs(config: OpenClawSshConfig): string[] {
  const rawPath = config.skillsPath || "~/.openclaw";
  // Remove trailing /skills/ if user put the full path — we'll auto-discover
  const cleaned = rawPath.replace(/\/skills\/?$/, "").replace(/\/+$/, "");
  // Resolve ~ to absolute path on the remote host (works for any user)
  const base = resolveRemoteTilde(config, cleaned).replace(/\/+$/, "");

  try {
    // Find all 'skills' directories under the base
    const output = runSsh(
      config,
      `find ${base} -maxdepth 3 -type d -name skills 2>/dev/null`,
    );
    if (!output.trim()) return [];

    return output
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d.length > 0 && !d.includes("/backups/") && !d.includes("node_modules"));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// scanRemoteOpenClawSkills — list and parse remote skills via SSH
// ---------------------------------------------------------------------------
export function scanRemoteOpenClawSkills(
  config: OpenClawSshConfig,
): Record<string, SkillEntry> {
  const skills: Record<string, SkillEntry> = {};

  // Auto-discover all skills directories
  const skillsDirs = discoverSkillsDirs(config);
  if (skillsDirs.length === 0) return skills;

  for (const skillsDir of skillsDirs) {
    // Derive a label from the directory path for grouping
    // e.g. ~/.openclaw/skills/ → "root", ~/.openclaw/workspace/skills/ → "workspace"
    const dirLabel = deriveLabel(skillsDir);

    // List skill directories
    let dirList: string;
    try {
      dirList = runSsh(
        config,
        `find ${skillsDir} -maxdepth 1 -mindepth 1 -type d -exec basename {} \\;`,
      );
    } catch {
      continue;
    }

    if (!dirList.trim()) continue;

    const dirNames = dirList
      .split("\n")
      .map((d) => d.trim())
      .filter((d) => d.length > 0 && !d.startsWith(".") && d !== "_archived");

    for (const dirName of dirNames) {
      const skillMdPath = `${skillsDir}/${dirName}/SKILL.md`;
      // Use a unique key that includes the source directory to avoid collisions
      const key = `openclaw:${dirLabel}/${dirName}`;

      // Skip if we already have this skill from a higher-priority directory
      if (skills[key]) continue;

      try {
        const output = runSsh(
          config,
          [
            `cat '${skillMdPath}'`,
            `echo '___STAT_SEP___'`,
            `(stat -c '%W %Y' '${skillMdPath}' 2>/dev/null || stat -f '%B %m' '${skillMdPath}' 2>/dev/null)`,
          ].join(" && "),
        );

        const sepIdx = output.lastIndexOf("___STAT_SEP___");
        if (sepIdx === -1) continue;

        const content = output.slice(0, sepIdx).trim();
        const statLine = output.slice(sepIdx + "___STAT_SEP___".length).trim();

        if (!content) continue;

        const statParts = statLine.split(/\s+/);
        const birthEpoch = parseInt(statParts[0] ?? "0", 10);
        const modEpoch = parseInt(statParts[1] ?? "0", 10);

        const createdAt = birthEpoch > 0
          ? new Date(birthEpoch * 1000).toISOString()
          : new Date().toISOString();
        const lastModified = modEpoch > 0
          ? new Date(modEpoch * 1000).toISOString()
          : new Date().toISOString();

        const entry: SkillEntry = {
          name: key,
          path: `${config.host}:${skillsDir}/${dirName}`,
          source: "openclaw-remote",
          description: parseSkillMd(content),
          lineCount: content.split("\n").length,
          createdAt,
          lastModified,
          claudeMdRefs: [],
          tags: {
            domain: [],
            autoTagged: false,
            frequency: null,
          },
          dependencies: [],
          notes: `[${dirLabel}]`,
          belongsTo: `openclaw:${config.host}`,
          enabled: true,
        };

        skills[key] = entry;
      } catch {
        continue;
      }
    }
  }

  return skills;
}

/**
 * Derive a human-readable label from a skills directory path.
 * e.g. /Users/maowu/.openclaw/skills → "root"
 *      /Users/maowu/.openclaw/workspace/skills → "workspace"
 *      /Users/maowu/.openclaw/workspace-ops/skills → "workspace-ops"
 *      /Users/maowu/.openclaw/extensions/qqbot/skills → "ext-qqbot"
 */
function deriveLabel(dirPath: string): string {
  // Normalize: collapse double slashes
  const normalized = dirPath.replace(/\/+/g, "/");

  // Match patterns like .openclaw/<segment>/skills or .openclaw/skills
  const match = normalized.match(/\.openclaw\/(.+?)\/skills\/?$/);
  if (!match) {
    // Direct .openclaw/skills/
    if (normalized.match(/\.openclaw\/skills\/?$/)) return "root";
    return "unknown";
  }

  const segment = match[1];
  if (segment.startsWith("extensions/")) {
    return `ext-${segment.split("/").pop()}`;
  }
  return segment;
}
