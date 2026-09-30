// Supabase Edge Function: envía una notificación push (Expo Push API) por
// cada fila nueva en public.alerts.
//
// Se conecta con un Database Webhook (Dashboard → Database → Webhooks):
//   tabla public.alerts, evento INSERT, tipo "Supabase Edge Functions",
//   función push-alerts. Ver README.md.
import { createClient } from 'npm:@supabase/supabase-js@2';

type AlertRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  const payload = await req.json().catch(() => null);
  const alert: AlertRow | undefined = payload?.record;
  if (!alert || payload?.type !== 'INSERT') {
    return new Response('ignored', { status: 200 });
  }

  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', alert.user_id);
  if (error) return new Response(error.message, { status: 500 });
  if (!tokens?.length) return new Response('no tokens', { status: 200 });

  const isSos = alert.kind === 'sos';
  const messages = tokens.map(({ token }) => ({
    to: token,
    title: alert.title,
    body: alert.body,
    data: { ...alert.data, alertId: alert.id, kind: alert.kind },
    sound: 'default',
    priority: 'high',
    channelId: isSos ? 'sos' : 'default',
    interruptionLevel: isSos ? 'time-sensitive' : 'active',
  }));

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const result = await res.json().catch(() => ({}));

  // Limpiar tokens que Expo reporta como no registrados.
  const tickets: Array<{ status: string; details?: { error?: string } }> = result?.data ?? [];
  const stale = tickets
    .map((t, i) => (t.details?.error === 'DeviceNotRegistered' ? tokens[i].token : null))
    .filter((t): t is string => t !== null);
  if (stale.length) await supabase.from('push_tokens').delete().in('token', stale);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
