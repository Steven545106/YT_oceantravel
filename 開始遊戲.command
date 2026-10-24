#!/bin/bash
# 雙擊即可：啟動本機伺服器並用瀏覽器開啟遊戲。關閉此視窗（或按 Ctrl+C）即停止。
cd "$(dirname "$0")" || exit 1
exec python3 scripts/serve.py
