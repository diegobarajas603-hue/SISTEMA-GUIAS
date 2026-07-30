import { useState } from 'react';
import { Sun, Moon, Monitor, KeyRound, Users, Sparkles, Check, LogOut } from 'lucide-react';
import { useSesion } from '@/estado/sesion';
import { useTema } from '@/estado/tema';
import { usarUsuarios, usarEquipos, usarCambiarPassword, usarGuardarPreferencias } from '@/lib/consultas/auth';
import { usarEstadoIA, usarRecalcularIA } from '@/lib/consultas/ia';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { Boton } from '@/componentes/ui/Boton';
import { Campo } from '@/componentes/ui/Campo';
import { Avatar } from '@/componentes/ui/Avatar';
import { Insignia, InsigniaIA } from '@/componentes/ui/Insignia';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { Pestanas } from '@/componentes/ui/Pestanas';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { ErrorAPI } from '@/lib/api';
import { dinero, fechaHora, numero } from '@/lib/formato';
import { ROL_TEXTO } from '@/lib/constantes';
import { cx } from '@/lib/utilidades';

const TEMAS = [
  { valor: 'claro' as const, titulo: 'Claro', icono: Sun },
  { valor: 'oscuro' as const, titulo: 'Oscuro', icono: Moon },
  { valor: 'sistema' as const, titulo: 'Sistema', icono: Monitor },
];

export default function PaginaAjustes() {
  const [pestana, setPestana] = useState('perfil');

  return (
    <div className="space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-texto">Ajustes</h1>
        <p className="text-sm text-texto-tenue">Tu cuenta, la apariencia de Aura y el estado del motor de inteligencia</p>
      </div>

      <Pestanas
        activa={pestana} onCambiar={setPestana}
        items={[
          { valor: 'perfil', etiqueta: 'Perfil' },
          { valor: 'apariencia', etiqueta: 'Apariencia' },
          { valor: 'equipo', etiqueta: 'Equipo' },
          { valor: 'inteligencia', etiqueta: 'Inteligencia' },
        ]}
      />

      {pestana === 'perfil' && <SeccionPerfil />}
      {pestana === 'apariencia' && <SeccionApariencia />}
      {pestana === 'equipo' && <SeccionEquipo />}
      {pestana === 'inteligencia' && <SeccionInteligencia />}
    </div>
  );
}

function SeccionPerfil() {
  const { usuario, cerrarSesion } = useSesion();
  const cambiar = usarCambiarPassword();
  const { avisar } = useAvisos();
  const [form, setForm] = useState({ actual: '', nueva: '', repetir: '' });

  const desajuste = form.nueva.length > 0 && form.repetir.length > 0 && form.nueva !== form.repetir;
  const listo = form.actual.length > 0 && form.nueva.length >= 8 && !desajuste;

  if (!usuario) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel>
        <EncabezadoPanel titulo="Tu cuenta" />
        <CuerpoPanel>
          <div className="flex items-center gap-3">
            <Avatar nombre={usuario.nombre} tono={usuario.avatar_tono} tamano="lg" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-texto">{usuario.nombre}</p>
              <p className="truncate text-sm text-texto-tenue">{usuario.email}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Insignia color="marca">{ROL_TEXTO[usuario.rol] ?? usuario.rol}</Insignia>
                {usuario.zona && <Insignia>{usuario.zona}</Insignia>}
              </div>
            </div>
          </div>

          <dl className="mt-4 space-y-2 border-t border-borde pt-4 text-sm">
            <Dato termino="Puesto" valor={usuario.puesto ?? '—'} />
            <Dato termino="Teléfono" valor={usuario.telefono ?? '—'} />
            <Dato termino="Meta mensual" valor={usuario.meta_mensual ? dinero(usuario.meta_mensual) : '—'} />
            <Dato termino="Último acceso" valor={fechaHora(usuario.ultimo_acceso)} />
          </dl>

          <Boton variante="secundario" tamano="sm" className="mt-4" iconoIzq={<LogOut className="size-3.5" />}
            onClick={() => cerrarSesion()}>
            Cerrar sesión
          </Boton>
        </CuerpoPanel>
      </Panel>

      <Panel>
        <EncabezadoPanel titulo="Contraseña" subtitulo="Al cambiarla se cierran todas tus sesiones" />
        <CuerpoPanel>
          <div className="space-y-3">
            <Campo etiqueta="Contraseña actual" type="password" autoComplete="current-password"
              value={form.actual} onChange={(e) => setForm((f) => ({ ...f, actual: e.target.value }))} />
            <Campo etiqueta="Nueva contraseña" type="password" autoComplete="new-password"
              ayuda="Mínimo 8 caracteres."
              value={form.nueva} onChange={(e) => setForm((f) => ({ ...f, nueva: e.target.value }))} />
            <Campo etiqueta="Repite la nueva" type="password" autoComplete="new-password"
              error={desajuste ? 'Las contraseñas no coinciden.' : undefined}
              value={form.repetir} onChange={(e) => setForm((f) => ({ ...f, repetir: e.target.value }))} />
            <Boton variante="primario" iconoIzq={<KeyRound className="size-4" />} disabled={!listo} cargando={cambiar.isPending}
              onClick={() => cambiar.mutate({ actual: form.actual, nueva: form.nueva }, {
                onSuccess: () => {
                  avisar({ tipo: 'exito', titulo: 'Contraseña actualizada', cuerpo: 'Vuelve a iniciar sesión.' });
                  setForm({ actual: '', nueva: '', repetir: '' });
                },
                onError: (e) => avisar({
                  tipo: 'error', titulo: 'No se pudo cambiar',
                  cuerpo: e instanceof ErrorAPI ? e.message : 'Intenta de nuevo.',
                }),
              })}>
              Cambiar contraseña
            </Boton>
          </div>
        </CuerpoPanel>
      </Panel>
    </div>
  );
}

