import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { NextResponse } from "next/server";

const APP_NAME = "技能透镜";
const BUNDLE_ID = "com.skill-lens.app";
const HOME = process.env.HOME || "";
const APP_DIR = path.join(HOME, "Applications");
const APP_PATH = path.join(APP_DIR, `${APP_NAME}.app`);

/** Check if the Dock app is installed */
export async function GET(): Promise<NextResponse> {
  const installed = fs.existsSync(APP_PATH);
  return NextResponse.json({ installed, path: installed ? APP_PATH : null });
}

/** Install or uninstall the Dock app */
export async function POST(request: Request): Promise<NextResponse> {
  const { action } = await request.json();

  if (action === "uninstall") {
    if (fs.existsSync(APP_PATH)) {
      fs.rmSync(APP_PATH, { recursive: true, force: true });
      try {
        execFileSync("killall", ["Dock"], { stdio: "pipe" });
      } catch {}
    }
    return NextResponse.json({ installed: false, message: "已卸载" });
  }

  // --- Install ---
  const projectDir = process.cwd();
  const logoSrc = path.join(projectDir, "public/logo-v6.png");

  // Create .app bundle structure
  const contentsDir = path.join(APP_PATH, "Contents");
  const macosDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");

  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  // Info.plist
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleName</key>
\t<string>${APP_NAME}</string>
\t<key>CFBundleDisplayName</key>
\t<string>${APP_NAME}</string>
\t<key>CFBundleIdentifier</key>
\t<string>${BUNDLE_ID}</string>
\t<key>CFBundleVersion</key>
\t<string>1.0</string>
\t<key>CFBundleShortVersionString</key>
\t<string>1.0</string>
\t<key>CFBundleExecutable</key>
\t<string>launch</string>
\t<key>CFBundleIconFile</key>
\t<string>AppIcon</string>
\t<key>CFBundlePackageType</key>
\t<string>APPL</string>
\t<key>LSMinimumSystemVersion</key>
\t<string>12.0</string>
\t<key>NSHighResolutionCapable</key>
\t<true/>
</dict>
</plist>`;
  fs.writeFileSync(path.join(contentsDir, "Info.plist"), plist);

  // Detect node path
  let nodeBin: string;
  try {
    const nodePath = execFileSync("which", ["node"], { encoding: "utf-8" }).trim();
    nodeBin = path.dirname(nodePath);
  } catch {
    nodeBin = "/opt/homebrew/bin";
  }

  // Launch script
  const launchScript = `#!/bin/bash
export PATH="${nodeBin}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PORT=3000
PROJECT_DIR="${projectDir}"
URL="http://localhost:$PORT"
LOG_FILE="/tmp/skill-lens-dev.log"

if lsof -ti:$PORT > /dev/null 2>&1; then
    open "$URL"
    exit 0
fi

cd "$PROJECT_DIR" || exit 1
nohup pnpm dev > "$LOG_FILE" 2>&1 &

for i in $(seq 1 40); do
    if lsof -ti:$PORT > /dev/null 2>&1; then
        break
    fi
    sleep 0.5
done

open "$URL"
`;
  const launchPath = path.join(macosDir, "launch");
  fs.writeFileSync(launchPath, launchScript);
  fs.chmodSync(launchPath, 0o755);

  // Stop script
  const stopScript = `#!/bin/bash
PORT=3000
PIDS=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null
    echo "Dev server stopped"
else
    echo "No server running on port $PORT"
fi
`;
  const stopPath = path.join(macosDir, "stop");
  fs.writeFileSync(stopPath, stopScript);
  fs.chmodSync(stopPath, 0o755);

  // Generate .icns from logo using sips + iconutil
  if (fs.existsSync(logoSrc)) {
    try {
      const iconsetDir = "/tmp/SkillLens.iconset";
      fs.mkdirSync(iconsetDir, { recursive: true });
      const sizes: [number, number, string][] = [
        [16, 16, "icon_16x16.png"],
        [32, 32, "icon_16x16@2x.png"],
        [32, 32, "icon_32x32.png"],
        [64, 64, "icon_32x32@2x.png"],
        [128, 128, "icon_128x128.png"],
        [256, 256, "icon_128x128@2x.png"],
        [256, 256, "icon_256x256.png"],
        [512, 512, "icon_256x256@2x.png"],
        [512, 512, "icon_512x512.png"],
        [1024, 1024, "icon_512x512@2x.png"],
      ];
      for (const [h, w, name] of sizes) {
        execFileSync("sips", ["-z", String(h), String(w), logoSrc, "--out", path.join(iconsetDir, name)], {
          stdio: "pipe",
        });
      }
      execFileSync("iconutil", ["-c", "icns", iconsetDir, "-o", path.join(resourcesDir, "AppIcon.icns")], {
        stdio: "pipe",
      });
      fs.rmSync(iconsetDir, { recursive: true, force: true });
    } catch {
      // Icon generation failed, app still works without custom icon
    }
  }

  // Register with Launch Services and refresh Dock
  try {
    execFileSync(
      "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
      ["-f", APP_PATH],
      { stdio: "pipe" },
    );
    execFileSync("killall", ["Dock"], { stdio: "pipe" });
  } catch {}

  return NextResponse.json({ installed: true, message: "已安装到 Dock", path: APP_PATH });
}
