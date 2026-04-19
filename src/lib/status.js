export const STATUS_OPTIONS = ['pasif', 'aktif', 'nfc', 'sifre_kilit', 'bloke'];

export const STATUS_META = {
  pasif: { label: 'PASIF', className: 'border-slate-200 bg-slate-100 text-slate-700', icon: 'pasif' },
  aktif: { label: 'AKTIF', className: 'border-teal-200 bg-teal-100 text-teal-800', icon: 'aktif' },
  nfc: { label: 'NFC', className: 'border-cyan-200 bg-cyan-100 text-cyan-800', icon: 'nfc' },
  sifre_kilit: { label: 'SIFRE KILIT', className: 'border-amber-200 bg-amber-100 text-amber-800', icon: 'sifre_kilit' },
  bloke: { label: 'BLOKE', className: 'border-rose-200 bg-rose-100 text-rose-800', icon: 'bloke' },
};

export const VALID_STATUSES = new Set(STATUS_OPTIONS);

export const STATUS_ALIASES = {
  active: 'aktif',
  blocked: 'bloke',
  block: 'bloke',
  kilit: 'sifre_kilit',
  password_lock: 'sifre_kilit',
  sifre: 'sifre_kilit',
  sifrekilit: 'sifre_kilit',
  sifre_kilit: 'sifre_kilit',
  adam: 'bloke',
};

export const STATUS_SELECT_OPTIONS = STATUS_OPTIONS.map((value) => ({
  value,
  label: STATUS_META[value]?.label || value,
}));

export function toStatusKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[ç]/g, 'c')
    .replace(/[ğ]/g, 'g')
    .replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o')
    .replace(/[ş]/g, 's')
    .replace(/[ü]/g, 'u')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeStatus(value, fallback = 'pasif') {
  const normalized = toStatusKey(value);
  if (!normalized) return fallback;
  if (VALID_STATUSES.has(normalized)) return normalized;
  return STATUS_ALIASES[normalized] || fallback;
}

export function normalizeBlockedStatus(value) {
  const normalized = normalizeStatus(value, 'bloke');
  return normalized === 'sifre_kilit' ? 'sifre_kilit' : 'bloke';
}

export function getStatusLabel(status) {
  const normalized = normalizeStatus(status, 'pasif');
  return STATUS_META[normalized]?.label || normalized;
}

export function isManagerLockedStatus(status) {
  const normalized = normalizeStatus(status, 'pasif');
  return normalized === 'bloke' || normalized === 'sifre_kilit';
}

export function isPositiveStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === 'aktif' || normalized === 'nfc';
}

export function isNegativeStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === 'bloke' || normalized === 'sifre_kilit';
}

export function shouldRepairTransactionStatus(rawValue) {
  const normalized = normalizeStatus(rawValue, 'pasif');
  return String(rawValue || '').trim() !== '' && toStatusKey(rawValue) !== normalized;
}

export function shouldRepairBlockStatus(rawValue) {
  const normalized = normalizeBlockedStatus(rawValue);
  return String(rawValue || '').trim() !== '' && toStatusKey(rawValue) !== normalized;
}
