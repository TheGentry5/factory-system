#!/bin/bash
# ==============================================
# 工厂管理系统 - 项目启动脚本 (Git Bash / Unix)
# ==============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  工厂管理系统 - 项目启动脚本${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ==========================================
# 1. 启动 MySQL 数据库服务
# ==========================================
echo -e "${YELLOW}[1/4] 正在检查 MySQL 数据库服务...${NC}"

if sc query MySQL 2>/dev/null | grep -q "RUNNING"; then
    echo -e "${GREEN}  [OK] MySQL 服务已在运行中${NC}"
elif sc query MySQL80 2>/dev/null | grep -q "RUNNING"; then
    echo -e "${GREEN}  [OK] MySQL80 服务已在运行中${NC}"
else
    echo -e "${YELLOW}  MySQL 服务未运行，尝试启动...${NC}"
    # 尝试启动 MySQL 服务（可能需要管理员权限）
    if net start MySQL 2>/dev/null; then
        echo -e "${GREEN}  [OK] MySQL 服务已启动${NC}"
    elif net start MySQL80 2>/dev/null; then
        echo -e "${GREEN}  [OK] MySQL80 服务已启动${NC}"
    else
        echo -e "${RED}  [警告] MySQL 启动失败，请手动以管理员身份运行:${NC}"
        echo -e "${RED}    net start MySQL${NC}"
        echo -e "${RED}    或在 Windows 服务中启动 MySQL 服务${NC}"
        echo ""
        echo -e "${YELLOW}  按 Enter 继续启动其他服务...${NC}"
        read -r
    fi
fi

# ==========================================
# 2. 启动后端 API 服务
# ==========================================
echo ""
echo -e "${YELLOW}[2/4] 正在启动后端 API 服务...${NC}"

start "工厂管理系统-后端API" cmd /c "cd /d \"$SCRIPT_DIR\" && echo 后端 API 服务启动中... && echo 端口: 3001 && echo 按 Ctrl+C 停止 && echo. && node server/index.cjs"

echo -e "${GREEN}  [OK] 后端 API 服务已在新窗口启动 (端口: 3001)${NC}"
echo -e "${YELLOW}  等待后端服务就绪...${NC}"
sleep 3

# ==========================================
# 3. 启动前端开发服务器
# ==========================================
echo ""
echo -e "${YELLOW}[3/4] 正在启动前端开发服务器...${NC}"

start "工厂管理系统-前端" cmd /c "cd /d \"$SCRIPT_DIR\" && echo 前端开发服务器启动中... && echo 端口: 5173 && echo 按 Ctrl+C 停止 && echo. && npm run dev"

echo -e "${GREEN}  [OK] 前端开发服务器已在新窗口启动${NC}"
echo -e "${YELLOW}  等待前端服务就绪...${NC}"
sleep 5

# ==========================================
# 4. 打开前端页面
# ==========================================
echo ""
echo -e "${YELLOW}[4/4] 正在打开前端页面...${NC}"

start "" "http://localhost:5173"

echo -e "${GREEN}  [OK] 浏览器已打开${NC}"

# ==========================================
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  启动完成！${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  后端 API:  ${GREEN}http://localhost:3001${NC}"
echo -e "  前端页面:  ${GREEN}http://localhost:5173${NC}"
echo -e "  健康检查:  ${GREEN}http://localhost:3001/api/health${NC}"
echo ""
echo -e "  关闭窗口: 在各服务窗口中按 Ctrl+C"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "${YELLOW}按 Enter 关闭此窗口...${NC}"
read -r
