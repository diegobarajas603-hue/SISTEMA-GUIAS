import { useState } from 'react';
import { Search, Building2, Check, X, MapPin, Phone, Mail, Hash } from 'lucide-react';
import { usarCuentas } from '@/lib/consultas/cuentas';
import { Campo } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';
import { Insignia } from '@/componentes/ui/Insignia';
import { useDespacio } from '@/lib/hooks';
import { cx } from '@/lib/utilidades';
import type { Cuenta } from '@/lib/tipos';

/**
 * Paso 1: elegir al cliente de la cartera existente.
 *
 * No hay formulario de alta a propósito. Los datos fiscales y de contacto ya
 * están capturados en la ficha; volver a pedirlos aquí es trabajo doble y la vía
 * más rápida a que la cotización lleve una dirección distinta de la de la
 * factura.
 */
export function SelectorCliente({ cuenta, onElegir }: {
  cuenta: Cuenta | null;
  onElegir: (c: Cuenta | null) => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const termino = useDespacio(busqueda, 250);
  const { data, isFetching } = usarCuentas({ q: termino || undefined, limite: 8 });

  if (cuenta) {
    return (
      <div className="rounded-xl border border-marca-500 bg-marca-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-marca-500 text-white">
            <Check className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-texto">{cuenta.nombre}</p>
            {cuenta.nombre_comercial && cuenta.nombre_comercial !== cuenta.nombre && (
              <p className="truncate text-xs text-texto-secundario">{cuenta.nombre_comercial}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-texto-secundario">
              {cuenta.rfc && <Dato icono={Hash}>{cuenta.rfc}</Dato>}
              {cuenta.telefono && <Dato icono={Phone}>{cuenta.telefono}</Dato>}
              {cuenta.email && <Dato icono={Mail}>{cuenta.email}</Dato>}
              {(cuenta.ciudad || cuenta.estado) && (
                <Dato icono={MapPin}>{[cuenta.ciudad, cuenta.estado].filter(Boolean).join(', ')}</Dato>
              )}
            </div>
            <p className="mt-2 text-2xs text-texto-tenue">
              Estos datos se toman de su ficha y saldrán tal cual en el PDF.
            </p>
          </div>
          <Boton tamano="sm" variante="fantasma" iconoIzq={<X className="size-3.5" />} onClick={() => onElegir(null)}>
            Cambiar
          </Boton>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-borde bg-superficie p-4">
      <Campo
        autoFocus
        iconoIzq={<Search className="size-3.5" />}
        placeholder="Busca por nombre, razón social o RFC…"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        aria-label="Buscar cliente"
      />

      <div className="mt-3 space-y-1">
        {isFetching && !data ? (
          <p className="py-6 text-center text-xs text-texto-tenue">Buscando…</p>
        ) : !data?.filas.length ? (
          <p className="py-6 text-center text-xs text-texto-tenue">
            {termino ? `Sin resultados para «${termino}».` : 'Escribe para buscar en tu cartera.'}
          </p>
        ) : (
          data.filas.map((c) => (
            <button
              key={c.id}
              onClick={() => onElegir(c)}
              className={cx(
                'flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left',
                'transition-colors hover:border-borde hover:bg-superficie-2',
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-superficie-2 text-texto-secundario">
                <Building2 className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-texto">{c.nombre}</span>
                <span className="block truncate text-2xs text-texto-tenue">
                  {[c.rfc, c.ciudad, c.estado].filter(Boolean).join(' · ') || 'Sin datos fiscales capturados'}
                </span>
              </span>
              {c.tipo !== 'cliente' && <Insignia>{c.tipo}</Insignia>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Dato({ icono: Icono, children }: { icono: typeof Hash; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <Icono className="size-3 shrink-0 text-texto-tenue" />
      {children}
    </span>
  );
}
