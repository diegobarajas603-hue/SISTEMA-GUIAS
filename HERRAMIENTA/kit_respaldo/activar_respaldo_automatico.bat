@echo off
REM ============================================================
REM  ACTIVAR RESPALDO AUTOMATICO DIARIO
REM  Ejecutar UNA sola vez. Crea una tarea de Windows que corre
REM  respaldo.bat todos los dias a las 2:00 PM.
REM ============================================================

schtasks /create /f /tn "Respaldo Sistema Herramientas" /tr "\"%~dp0respaldo.bat\" auto" /sc daily /st 14:00

if errorlevel 1 (
  echo.
  echo No se pudo crear la tarea. Prueba: clic derecho sobre este
  echo archivo y "Ejecutar como administrador".
) else (
  echo.
  echo LISTO: todos los dias a las 2:00 PM se hara un respaldo
  echo automatico en C:\RESPALDOS_HERRAMIENTA
  echo (la computadora debe estar encendida a esa hora)
)
echo.
pause
