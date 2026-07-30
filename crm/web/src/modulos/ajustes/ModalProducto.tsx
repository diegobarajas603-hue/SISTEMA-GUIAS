import { useEffect, useState } from 'react';
import { Modal } from '@/componentes/ui/Modal';
import { Boton } from '@/componentes/ui/Boton';
import { Campo, AreaTexto, Selector } from '@/componentes/ui/Campo';
import { Interruptor } from '@/componentes/ui/Interruptor';
import { useAvisos } from '@/componentes/ui/Notificaciones';
import { ErrorAPI } from '@/lib/api';
import { usarCrearProducto, usarActualizarProducto } from '@/lib/consultas/catalogo';
import { dinero } from '@/lib/formato';
import type { Producto } from '@/lib/tipos';

const UNIDADES = ['embarque', 'viaje', 'entrega', 'paquete', 'maniobra', 'operación', 'tarima/mes', 'unidad/mes', 'proyecto', 'servicio'];

const VACIO = {
  sku: '', nombre: '', descripcion: '', categoria: '', unidad: 'servicio',
  precio_base: '', costo_base: '', volumen_mensual: '1', recurrente: false,
};

export function ModalProducto({ abierto, producto, onCerrar }: {
  abierto: boolean; producto: Producto | null; onCerrar: () => void;
}) {
  const esNuevo = !producto;
  const [form, setForm] = useState(VACIO);
  const crear = usarCrearProducto();
  const actualizar = usarActualizarProducto();
  const { avisar } = useAvisos();

  useEffect(() => {
    if (!abierto) return;
    setForm(producto ? {
      sku: producto.sku,
      nombre: producto.nombre,
      descripcion: producto.descripcion ?? '',
      categoria: producto.categoria ?? '',
      unidad: producto.unidad,
      precio_base: String(producto.precio_base / 100),
      costo_base: String(producto.costo_base / 100),
      volumen_mensual: String(producto.volumen_mensual),
      recurrente: producto.recurrente,
    } : VACIO);
  }, [abierto, producto]);

  const puso = (k: keyof typeof VACIO) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const precio = Number(form.precio_base) || 0;
  const costo = Number(form.costo_base) || 0;
  const margen = precio > 0 ? Math.round(((precio - costo) / precio) * 100) : 0;
  const listo = form.nombre.trim() && (esNuevo ? form.sku.trim() : true);

  function guardar() {
    if (!listo) return;
    const datos = {
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim() || undefined,
      categoria: form.categoria.trim() || undefined,
      unidad: form.unidad,
      // El precio se captura en pesos y se guarda en centavos, como todo importe.
      precio_base: Math.round(precio * 100),
      costo_base: Math.round(costo * 100),
      margen_meta: Math.max(0, Math.min(100, margen)),
      volumen_mensual: Math.max(1, Number(form.volumen_mensual) || 1),
      recurrente: form.recurrente,
    };
    const alFallar = (e: unknown) => avisar({
      tipo: 'error', titulo: 'No se pudo guardar',
      cuerpo: e instanceof ErrorAPI ? e.message : 'Inténtalo de nuevo.',
    });

    if (esNuevo) {
      crear.mutate({ ...datos, sku: form.sku.trim().toUpperCase() }, {
        onSuccess: (p) => { avisar({ tipo: 'exito', titulo: `«${p.nombre}» agregado al catálogo` }); onCerrar(); },
        onError: alFallar,
      });
    } else {
      actualizar.mutate({ id: producto!.id, datos }, {
        onSuccess: () => { avisar({ tipo: 'exito', titulo: 'Servicio actualizado' }); onCerrar(); },
        onError: alFallar,
      });
    }
  }

  return (
    <Modal
      abierto={abierto} onCerrar={onCerrar} ancho="md"
      titulo={esNuevo ? 'Nuevo servicio' : `Editar ${producto?.nombre}`}
      pie={<>
        <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        <Boton variante="primario" disabled={!listo} cargando={crear.isPending || actualizar.isPending} onClick={guardar}>
          {esNuevo ? 'Agregar' : 'Guardar'}
        </Boton>
      </>}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          <Campo
            etiqueta="Clave" requerido placeholder="FT-LTL" value={form.sku}
            onChange={puso('sku')} disabled={!esNuevo}
            ayuda={esNuevo ? undefined : 'La clave no se cambia.'}
          />
          <Campo etiqueta="Nombre del servicio" requerido placeholder="Consolidado LTL MTY–CDMX"
            value={form.nombre} onChange={puso('nombre')} />
        </div>

        <AreaTexto etiqueta="Descripción" rows={2} value={form.descripcion} onChange={puso('descripcion')}
          placeholder="Qué incluye, para que aparezca en la cotización." />

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Categoría" placeholder="Transporte terrestre" value={form.categoria} onChange={puso('categoria')} />
          <Selector etiqueta="Unidad de cobro" value={form.unidad} onChange={puso('unidad')}>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </Selector>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Precio por unidad (pesos)" type="number" inputMode="decimal"
            placeholder="980" value={form.precio_base} onChange={puso('precio_base')} />
          <Campo etiqueta="Costo por unidad (pesos)" type="number" inputMode="decimal"
            placeholder="640" value={form.costo_base} onChange={puso('costo_base')} />
        </div>

        {precio > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-superficie-2 px-3 py-2 text-sm">
            <span className="text-texto-tenue">Margen resultante</span>
            <span className="num font-semibold text-texto">
              {margen}% · {dinero(Math.round((precio - costo) * 100))} por {form.unidad}
            </span>
          </div>
        )}

        <Campo
          etiqueta="Volumen mensual típico" type="number" inputMode="numeric"
          value={form.volumen_mensual} onChange={puso('volumen_mensual')}
          ayuda="Cuántas unidades contrata al mes un cliente mediano. La IA lo usa para estimar cuánto vale una venta cruzada."
        />

        <div className="flex items-start justify-between gap-3 border-t border-borde pt-3">
          <div>
            <p className="text-sm font-medium text-texto">Servicio recurrente</p>
            <p className="text-2xs text-texto-tenue">Se cobra cada mes, como el almacenaje o una unidad dedicada.</p>
          </div>
          <Interruptor activo={form.recurrente} etiqueta="Servicio recurrente"
            onCambiar={(v) => setForm((f) => ({ ...f, recurrente: v }))} />
        </div>

        {!esNuevo && (
          <div className="flex items-start justify-between gap-3 border-t border-borde pt-3">
            <div>
              <p className="text-sm font-medium text-texto">Disponible para cotizar</p>
              <p className="text-2xs text-texto-tenue">Al desactivarlo deja de aparecer en cotizaciones nuevas.</p>
            </div>
            <Interruptor
              activo={producto?.activo !== false} etiqueta="Disponible"
              onCambiar={(v) => actualizar.mutate({ id: producto!.id, datos: { activo: v } }, {
                onSuccess: () => avisar({ tipo: 'exito', titulo: v ? 'Servicio disponible' : 'Servicio retirado' }),
              })}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
