@echo off
chcp 65001 >nul
title PUBG Buddy 一键启动
cd /d "%~dp0"

echo ==========================================
echo    PUBG Buddy 一键启动 / One-click start
echo ==========================================
echo  本脚本只从官方源下载软件, 不收集任何数据
echo  Downloads from official sources only
echo ==========================================
echo.

rem ---------- [1/3] Node.js ----------
where node >nul 2>nul
if %errorlevel% equ 0 goto :node_ok

echo [1/3] 未检测到 Node.js, 尝试自动安装...

rem 方式一: winget(Win10 1809+ 自带)
where winget >nul 2>nul
if %errorlevel% equ 0 (
  echo       方式一: winget 安装 Node.js LTS...
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
  where node >nul 2>nul
  if %errorlevel% equ 0 goto :node_installed
)

rem 方式二: 从 Node.js 官网直接下载安装器(HTTPS)
echo       方式二: 从 nodejs.org 官网下载安装器...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi' -OutFile \"$env:TEMP\node-lts.msi\" -UseBasicParsing } catch { exit 1 }"
if %errorlevel% neq 0 (
  rem 方式三: 国内镜像(npmmirror, 阿里开源镜像站)
  echo       方式三: 官网较慢, 改用国内镜像下载...
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'https://npmmirror.com/mirrors/node/v22.14.0/node-v22.14.0-x64.msi' -OutFile \"$env:TEMP\node-lts.msi\" -UseBasicParsing } catch { exit 1 }"
)
if exist "%TEMP%\node-lts.msi" (
  echo       正在安装 Node.js(弹出的安装窗口一路下一步即可)...
  msiexec /i "%TEMP%\node-lts.msi" /passive
  set "PATH=%PATH%;%ProgramFiles%\nodejs;%APPDATA%\npm"
)

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo.
  echo  自动安装未完成。请手动安装 Node.js 后再次双击本脚本:
  echo  Please install Node.js manually, then run this again:
  echo  https://nodejs.org/  (点绿色 LTS 按钮下载, 一路下一步)
  echo.
  pause
  exit /b 1
)

:node_installed
echo       Node.js 安装完成。若下方步骤报错, 请关闭本窗口后再次双击本脚本。
:node_ok
for /f "delims=" %%v in ('node -v') do echo [1/3] Node.js 已就绪 %%v

rem ---------- [2/3] 依赖 ----------
if exist node_modules goto :deps_ok
echo [2/3] 首次运行, 正在安装依赖(需要几分钟, 只做一次)...
call npm install
if %errorlevel% equ 0 goto :deps_ok

echo       官方源安装失败, 自动切换国内镜像重试...
set "npm_config_registry=https://registry.npmmirror.com"
set "npm_config_electron_mirror=https://npmmirror.com/mirrors/electron/"
call npm install
if %errorlevel% neq 0 (
  echo.
  echo  依赖安装失败。请把上方红色报错截图发给开发者。
  echo  Dependency install failed, please screenshot the error above.
  pause
  exit /b 1
)
:deps_ok
echo [2/3] 依赖已就绪 / Dependencies OK

rem ---------- [3/3] 启动 ----------
echo [3/3] 启动 PUBG Buddy...
echo       首次使用: 打开后到「设置」页填入 PUBG API Key 并绑定游戏昵称
echo       (Key 在 developer.pubg.com 免费申请, 只保存在你自己电脑上)
echo.
call npm run dev
pause
