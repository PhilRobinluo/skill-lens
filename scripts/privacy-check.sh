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
MATCHES=$(git ls-files -- '*.ts' '*.tsx' '*.js' '*.json' '*.env*' '*.md' | xargs grep -lE "$API_PATTERNS" 2>/dev/null | grep -v node_modules | grep -v pnpm-lock)

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
# 3. 检查截图中是否有新增的可能含隐私的图片
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
