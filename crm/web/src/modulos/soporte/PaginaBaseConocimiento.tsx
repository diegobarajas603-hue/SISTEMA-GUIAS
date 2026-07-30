import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, BookOpen, Eye, ThumbsUp } from 'lucide-react';
import { usarBaseConocimiento } from '@/lib/consultas/tickets';
import { Campo } from '@/componentes/ui/Campo';
import { BotonIcono } from '@/componentes/ui/Boton';
import { Panel, EncabezadoPanel, CuerpoPanel } from '@/componentes/ui/Panel';
import { EsqueletoTarjetas } from '@/componentes/ui/Esqueleto';
import { Vacio } from '@/componentes/ui/Vacio';
import { useDespacio } from '@/lib/hooks';

export default function PaginaBaseConocimiento() {
  const navegar = useNavigate();
  const [busqueda, setBusqueda] = useState('');
  const buscadoDespacio = useDespacio(busqueda);
  const { data: articulos, isLoading } = usarBaseConocimiento(buscadoDespacio || undefined);

  const porCategoria = new Map<string, typeof articulos>();
  for (const a of articulos ?? []) {
    const cat = a.categoria ?? 'General';
    if (!porCategoria.has(cat)) porCategoria.set(cat, []);
    porCategoria.get(cat)!.push(a);
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <BotonIcono etiqueta="Volver" onClick={() => navegar('/soporte')}><ArrowLeft className="size-4" /></BotonIcono>
        <h1 className="text-2xl font-bold tracking-tight text-texto">Base de conocimiento</h1>
      </div>
      <Campo iconoIzq={<Search className="size-3.5" />} placeholder="Buscar artículos…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="max-w-md" />

      {isLoading ? (
        <EsqueletoTarjetas n={6} />
      ) : !articulos?.length ? (
        <Vacio icono={<BookOpen className="size-5" />} titulo="Sin artículos" />
      ) : (
        [...porCategoria.entries()].map(([cat, arts]) => (
          <div key={cat}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-tenue">{cat}</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {arts!.map((a) => (
                <Panel key={a.id} interactivo className="cursor-pointer">
                  <EncabezadoPanel titulo={a.titulo} />
                  <CuerpoPanel>
                    <p className="line-clamp-3 text-sm text-texto-secundario">{a.cuerpo}</p>
                    <div className="mt-2 flex items-center gap-3 text-2xs text-texto-tenue">
                      <span className="flex items-center gap-1"><Eye className="size-3" /> {a.vistas}</span>
                      <span className="flex items-center gap-1"><ThumbsUp className="size-3" /> {a.utiles}</span>
                    </div>
                  </CuerpoPanel>
                </Panel>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
