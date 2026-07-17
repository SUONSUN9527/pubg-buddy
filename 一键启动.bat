@echo off
chcp 65001 >nul
title PUBG Buddy 一键启动
cd /d "%~dp0"

echo ==========================================
echo    PUBG Buddy 一键启动 / One-click start
echo ==========================================
echo.

rem ---------- [1/3] Node.js ----------
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [1/3] 未检测到 Node.js, 正在通过 winget 自动安装 LTS 版本...
  echo       Node.js not found, installing LTS via winget...
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  if %errorlevel% neq 0 (
    echo.
    echo  winget 安装失败。请手动安装 Node.js 后重新双击本脚本:
    echo  winget failed. Please install Node.js manually, then run this again:
    echo  https://nodejs.org/
    echo.
    pause
    exit /b 1
  )
  rem 让当前窗口能立刻找到刚装好的 node
  set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
  where node >nul 2>nul
  if %errorlevel% neq 0 (
    echo.
    echo  Node.js 已安装, 但需要重新打开窗口生效。请再次双击本脚本。
    echo  Node.js installed. Please double-click this script again.
    echo.
    pause
    exit /b 0
  )
) else (
  for /f "delims=" %%v in ('node -v') do echo [1/3] Node.js 已就绪 %%v
)

rem ---------- [2/3] 依赖 ----------
if not exist node_modules (
  echo [2/3] 首次运行, 正在安装依赖(需要几分钟, 只做一次)...
  echo       Installing dependencies, first run only...
  call npm install
  if %errorlevel% neq 0 (
    echo.
    echo  依赖安装失败, 请截图报错信息。Dependency install failed.
    pause
    exit /b 1
  )
) else (
  echo [2/3] 依赖已就绪 / Dependencies OK
)

rem ---------- [3/3] 启动 ----------
echo [3/3] 启动 PUBG Buddy...
echo       首次使用: 打开后到「设置」页填入 PUBG API Key 并绑定游戏昵称
echo       First run: open Settings, paste your PUBG API key and bind your name
echo.
call npm run dev
pause
