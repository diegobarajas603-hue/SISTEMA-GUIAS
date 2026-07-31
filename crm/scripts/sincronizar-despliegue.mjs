/**
 * Copia el CRM al repositorio de despliegue (tauro-crm), que Railway construye
 * desde la raíz.
 *
 * Es un espejo, no una copia: lo que aquí se borró también se borra allá. Copiar
 * sin borrar deja archivos huérfanos en el destino, y como el build corre
 * «tsc -b» sobre todo src/, un componente que aquí ya no existe pero allá
 * sobrevive rompe la compilación. Railway entonces conserva el despliegue
 * anterior y la aplicación se queda congelada en una versión vieja sin que nada
 * lo advierta. Ya pasó una vez.
 *
 *   node scripts/sincronizar-despliegue.mjs [destino]
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origen = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destino = resolve(process.argv[2] ?? '/workspace/tauro-crm');

if (!existsSync(join(destino, '.git'))) {
  console.error(`No parece un repositorio: ${destino}`);
  process.exit(1);
}

// El README del destino está redactado para una instalación en la raíz, no
// dentro de un monorepo; se conserva el suyo.
const OMITIR = new Set(['.git', 'node_modules', 'dist', 'tomas', 'README.md']);

/** Rutas relativas de todos los archivos de un árbol, sin lo omitido. */
function archivos(raiz, base = '', acumulado = new Set()) {
  for (const entrada of readdirSync(join(raiz, base), { withFileTypes: true })) {
    if (OMITIR.has(entrada.name)) continue;
    const rel = base ? join(base, entrada.name) : entrada.name;
    if (entrada.isDirectory()) archivos(raiz, rel, acumulado);
    else acumulado.add(rel);
  }
  return acumulado;
}

const deOrigen = archivos(origen);
let copiados = 0;
for (const rel of deOrigen) {
  const desde = join(origen, rel);
  const hacia = join(destino, rel);
  if (existsSync(hacia) && statSync(hacia).mtimeMs >= statSync(desde).mtimeMs
      && statSync(hacia).size === statSync(desde).size) continue;
  mkdirSync(dirname(hacia), { recursive: true });
  copyFileSync(desde, hacia);
  copiados += 1;
}

let borrados = 0;
for (const rel of archivos(destino)) {
  if (deOrigen.has(rel)) continue;
  rmSync(join(destino, rel));
  borrados += 1;
  console.log(`borrado  ${rel}`);
}

console.log(`\n${copiados} copiados · ${borrados} borrados`);
const cambios = execFileSync('git', ['status', '--short'], { cwd: destino, encoding: 'utf8' });
console.log(cambios.trim() ? `\nCambios en ${destino}:\n${cambios}` : `\n${destino} ya estaba al día.`);
