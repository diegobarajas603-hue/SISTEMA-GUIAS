import { TarjetaLead } from './TarjetaLead';
import type { Lead } from '@/lib/tipos';

export function VistaTarjetas({ leads, onAbrir }: { leads: Lead[]; onAbrir: (id: number) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {leads.map((lead) => (
        <TarjetaLead key={lead.id} lead={lead} onClick={() => onAbrir(lead.id)} sinArrastre />
      ))}
    </div>
  );
}
