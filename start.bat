@echo off
REM ============================================================
REM  Back Office - DEMARRER LE DEVELOPPEMENT (Windows), tout en un :
REM    1. Docker Desktop (lance s'il ne tourne pas)
REM    2. la base locale et ses fonctions serveur
REM    3. les donnees fraiches de la prod (question O/N, oui par
REM       defaut au bout de 10 s ; la prod est seulement LUE, noms
REM       de clients remplaces, la base locale est remplacee)
REM    4. le serveur de l'app, navigateur ouvert sur localhost:3000
REM  Double-cliquer, puis laisser cette fenetre ouverte.
REM  (fichier volontairement sans accents : encodage cmd)
REM ============================================================
setlocal
title Back Office - developpement local (laisser cette fenetre ouverte)
cd /d "%~dp0"

echo.
echo === Back Office : demarrage du developpement ===
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

REM -- 1. Docker Desktop : lance s'il ne repond pas, attendu 3 min au plus
docker info >nul 2>nul
if not errorlevel 1 goto docker_ok
if not exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
  echo [ERREUR] Docker Desktop est introuvable. Lancez-le a la main.
  pause
  exit /b 1
)
echo Lancement de Docker Desktop...
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set ATTENTE=0
:docker_attente
timeout /t 5 /nobreak >nul
docker info >nul 2>nul
if not errorlevel 1 goto docker_ok
set /a ATTENTE+=1
if %ATTENTE% gtr 36 (
  echo [ERREUR] Docker Desktop ne repond pas apres 3 minutes.
  pause
  exit /b 1
)
goto docker_attente
:docker_ok

REM -- 2. Base de donnees LOCALE : l'app ne demarre que sur elle
REM    (plan environnement-dev-docker-2026-10-12). Juste apres le
REM    lancement de Docker (ou apres une coupure), la base est encore
REM    "starting" : on reessaie jusqu'a 6 fois, 15 s d'ecart.
set ESSAIS=0
:base
call supabase status >nul 2>nul
if not errorlevel 1 goto base_ok
set /a ESSAIS+=1
if %ESSAIS% gtr 6 (
  echo [ERREUR] La base locale ne demarre pas.
  pause
  exit /b 1
)
echo Demarrage de la base locale, essai %ESSAIS%...
call pnpm db:start >nul 2>nul
if errorlevel 1 timeout /t 15 /nobreak >nul
goto base
:base_ok
REM    Fonctions serveur locales : apres une coupure, leur conteneur reste
REM    arrete et "supabase start" ne le relance pas (constate le 2026-10-14).
docker start supabase_edge_runtime_back-office >nul 2>nul

REM -- 3. Donnees fraiches de la prod (lecture seule). Un echec n'empeche
REM    pas de travailler : on garde les donnees locales actuelles.
echo.
echo Recuperer les donnees fraiches de la prod ?
echo   O = oui : la base locale est remplacee par une copie de la prod
echo       ^(noms de clients remplaces, vos essais locaux sont perdus^)
echo   N = non : garder les donnees locales actuelles
choice /c ON /t 10 /d O /m "Votre choix (oui dans 10 s)"
if errorlevel 2 goto serveur
node scripts\copier-prod.mjs --confirme
if errorlevel 1 (
  echo.
  echo [ATTENTION] Copie non faite : on continue avec les donnees locales actuelles.
  echo.
  timeout /t 5 >nul
)
docker start supabase_edge_runtime_back-office >nul 2>nul

:serveur
REM -- 4. Ouvre le navigateur UNE FOIS le serveur pret (sonde le port 3000
REM    en arriere-plan pendant 60 s max, puis lance l'URL)
start "" /min powershell -NoProfile -Command "for ($i = 0; $i -lt 120; $i++) { try { $c = New-Object Net.Sockets.TcpClient('localhost', 3000); $c.Close(); Start-Process 'http://localhost:3000'; break } catch { Start-Sleep -Milliseconds 500 } }"

echo.
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
