#!/bin/bash
# 停止 Skill Manager dev server
PORT=3000
PIDS=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$PIDS" ]; then
    echo "$PIDS" | xargs kill 2>/dev/null
    rm -f /tmp/skill-manager-dev.pid
    echo "Skill Manager dev server stopped."
else
    echo "No dev server running on port $PORT."
fi
