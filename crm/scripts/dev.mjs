#!/usr/bin/env node
/**
 * Levanta la API y el frontend juntos en desarrollo, con salida entrelazada y
 * prefijo por proceso. Evita depender de una herramienta externa (concurrently)
 * para algo tan simple.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COLOR = { api: '\x1b[36m', web: '\x1b[35m', reset: '\x1b[0m' };

function lanzar(nombre, cmd, args, cwd) {
  const proc = spawn(cmd, args, { cwd, shell: process.platform === 'win32' });
  const prefijo = `${COLOR[nombre]}[${nombre}]${COLOR.reset}`;

  const emitir = (buf, flujo) => {
    for (const linea of buf.toString().split('\n')) {
      if (linea.trim()) flujo.write(`${prefijo} ${linea}\n`);
    }
  };
  proc.stdout.on('data', (b) => emitir(b, process.stdout));
  proc.stderr.on('data', (b) => emitir(b, process.stderr));
  proc.on('exit', (codigo) => {
    console.log(`${prefijo} salió con código ${codigo}`);
    if (codigo && codigo !== 0) apagarTodo(codigo);
  });
  return proc;
}

const procesos = [
  lanzar('api', 'npm', ['run', 'dev'], resolve(raiz, 'api')),
  lanzar('web', 'npm', ['run', 'dev'], resolve(raiz, 'web')),
];

function apagarTodo(codigo = 0) {
  for (const p of procesos) p.kill('SIGTERM');
  process.exit(codigo);
}

process.on('SIGINT', () => apagarTodo(0));
process.on('SIGTERM', () => apagarTodo(0));
