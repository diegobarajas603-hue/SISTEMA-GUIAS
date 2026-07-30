import { useEffect, useState } from 'react';
import { KeyRound, Copy, Check } from 'lucide-react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, Selector } from '@/componentes/ui/Campo';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { ErrorAPI } from '@/lib/api';
import { ROL_TEXTO } from '@/lib/constantes';
import {
  usarCrearUsuario, usarActualizarUsuario, usarRestablecerPassword, usarEquipos,
} from '@/lib/consultas/auth';
import type { Usuario } from '@/lib/tipos';

const ROLES = ['ejecutivo', 'gerente', 'marketing', 'soporte', 'admin'];
const ZONAS = ['MTY', 'CDMX', 'AMBAS'];

/** Contraseña inicial legible: se la dicta el administrador y se cambia al entrar. */
function generarClave() {
  const silabas = ['ta', 'ro', 'mi', 'sa', 'lu', 'ka', 'ne', 'po', 'vi', 'da'];
  const palabra = Array.from({ length: 3 }, () => silabas[Math.floor(Math.random() * silabas.length)]).join('');
  return palabra.charAt(0).toUpperCase() + palabra.slice(1) + Math.floor(1000 + Math.random() * 9000);
}

const VACIO = {
  email: '', nombre: '', puesto: '', telefono: '',
  rol: 'ejecutivo', zona: '', equipo_id: '', meta_mensual: '',
};

interface Props {
  abierto: boolean;
  usuario: Usuario | null;
  onCerrar: () => void;
}

