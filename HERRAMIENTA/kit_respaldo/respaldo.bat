@echo off
REM ============================================================
REM  RESPALDO DEL SISTEMA DE HERRAMIENTAS
REM  Guarda: base de datos + fotos (uploads) + PDFs (salidas_pdf)
REM  Doble clic para respaldar. No borra nada del sistema.
REM ============================================================

REM ---------- CONFIGURACION (solo tocar si algo cambia) ----------
set MYSQLDUMP=C:\xampp\mysql\bin\mysqldump.exe
set MYSQL=C:\xampp\mysql\bin\mysql.exe
set BASE=control_herramientas
set DESTINO=C:\RESPALDOS_HERRAMIENTA
set DIAS_A_CONSERVAR=30
REM ----------------------------------------------------------------

REM La carpeta del sistema es donde esta este archivo
set CARPETA_SISTEMA=%~dp0

REM Verificar que MySQL este encendido
"%MYSQL%" -u root -e "SELECT 1" >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: No se pudo conectar a MySQL.
  echo Abre el panel de XAMPP y enciende MySQL, luego intenta de nuevo.
  echo.
  pause
  exit /b 1
)

REM Fecha y hora para el nombre del respaldo
for /f %%a in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HH-mm-ss"') do set FECHA=%%a

set CARPETA=%DESTINO%\%FECHA%
mkdir "%CARPETA%" 2>nul

echo.
echo [1/3] Respaldando base de datos (empleados, departamentos, herramientas, asignaciones, salidas)...
"%MYSQLDUMP%" -u root --databases %BASE% --add-drop-table --single-transaction --default-character-set=utf8mb4 > "%CARPETA%\base_de_datos.sql"
if errorlevel 1 (
  echo ERROR: fallo el respaldo de la base de datos.
  rmdir /s /q "%CARPETA%" 2>nul
  pause
  exit /b 1
)

echo [2/3] Respaldando fotos de herramientas (uploads)...
robocopy "%CARPETA_SISTEMA%uploads" "%CARPETA%\uploads" /E >nul

echo [3/3] Respaldando PDFs de salidas de almacen...
robocopy "%CARPETA_SISTEMA%salidas_pdf" "%CARPETA%\salidas_pdf" /E >nul

REM Borrar respaldos con mas dias que DIAS_A_CONSERVAR
forfiles /p "%DESTINO%" /d -%DIAS_A_CONSERVAR% /c "cmd /c if @isdir==TRUE rmdir /s /q @path" 2>nul

echo.
echo ================================================
echo  RESPALDO COMPLETO GUARDADO EN:
echo  %CARPETA%
echo ================================================
echo.
if not "%1"=="auto" pause
