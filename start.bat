@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
title 工厂管理系统 - 启动脚本
cd /d "%~dp0"

echo ========================================
echo   工厂管理系统 - 项目启动脚本
echo ========================================
echo.

REM ==========================================
REM 1. 启动 MySQL 数据库服务
REM ==========================================
echo [1/4] 正在检查 MySQL 数据库服务...

REM 自动检测 MySQL 服务名 (sc query 输出格式: "SERVICE_NAME: MySQL80")
set "MYSQL_SVC="
for /f "tokens=2" %%s in ('sc query state^= all ^| findstr /i "SERVICE_NAME:.*MySQL"') do set "MYSQL_SVC=%%s"

REM 没找到则尝试常见服务名
if not defined MYSQL_SVC (
    for %%n in (MySQL80 MySQL8.0 MySQL57 MySQL5.7 MySQL) do (
        if not defined MYSQL_SVC (
            sc query "%%n" >nul 2>&1
            if !errorlevel! equ 0 set "MYSQL_SVC=%%n"
        )
    )
)

if not defined MYSQL_SVC goto :no_service

REM 检查该服务是否已在运行
sc query "%MYSQL_SVC%" | findstr /C:"RUNNING" >nul
if %errorlevel% equ 0 (
    echo   [OK] MySQL 服务 %MYSQL_SVC% 已在运行中
    goto :start_backend
)

echo   检测到 MySQL 服务: %MYSQL_SVC%（未运行）
echo   正在启动（弹出 UAC 窗口时请点击"是"）...
powershell -NoProfile -Command "Start-Process net -ArgumentList 'start','%MYSQL_SVC%' -Verb RunAs -Wait" >nul 2>&1

set /a RETRY=0
:wait_mysql
timeout /t 3 /nobreak >nul
sc query "%MYSQL_SVC%" | findstr /C:"RUNNING" >nul
if !errorlevel! equ 0 (
    echo   [OK] MySQL 服务 %MYSQL_SVC% 已启动
    goto :start_backend
)
set /a RETRY+=1
if !RETRY! lss 5 (
    echo   等待中... ^(!RETRY!/5^)
    goto :wait_mysql
)

echo   [警告] MySQL 可能未成功启动，请手动以管理员身份运行：
echo   net start %MYSQL_SVC%
echo.
echo   按任意键继续启动其他服务...
pause >nul
goto :start_backend

:no_service
echo   [警告] 未检测到 MySQL 服务，尝试直接连接数据库...
mysqladmin -u root -ppassword ping >nul 2>&1
if %errorlevel% equ 0 (
    echo   [OK] MySQL 已在运行（非服务模式）
    goto :start_backend
)
echo   [警告] 无法连接到 MySQL，请手动启动 MySQL 后再运行此脚本。
echo.
echo   按任意键继续启动其他服务...
pause >nul

REM ==========================================
REM 2. 启动后端 API 服务
REM ==========================================
:start_backend
echo.
echo [2/4] 正在启动后端 API 服务...

start "工厂管理系统-后端API" cmd /k node server\index.cjs

echo   [OK] 后端 API 服务已在新窗口启动 (端口: 3001)
echo   等待后端服务就绪...
timeout /t 3 /nobreak >nul

REM ==========================================
REM 3. 启动前端开发服务器
REM ==========================================
echo.
echo [3/4] 正在启动前端开发服务器...

start "工厂管理系统-前端" cmd /k npm run dev

echo   [OK] 前端开发服务器已在新窗口启动 (端口: 5173)
echo   等待前端服务就绪...
timeout /t 5 /nobreak >nul

REM ==========================================
REM 4. 打开前端页面
REM ==========================================
echo.
echo [4/4] 正在打开前端页面...

start "" "http://localhost:5173"

echo   [OK] 浏览器已打开
echo.
echo ========================================
echo   启动完成！
echo.
echo   后端 API: http://localhost:3001
echo   前端页面: http://localhost:5173
echo   健康检查: http://localhost:3001/api/health
echo.
echo   停止服务: 在各服务窗口中按 Ctrl+C 或直接关闭窗口
echo ========================================
echo.
echo 按任意键关闭此窗口...
pause >nul
