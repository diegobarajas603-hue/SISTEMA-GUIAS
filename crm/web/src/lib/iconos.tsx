import {
  // Navegación
  LayoutDashboard, Radar, Building2, Target, FileText, Megaphone, LifeBuoy,
  Calendar, BarChart3, Workflow, Sparkles, Settings,
  // Actividades
  Phone, Mail, Users, MessageCircle, CheckSquare, MapPin, Repeat, MonitorPlay,
  // Cronología y resultados
  Circle, CircleDollarSign, Eye, GitBranch, RefreshCw, StickyNote, Trophy,
  UserCheck, UserPlus, XCircle, ArrowRight,
  // Nodos de automatización
  Zap, Search, Brain, MessageSquare, Edit, Bell, Clock, Box,
  type LucideIcon,
} from 'lucide-react';

/**
 * Registro explícito de los iconos que se resuelven por nombre en tiempo de
 * ejecución (navegación, tipos de actividad, catálogo de nodos, cronología).
 *
 * Existe por una razón concreta: `import * as Iconos from 'lucide-react'` impide
 * el tree-shaking y mete las ~1500 imágenes del paquete en el bundle (625 kB).
 * Al enumerarlas se paga solo por las que de verdad se dibujan. Si el backend
 * añade un nodo con un icono nuevo, se agrega aquí; mientras tanto cae en `Box`.
 */
const REGISTRO: Record<string, LucideIcon> = {
  'layout-dashboard': LayoutDashboard,
  radar: Radar,
  'building-2': Building2,
  target: Target,
  'file-text': FileText,
  megaphone: Megaphone,
  'life-buoy': LifeBuoy,
  calendar: Calendar,
  'bar-chart-3': BarChart3,
  workflow: Workflow,
  sparkles: Sparkles,
  settings: Settings,

  phone: Phone,
  mail: Mail,
  users: Users,
  'message-circle': MessageCircle,
  'check-square': CheckSquare,
  'map-pin': MapPin,
  repeat: Repeat,
  'monitor-play': MonitorPlay,

  circle: Circle,
  'circle-dollar-sign': CircleDollarSign,
  eye: Eye,
  'git-branch': GitBranch,
  'refresh-cw': RefreshCw,
  'sticky-note': StickyNote,
  trophy: Trophy,
  'user-check': UserCheck,
  'user-plus': UserPlus,
  'x-circle': XCircle,
  'arrow-right': ArrowRight,

  zap: Zap,
  search: Search,
  brain: Brain,
  'message-square': MessageSquare,
  edit: Edit,
  bell: Bell,
  clock: Clock,
  box: Box,
};

export function iconoPorNombre(nombre: string | undefined | null): LucideIcon | undefined {
  return nombre ? REGISTRO[nombre] : undefined;
}

/** Dibuja un icono por su nombre en kebab-case. Sin coincidencia, no dibuja nada. */
export function Icono({ nombre, className }: { nombre: string; className?: string }) {
  const Componente = REGISTRO[nombre];
  return Componente ? <Componente className={className} /> : null;
}

/** Variante para el lienzo de automatizaciones: siempre dibuja algo. */
export function IconoConReserva({ nombre, className }: { nombre: string; className?: string }) {
  const Componente = REGISTRO[nombre] ?? Box;
  return <Componente className={className} />;
}
