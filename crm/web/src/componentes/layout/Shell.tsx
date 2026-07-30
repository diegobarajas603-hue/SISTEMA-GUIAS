import { Suspense, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { BarraLateral } from './BarraLateral';
import { BarraSuperior } from './BarraSuperior';
import { PaletaComandos } from './PaletaComandos';
import { Copiloto } from '@/componentes/ia/Copiloto';
import { useAlmacenLocal } from '@/lib/hooks';
import { useAtajo } from '@/lib/hooks';
import { usarDashboard } from '@/lib/consultas/dashboard';
import { Cargando } from '@/componentes/ui/Cargando';
import { NAV_PRINCIPAL } from '@/lib/constantes';

function tituloDeRuta(pathname: string): string {
  const todos = NAV_PRINCIPAL.flatMap((g) => g.items);
  const exacto = todos.find((i) => i.ruta === pathname);
  if (exacto) return exacto.etiqueta;
  const base = todos.find((i) => i.ruta !== '/' && pathname.startsWith(i.ruta));
  return base?.etiqueta ?? 'Aura';
}

export function Shell() {
  const [colapsada, setColapsada] = useAlmacenLocal('aura.sidebar-colapsada', false);
  const [paletaAbierta, setPaletaAbierta] = useState(false);
  const [copilotoAbierto, setCopilotoAbierto] = useState(false);
  const [preguntaInicial, setPreguntaInicial] = useState<string | null>(null);
  const location = useLocation();

  const { data: dashboard } = usarDashboard();

  useAtajo('mod+k', (e) => { e.preventDefault(); setPaletaAbierta(true); });
  useAtajo('mod+j', (e) => { e.preventDefault(); setCopilotoAbierto((v) => !v); });
  useAtajo('mod+\\', (e) => { e.preventDefault(); setColapsada((v) => !v); });

  const abrirCopilotoConPregunta = (pregunta?: string) => {
    setPreguntaInicial(pregunta ?? null);
    setCopilotoAbierto(true);
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-canvas">
      <BarraLateral colapsada={colapsada} contadores={dashboard?.contadores} />

      <div className="flex min-w-0 flex-1 flex-col">
        <BarraSuperior
          titulo={tituloDeRuta(location.pathname)}
          onAbrirPaleta={() => setPaletaAbierta(true)}
          onAbrirCopiloto={() => abrirCopilotoConPregunta()}
          colapsada={colapsada}
          onColapsar={() => setColapsada((v) => !v)}
        />
        <main id="contenido-scroll" className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1680px] px-6 py-6">
            <Suspense fallback={<Cargando etiqueta="Cargando módulo…" className="py-24" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <PaletaComandos abierta={paletaAbierta} onCerrar={() => setPaletaAbierta(false)} onAbrirCopiloto={abrirCopilotoConPregunta} />
      <Copiloto abierto={copilotoAbierto} onCerrar={() => setCopilotoAbierto(false)} preguntaInicial={preguntaInicial} />
    </div>
  );
}
