import { useEffect, useState } from 'react';
import { Search, Bell, Sparkles, Sun, Moon, Monitor, LogOut, Settings, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useTema } from '@/estado/tema';
import { useSesion } from '@/estado/sesion';
import { usarNotificaciones } from '@/lib/consultas/dashboard';
import { relativo } from '@/lib/formato';
import { Avatar } from '@/componentes/ui/Avatar';
import { BotonIcono } from '@/componentes/ui/Boton';
import { Menu } from '@/componentes/ui/Menu';
import { cx } from '@/lib/utilidades';
import { useNavigate } from 'react-router-dom';

export function BarraSuperior({
  titulo, acciones, onAbrirPaleta, onAbrirCopiloto, colapsada, onColapsar,
}: {
  titulo: string; acciones?: React.ReactNode; onAbrirPaleta: () => void; onAbrirCopiloto: () => void;
  colapsada: boolean; onColapsar: () => void;
}) {
  const [conScroll, setConScroll] = useState(false);
  useEffect(() => {
    const el = document.getElementById('contenido-scroll');
    if (!el) return;
    const onScroll = () => setConScroll(el.scrollTop > 4);
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={cx(
      'vidrio sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4 transition-shadow duration-200',
      conScroll ? 'shadow-2' : 'border-b-transparent',
    )}>
      <BotonIcono etiqueta={colapsada ? 'Expandir menú' : 'Colapsar menú'} onClick={onColapsar} tamano="sm">
        {colapsada ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
      </BotonIcono>

      <h1 className="truncate text-[15px] font-semibold text-texto">{titulo}</h1>

      <div className="ml-2 flex-1">
        <button
          onClick={onAbrirPaleta}
          className="flex h-8 w-full max-w-72 items-center gap-2 rounded-lg border border-borde bg-superficie-2 px-2.5 text-xs text-texto-tenue transition-colors hover:border-borde-fuerte"
        >
          <Search className="size-3.5" />
          Buscar en Aura…
          <kbd className="ml-auto rounded border border-borde bg-superficie px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
        </button>
      </div>

      <div className="flex items-center gap-1">
        {acciones}
        <BotonIcono etiqueta="Copiloto" onClick={onAbrirCopiloto} className="text-ia-500 hover:bg-ia-50">
          <Sparkles className="size-4" />
        </BotonIcono>
        <BandejaNotificaciones />
        <SelectorTema />
        <MenuUsuario />
      </div>
    </header>
  );
}

function SelectorTema() {
  const { tema, setTema } = useTema();
  const OPCIONES = [
    { valor: 'claro' as const, icono: Sun, etiqueta: 'Claro' },
    { valor: 'oscuro' as const, icono: Moon, etiqueta: 'Oscuro' },
    { valor: 'sistema' as const, icono: Monitor, etiqueta: 'Sistema' },
  ];
  return (
    <Menu
      alinear="der"
      disparador={
        <BotonIcono etiqueta="Cambiar tema" tamano="sm">
          {tema === 'oscuro' ? <Moon className="size-4" /> : tema === 'claro' ? <Sun className="size-4" /> : <Monitor className="size-4" />}
        </BotonIcono>
      }
      items={OPCIONES.map((o) => ({ etiqueta: o.etiqueta, icono: <o.icono className="size-4" />, onClick: () => setTema(o.valor) }))}
    />
  );
}

function BandejaNotificaciones() {
  const { data } = usarNotificaciones();
  const noLeidas = data?.filter((n) => !n.leida).length ?? 0;
  return (
    <Menu
      alinear="der"
      disparador={
        <span className="relative inline-flex">
          <BotonIcono etiqueta="Notificaciones" tamano="sm"><Bell className="size-4" /></BotonIcono>
          {noLeidas > 0 && <span className="absolute right-0.5 top-0.5 size-2 rounded-full bg-peligro-500 ring-2 ring-superficie" />}
        </span>
      }
      items={
        data?.length
          ? data.slice(0, 8).map((n) => ({ etiqueta: `${n.titulo} · ${relativo(n.creado_en)}` }))
          : [{ etiqueta: 'Sin notificaciones', deshabilitado: true }]
      }
    />
  );
}

function MenuUsuario() {
  const { usuario, cerrarSesion } = useSesion();
  const navegar = useNavigate();
  if (!usuario) return null;
  return (
    <Menu
      alinear="der"
      disparador={<span className="ml-1 cursor-pointer"><Avatar nombre={usuario.nombre} tono={usuario.avatar_tono} tamano="sm" /></span>}
      items={[
        { etiqueta: 'Ajustes', icono: <Settings className="size-4" />, onClick: () => navegar('/ajustes') },
        'separador',
        { etiqueta: 'Cerrar sesión', icono: <LogOut className="size-4" />, peligro: true, onClick: () => cerrarSesion() },
      ]}
    />
  );
}
