import { motion, type Variants } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { usarDashboard } from '@/lib/consultas/dashboard';
import { useSesion } from '@/estado/sesion';
import { EsqueletoTarjetas, Esqueleto } from '@/componentes/ui/Esqueleto';
import { TarjetaInsight } from '@/componentes/ia/TarjetaInsight';
import { WidgetVentas } from './WidgetVentas';
import { WidgetPronostico } from './WidgetPronostico';
import { WidgetEmbudo } from './WidgetEmbudo';
import { WidgetActividadesHoy } from './WidgetActividadesHoy';
import { WidgetObjetivos } from './WidgetObjetivos';
import { WidgetRanking } from './WidgetRanking';
import { WidgetClientesNuevos, WidgetClientesInactivos } from './WidgetClientes';
import { WidgetOportunidadesRiesgo } from './WidgetRiesgos';
import { WidgetProximasActividades } from './WidgetProximasActividades';

const VARIANTES_ENTRADA: Variants = {
  oculto: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] as const } }),
};

export default function PaginaDashboard() {
  const { usuario } = useSesion();
  const { data, isLoading } = usarDashboard();

  const saludo = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <Esqueleto className="h-8 w-64" />
        <EsqueletoTarjetas n={4} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Esqueleto key={i} className="h-64 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-texto">{saludo}, {usuario?.nombre.split(' ')[0]}</h1>
          <p className="mt-0.5 text-sm text-texto-tenue">{data.alcance} · esto es lo que necesitas saber hoy</p>
        </div>
      </div>

      {data.insights.length > 0 && (
        <motion.div custom={0} initial="oculto" animate="visible" variants={VARIANTES_ENTRADA}>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-texto-tenue">
            <Sparkles className="size-3.5 text-ia-500" /> Detectado por IA
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {data.insights.slice(0, 8).map((ins) => <TarjetaInsight key={ins.id} insight={ins} compacta />)}
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <motion.div custom={1} initial="oculto" animate="visible" variants={VARIANTES_ENTRADA} className="contents">
          <WidgetVentas ventasMes={data.ventasMes} serie={data.serie} />
          <WidgetPronostico pronostico={data.pronostico} />
        </motion.div>

        <motion.div custom={2} initial="oculto" animate="visible" variants={VARIANTES_ENTRADA} className="contents">
          <WidgetEmbudo embudo={data.embudo} />
          <WidgetActividadesHoy actividadesHoy={data.actividadesHoy} />
        </motion.div>

        <motion.div custom={3} initial="oculto" animate="visible" variants={VARIANTES_ENTRADA} className="contents">
          <WidgetObjetivos objetivos={data.objetivos} />
          <WidgetRanking ranking={data.ranking} />
        </motion.div>

        <motion.div custom={4} initial="oculto" animate="visible" variants={VARIANTES_ENTRADA} className="contents">
          <WidgetOportunidadesRiesgo oportunidadesRiesgo={data.oportunidadesRiesgo} />
          <WidgetProximasActividades proximasActividades={data.proximasActividades} />
        </motion.div>

        <motion.div custom={5} initial="oculto" animate="visible" variants={VARIANTES_ENTRADA} className="contents">
          <WidgetClientesNuevos clientesNuevos={data.clientesNuevos} />
          <WidgetClientesInactivos clientesInactivos={data.clientesInactivos} />
        </motion.div>
      </div>
    </div>
  );
}