export function ModalUsuario({ abierto, usuario, onCerrar }: Props) {
  const esNuevo = !usuario;
  const [form, setForm] = useState(VACIO);
  const [clave, setClave] = useState('');
  const [copiada, setCopiada] = useState(false);

  const { data: equipos } = usarEquipos();
  const crear = usarCrearUsuario();
  const actualizar = usarActualizarUsuario();
  const restablecer = usarRestablecerPassword();
  const { avisar } = useAvisos();

  useEffect(() => {
    if (!abierto) return;
    setCopiada(false);
    if (usuario) {
      setForm({
        email: usuario.email,
        nombre: usuario.nombre,
        puesto: usuario.puesto ?? '',
        telefono: usuario.telefono ?? '',
        rol: usuario.rol,
        zona: usuario.zona ?? '',
        equipo_id: usuario.equipo_id ? String(usuario.equipo_id) : '',
        meta_mensual: usuario.meta_mensual ? String(Math.round(usuario.meta_mensual / 100)) : '',
      });
      setClave('');
    } else {
      setForm(VACIO);
      setClave(generarClave());
    }
  }, [abierto, usuario]);

  const puso = (k: keyof typeof VACIO) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const listo = form.email.trim() && form.nombre.trim() && (esNuevo ? clave.length >= 8 : true);

  const comunes = {
    nombre: form.nombre.trim(),
    puesto: form.puesto.trim() || undefined,
    telefono: form.telefono.trim() || undefined,
    rol: form.rol,
    zona: form.zona || undefined,
    equipo_id: form.equipo_id ? Number(form.equipo_id) : null,
    meta_mensual: form.meta_mensual ? Math.round(Number(form.meta_mensual) * 100) : 0,
  };

  function guardar() {
    if (!listo) return;
    const alFallar = (e: unknown) => avisar({
      tipo: 'error', titulo: 'No se pudo guardar',
      cuerpo: e instanceof ErrorAPI ? e.message : 'Inténtalo de nuevo.',
    });

    if (esNuevo) {
      crear.mutate({ ...comunes, email: form.email.trim(), password: clave }, {
        onSuccess: (u) => {
          avisar({
            tipo: 'exito', titulo: `${u.nombre} ya puede entrar`,
            cuerpo: `Pásale la contraseña ${clave}; podrá cambiarla desde Ajustes.`,
          });
          onCerrar();
        },
        onError: alFallar,
      });
    } else {
      actualizar.mutate({ id: usuario!.id, datos: comunes }, {
        onSuccess: () => { avisar({ tipo: 'exito', titulo: 'Cambios guardados' }); onCerrar(); },
        onError: alFallar,
      });
    }
  }

  function nuevaClave() {
    const nueva = generarClave();
    restablecer.mutate({ id: usuario!.id, password: nueva }, {
      onSuccess: () => {
        setClave(nueva);
        setCopiada(false);
        avisar({
          tipo: 'exito', titulo: 'Contraseña restablecida',
          cuerpo: `La nueva es ${nueva}. Se cerraron sus sesiones abiertas.`,
        });
      },
      onError: () => avisar({ tipo: 'error', titulo: 'No se pudo restablecer' }),
    });
  }

  return (
    <Modal
      abierto={abierto} onCerrar={onCerrar} ancho="md"
      titulo={esNuevo ? 'Nueva persona' : `Editar a ${usuario?.nombre}`}
      pie={<>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!listo} cargando={crear.isPending || actualizar.isPending} onClick={guardar}>
          {esNuevo ? 'Dar de alta' : 'Guardar'}
        </Boton>
      </>}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre completo" requerido value={form.nombre} onChange={puso('nombre')} />
          <Campo
            etiqueta="Correo" type="email" requerido value={form.email} onChange={puso('email')}
            disabled={!esNuevo}
            ayuda={esNuevo ? undefined : 'El correo identifica la cuenta y no se cambia.'}
          />
        </div>

        {esNuevo && (
          <div className="rounded-lg border border-marca-200 bg-marca-50 p-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-marca-700">
              <KeyRound className="size-3.5" /> Contraseña inicial
            </p>
            <p className="mt-1 text-2xs leading-relaxed text-texto-secundario">
              Pásasela por un medio seguro. Podrá cambiarla desde Ajustes cuando entre.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded-md border border-borde bg-superficie px-2.5 py-1.5 font-mono text-sm text-texto">
                {clave}
              </code>
              <Boton
                tamano="sm" variante="secundario"
                iconoIzq={copiada ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                onClick={() => { navigator.clipboard?.writeText(clave); setCopiada(true); }}
              >
                {copiada ? 'Copiada' : 'Copiar'}
              </Boton>
              <Boton tamano="sm" variante="fantasma" onClick={() => { setClave(generarClave()); setCopiada(false); }}>
                Otra
              </Boton>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Selector etiqueta="Rol" value={form.rol} onChange={puso('rol')}
            ayuda={form.rol === 'admin' ? 'Acceso total, incluida la administración del sistema.'
              : form.rol === 'gerente' ? 'Ve todo el equipo y puede importar y administrar.'
                : undefined}>
            {ROLES.map((r) => <option key={r} value={r}>{ROL_TEXTO[r] ?? r}</option>)}
          </Selector>
          <Campo etiqueta="Puesto" placeholder="Ejecutivo Comercial" value={form.puesto} onChange={puso('puesto')} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Teléfono" value={form.telefono} onChange={puso('telefono')} />
          <Selector etiqueta="Zona" value={form.zona} onChange={puso('zona')}>
            <option value="">Sin zona</option>
            {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
          </Selector>
          <Selector etiqueta="Equipo" value={form.equipo_id} onChange={puso('equipo_id')}>
            <option value="">Sin equipo</option>
            {equipos?.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </Selector>
        </div>

        <Campo
          etiqueta="Meta mensual (pesos)" type="number" inputMode="numeric"
          placeholder="450000" value={form.meta_mensual} onChange={puso('meta_mensual')}
          ayuda="Se usa en el ranking y en el pronóstico. Déjalo vacío si no aplica."
        />

        {!esNuevo && (
          <div className="space-y-3 border-t border-borde pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-texto">Cuenta activa</p>
                <p className="text-2xs text-texto-tenue">
                  Al desactivarla se cierran sus sesiones y deja de poder entrar. Su historial se conserva.
                </p>
              </div>
              <Interruptor
                activo={usuario?.activo !== false} etiqueta="Cuenta activa"
                onCambiar={(v) => actualizar.mutate({ id: usuario!.id, datos: { activo: v } }, {
                  onSuccess: () => avisar({ tipo: 'exito', titulo: v ? 'Cuenta activada' : 'Cuenta desactivada' }),
                  onError: (e) => avisar({
                    tipo: 'error', titulo: 'No se pudo cambiar',
                    cuerpo: e instanceof ErrorAPI ? e.message : undefined,
                  }),
                })}
              />
            </div>

            <Boton
              variante="secundario" tamano="sm" cargando={restablecer.isPending}
              iconoIzq={<KeyRound className="size-3.5" />} onClick={nuevaClave}
            >
              Restablecer contraseña
            </Boton>
            {clave && (
              <p className="text-2xs text-texto-secundario">
                Nueva contraseña: <code className="font-mono text-texto">{clave}</code>
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
