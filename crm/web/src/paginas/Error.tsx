import { useRouteError, useNavigate, isRouteErrorResponse } from 'react-router-dom';
import { RefreshCw, Home, TriangleAlert } from 'lucide-react';
import { Boton } from '@/componentes/ui/Boton';

/**
 * Pantalla de último recurso. Sin esto, React Router enseña su mensaje de
 * desarrollo («Hey developer 👋») con el stack a la vista, que para quien está
 * usando el CRM no significa nada y da la impresión de que todo se rompió.
 */
export default function PaginaError() {
  const error = useRouteError();
  const navegar = useNavigate();

  const noEncontrada = isRouteErrorResponse(error) && error.status === 404;
  const detalle = isRouteErrorResponse(error)
    ? `${error.status} · ${error.statusText}`
    : error instanceof Error ? error.message : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-alerta-50 text-alerta-600">
          <TriangleAlert className="size-7" />
        </span>

        <h1 className="mt-5 text-xl font-bold tracking-tight text-texto">
          {noEncontrada ? 'Esta página no existe' : 'Algo se interrumpió'}
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-texto-secundario">
          {noEncontrada
            ? 'Revisa la dirección o vuelve al inicio.'
            : 'No pudimos cargar esta parte del sistema. Suele resolverse recargando; tus datos no se han perdido.'}
        </p>

        <div className="mt-6 flex items-center justify-center gap-2">
          <Boton variante="primario" iconoIzq={<RefreshCw className="size-4" />} onClick={() => window.location.reload()}>
            Recargar
          </Boton>
          <Boton variante="secundario" iconoIzq={<Home className="size-4" />} onClick={() => navegar('/')}>
            Ir al inicio
          </Boton>
        </div>

        {detalle && (
          <p className="mt-6 break-words font-mono text-2xs text-texto-tenue">{detalle}</p>
        )}
      </div>
    </div>
  );
}
