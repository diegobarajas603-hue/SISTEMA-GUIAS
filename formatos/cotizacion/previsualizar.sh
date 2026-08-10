#!/bin/bash
# Genera el .docx y una imagen JPG por hoja para revisar el resultado.
set -e
cd "$(dirname "$0")"
DOC=COTIZACION_FLETES_TAURO_2026.docx
rm -f "$DOC" *.pdf pagina-*.jpg
node cotizacion.js
rm -rf /tmp/loperfil
HOME=/tmp soffice --headless --norestore -env:UserInstallation=file:///tmp/loperfil \
  --convert-to pdf --outdir "$PWD" "$PWD/$DOC" >/dev/null 2>&1
pdftoppm -jpeg -r 110 "${DOC%.docx}.pdf" pagina
echo "paginas: $(ls pagina-*.jpg | wc -l)"
