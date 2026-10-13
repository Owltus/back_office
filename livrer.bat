@echo off
REM ============================================================
REM  Back Office - LIVRER EN PROD ce qui a ete developpe en local
REM  (plan environnement-dev-docker-2026-10-12, etape 9)
REM  Double-clic : controles, resume, puis on tape LIVRER.
REM  Options : livrer.bat --essai    (resume seulement, rien ne part)
REM            livrer.bat --amorcer  (une seule fois, au tout debut)
REM            livrer.bat --reprendre-instantane  (autre poste, ou
REM                       livraison interrompue : reprend le schema prod)
REM  (fichier volontairement sans accents : encodage cmd)
REM ============================================================
setlocal
title Back Office - livraison en prod
cd /d "%~dp0"
node scripts\livrer.mjs %*
echo.
pause
endlocal
