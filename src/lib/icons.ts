import {
  HeartPulse, Bone, Baby, Flower2, Stethoscope, Sparkles, Ear, Smile, Eye, Droplets,
  Activity, Brain, Syringe, Pill, type LucideIcon,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  'heart-pulse': HeartPulse,
  'bone': Bone,
  'baby': Baby,
  'flower-2': Flower2,
  'stethoscope': Stethoscope,
  'sparkles': Sparkles,
  'ear': Ear,
  'smile': Smile,
  'eye': Eye,
  'droplets': Droplets,
  'activity': Activity,
  'brain': Brain,
  'syringe': Syringe,
  'pill': Pill,
};

export const SPECIALTY_ICONS = ICON_MAP;

export function specialtyIcon(name: string | null | undefined): LucideIcon {
  if (!name) return Stethoscope;
  return ICON_MAP[name] ?? Stethoscope;
}

// Tailwind-safe color classes per specialty.color
export const COLOR_TONES: Record<string, { bg: string; text: string; ring: string; solid: string; soft: string }> = {
  rose:    { bg: 'bg-rose-100',    text: 'text-rose-700',    ring: 'ring-rose-200',    solid: 'bg-rose-500',    soft: 'bg-rose-50' },
  amber:   { bg: 'bg-amber-100',   text: 'text-amber-700',   ring: 'ring-amber-200',   solid: 'bg-amber-500',   soft: 'bg-amber-50' },
  sky:     { bg: 'bg-sky-100',     text: 'text-sky-700',     ring: 'ring-sky-200',     solid: 'bg-sky-500',     soft: 'bg-sky-50' },
  pink:    { bg: 'bg-pink-100',    text: 'text-pink-700',    ring: 'ring-pink-200',    solid: 'bg-pink-500',    soft: 'bg-pink-50' },
  teal:    { bg: 'bg-teal-100',    text: 'text-teal-700',    ring: 'ring-teal-200',    solid: 'bg-teal-500',    soft: 'bg-teal-50' },
  violet:  { bg: 'bg-violet-100',  text: 'text-violet-700',  ring: 'ring-violet-200',  solid: 'bg-violet-500',  soft: 'bg-violet-50' },
  cyan:    { bg: 'bg-cyan-100',    text: 'text-cyan-700',    ring: 'ring-cyan-200',    solid: 'bg-cyan-500',    soft: 'bg-cyan-50' },
  lime:    { bg: 'bg-lime-100',    text: 'text-lime-700',    ring: 'ring-lime-200',    solid: 'bg-lime-500',    soft: 'bg-lime-50' },
  indigo:  { bg: 'bg-indigo-100',  text: 'text-indigo-700',  ring: 'ring-indigo-200',  solid: 'bg-indigo-500',  soft: 'bg-indigo-50' },
  blue:    { bg: 'bg-blue-100',    text: 'text-blue-700',    ring: 'ring-blue-200',    solid: 'bg-blue-500',    soft: 'bg-blue-50' },
};

export function toneOf(color: string | null | undefined) {
  return COLOR_TONES[color ?? 'teal'] ?? COLOR_TONES.teal;
}
