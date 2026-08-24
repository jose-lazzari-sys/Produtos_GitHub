@echo off
chcp 65001 >nul
title NFC-e SP - Classificador de Produtos

echo ========================================================
echo   Iniciando NFC-e SP - Classificador de Produtos (Offline)
echo ========================================================
echo.

cd /d "%~dp0"

:: Abre o navegador automaticamente apos 3 segundos
start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:3000"

:: Executa o servidor Node/Vite
npm run dev

pause
