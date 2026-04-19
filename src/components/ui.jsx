import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  Lock,
  Smartphone,
} from 'lucide-react';
import { STATUS_META, normalizeStatus } from '../lib/status';

const STATUS_ICONS = {
  pasif: Ban,
  aktif: BadgeCheck,
  nfc: Smartphone,
  sifre_kilit: Lock,
  bloke: AlertTriangle,
};

export function Button({ children, className = '', variant = 'primary', ...props }) {
  const map = {
    primary: 'bg-slate-900 text-white hover:bg-slate-800 border-slate-900',
    outline: 'bg-white text-slate-900 hover:bg-slate-50 border-slate-300',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 border-rose-600',
    ghost: 'bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200',
  };
  return (
    <button
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-black transition ${map[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Input(props) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-900 ${props.className || ''}`}
    />
  );
}

export function SelectBox({ children, ...props }) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-900 ${props.className || ''}`}
    >
      {children}
    </select>
  );
}

export function Card({ children, className = '' }) {
  return <div className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function Modal({ open, title, onClose, children, maxWidth = 'max-w-4xl' }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`w-full ${maxWidth} overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div className="text-xl font-black text-slate-950">{title}</div>
          <button type="button" className="text-xl font-black text-slate-500 hover:text-slate-900" onClick={onClose}>×</button>
        </div>
        <div className="max-h-[80vh] overflow-auto p-6">{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const normalized = normalizeStatus(status);
  const meta = STATUS_META[normalized] || STATUS_META.pasif;
  const Icon = STATUS_ICONS[normalized] || Ban;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${meta.className}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

export function SummaryCard({ title, value, subtitle, tone = 'slate', onClick }) {
  const tones = {
    slate: 'border-slate-200',
    teal: 'border-teal-200 bg-teal-50/40',
    rose: 'border-rose-200 bg-rose-50/40',
    cyan: 'border-cyan-200 bg-cyan-50/40',
  };
  return (
    <Card className={`p-5 transition ${tones[tone]} ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}`}>
      <button type="button" className="w-full text-left" onClick={onClick}>
        <div className="text-[11px] font-black tracking-[0.24em] text-slate-500">{title}</div>
        <div className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</div>
        <div className="mt-2 text-sm font-semibold text-slate-600">{subtitle}</div>
      </button>
    </Card>
  );
}

export function SidebarButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${active ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
