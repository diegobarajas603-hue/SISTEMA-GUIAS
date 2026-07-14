@echo off
REM ============================================================
REM  RESTAURAR UN RESPALDO DEL SISTEMA DE HERRAMIENTAS
REM  Regresa la base de datos, fotos y PDFs a como estaban
REM  el dia del respaldo que elijas.
REM ============================================================

set MYSQL=C:\xampp\mysql\bin\mysql.exe
set DESTINO=C:\RESPALDOS_HERRAMIENTA
set CARPETA_SISTEMA=%~dp0

if not exist "%DESTINO%" (
  echo No existe la carpeta de respaldos %DESTINO%
  echo Primero haz un respaldo con respaldo.bat
  pause
  exit /b 1
)

echo.
echo RESPALDOS DISPONIBLES (el primero es el mas reciente):
echo -------------------------------------------------------
dir /b /ad /o-n "%DESTINO%"
echo -------------------------------------------------------
echo.
set ELEGIDO=
set /p ELEGIDO=Escribe el nombre del respaldo a restaurar (ENTER = el mas reciente): 

if "%ELEGIDO%"=="" (
  for /f "delims=" %%a in ('dir /b /ad /o-n "%DESTINO%"') do (
    set ELEGIDO=%%a
    goto :encontrado
  )
)
:encontrado

if not exist "%DESTINO%\%ELEGIDO%\base_de_datos.sql" (
  echo ERROR: no encuentro el respaldo "%ELEGIDO%"
  pause
  exit /b 1
)

echo.
echo *** ATENCION ***
echo Esto va a REEMPLAZAR los datos actuales del sistema con el
echo respaldo: %ELEGIDO%
echo Lo capturado DESPUES de ese respaldo se va a perder.
echo.
set CONFIRMA=
set /p CONFIRMA=Escribe SI (en mayusculas) para continuar: 
if not "%CONFIRMA%"=="SI" (
  echo Cancelado. No se toco nada.
  pause
  exit /b
)

REM Verificar que MySQL este encendido
"%MYSQL%" -u root -e "SELECT 1" >nul 2>&1
if errorlevel 1 (
  echo ERROR: No se pudo conectar a MySQL. Enciende MySQL en XAMPP.
  pause
  exit /b 1
)

echo.
echo [1/3] Restaurando base de datos...
"%MYSQL%" -u root < "%DESTINO%\%ELEGIDO%\base_de_datos.sql"
if errorlevel 1 (
  echo ERROR al restaurar la base de datos.
  pause
  exit /b 1
)

echo [2/3] Restaurando fotos...
robocopy "%DESTINO%\%ELEGIDO%\uploads" "%CARPETA_SISTEMA%uploads" /E >nul

echo [3/3] Restaurando PDFs...
robocopy "%DESTINO%\%ELEGIDO%\salidas_pdf" "%CARPETA_SISTEMA%salidas_pdf" /E >nul

echo.
echo ================================================
echo  RESTAURACION TERMINADA
echo  El sistema quedo como estaba el: %ELEGIDO%
echo ================================================
echo.
pause
