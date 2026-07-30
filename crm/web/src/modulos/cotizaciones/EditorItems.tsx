import { Plus, Trash2 } from 'lucide-react';
import { Boton, BotonIcono } from '@/componentes/ui/Boton';
import { Selector } from '@/componentes/ui/Campo';
import { dinero } from '@/lib/formato';
import type { ItemCotizacion, Producto } from '@/lib/tipos';

const IVA = 0.16;

export function calcularTotalesLocal(items: ItemCotizacion[]) {
  let subtotal = 0; let descuento = 0;
  for (const it of items) {
    const bruto = Math.round(it.cantidad * it.precio_unitario);
    const dto = Math.round(bruto * (it.descuento_pct / 100));
    subtotal += bruto - dto;
    descuento += dto;
  }
  const impuestos = Math.round(subtotal * IVA);
  return { subtotal, descuento, impuestos, total: subtotal + impuestos };
}

export function EditorItems({
  items, onCambiar, productos, soloLectura,
}: { items: ItemCotizacion[]; onCambiar: (items: ItemCotizacion[]) => void; productos: Producto[]; soloLectura?: boolean }) {
  const totales = calcularTotalesLocal(items);

  function actualizar(i: number, campo: keyof ItemCotizacion, valor: string | number) {
    const copia = [...items];
    copia[i] = { ...copia[i], [campo]: valor };
    onCambiar(copia);
  }

  function elegirProducto(i: number, productoId: string) {
    const p = productos.find((x) => x.id === Number(productoId));
    const copia = [...items];
    copia[i] = { ...copia[i], producto_id: p?.id ?? null, descripcion: p?.nombre ?? copia[i].descripcion, precio_unitario: p?.precio_base ?? copia[i].precio_unitario };
    onCambiar(copia);
  }

  return (
    <div>
      <div className="overflow-hidden rounded-lg border border-borde">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde bg-superficie-2 text-2xs uppercase text-texto-tenue">
              <th className="px-3 py-2 text-left">Concepto</th><th className="w-20 px-2 py-2 text-right">Cant.</th>
              <th className="w-32 px-2 py-2 text-right">Precio unit.</th><th className="w-20 px-2 py-2 text-right">Desc. %</th>
              <th className="w-32 px-3 py-2 text-right">Importe</th>{!soloLectura && <th className="w-10" />}
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const importe = Math.round(it.cantidad * it.precio_unitario * (1 - it.descuento_pct / 100));
              return (
                <tr key={i} className="border-b border-borde last:border-0">
                  <td className="px-3 py-2">
                    {soloLectura ? <span className="text-texto">{it.descripcion}</span> : (
                      <div className="space-y-1">
                        <Selector value={it.producto_id ?? ''} onChange={(e) => elegirProducto(i, e.target.value)} className="h-7 text-xs">
                          <option value="">Concepto libre</option>
                          {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </Selector>
                        <input value={it.descripcion} onChange={(e) => actualizar(i, 'descripcion', e.target.value)}
                          className="w-full rounded border border-borde bg-superficie px-2 py-1 text-xs outline-none focus:border-marca-500" />
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {soloLectura ? <span className="num">{it.cantidad}</span> : (
                      <input type="number" min={0} value={it.cantidad} onChange={(e) => actualizar(i, 'cantidad', Number(e.target.value))}
                        className="num w-16 rounded border border-borde bg-superficie px-1.5 py-1 text-right text-xs outline-none focus:border-marca-500" />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {soloLectura ? <span className="num">{dinero(it.precio_unitario)}</span> : (
                      <input type="number" min={0} value={Math.round(it.precio_unitario / 100)}
                        onChange={(e) => actualizar(i, 'precio_unitario', Math.round(Number(e.target.value) * 100))}
                        className="num w-24 rounded border border-borde bg-superficie px-1.5 py-1 text-right text-xs outline-none focus:border-marca-500" />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {soloLectura ? <span className="num">{it.descuento_pct}%</span> : (
                      <input type="number" min={0} max={100} value={it.descuento_pct} onChange={(e) => actualizar(i, 'descuento_pct', Number(e.target.value))}
                        className="num w-14 rounded border border-borde bg-superficie px-1.5 py-1 text-right text-xs outline-none focus:border-marca-500" />
                    )}
                  </td>
                  <td className="num px-3 py-2 text-right font-medium text-texto">{dinero(importe)}</td>
                  {!soloLectura && (
                    <td className="px-1 py-2 text-center">
                      <BotonIcono etiqueta="Quitar" tamano="sm" onClick={() => onCambiar(items.filter((_, j) => j !== i))}><Trash2 className="size-3.5 text-peligro-500" /></BotonIcono>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!soloLectura && (
        <Boton tamano="sm" variante="secundario" className="mt-2" iconoIzq={<Plus className="size-3.5" />}
          onClick={() => onCambiar([...items, { descripcion: '', cantidad: 1, precio_unitario: 0, descuento_pct: 0 }])}>
          Agregar concepto
        </Boton>
      )}

      <div className="ml-auto mt-4 w-56 space-y-1 text-sm">
        <div className="flex justify-between text-texto-secundario"><span>Subtotal</span><span className="num">{dinero(totales.subtotal)}</span></div>
        {totales.descuento > 0 && <div className="flex justify-between text-texto-secundario"><span>Descuento</span><span className="num">−{dinero(totales.descuento)}</span></div>}
        <div className="flex justify-between text-texto-secundario"><span>IVA (16%)</span><span className="num">{dinero(totales.impuestos)}</span></div>
        <div className="flex justify-between border-t border-borde pt-1.5 text-base font-bold text-texto"><span>Total</span><span className="num">{dinero(totales.total)}</span></div>
      </div>
    </div>
  );
}
