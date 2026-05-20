/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const productName = context.packager.appInfo.productFilename;
  const appRoot = path.join(
    context.appOutDir,
    `${productName}.app`,
    "Contents",
    "Resources",
    "app",
  );

  removeDevBuildCache(appRoot);
  sanitizeRequiredServerFiles(appRoot, context.packager.projectDir);
  copyNextSwcNativePackage(appRoot, context.packager.projectDir);
};

function removeDevBuildCache(appRoot) {
  const devDir = path.join(appRoot, ".next", "dev");
  fs.rmSync(devDir, { recursive: true, force: true });
}

function sanitizeRequiredServerFiles(appRoot, projectDir) {
  for (const fileName of ["required-server-files.json", "required-server-files.js"]) {
    const requiredFilesPath = path.join(appRoot, ".next", fileName);
    if (!fs.existsSync(requiredFilesPath)) continue;

    const raw = fs.readFileSync(requiredFilesPath, "utf8");
    const projectRoot = projectDir;
    const sanitized = raw
      .split(projectRoot).join(".")
      .split(projectRoot.replaceAll("\\", "/")).join(".");

    fs.writeFileSync(requiredFilesPath, sanitized, "utf8");
  }
}

function copyNextSwcNativePackage(appRoot, projectDir) {
  if (process.platform !== "darwin") return;

  const packageName = process.arch === "arm64"
    ? "swc-darwin-arm64"
    : "swc-darwin-x64";

  const source = findPackagePath(path.join(projectDir, "node_modules"), "@next", packageName);
  if (!source) {
    console.warn(`[afterPack] @next/${packageName} not found in local node_modules`);
    return;
  }

  const target = path.join(appRoot, "node_modules", "@next", packageName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
}

function findPackagePath(root, scope, packageName) {
  const direct = path.join(root, scope, packageName);
  if (fs.existsSync(path.join(direct, "package.json"))) return direct;

  const pnpmRoot = path.join(root, ".pnpm");
  if (!fs.existsSync(pnpmRoot)) return null;

  for (const entry of fs.readdirSync(pnpmRoot)) {
    if (!entry.startsWith(`${scope}+${packageName}@`)) continue;
    const candidate = path.join(pnpmRoot, entry, "node_modules", scope, packageName);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  }

  return null;
}
