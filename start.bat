@echo off
REM ============================================================
REM  Back Office - lancement de l'app en local (Windows)
REM  Double-cliquer sur ce fichier pour demarrer le serveur.
REM ============================================================
setlocal
cd /d "%~dp0"

echo.
echo === Back Office : demarrage local ===
echo.

REM -- Verifie que pnpm est disponible
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] pnpm est introuvable. Installe-le avec : npm install -g pnpm
  echo.
  pause
  exit /b 1
)

REM -- Installe les dependances si besoin
if not exist "node_modules" (
  echo Installation des dependances (premiere execution)...
  call pnpm install
  if errorlevel 1 (
    echo [ERREUR] L'installation a echoue.
    pause
    exit /b 1
  )
)

REM -- Ouvre le navigateur puis lance le serveur de dev
echo Ouverture du navigateur sur http://localhost:3000 ...
start "" http://localhost:3000

echo Lancement du serveur (Ctrl+C pour arreter)...
echo.
call pnpm dev

endlocal
