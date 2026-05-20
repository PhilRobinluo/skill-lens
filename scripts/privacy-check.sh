#!/bin/bash
# ============================================================
# 隐私检查脚本 — 每次 git push 前自动运行
# 检测个人路径、API Key、真名等敏感信息
# ============================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 动态获取当前用户的 home 目录路径，避免硬编码
HOME_PATH=$(eval echo "~")
USERNAME=$(whoami)

FOUND=0

echo ""
echo "🔍 隐私检查开始..."
echo ""

# -----------------------------------------------------------
# 1. 检查个人路径（/Users/qihang）
# -----------------------------------------------------------
MATCHES=$(git diff --cached --name-only --diff-filter=d 2>/dev/null | xargs grep -l "$HOME_PATH" 2>/dev/null)
if [ -z "$MATCHES" ]; then
  # 没有暂存的变更时，检查所有已跟踪文件（排除本脚本自身）
  MATCHES=$(git ls-files | grep -v "scripts/privacy-check.sh" | xargs grep -l "$HOME_PATH" 2>/dev/null)
fi

if [ -n "$MATCHES" ]; then
  echo -e "${RED}❌ 发现个人路径 $HOME_PATH${NC}"
  echo "   以下文件包含你的电脑用户名路径："
  echo "$MATCHES" | while read -r f; do
    COUNT=$(grep -c "$HOME_PATH" "$f" 2>/dev/null)
    echo "   - $f ($COUNT 处)"
  done
  echo ""
  FOUND=1
fi

# -----------------------------------------------------------
# 2. 检查 API Key 模式
# -----------------------------------------------------------
API_PATTERNS='sk-or-v1-[a-zA-Z0-9]{20,}|sk-[a-zA-Z0-9]{20,}|OPENAI_API_KEY=.+|ANTHROPIC_API_KEY=.+'
MATCHES=$(git ls-files -- '*.ts' '*.tsx' '*.js' '*.json' '*.env*' '*.md' | xargs grep -lE "$API_PATTERNS" 2>/dev/null | grep -v node_modules | grep -v pnpm-lock | grep -v "scripts/privacy-check.sh")

if [ -n "$MATCHES" ]; then
  echo -e "${RED}❌ 发现疑似 API Key${NC}"
  echo "   以下文件可能包含真实密钥："
  echo "$MATCHES" | while read -r f; do
    echo "   - $f"
  done
  echo ""
  FOUND=1
fi

# -----------------------------------------------------------
# 3. 检查本地 ignored data/，防止明文密钥和个人路径长期留在仓库目录
# -----------------------------------------------------------
LOCAL_DATA_PATTERNS="$API_PATTERNS|BEGIN (OPENSSH|RSA|EC|DSA) PRIVATE KEY|/Users/[A-Za-z0-9._-]+|lan-macbook-air|qihangdeMac|macmini|100\\.[0-9]+\\.[0-9]+\\.[0-9]+"
if [ -d "data" ]; then
  MATCHES=$(find data -type f ! -name ".gitignore" -print0 2>/dev/null | xargs -0 grep -lE "$LOCAL_DATA_PATTERNS" 2>/dev/null)
  if [ -n "$MATCHES" ]; then
    echo -e "${RED}❌ 本地 data/ 目录包含敏感运行时数据${NC}"
    echo "   这些文件即使被 .gitignore 忽略，也不应放在仓库目录："
    echo "$MATCHES" | while read -r f; do
      echo "   - $f"
    done
    echo "   请迁移到系统应用数据目录，例如 ~/Library/Application Support/Skill Lens/data。"
    echo ""
    FOUND=1
  fi
fi

# -----------------------------------------------------------
# 4. 检查 Electron 打包白名单，防止 ignored data/ 被塞进 Release
# -----------------------------------------------------------
if ! node <<'NODE'
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const files = pkg.build?.files ?? [];
const dangerous = files.filter((entry) => {
  if (typeof entry !== "string") return false;
  if (entry.startsWith("!")) return false;
  if (entry === "data/demo-registry.json") return false;
  return entry === "data" || entry === "data/*" || entry === "data/**/*" || entry.startsWith("data/**");
});
if (dangerous.length > 0) {
  console.error(dangerous.join("\n"));
  process.exit(1);
}
NODE
then
  echo -e "${RED}❌ Electron 打包配置包含危险 data/ 通配符${NC}"
  echo "   build.files 只能显式包含 data/demo-registry.json，不能包含 data/**/*。"
  echo ""
  FOUND=1
fi

# -----------------------------------------------------------
# 5. 检查本地已构建 Electron app，防止误上传污染产物
# -----------------------------------------------------------
APP_ASAR="dist/mac-arm64/Skill Lens.app/Contents/Resources/app.asar"
APP_DIR="dist/mac-arm64/Skill Lens.app/Contents/Resources/app"
DIST_PATTERNS='sk-or-v1-|lan-macbook-air|BEGIN OPENSSH PRIVATE KEY|BEGIN RSA PRIVATE KEY'

if [ -f "$APP_ASAR" ]; then
  if grep -aEq "$DIST_PATTERNS" "$APP_ASAR" 2>/dev/null; then
    echo -e "${RED}❌ dist 里的 app.asar 仍包含敏感配置痕迹${NC}"
    echo "   请删除旧 dist/ 并重新构建，然后再次运行隐私检查。"
    echo ""
    FOUND=1
  fi
fi

if [ -d "$APP_DIR" ]; then
  if grep -RIlE "$DIST_PATTERNS" "$APP_DIR" 2>/dev/null | head -1 | grep -q .; then
    echo -e "${RED}❌ dist 里的 unpacked app 仍包含敏感配置痕迹${NC}"
    echo "   请删除旧 dist/ 并重新构建，然后再次运行隐私检查。"
    echo ""
    FOUND=1
  fi
  if grep -RIlF "$HOME_PATH" "$APP_DIR" 2>/dev/null | head -1 | grep -q .; then
    echo -e "${RED}❌ dist 里的 unpacked app 仍包含本机绝对路径${NC}"
    echo "   请清理 .next 开发缓存/manifest 里的 $HOME_PATH 后重新构建。"
    echo ""
    FOUND=1
  fi
  if grep -RIlF "/Users/qihang" "$APP_DIR" 2>/dev/null | head -1 | grep -q .; then
    echo -e "${RED}❌ dist 里的 unpacked app 仍包含旧机器绝对路径 /Users/qihang${NC}"
    echo "   请清理旧个人路径后重新构建。"
    echo ""
    FOUND=1
  fi
fi

# -----------------------------------------------------------
# 6. 检查截图中是否有新增的可能含隐私的图片
# -----------------------------------------------------------
NEW_IMAGES=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep -E '\.(png|jpg|jpeg|gif|webp)$')
if [ -n "$NEW_IMAGES" ]; then
  echo -e "${YELLOW}⚠️  新增了图片文件（请确认没有隐私信息）${NC}"
  echo "$NEW_IMAGES" | while read -r f; do
    echo "   - $f"
  done
  echo ""
fi

# -----------------------------------------------------------
# 结果
# -----------------------------------------------------------
if [ $FOUND -eq 0 ]; then
  echo -e "${GREEN}✅ 隐私检查通过！没有发现敏感信息。${NC}"
  echo ""
  exit 0
else
  echo -e "${RED}🚫 隐私检查未通过！请修复上面的问题后再 push。${NC}"
  echo -e "   如果你确认这些是安全的，可以用 ${YELLOW}git push --no-verify${NC} 跳过检查。"
  echo ""
  exit 1
fi
