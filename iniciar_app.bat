@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
title NFC-e SP - Classificador de Produtos

echo ================================================================
echo   Iniciando NFC-e SP - Classificador de Produtos (Modo Local)
echo ================================================================
echo.

:: 1. Garante que o diretorio de execucao seja a pasta onde este script esta salvo
cd /d "%~dp0"
echo [INFO] Pasta do projeto: "%CD%"

:: 2. Adiciona caminhos padroes do Node.js ao PATH caso o Windows ainda nao tenha atualizado
if exist "C:\Program Files\nodejs" set "PATH=C:\Program Files\nodejs;!PATH!"
if exist "C:\Program Files (x86)\nodejs" set "PATH=C:\Program Files (x86)\nodejs;!PATH!"
if exist "%APPDATA%\npm" set "PATH=!PATH!;%APPDATA%\npm"
if exist "%LOCALAPPDATA%\Programs\node" set "PATH=!PATH!;%LOCALAPPDATA%\Programs\node"

:: 3. Verifica se o Node.js esta instalado
where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo ================================================================
    echo [ERRO] O Node.js nao foi encontrado no seu computador!
    echo ================================================================
    echo Para utilizar o aplicativo offline no seu computador, e necessario
    echo instalar o Node.js ^(versao LTS recomendada^).
    echo.
    echo Baixe e instale gratuitamente em: https://nodejs.org
    echo.
    echo Dica: Apos concluir a instalacao do Node.js, feche e abra
    echo novamente este arquivo.
    echo ================================================================
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set "NODE_VER=%%v"
echo [OK] Node.js detectado: !NODE_VER!

:: 4. Verifica se o NPM esta disponivel
where npm >nul 2>&1
if errorlevel 1 (
    echo.
    echo ================================================================
    echo [ERRO] O gerenciador de pacotes NPM nao foi encontrado no PATH!
    echo ================================================================
    echo Reinstale o Node.js marcando a opcao de adicionar ao PATH.
    echo ================================================================
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('npm -v 2^>nul') do set "NPM_VER=%%v"
echo [OK] NPM detectado: !NPM_VER!
echo.

:: 5. Se a pasta node_modules nao existir ou estiver vazia, instala dependencias
if not exist "node_modules\" (
    echo [INFO] Primeira execucao detectada. Instalando pacotes necessarios...
    echo Isso pode levar de 1 a 2 minutos. Por favor aguarde...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo ================================================================
        echo [ERRO] Falha ao instalar dependencias com 'npm install'.
        echo Verifique sua conexao com a internet e tente novamente.
        echo ================================================================
        echo.
        pause
        exit /b 1
    )
    echo.
    echo [SUCESSO] Instalacao de pacotes concluida com sucesso!
    echo.
)

:: 6. Abre o navegador automaticamente em segundo plano apos 3 segundos
start "" cmd /c "timeout /t 3 /nobreak >nul 2>&1 & start http://localhost:3000"

echo [INFO] Iniciando servidor local em http://localhost:3000 ...
echo [INFO] O seu navegador abrira automaticamente em alguns segundos.
echo [INFO] Mantenha esta janela aberta enquanto estiver usando o aplicativo.
echo [INFO] Para fechar o app, basta fechar esta janela ou teclar Ctrl + C.
echo ----------------------------------------------------------------
echo.

:: 7. Executa o servidor usando CALL para nunca fechar o CMD prematuramente
call npm run dev

:: 8. Caso o servidor seja encerrado, mantem a tela aberta para diagnostico
echo.
echo ----------------------------------------------------------------
echo [INFO] O servidor local foi encerrado.
echo ----------------------------------------------------------------
pause