function SeccionApariencia() {
  const { tema, setTema, efectivo } = useTema();
  const guardar = usarGuardarPreferencias();
  const { usuario } = useSesion();
  const prefs = (usuario?.preferencias ?? {}) as Record<string, unknown>;
  const [densidad, setDensidad] = useState(Boolean(prefs.densidadCompacta));
  const [animaciones, setAnimaciones] = useState(prefs.animaciones !== false);

  function persistir(parche: Record<string, unknown>) {
    guardar.mutate(parche);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel>
        <EncabezadoPanel titulo="Tema" subtitulo={`Ahora mismo se ve en modo ${efectivo}`} />
        <CuerpoPanel>
          <div className="grid grid-cols-3 gap-2">
            {TEMAS.map((t) => (
              <button key={t.valor} onClick={() => { setTema(t.valor); persistir({ tema: t.valor }); }}
                className={cx(
                  'flex flex-col items-center gap-2 rounded-lg border p-3 transition-all duration-150',
                  tema === t.valor ? 'border-marca-500 bg-marca-50 text-marca-700 shadow-2' : 'border-borde text-texto-secundario hover:border-borde-fuerte',
                )}>
                <t.icono className="size-5" />
                <span className="text-xs font-medium">{t.titulo}</span>
                {tema === t.valor && <Check className="size-3" />}
              </button>
            ))}
          </div>
        </CuerpoPanel>
      </Panel>

      <Panel>
        <EncabezadoPanel titulo="Interfaz" />
        <CuerpoPanel>
          <div className="space-y-3">
            <FilaPreferencia
              titulo="Densidad compacta"
              detalle="Tablas y listas con menos aire, para pantallas pequeñas."
              activo={densidad}
              onCambiar={(v) => { setDensidad(v); persistir({ densidadCompacta: v }); }}
            />
            <FilaPreferencia
              titulo="Animaciones"
              detalle="Transiciones y entradas animadas. Desactívalas si prefieres una interfaz sin movimiento."
              activo={animaciones}
              onCambiar={(v) => { setAnimaciones(v); persistir({ animaciones: v }); }}
            />
          </div>
          <p className="mt-4 rounded-lg bg-superficie-2 p-2.5 text-2xs leading-relaxed text-texto-tenue">
            Aura también respeta <code>prefers-reduced-motion</code> del sistema: si lo tienes activado,
            las animaciones se acortan aunque aquí estén encendidas.
          </p>
        </CuerpoPanel>
      </Panel>
    </div>
  );
}

