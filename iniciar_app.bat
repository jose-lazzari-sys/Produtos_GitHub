@echo off
chcp 65001 >nul
title NFC-e SP - Classificador de Produtos

echo ========================================================
echo   Iniciando NFC-e SP - Classificador de Produtos (Offline)
echo ========================================================
echo.

cd /d "%~dp0"

:: 1. Verifica se o Node.js esta instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    echo Para rodar localmente, baixe e instale o Node.js (versao LTS) em:
    echo https://nodejs.org
    echo.
    echo Apos instalar o Node.js, execute este arquivo novamente.
    echo.
    pause
    exit /b
)

:: 2. Se a pasta node_modules nao existir, instala dependencias automaticamente
if not exist "node_modules\" (
    echo [INFO] Primeira execucao detectada. Instalando pacotes necessarios...
    echo Isso pode levar de 1 a 2 minutos. Aguarde...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha ao instalar pacotes. Verifique sua conexao com a internet.
        pause
        exit /b
    )
    echo.
    echo [SUCESSO] Instalacao concluida com sucesso!
    echo.
)

:: 3. Abre o navegador automaticamente apos 4 segundos
start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:3000"

echo [INFO] Iniciando servidor em http://localhost:3000 ...
echo (Mantenha esta janela aberta enquanto estiver usando o aplicativo)
echo.

:: 4. Executa o servidor local
npm run dev

pause

