@echo off
title Liquidaciones
cd /d "%~dp0"

echo ============================================
echo   Iniciando Sistema de Liquidaciones
echo ============================================
echo.

py -m pip show flask >nul 2>&1
if errorlevel 1 (
    echo Instalando dependencias por primera vez...
    py -m pip install -r requirements.txt
)

py app.py

pause
