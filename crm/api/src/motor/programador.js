/**
 * Programador interno: reanuda esperas y dispara los flujos con horario
 * (`cron.diario`, `cron.semanal`). Un `setInterval` en el proceso de la API es
 * suficiente para una instancia; con varias réplicas habría que mover esto a un
 * único worker o usar un bloqueo por advisory lock de Postgres.
 *
 * El estado vive en la base (`ultimo_run_en`, `reanudar_en`), no en memoria: si el
 * proceso se reinicia, nada se ejecuta dos veces ni se pierde.
 */

import { consultar, pool } from '../db/pool.js';
import { ejecutar, reanudarEsperas } from './ejecutor.js';
import { recalcularIA } from '../servicios/ia-tareas.js';

const CADA_MS = 60_000;

async function tick() {
  try {
    await reanudarEsperas();
  } catch (error) {
    console.error('[programador] esperas:', error.message);
  }

  try {
    await dispararProgramados();
  } catch (error) {
    console.error('[programador] flujos programados:', error.message);
  }
}

async function dispararProgramados() {
  const ahora = new Date();
  const hora = ahora.getHours();
  const diaSemana = ahora.getDay();

  const flujos = await consultar(
    `SELECT * FROM automatizaciones
      WHERE activa AND evento IN ('cron.diario','cron.semanal')
        AND (ultimo_run_en IS NULL OR ultimo_run_en < now() - interval '20 hours')`,
  );

  for (const flujo of flujos) {
    const disparador = (flujo.nodos ?? []).find((n) => n.tipo === 'disparador');
    const cfg = disparador?.config ?? {};
    const horaObjetivo = Number(cfg.hora ?? 8);

    if (hora < horaObjetivo) continue;
    if (flujo.evento === 'cron.semanal') {
      const diaObjetivo = Number(cfg.dia ?? 1);
      if (diaSemana !== diaObjetivo) continue;
      const ultimo = flujo.ultimo_run_en ? new Date(flujo.ultimo_run_en) : null;
      if (ultimo && Date.now() - ultimo.getTime() < 6 * 86_400_000) continue;
    }

    console.log(`[programador] ejecutando «${flujo.nombre}»`);
    await ejecutar(flujo, {});
  }
}

/**
 * Recálculo de métricas de IA una vez al día: la recencia hace que el riesgo de
 * fuga y el estancamiento cambien con el simple paso del tiempo.
 */
async function tickDiarioIA() {
  const { rows } = await pool.query(
    `SELECT max(creado_en) AS ultimo FROM ia_insights WHERE tipo IN ('churn','estancada')`,
  );
  const ultimo = rows[0]?.ultimo ? new Date(rows[0].ultimo) : null;
  if (ultimo && Date.now() - ultimo.getTime() < 20 * 3_600_000) return;
  console.log('[programador] recalculando métricas de IA…');
  await recalcularIA().catch((e) => console.error('[programador] IA:', e.message));
}

export function iniciarProgramador() {
  const temporizador = setInterval(() => {
    tick();
    tickDiarioIA().catch(() => {});
  }, CADA_MS);
  temporizador.unref();
  // Primera pasada al arrancar, con margen para que la base esté lista.
  setTimeout(() => tick(), 5_000).unref();
  console.log('[programador] activo · revisión cada 60 s');
  return () => clearInterval(temporizador);
}

export default { iniciarProgramador };
