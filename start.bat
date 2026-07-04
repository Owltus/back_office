@echo off
REM ============================================================
REM  Back Office - lancement de l'app en local (Windows)
REM  Double-cliquer sur ce fichier pour demarrer le serveur.
REM  (fichier volontairement sans accents : encodage cmd)
REM ============================================================
setlocal
title Back Office - serveur local (laisser cette fenetre ouverte)
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
REM    NB : les parentheses fermantes sont echappees ^) sinon elles
REM    terminent le bloc if et le script deraille.
if not exist "node_modules" (
  echo Installation des dependances ^(premiere execution^)...
  call pnpm install
  if errorlevel 1 (
    echo [ERREUR] L'installation a echoue.
    pause
    exit /b 1
  )
)

REM -- Ouvre le navigateur UNE FOIS le serveur pret (sonde le port 3000
REM    en arriere-plan pendant 60 s max, puis lance l'URL)
start "" /min powershell -NoProfile -Command "for ($i = 0; $i -lt 120; $i++) { try { $c = New-Object Net.Sockets.TcpClient('localhost', 3000); $c.Close(); Start-Process 'http://localhost:3000'; break } catch { Start-Sleep -Milliseconds 500 } }"

echo Lancement du serveur : http://localhost:3000
echo Le navigateur s'ouvrira automatiquement quand le serveur sera pret.
echo ^(Ctrl+C ou fermer cette fenetre pour arreter^)
echo.
call pnpm dev

REM -- Si on arrive ici, le serveur s'est arrete (ou a plante) :
REM    on garde la fenetre ouverte pour pouvoir lire les messages.
echo.
echo [INFO] Le serveur s'est arrete.
pause
endlocal