function SeccionEquipo() {
  const { data: usuarios } = usarUsuarios();
  const { data: equipos } = usarEquipos();

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel>
        <EncabezadoPanel titulo="Personas" subtitulo={`${numero(usuarios?.length ?? 0)} usuarios`} />
        <CuerpoPanel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-2xs uppercase text-texto-tenue">
                  <th className="py-2 text-left">Persona</th>
                  <th className="py-2 text-left">Rol</th>
                  <th className="py-2 text-left">Zona</th>
                  <th className="py-2 text-right">Abiertas</th>
                  <th className="py-2 text-right">Meta</th>
                </tr>
              </thead>
              <tbody>
                {usuarios?.map((u) => (
                  <tr key={u.id} className={cx('border-b border-borde last:border-0', !u.activo && 'opacity-50')}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar nombre={u.nombre} tono={u.avatar_tono} tamano="xs" />
                        <div className="min-w-0">
                          <p className="truncate text-texto">{u.nombre}</p>
                          <p className="truncate text-2xs text-texto-tenue">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5"><Insignia color={u.rol === 'gerente' ? 'marca' : 'gris'}>{ROL_TEXTO[u.rol] ?? u.rol}</Insignia></td>
                    <td className="py-2.5 text-texto-secundario">{u.zona ?? '—'}</td>
                    <td className="num py-2.5 text-right text-texto-secundario">{numero(u.oportunidades_abiertas ?? 0)}</td>
                    <td className="num py-2.5 text-right">{u.meta_mensual ? dinero(u.meta_mensual) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CuerpoPanel>
      </Panel>

      <Panel className="h-fit">
        <EncabezadoPanel titulo="Equipos" acciones={<Users className="size-4 text-texto-tenue" />} />
        <CuerpoPanel>
          <ul className="space-y-2">
            {equipos?.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded-lg border border-borde px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-texto">{e.nombre}</p>
                  {e.zona && <p className="truncate text-2xs text-texto-tenue">{e.zona}</p>}
                </div>
                <span className="num shrink-0 text-xs text-texto-secundario">{e.miembros}</span>
              </li>
            ))}
          </ul>
        </CuerpoPanel>
      </Panel>
    </div>
  );
}

function SeccionInteligencia() {
  const { data: estado } = usarEstadoIA();
  const recalcular = usarRecalcularIA();
  const { avisar } = useAvisos();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel>
        <EncabezadoPanel titulo="Motor de inteligencia"
          acciones={estado?.generativa ? <InsigniaIA>Generativa activa</InsigniaIA> : <Insignia>Solo determinista</Insignia>} />
        <CuerpoPanel>
          <dl className="space-y-2 text-sm">
            <Dato termino="Motor determinista" valor={estado?.motor_determinista ? 'Operando' : 'Detenido'} />
            <Dato termino="Redacción generativa" valor={estado?.generativa ? (estado.modelo ?? 'Activa') : 'No configurada'} />
          </dl>
          <p className="mt-3 rounded-lg bg-superficie-2 p-2.5 text-2xs leading-relaxed text-texto-secundario">
            {estado?.nota ?? 'Los scores, pronósticos y probabilidades salen siempre del motor determinista sobre tus datos. El modelo generativo solo redacta el texto que los acompaña.'}
          </p>
        </CuerpoPanel>
      </Panel>

      <Panel>
        <EncabezadoPanel titulo="Recalcular" subtitulo="Vuelve a puntuar oportunidades, cuentas e insights" />
        <CuerpoPanel>
          <p className="text-sm text-texto-secundario">
            El recálculo corre solo cada noche. Fuérzalo si acabas de cargar datos y quieres ver los
            resultados actualizados de inmediato.
          </p>
          <Boton variante="ia" className="mt-3" cargando={recalcular.isPending} iconoIzq={<Sparkles className="size-4" />}
            onClick={() => recalcular.mutate(undefined, {
              onSuccess: (r) => avisar({
                tipo: 'exito', titulo: 'Inteligencia recalculada',
                cuerpo: `${r.oportunidades} oportunidades, ${r.cuentas} cuentas y ${r.insights} insights en ${r.ms} ms.`,
              }),
            })}>
            Recalcular ahora
          </Boton>
          {recalcular.data && (
            <p className="mt-2 text-2xs text-texto-tenue">
              Última corrida: {numero(recalcular.data.oportunidades)} oportunidades · {numero(recalcular.data.cuentas)} cuentas · {recalcular.data.ms} ms
            </p>
          )}
        </CuerpoPanel>
      </Panel>
    </div>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-texto-tenue">{termino}</dt>
      <dd className="truncate text-texto">{valor}</dd>
    </div>
  );
}

function FilaPreferencia({ titulo, detalle, activo, onCambiar }: {
  titulo: string; detalle: string; activo: boolean; onCambiar: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-texto">{titulo}</p>
        <p className="text-2xs leading-relaxed text-texto-tenue">{detalle}</p>
      </div>
      <Interruptor activo={activo} onCambiar={onCambiar} etiqueta={titulo} />
    </div>
  );
}
