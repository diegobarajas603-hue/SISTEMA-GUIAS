import { createBrowserRouter, Navigate } from 'react-router-dom';
import { perezoso } from '@/lib/perezoso';
import { Shell } from '@/componentes/layout/Shell';
import { RutaProtegida } from '@/componentes/layout/RutaProtegida';
import Entrar from '@/paginas/Entrar';
import PaginaError from '@/paginas/Error';

const PaginaDashboard = perezoso(() => import('@/modulos/dashboard/PaginaDashboard'));
const PaginaProspectos = perezoso(() => import('@/modulos/prospectos/PaginaProspectos'));
const PaginaClientes = perezoso(() => import('@/modulos/clientes/PaginaClientes'));
const PaginaClienteFicha = perezoso(() => import('@/modulos/clientes/PaginaClienteFicha'));
const PaginaOportunidades = perezoso(() => import('@/modulos/oportunidades/PaginaOportunidades'));
const PaginaOportunidadDetalle = perezoso(() => import('@/modulos/oportunidades/PaginaOportunidadDetalle'));
const PaginaCotizaciones = perezoso(() => import('@/modulos/cotizaciones/PaginaCotizaciones'));
const PaginaCotizacionDetalle = perezoso(() => import('@/modulos/cotizaciones/PaginaCotizacionDetalle'));
const PaginaMarketing = perezoso(() => import('@/modulos/marketing/PaginaMarketing'));
const PaginaCampanaDetalle = perezoso(() => import('@/modulos/marketing/PaginaCampanaDetalle'));
const PaginaSoporte = perezoso(() => import('@/modulos/soporte/PaginaSoporte'));
const PaginaTicketDetalle = perezoso(() => import('@/modulos/soporte/PaginaTicketDetalle'));
const PaginaBaseConocimiento = perezoso(() => import('@/modulos/soporte/PaginaBaseConocimiento'));
const PaginaAgenda = perezoso(() => import('@/modulos/agenda/PaginaAgenda'));
const PaginaReportes = perezoso(() => import('@/modulos/reportes/PaginaReportes'));
const PaginaImportarClientes = perezoso(() => import('@/modulos/importacion/PaginaImportarClientes'));
const PaginaHistorialImportaciones = perezoso(() => import('@/modulos/importacion/PaginaHistorialImportaciones'));
const PaginaAutomatizaciones = perezoso(() => import('@/modulos/automatizaciones/PaginaAutomatizaciones'));
const PaginaEditorFlujo = perezoso(() => import('@/modulos/automatizaciones/PaginaEditorFlujo'));
const PaginaCopilotoCompleto = perezoso(() => import('@/modulos/ia/PaginaCopilotoCompleto'));
const PaginaAjustes = perezoso(() => import('@/modulos/ajustes/PaginaAjustes'));

export const enrutador = createBrowserRouter([
  { path: '/entrar', element: <Entrar />, errorElement: <PaginaError /> },
  {
    path: '/',
    errorElement: <PaginaError />,
    element: <RutaProtegida><Shell /></RutaProtegida>,
    children: [
      { index: true, element: <PaginaDashboard /> },
      { path: 'prospectos', element: <PaginaProspectos /> },
      { path: 'prospectos/:id', element: <PaginaProspectos /> },
      { path: 'clientes', element: <PaginaClientes /> },
      // Las rutas estáticas van antes que «clientes/:id» para que «importar» no
      // se interprete como el id de un cliente.
      { path: 'clientes/importar', element: <PaginaImportarClientes /> },
      { path: 'clientes/importaciones', element: <PaginaHistorialImportaciones /> },
      { path: 'clientes/:id', element: <PaginaClienteFicha /> },
      { path: 'oportunidades', element: <PaginaOportunidades /> },
      { path: 'oportunidades/:id', element: <PaginaOportunidadDetalle /> },
      { path: 'cotizaciones', element: <PaginaCotizaciones /> },
      { path: 'cotizaciones/:id', element: <PaginaCotizacionDetalle /> },
      { path: 'marketing', element: <PaginaMarketing /> },
      { path: 'marketing/campanas/:id', element: <PaginaCampanaDetalle /> },
      { path: 'soporte', element: <PaginaSoporte /> },
      { path: 'soporte/conocimiento', element: <PaginaBaseConocimiento /> },
      { path: 'soporte/:id', element: <PaginaTicketDetalle /> },
      { path: 'agenda', element: <PaginaAgenda /> },
      { path: 'reportes', element: <PaginaReportes /> },
      { path: 'automatizaciones', element: <PaginaAutomatizaciones /> },
      { path: 'automatizaciones/:id', element: <PaginaEditorFlujo /> },
      { path: 'ia', element: <PaginaCopilotoCompleto /> },
      { path: 'ajustes', element: <PaginaAjustes /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
