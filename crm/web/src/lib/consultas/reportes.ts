import { useQuery } from '@tanstack/react-query';
import { api, conQuery } from '@/lib/api';
import type { EtapaEmbudo } from '@/lib/tipos';

export interface ReportesCompleto {
  kpis: {
    ingresos_mes: number; ingresos_ano: number; pipeline: number; oportunidades_abiertas: number;
    conversion: number | null; dias_ciclo: number | null; ticket_promedio: number | null;
    clientes: number; clientes_en_riesgo: number; leads_mes: number;
  };
  ingresos: Array<{ mes: string; ganado: number; operaciones: number; perdido: number; nuevos: number; existentes: number; meta: number; ano_anterior: number }>;
  embudo: EtapaEmbudo[];
  vendedores: Array<{
    id: number; nombre: string; avatar_tono: number; puesto: string; zona: string; equipo: string; meta_mensual: number;
    cerradas: number; ganadas: number; perdidas: number; abiertas: number; ingresos: number; pipeline: number;
    conversion: number | null; ticket_promedio: number | null; dias_ciclo: number | null; actividades: number;
  }>;
  velocidad: Array<{ etapa: string; transiciones: number; dias_promedio: number; dias_mediana: number; dias_max: number }>;
  industrias: Array<{ industria: string; cuentas: number; ganadas: number; perdidas: number; ingresos: number; conversion: number | null }>;
  productos: Array<{ id: number; sku: string; nombre: string; categoria: string; operaciones: number; ingresos: number; unidades: number; descuento_promedio: number | null; margen: number }>;
  perdidas: Array<{ motivo: string; total: number; monto: number; dias_promedio: number }>;
  competencia: Array<{ competidor: string; enfrentamientos: number; ganados: number; perdidos: number; tasa_victoria: number | null; monto_perdido: number }>;
  mapaCalor: Array<{ dia: number; hora: number; total: number }>;
}

export const usarReportes = (alcance: 'auto' | 'mio' | 'todo' = 'auto', meses = 12) =>
  useQuery({
    queryKey: ['reportes', alcance, meses],
    queryFn: () => api.get<ReportesCompleto>(conQuery('/reportes', { alcance, meses })),
  });

export const usarCartera = () =>
  useQuery({
    queryKey: ['reportes-cartera'],
    queryFn: () => api.get<{
      top: Array<{ id: number; nombre: string; nombre_comercial: string | null; industria: string | null; ingresos_ano: number; valor_vida: number; salud: number; riesgo_churn: number; propietario: string | null }>;
      distribucion: Array<{ tamano: string; cuentas: number; ingresos: number }>;
      salud: { critico: number; alto: number; medio: number; bajo: number; ingresos_en_riesgo: number; salud_promedio: number };
      cohortes: Array<{ cohorte: string; clientes: number; valor_vida: number; perdidos: number }>;
      concentracion: { top5: number; total: number; porcentaje: number };
    }>('/reportes/cartera'),
  });

export const urlExportar = (reporte: string, meses = 12, alcance = 'auto') =>
  conQuery(`/api/v1/reportes/exportar/${reporte}`, { meses, alcance });
