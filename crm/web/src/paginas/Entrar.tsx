import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useSesion } from '@/estado/sesion';
import { Campo } from '@/componentes/ui/Campo';
import { Boton } from '@/componentes/ui/Boton';

export default function Entrar() {
  const { usuario, cargando, iniciarSesion, errorLogin } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (!cargando && usuario) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try { await iniciarSesion(email, password); } catch { /* el error ya queda en errorLogin */ }
    setEnviando(false);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-marca-500/10 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-ia-500/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl border border-borde bg-superficie p-8 shadow-4"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-3 flex size-11 items-center justify-center rounded-2xl gradiente-ia text-white shadow-3">
            <Sparkles className="size-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-texto">Aura CRM</h1>
          <p className="mt-1 text-sm text-texto-tenue">Plataforma comercial inteligente de Fletes Tauro</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <Campo etiqueta="Correo" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu.correo@fletestauro.com.mx" />
          <Campo etiqueta="Contraseña" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />

          {errorLogin && (
            <div className="rounded-lg border border-peligro-200 bg-peligro-50 px-3 py-2 text-xs text-peligro-600">{errorLogin}</div>
          )}

          <Boton type="submit" variante="primario" tamano="lg" cargando={enviando} className="w-full" iconoDer={<ArrowRight className="size-4" />}>
            Entrar
          </Boton>
        </form>
      </motion.div>
    </div>
  );
}
