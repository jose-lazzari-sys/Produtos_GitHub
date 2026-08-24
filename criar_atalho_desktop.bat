@echo off
chcp 65001 >nul
title Criar Atalho na Area de Trabalho

echo Criando atalho na sua Area de Trabalho...

set SCRIPT="%TEMP%\create_shortcut_%RANDOM%.vbs"
set TARGET=%~dp0iniciar_app.bat
set WORKDIR=%~dp0
set ICON=%SystemRoot%\System32\shell32.dll,13

echo Set oWS = WScript.CreateObject("WScript.Shell") > %SCRIPT%
echo sLinkFile = oWS.SpecialFolders("Desktop") ^& "\NFC-e Produtos Comprados.lnk" >> %SCRIPT%
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> %SCRIPT%
echo oLink.TargetPath = "%TARGET%" >> %SCRIPT%
echo oLink.WorkingDirectory = "%WORKDIR%" >> %SCRIPT%
echo oLink.Description = "Sistema NFC-e SP - Produtos Comprados" >> %SCRIPT%
echo oLink.IconLocation = "%ICON%" >> %SCRIPT%
echo oLink.Save >> %SCRIPT%

cscript /nologo %SCRIPT%
del %SCRIPT%

echo.
echo ================================================================
echo   SUCESSO! Atalho "NFC-e Produtos Comprados" criado na Area de Trabalho!
echo   Basta dar 2 cliques nele para abrir o sistema diretamente.
echo ================================================================
echo.
pause
