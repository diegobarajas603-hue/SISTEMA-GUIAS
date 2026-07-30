import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usarCuenta } from '@/lib/consultas/cuentas';
import { Cargando } from '@/componentes/ui/Cargando';
import { Vacio } from '@/componentes/ui/Vacio';
import { BotonIcono } from '@/componentes/ui/Boton';
import { ColumnaIzquierda } from './ColumnaIzquierda';
import { Cronologia } from './Cronologia';
import { ColumnaDerecha } from './ColumnaDerecha';

export default function PaginaClienteFicha() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { data: cuenta, isLoading } = usarCuenta(id ? Number(id) : null);

  if (isLoading) return <Cargando etiqueta="Cargando ficha del cliente…" className="py-24" />;
  if (!cuenta) return <Vacio titulo="No se encontró la cuenta" />;

  return (
    <div className="space-y-4 pb-8">
      <BotonIcono etiqueta="Volver" onClick={() => navegar('/clientes')}><ArrowLeft className="size-4" /></BotonIcono>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_1fr_360px]">
        <ColumnaIzquierda cuenta={cuenta} />
        <Cronologia cuenta={cuenta} />
        <ColumnaDerecha cuenta={cuenta} />
      </div>
    </div>
  );
}
