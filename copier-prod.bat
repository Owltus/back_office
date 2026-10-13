@echo off
REM ============================================================
REM  Back Office - COPIER les donnees de la prod dans la base locale
REM  (plan environnement-dev-docker-2026-10-12, etape 14)
REM  La prod est seulement LUE. Noms de clients remplaces.
REM  La base locale est entierement remplacee (on tape COPIER).
REM  (fichier volontairement sans accents : encodage cmd)
REM ============================================================
setlocal
title Back Office - copie des donnees de la prod
cd /d "%~dp0"
node scripts\copier-prod.mjs %*
echo.
pause
endlocal
