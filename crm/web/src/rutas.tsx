import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from '@/componentes/layout/Shell';
import { RutaProtegida } from '@/componentes/layout/RutaProtegida';
import Entrar from '@/paginas/Entrar';

const PaginaDashboard = lazy(() => import('@/modulos/dashboard/PaginaDashboard'));
const PaginaProspectos = lazy(() => import('@/modulos/prospectos/PaginaProspectos'));
const PaginaClientes = lazy(() => import('@/modulos/clientes/PaginaClientes'));
const PaginaClienteFicha = lazy(() => import('@/modulos/clientes/PaginaClienteFicha'));
const PaginaOportunidades = lazy(() => import('@/modulos/oportunidades/PaginaOportunidades'));
const PaginaOportunidadDetalle = lazy(() => import('@/modulos/oportunidades/PaginaOportunidadDetalle'));
const PaginaCotizaciones = lazy(() => import('@/modulos/cotizaciones/PaginaCotizaciones'));
const PaginaCotizacionDetalle = lazy(() => import('@/modulos/cotizaciones/PaginaCotizacionDetalle'));
const PaginaMarketing = lazy(() => import('@/modulos/marketing/PaginaMarketing'));
const PaginaCampanaDetalle = lazy(() => import('@/modulos/marketing/PaginaCampanaDetalle'));
const PaginaSoporte = lazy(() => import('@/modulos/soporte/PaginaSoporte'));
const PaginaTicketDetalle = lazy(() => import('@/modulos/soporte/PaginaTicketDetalle'));
const PaginaBaseConocimiento = lazy(() => import('@/modulos/soporte/PaginaBaseConocimiento'));
const PaginaAgenda = lazy(() => import('@/modulos/agenda/PaginaAgenda'));
const PaginaReportes = lazy(() => import('@/modulos/reportes/PaginaReportes'));
const PaginaImportarClientes = lazy(() => import('@/modulos/importacion/PaginaImportarClientes'));
const PaginaHistorialImportaciones = lazy(() => import('@/modulos/importacion/PaginaHistorialImportaciones'));
const PaginaAutomatizaciones = lazy(() => import('@/modulos/automatizaciones/PaginaAutomatizaciones'));
const PaginaEditorFlujo = lazy(() => import('@/modulos/automatizaciones/PaginaEditorFlujo'));
const PaginaCopilotoCompleto = lazy(() => import('@/modulos/ia/PaginaCopilotoCompleto'));
const PaginaAjustes = lazy(() => import('@/modulos/ajustes/PaginaAjustes'));

export const enrutador = createBrowserRouter([
  { path: '/entrar', element: <Entrar /> },
  {
    path: '/',
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
