import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import * as Iconos from 'lucide-react';
import { NAV_PRINCIPAL } from '@/lib/constantes';
import { useSesion } from '@/estado/sesion';
import { Avatar } from '@/componentes/ui/Avatar';
import { cx } from '@/lib/utilidades';

type NombreIcono = keyof typeof Iconos;

function Icono({ nombre, className }: { nombre: string; className?: string }) {
  const Componente = Iconos[(nombre.replace(/(^\w|-\w)/g, (m) => m.replace('-', '').toUpperCase())) as NombreIcono] as Iconos.LucideIcon | undefined;
  if (!Componente) return null;
  return <Componente className={className} />;
}

export function BarraLateral({ colapsada, contadores }: { colapsada: boolean; contadores?: Record<string, number> }) {
  const { usuario } = useSesion();

  const badgePara = (ruta: string): number | undefined => {
    if (!contadores) return undefined;
    if (ruta === '/prospectos') return contadores.prospectosNuevos || undefined;
    if (ruta === '/soporte') return contadores.ticketsSlaVencido || undefined;
    if (ruta === '/agenda') return contadores.actividadesVencidas || undefined;
    return undefined;
  };

  return (
    <aside className={cx(
      'flex h-full shrink-0 flex-col border-r border-borde bg-superficie transition-[width] duration-300 ease-[var(--ease-panel)]',
      colapsada ? 'w-[68px]' : 'w-[236px]',
    )}>
      <div className="flex h-14 shrink-0 items-center gap-2.5 px-4">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg gradiente-ia text-white">
          <Iconos.Sparkles className="size-4" />
        </div>
        {!colapsada && <span className="text-[15px] font-bold tracking-tight text-texto">Aura</span>}
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2.5 py-2">
        {NAV_PRINCIPAL.map((grupo) => (
          <div key={grupo.grupo}>
            {!colapsada && <p className="mb-1 px-2.5 text-2xs font-semibold uppercase tracking-wider text-texto-tenue">{grupo.grupo}</p>}
            <div className="space-y-0.5">
              {grupo.items.map((item) => {
                const badge = badgePara(item.ruta);
                return (
                  <NavLink key={item.ruta} to={item.ruta} end={item.ruta === '/'}>
                    {({ isActive }) => (
                      <div className={cx(
                        'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors duration-150',
                        isActive ? 'text-marca-700' : 'text-texto-secundario hover:bg-superficie-2 hover:text-texto',
                      )}>
                        {isActive && (
                          <motion.div layoutId="indicador-nav" className="absolute inset-0 rounded-lg bg-marca-50"
                            transition={{ type: 'spring', stiffness: 500, damping: 40 }} />
                        )}
                        <Icono nombre={item.icono} className="relative z-10 size-[18px] shrink-0" />
                        {!colapsada && <span className="relative z-10 truncate">{item.etiqueta}</span>}
                        {!colapsada && badge !== undefined && (
                          <span className="relative z-10 ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-pildora bg-peligro-500 px-1 text-[10px] font-bold text-white">
                            {badge}
                          </span>
                        )}
                      </div>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {usuario && (
        <div className="shrink-0 border-t border-borde p-2.5">
          <NavLink to="/ajustes" className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-superficie-2">
            <Avatar nombre={usuario.nombre} tono={usuario.avatar_tono} tamano="sm" />
            {!colapsada && (
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-texto">{usuario.nombre}</p>
                <p className="truncate text-2xs text-texto-tenue capitalize">{usuario.rol}</p>
              </div>
            )}
          </NavLink>
        </div>
      )}
    </aside>
  );
}
