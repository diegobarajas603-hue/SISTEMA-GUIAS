import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { ProveedorSesion } from '@/estado/sesion';
import { ProveedorTema } from '@/estado/tema';
import { ProveedorAvisos } from '@/componentes/ui/Notificaciones';
import { enrutador } from '@/rutas';

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <ProveedorTema>
      <QueryClientProvider client={qc}>
        <ProveedorAvisos>
          <ProveedorSesion>
            <RouterProvider router={enrutador} />
          </ProveedorSesion>
        </ProveedorAvisos>
      </QueryClientProvider>
    </ProveedorTema>
  );
}
