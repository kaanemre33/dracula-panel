import { supabase } from './supabase'
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  BellRing,
  Download,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Lock,
  PieChart as PieChartIcon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  Pencil,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

const APP_TIME_ZONE = 'Europe/Istanbul';
const STORAGE_USERS = 'set-panel-users-v4';
const STORAGE_THEME = 'set-panel-theme-v1';
const STORAGE_BANKS = 'set-panel-banks-v1';
const STORAGE_CURRENT_USER = 'set-panel-current-user-v1';

const DEFAULT_BANKS = [
  'Ziraat Bankası',
  'VakıfBank',
  'Halkbank',
  'İş Bankası',
  'Garanti BBVA',
  'Akbank',
  'Yapı Kredi',
  'QNB Finansbank',
  'DenizBank',
  'TEB',
  'ING',
  'Enpara',
  'Kuveyt Türk',
  'Albaraka Türk',
  'Türkiye Finans',
  'Fibabanka',
  'Odeabank',
  'Şekerbank',
  'Anadolubank',
  'ON Bank',
];

function getTurkeyNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value || '00';

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    dateTime: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`,
  };
}

const TODAY = getTurkeyNow().date;
const DEFAULT_ACCOUNT_NAMES = DEFAULT_BANKS.slice(0, 5);

const STATUS_META = {
  pasif: { label: 'PASİF', className: 'border-slate-200 bg-slate-100 text-slate-700', icon: Ban },
  aktif: { label: 'AKTİF', className: 'border-teal-200 bg-teal-100 text-teal-800', icon: BadgeCheck },
  nfc: { label: 'NFC', className: 'border-cyan-200 bg-cyan-100 text-cyan-800', icon: Smartphone },
  sifre_kilit: { label: 'ŞİFRE KİLİT', className: 'border-amber-200 bg-amber-100 text-amber-800', icon: Lock },
  bloke: { label: 'BLOKE', className: 'border-rose-200 bg-rose-100 text-rose-800', icon: AlertTriangle },
};

const VALID_STATUSES = new Set(['pasif', 'aktif', 'nfc', 'sifre_kilit', 'bloke']);
const STATUS_ALIASES = {
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

function toStatusKey(value) {
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

function normalizeStatus(value, fallback = 'pasif') {
  const normalized = toStatusKey(value);
  if (!normalized) return fallback;
  if (VALID_STATUSES.has(normalized)) return normalized;
  return STATUS_ALIASES[normalized] || fallback;
}

function normalizeBlockedStatus(value) {
  const normalized = normalizeStatus(value, 'bloke');
  return normalized === 'sifre_kilit' ? 'sifre_kilit' : 'bloke';
}

const SEED_PEOPLE = [];

const DEFAULT_USERS = [
  { id: 'u1', username: 'admin', password: 'admin123', displayName: 'YÖNETİCİ', role: 'admin', isActive: true, canEnterData: true },
];

function getStoredUsers() {
  try {
    const raw = window.localStorage.getItem(STORAGE_USERS);
    if (!raw) return DEFAULT_USERS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

function getStoredTheme() {
  try {
    return window.localStorage.getItem(STORAGE_THEME) || 'light';
  } catch {
    return 'light';
  }
}

function getStoredBanks() {
  try {
    const raw = window.localStorage.getItem(STORAGE_BANKS);
    if (!raw) return DEFAULT_BANKS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_BANKS;
  } catch {
    return DEFAULT_BANKS;
  }
}

function makeDayRecords(people) {
  return people.flatMap((person) =>
    person.accountNames.map((accountName, index) => ({
      id: `${person.id}-${index + 1}`,
      personId: person.id,
      personName: person.fullName,
      accountName,
      amount: 0,
      status: 'pasif',
      note: '',
      editedBy: '',
      editedAt: '',
    }))
  );
}

function seedHistory(people) {
  return {
    [TODAY]: makeDayRecords(people),
  };
}

const SEED_BLOCKS = [];

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function isPositiveStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === 'aktif' || normalized === 'nfc';
}

function isNegativeStatus(status) {
  const normalized = normalizeStatus(status);
  return normalized === 'bloke' || normalized === 'sifre_kilit';
}

function getResolvedReleaseAmount(item) {
  if (!item) return 0;
  const totalAmount = Number(item.amount || 0);
  if (item.resultList === 'kapandi' || item.resultList === 'aktif_alindi') return 0;
  if (item.resultList !== 'merkez' || item.resolution !== 'cozuldu') return 0;
  return Math.max(0, Math.min(totalAmount, Number(item.resolvedAmount || 0)));
}

function getCurrentBlockedAmount(item) {
  if (!item) return 0;
  const totalAmount = Number(item.amount || 0);
  if (item.resultList === 'kapandi' || item.resultList === 'aktif_alindi') return 0;
  if (item.resolution === 'cozulmedi') return totalAmount;
  if (item.resultList === 'merkez' && item.resolution === 'cozuldu') {
    return Math.max(0, totalAmount - getResolvedReleaseAmount(item));
  }
  return 0;
}

function getEffectiveNegativeAmount(row, blockItem) {
  if (!isNegativeStatus(row?.status)) return 0;
  const totalAmount = Number(row?.amount || 0);
  if (!blockItem) return totalAmount;
  return Math.max(0, Math.min(totalAmount, getCurrentBlockedAmount(blockItem)));
}

function buildLatestBlockMap(blockItems = []) {
  const next = new Map();
  blockItems.forEach((item) => {
    if (!item?.sourceRowKey || next.has(item.sourceRowKey)) return;
    next.set(item.sourceRowKey, item);
  });
  return next;
}

function getBlockLifecycleState(item) {
  if (!item) return 'unknown';
  if (item.resultList === 'aktif_alindi') return 'activated';
  if (item.resultList === 'kapandi') return 'closed';
  if (getCurrentBlockedAmount(item) > 0) return 'unresolved';
  if (item.resultList === 'merkez' && item.resolution === 'cozuldu') return 'resolved';
  return 'unknown';
}

function getEffectiveStatusFromBlockItem(item) {
  const lifecycle = getBlockLifecycleState(item);
  if (lifecycle === 'activated' || lifecycle === 'resolved') return 'aktif';
  if (lifecycle === 'closed') return 'pasif';
  if (lifecycle === 'unresolved') return normalizeBlockedStatus(item.type);
  return null;
}

function applyLatestBlockStateToHistory(historyByDay = {}, blockItems = []) {
  const latestBlockByRowKey = buildLatestBlockMap(blockItems);
  const next = {};

  Object.entries(historyByDay).forEach(([day, rows]) => {
    next[day] = (rows || []).map((row) => {
      const blockItem = latestBlockByRowKey.get(row.id);
      if (!blockItem) return row;

      const nextStatus = getEffectiveStatusFromBlockItem(blockItem);
      if (!nextStatus) return row;

      return {
        ...row,
        amount: getBlockLifecycleState(blockItem) === 'closed' ? 0 : Number(row.amount || 0),
        status: nextStatus,
      };
    });
  });

  return next;
}

function getLatestHistoryDay(historyByDay = {}) {
  const days = Object.keys(historyByDay).sort();
  return days[days.length - 1] || TODAY;
}

function Button({ children, className = '', variant = 'primary', ...props }) {
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

function Input(props) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-900 ${props.className || ''}`}
    />
  );
}

function SelectBox({ children, ...props }) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-slate-900 ${props.className || ''}`}
    >
      {children}
    </select>
  );
}

function Card({ children, className = '' }) {
  return <div className={`rounded-3xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

function Modal({ open, title, onClose, children, maxWidth = 'max-w-4xl' }) {
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

function StatusBadge({ status }) {
  const meta = STATUS_META[normalizeStatus(status)] || STATUS_META.pasif;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${meta.className}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
}

function SummaryCard({ title, value, subtitle, tone = 'slate', onClick }) {
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

function SidebarButton({ active, icon: Icon, label, onClick }) {
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

export default function App() {
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [users, setUsers] = useState([]);
  const [bankList, setBankList] = useState(() => getStoredBanks());
  const [people, setPeople] = useState([]);
  const [historyByDay, setHistoryByDay] = useState({});
  const [blockCenter, setBlockCenter] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [login, setLogin] = useState({ username: '', password: '' });
  const [selectedDay, setSelectedDay] = useState(TODAY);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [activeSection, setActiveSection] = useState('genel');
  const [filter, setFilter] = useState('');
  const [notifyFlash, setNotifyFlash] = useState(false);
  const [showUsersPanel, setShowUsersPanel] = useState(false);
  const [selectedGeneralSummary, setSelectedGeneralSummary] = useState(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [selectedBlockItem, setSelectedBlockItem] = useState(null);
  const [resolvedAmountInput, setResolvedAmountInput] = useState('');
  const [showResolvedAmountInput, setShowResolvedAmountInput] = useState(false);
  const [pendingResolveMode, setPendingResolveMode] = useState('cozuldu');
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ displayName: '', username: '', password: '', role: 'user' });
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [userPermissionDrafts, setUserPermissionDrafts] = useState({});
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonDate, setNewPersonDate] = useState(TODAY);
  const [newAccountCount, setNewAccountCount] = useState('5');
  const [newAccountNames, setNewAccountNames] = useState(DEFAULT_ACCOUNT_NAMES);
  const [appLoading, setAppLoading] = useState(false);
  const [pendingSetRows, setPendingSetRows] = useState({});
  const [navigationWarningOpen, setNavigationWarningOpen] = useState(false);
  const [pendingSection, setPendingSection] = useState(null);
  const [navigationWarningMessage, setNavigationWarningMessage] = useState('Lütfen girdiğiniz verileri kaydedin.');
  const [actionNotice, setActionNotice] = useState({ open: false, title: '', message: '', tone: 'success' });
  const [deleteTargetUser, setDeleteTargetUser] = useState(null);
  const [deleteSetTarget, setDeleteSetTarget] = useState(null);
  const [editingPersonId, setEditingPersonId] = useState(null);
  const [newBankName, setNewBankName] = useState('');

  const canManage = currentUser?.role === 'admin';

  const ownerVisiblePeople = useMemo(() => {
    if (canManage) return people;
    return people.filter((person) => person.createdByUserId === currentUser?.id);
  }, [canManage, people, currentUser?.id]);

  const visiblePersonIds = useMemo(() => new Set(ownerVisiblePeople.map((person) => person.id)), [ownerVisiblePeople]);

  const dailyRows = historyByDay[selectedDay] || [];
  const displayedDailyRows = dailyRows.map((row) => pendingSetRows[row.id] || row);
  const visibleDailyRows = canManage ? displayedDailyRows : displayedDailyRows.filter((row) => visiblePersonIds.has(row.personId));
  const visiblePeople = ownerVisiblePeople;
  const selectedRows = visibleDailyRows.filter((r) => r.personId === selectedPersonId);
  const visibleBlockCenter = canManage
    ? blockCenter
    : blockCenter.filter((item) => {
        const sourcePersonId = getPersonIdFromRowKey(item.sourceRowKey);
        return visiblePersonIds.has(sourcePersonId) || ownerVisiblePeople.some((person) => person.fullName === item.personName);
      });
  const visibleRowKeySet = useMemo(() => new Set(visibleDailyRows.map((row) => row.id)), [visibleDailyRows]);
  const latestVisibleBlockByRowKey = useMemo(() => buildLatestBlockMap(visibleBlockCenter), [visibleBlockCenter]);
  const latestVisibleBlockItems = useMemo(() => Array.from(latestVisibleBlockByRowKey.values()), [latestVisibleBlockByRowKey]);
  const currentDayBlockItems = useMemo(
    () => latestVisibleBlockItems.filter((item) => visibleRowKeySet.has(item.sourceRowKey)),
    [latestVisibleBlockItems, visibleRowKeySet]
  );
  const currentDayBlockByRowKey = useMemo(() => buildLatestBlockMap(currentDayBlockItems), [currentDayBlockItems]);
  const activeUsers = canManage ? users.filter((u) => u.isActive && !u.isDeleted) : users.filter((u) => u.id === currentUser?.id && u.isActive && !u.isDeleted);
  const typingUsers = []; // intentionally disabled; UI stays passive

  const hasUnsavedSetBilgiGirisi = useMemo(() => {
    const count = Number(newAccountCount || 0);
    const selectedNames = newAccountNames.slice(0, count);
    if (editingPersonId) return false;
    const hasNameStarted = newPersonName.trim().length > 0;
    const hasDateChanged = newPersonDate !== TODAY;
    const hasCountChanged = newAccountCount !== '5';
    const hasCustomNames = selectedNames.some((name, index) => (name || '').trim() !== (DEFAULT_ACCOUNT_NAMES[index] || '').trim());
    return hasNameStarted || hasDateChanged || hasCountChanged || hasCustomNames;
  }, [newPersonName, newPersonDate, newAccountCount, newAccountNames, editingPersonId]);

  function hasUnsavedUserPanel() {
    const hasPasswordDraft = Object.values(passwordDrafts).some((value) => String(value || '').trim().length > 0);
    const hasPermissionDraft = Object.keys(userPermissionDrafts).length > 0;
    const hasNewUserDraft =
      String(newUserForm.displayName || '').trim().length > 0 ||
      String(newUserForm.username || '').trim().length > 0 ||
      String(newUserForm.password || '').trim().length > 0;
    return hasPasswordDraft || hasPermissionDraft || hasNewUserDraft;
  }

  function hasUnsavedAny() {
    return (activeSection === 'durum' && Object.keys(pendingSetRows).length > 0) ||
      (activeSection === 'giris' && hasUnsavedSetBilgiGirisi) ||
      (showUsersPanel && hasUnsavedUserPanel());
  }

  function getPanelUser(user) {
    const draft = userPermissionDrafts[user.id];
    if (!draft) return user;
    return { ...user, ...draft };
  }

  function getBlockResultMeta(item) {
    const blockedAmount = getCurrentBlockedAmount(item);
    const totalAmount = Number(item?.amount || 0);
    if (item?.resultList === 'aktif_alindi') return { label: 'AKTİFE ALINDI', className: 'text-teal-700' };
    if (item?.resultList === 'kapandi') return { label: 'KAPANDI', className: 'text-slate-700' };
    if (blockedAmount > 0 && blockedAmount < totalAmount) return { label: 'KISMİ BLOKE', className: 'text-amber-700' };
    if (blockedAmount > 0) return { label: 'ÇÖZÜLMEDİ', className: 'text-rose-700' };
    return { label: 'ÇÖZÜLDÜ', className: 'text-teal-700' };
  }

  const groupedTotals = useMemo(() => {
    const positive = visibleDailyRows.filter((row) => isPositiveStatus(row.status));
    const negativeRows = visibleDailyRows
      .filter((row) => isNegativeStatus(row.status))
      .map((row) => ({
        ...row,
        effectiveAmount: getEffectiveNegativeAmount(row, currentDayBlockByRowKey.get(row.id)),
      }));
    const closedItems = currentDayBlockItems.filter((item) => getBlockLifecycleState(item) === 'closed');
    const activatedItems = currentDayBlockItems.filter((item) => getBlockLifecycleState(item) === 'activated');

    return {
      positiveAmount: positive.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      positiveCount: positive.length,
      negativeAmount: negativeRows.reduce((sum, row) => sum + Number(row.effectiveAmount || 0), 0),
      negativeCount: negativeRows.filter((row) => Number(row.effectiveAmount || 0) > 0).length,
      closedCount: closedItems.length,
      closedAmount: closedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
      activatedCount: activatedItems.length,
      activatedAmount: activatedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    };
  }, [visibleDailyRows, currentDayBlockItems, currentDayBlockByRowKey]);

  const personTotals = useMemo(() => {
    const totalAmount = selectedRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const activeAmount = selectedRows
      .filter((row) => isPositiveStatus(row.status))
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const lockedAmount = selectedRows.reduce(
      (sum, row) => sum + getEffectiveNegativeAmount(row, currentDayBlockByRowKey.get(row.id)),
      0
    );
    return { totalAmount, activeAmount, lockedAmount, totalCount: selectedRows.length };
  }, [selectedRows, currentDayBlockByRowKey]);

  const filteredBlockCenter = useMemo(() => {
    if (!filter.trim()) return latestVisibleBlockItems;
    return latestVisibleBlockItems.filter((b) =>
      `${b.personName} ${b.accountName} ${b.note} ${b.type} ${b.resultList} ${b.resolution}`.toLowerCase().includes(filter.toLowerCase())
    );
  }, [latestVisibleBlockItems, filter]);

  const blockTableRows = useMemo(
    () => filteredBlockCenter.filter((item) => getBlockLifecycleState(item) === 'unresolved'),
    [filteredBlockCenter]
  );

  const blockSummary = useMemo(() => {
    const unresolvedItems = latestVisibleBlockItems.filter((item) => getBlockLifecycleState(item) === 'unresolved');
    const resolvedItems = latestVisibleBlockItems.filter((item) => getBlockLifecycleState(item) === 'resolved');
    const closedItems = latestVisibleBlockItems.filter((item) => getBlockLifecycleState(item) === 'closed');
    const activatedItems = latestVisibleBlockItems.filter((item) => getBlockLifecycleState(item) === 'activated');
    return {
      resolvedCount: resolvedItems.length,
      resolvedAmount: resolvedItems.reduce((sum, item) => sum + getResolvedReleaseAmount(item), 0),
      unresolvedCount: unresolvedItems.length,
      unresolvedAmount: unresolvedItems.reduce((sum, item) => sum + getCurrentBlockedAmount(item), 0),
      closedCount: closedItems.length,
      activatedCount: activatedItems.length,
    };
  }, [latestVisibleBlockItems]);

  const generalSummaryDetails = useMemo(() => ({
    positive: visibleDailyRows.filter((row) => isPositiveStatus(row.status)),
    negative: visibleDailyRows
      .filter((row) => isNegativeStatus(row.status))
      .map((row) => {
        const blockItem = currentDayBlockByRowKey.get(row.id);
        const effectiveAmount = getEffectiveNegativeAmount(row, blockItem);
        if (!effectiveAmount) return null;
        if (!blockItem || effectiveAmount === Number(row.amount || 0)) {
          return { ...row, amount: effectiveAmount };
        }
        return {
          ...row,
          amount: effectiveAmount,
          note: `${row.note || 'Not yok'} - Kalan bloke: ${formatMoney(effectiveAmount)}`,
        };
      })
      .filter(Boolean),
    activated: currentDayBlockItems.filter((item) => getBlockLifecycleState(item) === 'activated'),
    closed: currentDayBlockItems.filter((item) => getBlockLifecycleState(item) === 'closed'),
  }), [visibleDailyRows, currentDayBlockItems, currentDayBlockByRowKey]);

  const chartDailyTrend = useMemo(() => {
    const keys = Object.keys(historyByDay).sort();
    const latestBlockByRowKey = buildLatestBlockMap(visibleBlockCenter);
    return keys.slice(-7).map((day) => {
      const rows = historyByDay[day] || [];
      const active = rows
        .filter((row) => isPositiveStatus(row.status))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const blocked = rows.reduce(
        (sum, row) => sum + getEffectiveNegativeAmount(row, latestBlockByRowKey.get(row.id)),
        0
      );
      return { day: day.slice(5), aktif: active, bloke: blocked };
    });
  }, [historyByDay, visibleBlockCenter]);

  const chartStatusMix = useMemo(() => {
    const rows = visibleDailyRows;
    const getCount = (targetStatus, needsBlockedAmount = false) =>
      rows.filter((row) => {
        const sameStatus = normalizeStatus(row.status, 'pasif') === targetStatus;
        if (!sameStatus) return false;
        if (!needsBlockedAmount) return true;
        return getEffectiveNegativeAmount(row, currentDayBlockByRowKey.get(row.id)) > 0;
      }).length;

    return [
      { name: 'Aktif', value: getCount('aktif') },
      { name: 'NFC', value: getCount('nfc') },
      { name: 'Bloke', value: getCount('bloke', true) },
      { name: 'Şifre Kilit', value: getCount('sifre_kilit', true) },
      { name: 'Pasif', value: getCount('pasif') },
    ];
  }, [visibleDailyRows, currentDayBlockByRowKey]);

  const pieColors = ['#0f766e', '#0891b2', '#e11d48', '#d97706', '#94a3b8'];


function makeRowKey(day, personId, accountName) {
  return `${day}__${personId}__${accountName}`;
}

function getPersonIdFromRowKey(rowKey = '') {
  const parts = String(rowKey || '').split('__');
  return parts.length >= 3 ? parts[1] : '';
}

function normalizeUserRecord(row) {
  if (!row) return null;
  const username = row.username || '';
  const displayName = row.display_name || row.displayName || username.toUpperCase();
  const isDeleted = Boolean(row.is_deleted ?? row.isDeleted ?? false) || username.startsWith('__deleted__') || displayName.includes('(SİLİNDİ)');
  return {
    ...row,
    id: row.id,
    username,
    password: row.password || '',
    displayName,
    role: row.role || 'user',
    isActive: row.is_active ?? row.isActive ?? true,
    canEnterData: row.can_enter_data ?? row.canEnterData ?? true,
    isDeleted,
  };
}

function buildPeopleFromDb(peopleRows = [], accountRows = []) {
  const grouped = {};
  accountRows.forEach((row) => {
    if (!grouped[row.person_id]) grouped[row.person_id] = [];
    grouped[row.person_id].push(row);
  });
  return [...peopleRows]
    .sort((a, b) => String(a.full_name || '').localeCompare(String(b.full_name || '')))
    .map((row) => ({
      id: row.id,
      fullName: row.full_name,
      startDate: row.start_date || TODAY,
      createdByUserId: row.created_by || '',
      accountNames: (grouped[row.id] || [])
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((acc) => acc.bank_name),
    }));
}

function buildZeroRowsForPeople(peopleList = [], day = TODAY) {
  return peopleList.flatMap((person) =>
    (person.accountNames || []).map((accountName, index) => ({
      id: makeRowKey(day, person.id, accountName),
      personId: person.id,
      personName: person.fullName,
      accountName,
      amount: 0,
      status: 'pasif',
      note: '',
      editedBy: '',
      editedAt: '',
    }))
  );
}

function buildHistoryFromDb(transactionRows = [], peopleList = []) {
  const next = {};
  transactionRows.forEach((row) => {
    const day = row.day || TODAY;
    if (!next[day]) next[day] = [];
    next[day].push({
      id: row.row_key || makeRowKey(day, row.person_id, row.account_name),
      personId: row.person_id,
      personName: row.person_name,
      accountName: row.account_name,
      amount: Number(row.amount || 0),
      status: normalizeStatus(row.status, 'pasif'),
      note: row.note || '',
      editedBy: row.edited_by || '',
      editedAt: row.edited_at || '',
    });
  });
  if (!Object.keys(next).length) next[TODAY] = buildZeroRowsForPeople(peopleList, TODAY);
  return next;
}

function normalizeBlockRecord(row) {
  return {
    id: row.id,
    sourceRowKey: row.source_row_key || '',
    date: row.date || TODAY,
    personName: row.person_name || '',
    accountName: row.account_name || '',
    amount: Number(row.amount || 0),
    type: normalizeBlockedStatus(row.type),
    note: row.note || '',
    resolution: row.resolution || 'cozulmedi',
    resultList: row.result_list || 'merkez',
    resolvedAmount: Number(row.resolved_amount || 0),
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
  };
}

async function loadUsersFromDb() {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const normalized = (data || [])
    .map(normalizeUserRecord)
    .filter((user) => user.isActive && !user.isDeleted);
  setUsers(normalized);
  return normalized;
}

async function loadBanksFromDb() {
  const { data, error } = await supabase.from('banks').select('*').order('name', { ascending: true });
  if (error) throw error;
  const names = (data || []).map((row) => row.name).filter(Boolean);
  setBankList(names.length ? names : DEFAULT_BANKS);
  return names.length ? names : DEFAULT_BANKS;
}

async function loadSupabaseAppData() {
  setAppLoading(true);
  try {
    const [usersRes, banksRes, peopleRes, accountsRes, txRes, blocksRes] = await Promise.all([
      supabase.from('users').select('*').eq('is_active', true).order('created_at', { ascending: true }),
      supabase.from('banks').select('*').order('name', { ascending: true }),
      supabase.from('people').select('*').order('created_at', { ascending: true }),
      supabase.from('accounts').select('*').order('sort_order', { ascending: true }),
      supabase.from('transactions').select('*').order('day', { ascending: true }),
      supabase.from('blocks').select('*').order('created_at', { ascending: false }),
    ]);
    if (usersRes.error) throw usersRes.error;
    if (banksRes.error && banksRes.error.code !== 'PGRST116') throw banksRes.error;
    if (peopleRes.error) throw peopleRes.error;
    if (accountsRes.error) throw accountsRes.error;
    if (txRes.error) throw txRes.error;
    if (blocksRes.error) throw blocksRes.error;

    const nextUsers = (usersRes.data || [])
      .map(normalizeUserRecord)
      .filter((user) => user.isActive && !user.isDeleted);
    const nextBanks = (banksRes.data || []).map((row) => row.name).filter(Boolean);
    const nextPeople = buildPeopleFromDb(peopleRes.data || [], accountsRes.data || []);
    const nextBlocks = (blocksRes.data || []).map(normalizeBlockRecord);
    const nextHistory = applyLatestBlockStateToHistory(buildHistoryFromDb(txRes.data || [], nextPeople), nextBlocks);

    setUsers(nextUsers);
    setBankList(nextBanks.length ? nextBanks : DEFAULT_BANKS);
    setPeople(nextPeople);
    setHistoryByDay(nextHistory);
    setSelectedDay((prev) => (prev && nextHistory[prev] ? prev : getLatestHistoryDay(nextHistory)));
    setBlockCenter(nextBlocks);
    return { users: nextUsers, banks: nextBanks, people: nextPeople, history: nextHistory, blocks: nextBlocks };
  } finally {
    setAppLoading(false);
  }
}

  function handleExportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('SET YONETIM PANELI RAPORU', 14, 20);
    doc.setFontSize(11);
    doc.text(`Rapor Gunu: ${selectedDay}`, 14, 32);
    doc.text(`Aktif + NFC Bakiye: ${formatMoney(groupedTotals.positiveAmount)}`, 14, 42);
    doc.text(`Bloke + Sifre Kilit: ${formatMoney(groupedTotals.negativeAmount)}`, 14, 52);
    doc.text(`Aktife Alinan Hesaplar: ${groupedTotals.activatedCount}`, 14, 62);
    doc.text(`Kapanan Hesaplar: ${groupedTotals.closedCount}`, 14, 72);
    doc.text('Durum: Aktif veri girişi yok', 14, 84);

    let y = 100;
    selectedRows.forEach((row, idx) => {
      const line = `${idx + 1}. ${row.accountName} | ${formatMoney(row.amount)} | ${STATUS_META[row.status]?.label || row.status} | ${row.editedBy || '-'}`;
      doc.text(line, 14, y);
      y += 8;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });

    doc.save(`set-yonetim-paneli-${selectedDay}.pdf`);
  }

  function handleExportExcel() {
    const rows = visibleDailyRows.map((row) => ({
      Sahis: row.personName,
      Hesap: row.accountName,
      Tutar: Number(row.amount || 0),
      Durum: STATUS_META[row.status]?.label || row.status,
      Not: row.note || '',
      Duzenleyen: row.editedBy || '',
      Tarih: row.editedAt || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Set Durumu');
    XLSX.writeFile(workbook, `set-yonetim-paneli-${selectedDay}.xlsx`);
  }

  function handleBlockExportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('BLOKE MERKEZI RAPORU', 14, 20);

    if (blockTableRows.length === 0) {
      doc.setFontSize(11);
      doc.text('Kayit yok.', 14, 32);
      doc.save(`bloke-merkezi-${selectedDay}.pdf`);
      return;
    }

    doc.setFontSize(11);
    let y = 34;
    blockTableRows.forEach((item, index) => {
      const line = `${index + 1}. ${item.personName} | ${item.accountName} | ${formatMoney(getCurrentBlockedAmount(item))} | ${STATUS_META[item.type]?.label || item.type} | ${item.resolution}`;
      doc.text(line, 14, y);
      y += 8;
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
    });
    doc.save(`bloke-merkezi-${selectedDay}.pdf`);
  }

  function handleBlockExportExcel() {
    const rows = blockTableRows.map((item) => ({
      Tarih: item.date,
      Sahis: item.personName,
      Hesap: item.accountName,
      Tutar: Number(getCurrentBlockedAmount(item) || 0),
      Durum: STATUS_META[item.type]?.label || item.type,
      Not: item.note || '',
      Cozum: item.resolution,
      Sonuc: item.resultList,
      Olusturan: item.createdBy || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Bloke Merkezi');
    XLSX.writeFile(workbook, `bloke-merkezi-${selectedDay}.xlsx`);
  }

  function showActionNotice(title, message, tone = 'success') {
    setActionNotice({ open: true, title, message, tone });
    window.clearTimeout(window.__setPanelNoticeTimer);
    window.__setPanelNoticeTimer = window.setTimeout(() => {
      setActionNotice((prev) => ({ ...prev, open: false }));
    }, 3000);
  }

  function ensureDay(day) {
    if (historyByDay[day]) return;
    setHistoryByDay((prev) => ({
      ...prev,
      [day]: buildZeroRowsForPeople(people, day),
    }));
  }

async function startNewDay() {
  const today = getTurkeyNow().date;
  if (historyByDay[today]) {
    setSelectedDay(today);
    showActionNotice('Bilgi', 'Zaten güncel gündesiniz.');
    return;
  }

  const sourceRows = historyByDay[selectedDay] || buildZeroRowsForPeople(people, selectedDay);
  const nextDayRows = sourceRows.map((row) => {
    const normalizedStatus = normalizeStatus(row.status, 'pasif');
    return {
      ...row,
      id: makeRowKey(today, row.personId, row.accountName),
      amount: normalizedStatus === 'aktif' ? 0 : Number(row.amount || 0),
      status: normalizedStatus,
      note: row.note || '',
      editedBy: '',
      editedAt: '',
    };
  });

  try {
    setAppLoading(true);
    const payload = nextDayRows.map((row) => ({
      row_key: makeRowKey(today, row.personId, row.accountName),
      day: today,
      person_id: row.personId,
      person_name: row.personName,
      account_name: row.accountName,
      amount: Number(row.amount || 0),
      status: row.status,
      note: row.note || '',
      edited_by: '',
      edited_at: '',
    }));
    if (payload.length) {
      const { error } = await supabase.from('transactions').upsert(payload, { onConflict: 'row_key' });
      if (error) throw error;
    }
    await loadSupabaseAppData();
    setPendingSetRows({});
    setSelectedDay(today);
    showActionNotice('Yeni gün oluşturuldu', 'Yeni güne geçildi. Aktif bakiyeler sıfırlandı, diğer kayıtlar devralındı.');
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Yeni gün oluşturulamadı.', 'danger');
  } finally {
    setAppLoading(false);
  }
}


  async function handleLogin() {
    setAppLoading(true);
    try {
      const username = String(login.username || '').trim().toLowerCase();
      const password = String(login.password || '').trim();
      if (!username || !password) {
        showActionNotice('Hata', 'Kullanıcı adı ve şifre zorunludur.', 'danger');
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .maybeSingle();

      if (error || !data) {
        showActionNotice('Hata', 'Giriş bilgileri hatalı.', 'danger');
        return;
      }

      const savedPassword = String(data.password || '').trim();
      if (savedPassword !== password) {
        showActionNotice('Hata', 'Giriş bilgileri hatalı.', 'danger');
        return;
      }

      const normalizedUser = normalizeUserRecord(data);
      if (normalizedUser.isDeleted) {
        showActionNotice('Hata', 'Bu kullanıcı silinmiş durumda.', 'danger');
        return;
      }
      if (!normalizedUser.isActive) {
        showActionNotice('Hata', 'Bu kullanıcı pasif durumda.', 'danger');
        return;
      }

      setCurrentUser(normalizedUser);
      try {
        window.localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(normalizedUser));
        window.history.replaceState({}, '', window.location.pathname);
      } catch {}
      await loadSupabaseAppData();
    } catch (err) {
      showActionNotice('Hata', err?.message || 'Giriş sırasında hata oluştu.', 'danger');
    } finally {
      setAppLoading(false);
    }
  }

  function updateRow(rowId, key, value) {
    if (!currentUser) return;
    if (!currentUser.canEnterData && currentUser.role !== 'admin') {
      showActionNotice('Yetki yok', 'Veri giriş yetkiniz yok.', 'danger');
      return;
    }

    const currentRow = (historyByDay[selectedDay] || []).find((row) => row.id === rowId);
    const baseRow = pendingSetRows[rowId] || currentRow;
    if (!baseRow) return;
    const nextValue = key === 'status' ? normalizeStatus(value, 'pasif') : value;

    setPendingSetRows((prev) => ({
      ...prev,
      [rowId]: {
        ...baseRow,
        [key]: nextValue,
        editedBy: currentUser.displayName,
        editedAt: getTurkeyNow().dateTime,
      },
    }));
  }

async function saveSetDurumu() {
  const now = getTurkeyNow();
  if (!currentUser) return;
  if (Object.keys(pendingSetRows).length === 0) {
    showActionNotice('Bilgi', 'Kaydedilecek değişiklik yok.');
    return;
  }

  const newBlockItems = [];
  const nextRows = (historyByDay[selectedDay] || []).map((row) => {
    const nextRow = pendingSetRows[row.id];
    if (!nextRow) return row;

    const previousStatus = normalizeStatus(row.status, 'pasif');
    const nextStatus = normalizeStatus(nextRow.status, 'pasif');
    const wasBlockedBefore = previousStatus === 'bloke' || previousStatus === 'sifre_kilit';
    const isBlockedNow = nextStatus === 'bloke' || nextStatus === 'sifre_kilit';
    const sourceRowKey = makeRowKey(selectedDay, nextRow.personId, nextRow.accountName);
    if (!wasBlockedBefore && isBlockedNow) {
      const exists = blockCenter.some((b) => b.sourceRowKey === sourceRowKey && b.resultList === 'merkez');
      if (!exists) {
        newBlockItems.push({
          sourceRowKey,
          date: selectedDay,
          personName: nextRow.personName,
          accountName: nextRow.accountName,
          amount: Number(nextRow.amount || 0),
          type: normalizeBlockedStatus(nextStatus),
          note: nextRow.note || '',
          resolution: 'cozulmedi',
          resultList: 'merkez',
          resolvedAmount: 0,
          createdBy: currentUser.displayName,
        });
      }
    }

    return {
      ...nextRow,
      status: nextStatus,
      editedBy: nextRow.editedBy || currentUser.displayName,
      editedAt: nextRow.editedAt || now.dateTime,
    };
  });

  const txPayload = nextRows.map((row) => ({
    row_key: makeRowKey(selectedDay, row.personId, row.accountName),
    day: selectedDay,
    person_id: row.personId,
    person_name: row.personName,
    account_name: row.accountName,
    amount: Number(row.amount || 0),
    status: normalizeStatus(row.status, 'pasif'),
    note: row.note || '',
    edited_by: row.editedBy || currentUser.displayName,
    edited_at: row.editedAt || now.dateTime,
  }));

  try {
    setAppLoading(true);
    const { error: txError } = await supabase.from('transactions').upsert(txPayload, { onConflict: 'row_key' });
    if (txError) throw txError;

    if (newBlockItems.length) {
      const blockPayload = newBlockItems.map((item) => ({
        source_row_key: item.sourceRowKey,
        date: item.date,
        person_name: item.personName,
        account_name: item.accountName,
        amount: Number(item.amount || 0),
        type: normalizeBlockedStatus(item.type),
        note: item.note || '',
        resolution: item.resolution,
        result_list: item.resultList,
        resolved_amount: Number(item.resolvedAmount || 0),
        created_by: item.createdBy,
      }));
      const { error: blockError } = await supabase.from('blocks').insert(blockPayload);
      if (blockError) throw blockError;
    }

    await loadSupabaseAppData();
    setPendingSetRows({});
    setNavigationWarningOpen(false);

    if (pendingSection) {
      if (pendingSection === 'logout') {
        setPendingSection(null);
        try {
          window.localStorage.removeItem(STORAGE_CURRENT_USER);
          window.history.replaceState({}, '', window.location.pathname);
        } catch {}
        setCurrentUser(null);
      } else {
        setActiveSection(pendingSection);
        setPendingSection(null);
      }
    } else {
      setActiveSection('genel');
    }

    showActionNotice('Kaydedildi', 'Set durumu Supabase veritabanına kaydedildi.');
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Set durumu kaydedilemedi.', 'danger');
  } finally {
    setAppLoading(false);
  }
}


  function handleSectionChange(nextSection) {
    if (nextSection === activeSection) return;

    if (activeSection === 'durum' && Object.keys(pendingSetRows).length > 0) {
      setPendingSection(nextSection);
      setNavigationWarningMessage('Lütfen girdiğiniz verileri kaydedin.');
      setNavigationWarningOpen(true);
      return;
    }

    if (activeSection === 'giris' && hasUnsavedSetBilgiGirisi) {
      setPendingSection(nextSection);
      setNavigationWarningMessage('Lütfen şahıs bilgilerini ve tüm hesap isimlerini kaydedin.');
      setNavigationWarningOpen(true);
      return;
    }

    setActiveSection(nextSection);
  }

  function handleLogout() {
    if (showUsersPanel && hasUnsavedUserPanel()) {
      showActionNotice('Kaydetmeden çıkamazsınız', 'Önce kullanıcı panelindeki değişiklikleri kaydedin.', 'danger');
      return;
    }
    if (hasUnsavedAny()) {
      setPendingSection('logout');
      setNavigationWarningMessage('Lütfen girdiğiniz verileri kaydedin.');
      setNavigationWarningOpen(true);
      return;
    }
    try {
      window.localStorage.removeItem(STORAGE_CURRENT_USER);
      window.history.replaceState({}, '', window.location.pathname);
    } catch {}
    setCurrentUser(null);
  }

async function saveUserPanelChanges() {
  if (!canManage) return false;

  try {
    setAppLoading(true);
    const updatedNames = [];

    const draftIds = new Set([
      ...Object.keys(passwordDrafts),
      ...Object.keys(userPermissionDrafts),
    ]);

    for (const userId of draftIds) {
      const targetUser = users.find((u) => u.id === userId);
      if (!targetUser) continue;
      const permissionDraft = userPermissionDrafts[userId] || {};
      const nextPassword = String(passwordDrafts[userId] || '').trim();
      const payload = {
        username: targetUser.username,
        password: nextPassword || targetUser.password,
        role: targetUser.role,
        display_name: targetUser.displayName,
        is_active: permissionDraft.isActive ?? targetUser.isActive,
        can_enter_data: permissionDraft.canEnterData ?? targetUser.canEnterData,
      };
      const { error } = await supabase.from('users').update(payload).eq('id', userId);
      if (error) throw error;
      updatedNames.push(targetUser.displayName);
    }

    const hasNewUserDraft =
      String(newUserForm.displayName || '').trim().length > 0 ||
      String(newUserForm.username || '').trim().length > 0 ||
      String(newUserForm.password || '').trim().length > 0;
    let createdUserName = '';

    if (hasNewUserDraft) {
      const displayName = newUserForm.displayName.trim().toUpperCase();
      const username = newUserForm.username.trim().toLowerCase();
      const password = newUserForm.password.trim();

      if (!displayName || !username || !password) {
        showActionNotice('Hata', 'Yeni kullanıcı formunu tamamlamadan devam edemezsiniz.', 'danger');
        return false;
      }

      if (users.some((u) => u.username.toLowerCase() === username)) {
        showActionNotice('Hata', 'Bu kullanıcı adı zaten kullanılıyor.', 'danger');
        return false;
      }

      const { error } = await supabase.from('users').insert({
        username,
        password,
        role: newUserForm.role,
        display_name: displayName,
        is_active: true,
        can_enter_data: true,
      });
      if (error) throw error;
      createdUserName = displayName;
      setNewUserForm({ displayName: '', username: '', password: '', role: 'user' });
    }

    await loadUsersFromDb();
    setPasswordDrafts({});
    setUserPermissionDrafts({});

    if (updatedNames.length > 0 && createdUserName) {
      showActionNotice('Kullanıcı bölümü kaydedildi', `${updatedNames.length} şifre güncellendi ve ${createdUserName} eklendi.`);
    } else if (updatedNames.length > 0) {
      showActionNotice('Şifreler kaydedildi', `${updatedNames.length} kullanıcı için şifre güncellendi.`);
    } else if (createdUserName) {
      showActionNotice('Kullanıcı oluşturuldu', `${createdUserName} eklendi.`);
    }

    return true;
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Kullanıcı değişiklikleri kaydedilemedi.', 'danger');
    return false;
  } finally {
    setAppLoading(false);
  }
}


  async function handleWarningSaveAndContinue() {
    if (showUsersPanel && hasUnsavedUserPanel()) {
      const ok = await saveUserPanelChanges();
      if (!ok) return;

      setNavigationWarningOpen(false);
      if (pendingSection === 'logout') {
        setPendingSection(null);
        setShowUsersPanel(false);
        setCurrentUser(null);
        return;
      }
      if (pendingSection === 'close_users_panel' || !pendingSection) {
        setPendingSection(null);
        setShowUsersPanel(false);
        return;
      }
      setShowUsersPanel(false);
      setActiveSection(pendingSection);
      setPendingSection(null);
      return;
    }

    if (activeSection === 'giris') {
      await addOrUpdatePerson();
      return;
    }

    await saveSetDurumu();
  }

  function discardPendingChangesAndNavigate() {
    setPendingSetRows({});
    setNavigationWarningOpen(false);
    if (pendingSection === 'logout') {
      setPendingSection(null);
      setCurrentUser(null);
      return;
    }
    if (pendingSection) {
      setActiveSection(pendingSection);
      setPendingSection(null);
    }
  }

  async function sendNotification() {
    if (!canManage) return;
    const message = 'Verileri 00.00’dan önce girin.';
    const timeText = getTurkeyNow().dateTime;
    setNotifyFlash(true);
    setNotificationModalOpen(true);
    setTimeout(() => setNotifyFlash(false), 5000);

    try {
      if ('Notification' in window) {
        let permission = Notification.permission;
        if (permission === 'default') permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification('Veri Giriş Uyarısı', {
            body: `${message} • ${timeText}`,
            requireInteraction: true,
          });
        }
      }
    } catch {}
  }

  function resetPersonForm() {
    setEditingPersonId(null);
    setNewPersonName('');
    setNewPersonDate(TODAY);
    setNewAccountCount('5');
    setNewAccountNames(DEFAULT_ACCOUNT_NAMES);
  }

async function addCustomBank() {
  if (!canManage) return;
  const name = newBankName.trim();
  if (!name) return showActionNotice('Hata', 'Banka adı girin.', 'danger');
  if (bankList.some((bank) => bank.toLowerCase() === name.toLowerCase())) {
    return showActionNotice('Hata', 'Bu banka zaten listede var.', 'danger');
  }
  try {
    const { error } = await supabase.from('banks').insert({ name });
    if (error) throw error;
    await loadBanksFromDb();
    setNewBankName('');
    showActionNotice('Banka eklendi', `${name} listeye eklendi.`);
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Banka eklenemedi.', 'danger');
  }
}

async function removeCustomBank(bankName) {
  if (!canManage) return;
  try {
    const { error } = await supabase.from('banks').delete().eq('name', bankName);
    if (error) throw error;
    await loadBanksFromDb();
    setNewAccountNames((prev) => prev.filter((bank) => bank !== bankName));
    showActionNotice('Banka silindi', `${bankName} listeden kaldırıldı.`, 'danger');
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Banka silinemedi.', 'danger');
  }
}


  async function addOrUpdatePerson() {
    if (!newPersonName.trim()) return showActionNotice('Hata', 'Ad soyad zorunlu.', 'danger');
    if (!newPersonDate) return showActionNotice('Hata', 'Tarih zorunlu.', 'danger');

    const count = Number(newAccountCount || 0);
    const finalNames = newAccountNames.slice(0, count).map((name) => name.trim());
    if (finalNames.length !== count || finalNames.some((name) => !name)) {
      return showActionNotice('Hata', 'Seçtiğiniz hesap sayısı kadar banka seçmek zorunlu.', 'danger');
    }

    const nextFullName = newPersonName.trim().toUpperCase();

    try {
      setAppLoading(true);

      if (editingPersonId) {
        const original = people.find((p) => p.id === editingPersonId);
        if (!original) {
          showActionNotice('Hata', 'Düzenlenecek set bulunamadı.', 'danger');
          return;
        }

        const { error: peopleError } = await supabase
          .from('people')
          .update({ full_name: nextFullName, start_date: newPersonDate })
          .eq('id', editingPersonId);
        if (peopleError) throw peopleError;

        const { error: deleteAccountsError } = await supabase.from('accounts').delete().eq('person_id', editingPersonId);
        if (deleteAccountsError) throw deleteAccountsError;

        const accountPayload = finalNames.map((bankName, index) => ({
          person_id: editingPersonId,
          bank_name: bankName,
          sort_order: index + 1,
        }));
        if (accountPayload.length) {
          const { error: insertAccountsError } = await supabase.from('accounts').insert(accountPayload);
          if (insertAccountsError) throw insertAccountsError;
        }

        const rebuiltTransactions = [];
        Object.keys(historyByDay).forEach((day) => {
          finalNames.forEach((accountName, index) => {
            const previousAccountName = original.accountNames[index] || accountName;
            const oldRow = (historyByDay[day] || []).find(
              (row) => row.personId === editingPersonId && row.accountName === previousAccountName
            );
            rebuiltTransactions.push({
              row_key: makeRowKey(day, editingPersonId, accountName),
              day,
              person_id: editingPersonId,
              person_name: nextFullName,
              account_name: accountName,
              amount: Number(oldRow?.amount || 0),
              status: normalizeStatus(oldRow?.status, 'pasif'),
              note: oldRow?.note || '',
              edited_by: oldRow?.editedBy || '',
              edited_at: oldRow?.editedAt || '',
            });
          });
        });

        const { error: deleteTxError } = await supabase.from('transactions').delete().eq('person_id', editingPersonId);
        if (deleteTxError) throw deleteTxError;
        if (rebuiltTransactions.length) {
          const { error: insertTxError } = await supabase.from('transactions').insert(rebuiltTransactions);
          if (insertTxError) throw insertTxError;
        }

        const { data: blocksData, error: blocksFetchError } = await supabase
          .from('blocks')
          .select('*')
          .eq('person_name', original.fullName);
        if (blocksFetchError) throw blocksFetchError;
        for (const block of blocksData || []) {
          const previousIndex = original.accountNames.findIndex((name) => name === block.account_name);
          const mappedAccountName = finalNames[previousIndex] || finalNames[0] || block.account_name;
          const { error: blockUpdateError } = await supabase
            .from('blocks')
            .update({
              person_name: nextFullName,
              account_name: mappedAccountName,
              source_row_key: block.date ? makeRowKey(block.date, editingPersonId, mappedAccountName) : block.source_row_key,
            })
            .eq('id', block.id);
          if (blockUpdateError) throw blockUpdateError;
        }

        await loadSupabaseAppData();
        resetPersonForm();
        showActionNotice('Güncellendi', 'Set bilgileri Supabase üzerinde güncellendi.');
        return;
      }

      const { data: personInsert, error: personError } = await supabase
        .from('people')
        .insert({
          full_name: nextFullName,
          start_date: newPersonDate,
          created_by: currentUser?.id || null,
        })
        .select()
        .single();
      if (personError) throw personError;

      const personId = personInsert.id;
      const accountPayload = finalNames.map((bankName, index) => ({
        person_id: personId,
        bank_name: bankName,
        sort_order: index + 1,
      }));
      if (accountPayload.length) {
        const { error: accountsError } = await supabase.from('accounts').insert(accountPayload);
        if (accountsError) throw accountsError;
      }

      const transactionPayload = finalNames.map((accountName) => ({
        row_key: makeRowKey(selectedDay, personId, accountName),
        day: selectedDay,
        person_id: personId,
        person_name: nextFullName,
        account_name: accountName,
        amount: 0,
        status: 'pasif',
        note: '',
        edited_by: '',
        edited_at: '',
      }));
      if (transactionPayload.length) {
        const { error: txError } = await supabase.from('transactions').insert(transactionPayload);
        if (txError) throw txError;
      }

      await loadSupabaseAppData();
      setSelectedPersonId(personId);
      resetPersonForm();
      showActionNotice('Kaydedildi', 'Yeni set Supabase veritabanına eklendi.');
    } catch (err) {
      showActionNotice('Hata', err?.message || 'Set kaydedilemedi.', 'danger');
    } finally {
      setAppLoading(false);
    }
  }

  function beginEditPerson(personId) {
    const person = people.find((p) => p.id === personId);
    if (!person) return;
    setEditingPersonId(person.id);
    setNewPersonName(person.fullName);
    setNewPersonDate(person.startDate || TODAY);
    setNewAccountCount(String(person.accountNames.length));
    setNewAccountNames([...person.accountNames]);
    setActiveSection('giris');
  }

async function confirmDeleteSet() {
  if (!deleteSetTarget) return;
  const targetId = deleteSetTarget.id;
  const targetName = deleteSetTarget.fullName;

  try {
    setAppLoading(true);
    const { error: blocksError } = await supabase.from('blocks').delete().eq('person_name', targetName);
    if (blocksError) throw blocksError;
    const { error: txError } = await supabase.from('transactions').delete().eq('person_id', targetId);
    if (txError) throw txError;
    const { error: accountsError } = await supabase.from('accounts').delete().eq('person_id', targetId);
    if (accountsError) throw accountsError;
    const { error: peopleError } = await supabase.from('people').delete().eq('id', targetId);
    if (peopleError) throw peopleError;
    await loadSupabaseAppData();
    if (selectedPersonId === targetId) setSelectedPersonId('');
    setDeleteSetTarget(null);
    showActionNotice('Set silindi', `${targetName} kaldırıldı.`, 'danger');
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Set silinemedi.', 'danger');
  } finally {
    setAppLoading(false);
  }
}


  function addBankField() {
    const count = Math.min(20, Number(newAccountCount || 0) + 1);
    setNewAccountCount(String(count));
    setNewAccountNames((prev) => {
      const next = [...prev];
      while (next.length < count) next.push(bankList[(next.length) % Math.max(bankList.length, 1)] || '');
      return next.slice(0, count);
    });
  }

  function removeBankField(index) {
    const count = Number(newAccountCount || 0);
    if (count <= 1) return;
    setNewAccountNames((prev) => prev.filter((_, i) => i !== index));
    setNewAccountCount(String(count - 1));
  }

  function toggleUser(userId, key) {
    if (!canManage) return;
    setUserPermissionDrafts((prev) => {
      const sourceUser = users.find((u) => u.id === userId);
      if (!sourceUser) return prev;
      const currentDraft = prev[userId] || { isActive: sourceUser.isActive, canEnterData: sourceUser.canEnterData };
      return {
        ...prev,
        [userId]: { ...currentDraft, [key]: !currentDraft[key] },
      };
    });
  }

async function saveUserRow(userId) {
  if (!canManage) return;
  const nextPassword = String(passwordDrafts[userId] || '').trim();
  const permissionDraft = userPermissionDrafts[userId];
  const targetUser = users.find((u) => u.id === userId);
  if (!targetUser) return showActionNotice('Hata', 'Kullanıcı bulunamadı.', 'danger');

  if (!nextPassword && !permissionDraft) {
    showActionNotice('Bilgi', 'Kaydedilecek değişiklik yok.');
    return;
  }

  try {
    setAppLoading(true);
    const payload = {
      password: nextPassword || targetUser.password,
      role: targetUser.role,
      username: targetUser.username,
      display_name: targetUser.displayName,
      is_active: permissionDraft?.isActive ?? targetUser.isActive,
      can_enter_data: permissionDraft?.canEnterData ?? targetUser.canEnterData,
    };
    const { error } = await supabase.from('users').update(payload).eq('id', userId);
    if (error) throw error;
    await loadUsersFromDb();
    setPasswordDrafts((prev) => ({ ...prev, [userId]: '' }));
    setUserPermissionDrafts((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    showActionNotice('Kaydedildi', `${targetUser.displayName} için değişiklikler kaydedildi.`);
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Kullanıcı güncellenemedi.', 'danger');
  } finally {
    setAppLoading(false);
  }
}


  function deleteUser(userId) {
    if (!canManage) return;
    const user = users.find((u) => u.id === userId);
    if (!user) {
      showActionNotice('İşlem başarısız', 'Kullanıcı bulunamadı.', 'danger');
      return;
    }
    if (user.role === 'admin') {
      showActionNotice('İşlem engellendi', 'Yönetici kullanıcı silinemez.', 'danger');
      return;
    }
    setDeleteTargetUser(user);
  }

async function confirmDeleteUser() {
  if (!deleteTargetUser) return;
  const targetId = deleteTargetUser.id;
  const targetName = deleteTargetUser.displayName;

  try {
    setAppLoading(true);

    const targetUser = users.find((u) => u.id === targetId);
    if (!targetUser) throw new Error('Kullanıcı bulunamadı.');

    const payload = {
      username: targetUser.username,
      password: targetUser.password,
      role: targetUser.role,
      display_name: targetUser.displayName,
      is_active: false,
      can_enter_data: false,
    };

    const { error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', targetId);

    if (error) throw error;

    const refreshedUsers = await loadUsersFromDb();
    const stillVisible = (refreshedUsers || []).some((u) => u.id === targetId);
    if (stillVisible) {
      throw new Error('Kullanıcı veritabanında pasiflenemedi.');
    }

    setUsers((prev) => prev.filter((u) => u.id !== targetId));
    setUserPermissionDrafts((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setPasswordDrafts((prev) => {
      const next = { ...prev };
      delete next[targetId];
      return next;
    });
    setDeleteTargetUser(null);
    showActionNotice('Kullanıcı silindi', `${targetName} listeden kaldırıldı.`, 'danger');
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Kullanıcı silinemedi.', 'danger');
  } finally {
    setAppLoading(false);
  }
}

async function createNewUser() {
  if (!canManage) return;
  const displayName = newUserForm.displayName.trim().toUpperCase();
  const username = newUserForm.username.trim().toLowerCase();
  const password = newUserForm.password.trim();
  if (!displayName || !username || !password) {
    return showActionNotice('Hata', 'Yeni kullanıcı için ad, kullanıcı adı ve şifre zorunludur.', 'danger');
  }
  if (users.some((u) => u.username.toLowerCase() === username)) {
    return showActionNotice('Hata', 'Bu kullanıcı adı zaten kullanılıyor.', 'danger');
  }
  try {
    setAppLoading(true);
    const { error } = await supabase.from('users').insert({
      username,
      password,
      role: newUserForm.role,
      display_name: displayName,
      is_active: true,
      can_enter_data: true,
    });
    if (error) throw error;
    await loadUsersFromDb();
    setNewUserForm({ displayName: '', username: '', password: '', role: 'user' });
    showActionNotice('Kullanıcı oluşturuldu', `${displayName} eklendi.`);
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Kullanıcı oluşturulamadı.', 'danger');
  } finally {
    setAppLoading(false);
  }
}


  function openBlockResolution(item) {
    if (!canManage) return showActionNotice('Yetki yok', 'Bloke merkezini sadece yönetici düzenleyebilir.', 'danger');
    setSelectedBlockItem(item);
    setResolvedAmountInput(item.resolvedAmount ? String(item.resolvedAmount) : String(item.amount || 0));
    setShowResolvedAmountInput(false);
    setPendingResolveMode('cozuldu');
    setBlockDialogOpen(true);
  }

async function setBlockAsResolved(mode = 'cozuldu') {
  if (!selectedBlockItem) return;
  if (mode !== 'cozulmedi' && !showResolvedAmountInput) {
    setPendingResolveMode(mode);
    setShowResolvedAmountInput(true);
    return;
  }

  const finalResolvedAmount = Number(resolvedAmountInput || 0);
  const now = getTurkeyNow();
  let payload;
  if (mode === 'aktif_alindi') payload = { resolution: 'cozuldu', result_list: 'aktif_alindi', resolved_amount: 0 };
  else if (mode === 'kapandi') payload = { resolution: 'cozuldu', result_list: 'kapandi', resolved_amount: 0 };
  else if (mode === 'cozulmedi') payload = { resolution: 'cozulmedi', result_list: 'merkez', resolved_amount: 0 };
  else payload = { resolution: Number(finalResolvedAmount || 0) > 0 ? 'cozuldu' : 'cozuldu', result_list: 'merkez', resolved_amount: Math.max(0, Number(finalResolvedAmount || 0)) };

  try {
    setAppLoading(true);
    const { error } = await supabase.from('blocks').update(payload).eq('id', selectedBlockItem.id);
    if (error) throw error;

    if (selectedBlockItem.sourceRowKey) {
      const blockedStatus = normalizeBlockedStatus(selectedBlockItem.type);
      let txPatch = {
        edited_by: currentUser?.displayName || selectedBlockItem.createdBy || '',
        edited_at: now.dateTime,
      };

      if (mode === 'aktif_alindi') {
        txPatch = { ...txPatch, status: 'aktif' };
      } else if (mode === 'kapandi') {
        txPatch = { ...txPatch, status: 'pasif', amount: 0 };
      } else if (mode === 'cozulmedi') {
        txPatch = { ...txPatch, status: blockedStatus };
      } else {
        const isFullyResolved = Math.max(0, Number(finalResolvedAmount || 0)) >= Number(selectedBlockItem.amount || 0);
        txPatch = { ...txPatch, status: isFullyResolved ? 'aktif' : blockedStatus };
      }

      const { error: txError } = await supabase.from('transactions').update(txPatch).eq('row_key', selectedBlockItem.sourceRowKey);
      if (txError) throw txError;
    }

    await loadSupabaseAppData();
    setBlockDialogOpen(false);
    setSelectedBlockItem(null);
    setResolvedAmountInput('');
    setShowResolvedAmountInput(false);
    setPendingResolveMode('cozuldu');
    showActionNotice('Güncellendi', 'Bloke kaydı Supabase üzerinde güncellendi.');
  } catch (err) {
    showActionNotice('Hata', err?.message || 'Bloke kaydı güncellenemedi.', 'danger');
  } finally {
    setAppLoading(false);
  }
}


  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
    } catch {}
  }, [users]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_BANKS, JSON.stringify(bankList));
    } catch {}
  }, [bankList]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_THEME, theme);
    } catch {}
  }, [theme]);


useEffect(() => {
  loadBanksFromDb().catch(() => setBankList(DEFAULT_BANKS));
}, []);

useEffect(() => {
  try {
    const raw = window.localStorage.getItem(STORAGE_CURRENT_USER);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    const normalized = normalizeUserRecord(parsed);
    if (normalized && normalized.isActive && !normalized.isDeleted) {
      setCurrentUser(normalized);
    }
  } catch {}
}, []);

useEffect(() => {
  if (!currentUser) return;
  loadSupabaseAppData().catch((err) => {
    showActionNotice('Hata', err?.message || 'Supabase verileri yüklenemedi.', 'danger');
  });
}, [currentUser?.id]);
  useEffect(() => {
    try {
      if (currentUser) window.localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(currentUser));
      else window.localStorage.removeItem(STORAGE_CURRENT_USER);
    } catch {}
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || !users.length) return;
    const refreshedUser = users.find((u) => u.id === currentUser.id || u.username === currentUser.username);
    if (!refreshedUser) return;
    setCurrentUser((prev) => ({ ...prev, ...refreshedUser }));
  }, [users]);

  useEffect(() => {
    if (!visiblePeople.length) {
      setSelectedPersonId('');
      return;
    }
    if (!visiblePeople.some((p) => p.id === selectedPersonId)) {
      setSelectedPersonId(visiblePeople[0].id);
    }
  }, [visiblePeople, selectedPersonId]);


useEffect(() => {
  if (!currentUser) return;
  if (historyByDay[selectedDay]) return;
  setHistoryByDay((prev) => ({
    ...prev,
    [selectedDay]: buildZeroRowsForPeople(people, selectedDay),
  }));
}, [currentUser, people, selectedDay, historyByDay]);

  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedAny()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingSetRows, hasUnsavedSetBilgiGirisi, activeSection, passwordDrafts, userPermissionDrafts, newUserForm, showUsersPanel]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_45%,_#e2e8f0_100%)] p-10">
        <div className="mx-auto max-w-md">
          <Card className="border border-slate-200 bg-white shadow-2xl">
            <div className="space-y-4 p-6">
              <div className="flex items-center gap-3 text-2xl font-black text-slate-950">
                <ShieldCheck className="h-7 w-7" /> WEB YÖNETİM GİRİŞİ
              </div>
              <div className="text-sm font-medium text-slate-500">Masaüstü kullanıma uygun, kurumsal web paneli</div>
              <div>
                <div className="mb-2 text-sm font-black">Kullanıcı Adı</div>
                <Input value={login.username} onChange={(e) => setLogin({ ...login, username: e.target.value })} />
              </div>
              <div>
                <div className="mb-2 text-sm font-black">Şifre</div>
                <Input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} />
              </div>
              <Button className="w-full" onClick={handleLogin}>GİRİŞ YAP</Button>
            </div>
          </Card>
        </div>
        {appLoading && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 shadow-2xl">YÜKLENİYOR...</div>
          </div>
        )}

      {actionNotice.open && (
          <div className="fixed right-6 top-6 z-[140] min-w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
            <div className={`text-sm font-black ${actionNotice.tone === 'danger' ? 'text-rose-700' : 'text-teal-700'}`}>{actionNotice.title}</div>
            <div className="mt-1 text-sm font-semibold text-slate-600">{actionNotice.message}</div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#eef2f7_45%,_#e2e8f0_100%)]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] gap-6 p-6">
        <aside className="w-72 shrink-0">
          <Card className="sticky top-6 p-6">
            <div className="pb-4">
              <div className="text-xl font-black text-slate-950">SET YÖNETİM PANELİ</div>
              <div className="text-sm text-slate-500">Web tabanlı profesyonel takip ekranı</div>
            </div>
            <div className="space-y-3">
              <SidebarButton active={activeSection === 'genel'} icon={LayoutDashboard} label="Genel Özet" onClick={() => handleSectionChange('genel')} />
              <SidebarButton active={activeSection === 'durum'} icon={PieChartIcon} label="Set Durumu" onClick={() => handleSectionChange('durum')} />
              <SidebarButton active={activeSection === 'bloke'} icon={AlertTriangle} label="Bloke Takibi" onClick={() => handleSectionChange('bloke')} />
              <SidebarButton active={activeSection === 'giris'} icon={UserRound} label="Set Bilgi Girişi" onClick={() => handleSectionChange('giris')} />

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-black tracking-[0.22em] text-slate-500">OTURUM</div>
                <div className="mt-2 text-lg font-black text-slate-950">{currentUser.displayName}</div>
                <div className="mt-1 text-sm font-semibold text-slate-600">{currentUser.role === 'admin' ? 'YÖNETİCİ' : 'KULLANICI'}</div>
                <div className="mt-4 text-xs font-bold text-slate-500">Saat dilimi: Türkiye (UTC+3)</div>
                <Button variant="outline" className="mt-4 w-full" onClick={handleLogout}>ÇIKIŞ YAP</Button>
              </div>
            </div>
          </Card>
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <Card>
            <div className="flex flex-col gap-5 p-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-3">
                <div>
                  <div className="text-[11px] font-black tracking-[0.24em] text-slate-500">RAPOR GÜNÜ</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <Input
                      type="date"
                      value={selectedDay}
                      onChange={(e) => {
                        ensureDay(e.target.value);
                        setSelectedDay(e.target.value);
                      }}
                      className="max-w-[220px] font-bold"
                    />
                    <Button variant="outline" onClick={startNewDay}>YENİ GÜNE BAŞLA</Button>
                    <Button variant="outline" onClick={handleExportPDF}>
                      <Download className="h-4 w-4" /> RAPOR AL
                    </Button>
                    <Button variant="outline" onClick={handleExportExcel}>
                      <FileSpreadsheet className="h-4 w-4" /> EXCEL
                    </Button>
                    <Button variant="outline" onClick={handleExportPDF}>
                      <FileText className="h-4 w-4" /> PDF
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  <span className="h-2 w-2 rounded-full bg-slate-400" />
                  Aktif veri girişi yok
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {canManage && (
                  <Button
                    onClick={sendNotification}
                    className={notifyFlash ? 'bg-rose-600 hover:bg-rose-700 border-rose-600' : ''}
                  >
                    <BellRing className="h-4 w-4" /> BİLDİRİM GÖNDER
                  </Button>
                )}
                {canManage && (
                  <Button variant="outline" onClick={() => setShowUsersPanel(true)}>
                    <Settings className="h-4 w-4" /> KULLANICILAR
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {activeSection === 'genel' && (
            <>
              <div className="grid gap-4 xl:grid-cols-4">
                <SummaryCard title="AKTİF + NFC BAKİYE" value={formatMoney(groupedTotals.positiveAmount)} subtitle={`Hesap sayısı: ${groupedTotals.positiveCount}`} tone="teal" onClick={() => setSelectedGeneralSummary('positive')} />
                <SummaryCard title="BLOKE + ŞİFRE KİLİT" value={formatMoney(groupedTotals.negativeAmount)} subtitle={`Hesap sayısı: ${groupedTotals.negativeCount}`} tone="rose" onClick={() => setSelectedGeneralSummary('negative')} />
                <SummaryCard title="AKTİFE ALINAN HESAPLAR" value={groupedTotals.activatedCount} subtitle={`Aktife alınan tutar: ${formatMoney(groupedTotals.activatedAmount)}`} tone="cyan" onClick={() => setSelectedGeneralSummary('activated')} />
                <SummaryCard title="KAPANAN HESAPLAR" value={groupedTotals.closedCount} subtitle={`Kapanan hesap tutarı: ${formatMoney(groupedTotals.closedAmount)}`} tone="slate" onClick={() => setSelectedGeneralSummary('closed')} />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
                <Card>
                  <div className="p-6">
                    <div className="text-lg font-black">GÜNLÜK BAKİYE TRENDİ</div>
                    <div className="text-sm text-slate-500">Son günlerde aktif ve bloke dağılımı</div>
                    <div className="mt-4 h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartDailyTrend}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="day" />
                          <YAxis />
                          <Tooltip formatter={(value) => formatMoney(value)} />
                          <Area type="monotone" dataKey="aktif" stroke="#0f766e" fill="#99f6e4" strokeWidth={2} />
                          <Area type="monotone" dataKey="bloke" stroke="#e11d48" fill="#fecdd3" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="p-6">
                    <div className="text-lg font-black">DURUM DAĞILIMI</div>
                    <div className="text-sm text-slate-500">Güncel kayıtların durum karışımı</div>
                    <div className="mt-4 h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={chartStatusMix} dataKey="value" nameKey="name" innerRadius={60} outerRadius={95} paddingAngle={2}>
                            {chartStatusMix.map((entry, index) => (
                              <Cell key={entry.name} fill={pieColors[index % pieColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </Card>
              </div>
            </>
          )}

          {activeSection === 'durum' && (
            <>
              <Card>
                <div className="grid gap-4 p-6 xl:grid-cols-[280px_1fr] xl:items-end">
                  <div>
                    <div className="mb-2 text-sm font-black">ŞAHIS SEÇ</div>
                    <SelectBox value={selectedPersonId} onChange={(e) => setSelectedPersonId(e.target.value)}>
                      {visiblePeople.map((p) => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                      ))}
                    </SelectBox>
                  </div>
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <SummaryCard title="TOPLAM BAKİYE" value={formatMoney(personTotals.totalAmount)} subtitle={`Toplam hesap sayısı: ${personTotals.totalCount}`} tone="slate" />
                      <SummaryCard title="AKTİF + NFC" value={formatMoney(personTotals.activeAmount)} subtitle="Olumlu durum" tone="teal" />
                      <SummaryCard title="BLOKE + ŞİFRE KİLİT" value={formatMoney(personTotals.lockedAmount)} subtitle="Olumsuz durum" tone="rose" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => beginEditPerson(selectedPersonId)}>
                        <Pencil className="h-4 w-4" /> DÜZENLE
                      </Button>
                      <Button variant="outline" onClick={() => { resetPersonForm(); setActiveSection('giris'); }}>
                        <Plus className="h-4 w-4" /> YENİ EKLE
                      </Button>
                      <Button variant="danger" onClick={() => {
                        const target = people.find((p) => p.id === selectedPersonId);
                        if (target) setDeleteSetTarget(target);
                      }}>
                        <Trash2 className="h-4 w-4" /> SİL
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="space-y-4 p-6">
                  <div>
                    <div className="text-lg font-black">DETAYLI HESAP TABLOSU</div>
                    <div className="text-sm text-slate-500">Web düzenine uygun sabit başlıklı tablo görünümü</div>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-[1.2fr_140px_180px_1fr_170px_220px] bg-slate-900 px-4 py-3 text-xs font-black tracking-[0.18em] text-white">
                      <div>HESAP</div>
                      <div>TUTAR</div>
                      <div>DURUM</div>
                      <div>NOT</div>
                      <div>SON DURUM</div>
                      <div>KULLANICI / TARİH</div>
                    </div>
                    <div className="max-h-[520px] overflow-auto">
                      {selectedRows.map((row) => {
                        const isPending = !!pendingSetRows[row.id];
                        const liveRow = pendingSetRows[row.id] || row;
                        const liveStatus = normalizeStatus(liveRow.status, 'pasif');
                        return (
                          <div key={row.id} className={`grid grid-cols-[1.2fr_140px_180px_1fr_170px_220px] items-center gap-3 border-t border-slate-200 px-4 py-3 transition ${isPending ? 'bg-amber-50' : 'bg-white hover:bg-slate-50'}`}>
                            <div className="font-black text-slate-900">{liveRow.accountName}</div>
                            <Input type="number" value={liveRow.amount} onChange={(e) => updateRow(row.id, 'amount', e.target.value)} className="font-bold" />
                            <SelectBox value={liveStatus} onChange={(e) => updateRow(row.id, 'status', e.target.value)} className="font-bold">
                              <option value="pasif">PASİF</option>
                              <option value="aktif">AKTİF</option>
                              <option value="nfc">NFC</option>
                              <option value="sifre_kilit">ŞİFRE KİLİT</option>
                              <option value="bloke">BLOKE</option>
                            </SelectBox>
                            <Input value={liveRow.note} onChange={(e) => updateRow(row.id, 'note', e.target.value)} placeholder="Not" className="font-bold" />
                            <div><StatusBadge status={liveStatus} /></div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
                              <div className="text-sm font-black text-slate-900">{liveRow.editedBy || currentUser?.displayName || '-'}</div>
                              <div className="text-xs font-bold text-slate-500">{liveRow.editedAt || '-'}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={saveSetDurumu}>KAYDET</Button>
                  </div>
                </div>
              </Card>
            </>
          )}

          {activeSection === 'giris' && (
            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <div className="space-y-5 p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-black">{editingPersonId ? 'SET DÜZENLE' : 'SET BİLGİ GİRİŞ'}</div>
                      <div className="text-sm text-slate-500">Yeni eklenen tüm hesaplar başlangıçta pasif oluşturulur.</div>
                    </div>
                    {editingPersonId && (
                      <Button variant="ghost" onClick={resetPersonForm}>İPTAL</Button>
                    )}
                  </div>
                  <div className="grid gap-4 xl:grid-cols-3">
                    <div>
                      <div className="mb-2 text-sm font-black">AD SOYAD</div>
                      <Input value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} className="font-bold" />
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-black">BANKA SAYISI</div>
                      <SelectBox
                        value={newAccountCount}
                        onChange={(e) => {
                          const value = e.target.value;
                          const count = Number(value);
                          setNewAccountCount(value);
                          setNewAccountNames((prev) => {
                            const next = [...prev];
                            while (next.length < count) next.push(bankList[next.length % Math.max(bankList.length, 1)] || '');
                            return next.slice(0, count);
                          });
                        }}
                      >
                        {Array.from({ length: 20 }, (_, i) => (
                          <option key={i + 1} value={String(i + 1)}>{i + 1} BANKA</option>
                        ))}
                      </SelectBox>
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-black">TARİH</div>
                      <Input type="date" value={newPersonDate} onChange={(e) => setNewPersonDate(e.target.value)} className="font-bold" />
                    </div>
                  </div>

                  {canManage && (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="mb-3 text-sm font-black tracking-[0.16em] text-slate-600">BANKA YÖNETİMİ (ADMIN)</div>
                      <div className="flex gap-2">
                        <Input value={newBankName} onChange={(e) => setNewBankName(e.target.value)} placeholder="Banka adı girin (örn: Enpara)" className="font-bold" />
                        <Button type="button" onClick={addCustomBank}>
                          <Plus className="h-4 w-4" /> EKLE
                        </Button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {bankList.map((bank) => (
                          <div key={bank} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700">
                            <span>{bank}</span>
                            <button type="button" className="text-rose-600 hover:text-rose-800" onClick={() => removeCustomBank(bank)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="text-sm font-black tracking-[0.16em] text-slate-600">BANKA LİSTESİ</div>
                      <Button type="button" variant="outline" onClick={addBankField} disabled={Number(newAccountCount) >= 20}>
                        <Plus className="h-4 w-4" /> YENİ EKLE
                      </Button>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {newAccountNames.slice(0, Number(newAccountCount)).map((name, index) => (
                        <div key={index} className="rounded-2xl border border-slate-200 bg-white p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-black">{index + 1}. BANKA</div>
                            <button
                              type="button"
                              className="rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50"
                              onClick={() => removeBankField(index)}
                              disabled={Number(newAccountCount) <= 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <SelectBox value={name} onChange={(e) => setNewAccountNames((prev) => prev.map((item, i) => (i === index ? e.target.value : item)))} className="font-bold">
                            {bankList.map((bank) => (
                              <option key={bank} value={bank}>{bank}</option>
                            ))}
                          </SelectBox>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={resetPersonForm}>TEMİZLE</Button>
                    <Button onClick={addOrUpdatePerson}><Plus className="h-4 w-4" /> {editingPersonId ? 'GÜNCELLE' : 'KAYDET'}</Button>
                  </div>
                </div>
              </Card>

              <Card>
                <div className="space-y-3 p-6">
                  <div>
                    <div className="text-lg font-black">SET LİSTESİ</div>
                    <div className="text-sm text-slate-500">Kartlı hızlı erişim listesi</div>
                  </div>
                  {visiblePeople.map((person) => (
                    <div key={person.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="font-black text-slate-950">{person.fullName}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-500">Tarih: {person.startDate || '-'}</div>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">{person.accountNames.length} banka</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => { setSelectedPersonId(person.id); setActiveSection('durum'); }}>
                          HESAPLARI AÇ
                        </Button>
                        <Button variant="outline" onClick={() => beginEditPerson(person.id)}>
                          <Pencil className="h-4 w-4" /> DÜZENLE
                        </Button>
                        <Button variant="danger" onClick={() => setDeleteSetTarget(person)}>
                          <Trash2 className="h-4 w-4" /> SİL
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {activeSection === 'bloke' && (
            <>
              <div className="grid gap-4 xl:grid-cols-4">
                <SummaryCard title="AÇIK BLOKE SAYISI" value={blockSummary.unresolvedCount} subtitle={`Toplam bloke: ${formatMoney(blockSummary.unresolvedAmount)}`} tone="rose" />
                <SummaryCard title="ÇÖZÜLEN BLOKE SAYISI" value={blockSummary.resolvedCount} subtitle={`Çözülen bakiye: ${formatMoney(blockSummary.resolvedAmount)}`} tone="cyan" />
                <SummaryCard title="KAPANAN HESAPLAR" value={blockSummary.closedCount} subtitle="Son durum kapanan" tone="slate" />
                <SummaryCard title="AKTİFE ALINANLAR" value={blockSummary.activatedCount} subtitle="Son durum aktife alınan" tone="teal" />
              </div>

              <Card>
                <div className="space-y-4 p-6">
                  <div>
                    <div className="text-lg font-black">BLOKE MERKEZİ</div>
                    <div className="text-sm text-slate-500">Açık bloke kayıtlarının son durum listesi burada tutulur</div>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div className="max-w-md flex-1">
                      <div className="mb-2 text-sm font-black">FİLTRE</div>
                      <div className="relative">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Şahıs, hesap, not, durum" className="pl-9 font-bold" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleBlockExportExcel}><FileSpreadsheet className="h-4 w-4" /> EXCEL</Button>
                      <Button variant="outline" onClick={handleBlockExportPDF}><FileText className="h-4 w-4" /> PDF</Button>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="grid grid-cols-[1.4fr_160px_160px_180px_150px] bg-slate-900 px-4 py-3 text-xs font-black tracking-[0.18em] text-white">
                      <div>KAYIT</div>
                      <div>TUTAR</div>
                      <div>DURUM</div>
                      <div>SONUÇ</div>
                      <div>İŞLEM</div>
                    </div>
                    <div className="max-h-[520px] overflow-auto">
                      {blockTableRows.length === 0 ? (
                        <div className="p-8 text-center text-sm font-bold text-slate-500">KAYIT YOK</div>
                      ) : (
                        blockTableRows.map((item) => (
                          <div key={item.id} className="grid grid-cols-[1.4fr_160px_160px_180px_150px] items-center gap-3 border-t border-slate-200 px-4 py-3 hover:bg-slate-50">
                            <div>
                              <div className="font-black text-slate-950">{item.personName} • {item.accountName}</div>
                              <div className="text-xs font-bold text-slate-500">{item.date} • {item.createdBy} • {item.note || 'Not yok'}</div>
                            </div>
                            <div className="font-black text-slate-900">{formatMoney(getCurrentBlockedAmount(item))}</div>
                            <div><StatusBadge status={item.type} /></div>
                            <div className={`font-black ${getBlockResultMeta(item).className}`}>{getBlockResultMeta(item).label}</div>
                            <Button variant="outline" onClick={() => openBlockResolution(item)}>DURUM GÜNCELLE</Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </>
          )}
        </main>
      </div>

      {canManage && (
        <Modal open={showUsersPanel} onClose={() => {
          if (hasUnsavedUserPanel()) {
            showActionNotice('Kaydetmeden çıkamazsınız', 'Önce kullanıcı panelindeki değişiklikleri kaydedin.', 'danger');
            return;
          }
          setShowUsersPanel(false);
        }} title="KULLANICI YÖNETİMİ" maxWidth="max-w-6xl">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <div className="mb-4 text-sm font-black tracking-[0.18em] text-slate-600">YENİ KULLANICI OLUŞTUR</div>
            <div className="grid gap-3 xl:grid-cols-[1.1fr_1fr_1fr_220px_auto] xl:items-end">
              <div>
                <div className="mb-2 block text-sm font-black">AD SOYAD</div>
                <Input placeholder="Ad Soyad" value={newUserForm.displayName} onChange={(e) => setNewUserForm((p) => ({ ...p, displayName: e.target.value }))} />
              </div>
              <div>
                <div className="mb-2 block text-sm font-black">KULLANICI ADI</div>
                <Input placeholder="Kullanıcı adı" value={newUserForm.username} onChange={(e) => setNewUserForm((p) => ({ ...p, username: e.target.value }))} />
              </div>
              <div>
                <div className="mb-2 block text-sm font-black">ŞİFRE</div>
                <Input type="password" placeholder="Şifre" value={newUserForm.password} onChange={(e) => setNewUserForm((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <div>
                <div className="mb-2 block text-sm font-black">ROL</div>
                <SelectBox value={newUserForm.role} onChange={(e) => setNewUserForm((p) => ({ ...p, role: e.target.value }))}>
                  <option value="user">KULLANICI</option>
                  <option value="admin">YÖNETİCİ</option>
                </SelectBox>
              </div>
              <Button type="button" onClick={createNewUser} className="h-10 xl:px-5"><Plus className="h-4 w-4" /> OLUŞTUR</Button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200">
            <div className="grid grid-cols-[1.2fr_140px_170px_170px_1.2fr] items-center gap-3 bg-slate-900 px-4 py-3 text-xs font-black tracking-[0.18em] text-white">
              <div>KULLANICI</div>
              <div>ROL</div>
              <div>DURUM</div>
              <div>YETKİ</div>
              <div>ŞİFRE / İŞLEM</div>
            </div>
            <div className="max-h-[46vh] overflow-auto bg-white">
              {users.filter((u) => !u.isDeleted).map((u) => (
                <div key={u.id} className="grid grid-cols-[1.2fr_140px_170px_170px_1.2fr] items-center gap-3 border-t border-slate-200 px-4 py-4">
                  <div className="min-w-0">
                    <div className="truncate font-black text-slate-950">{u.displayName}</div>
                    <div className="mt-1 text-xs font-bold text-slate-500">{u.username}</div>
                  </div>
                  <div className="font-black text-slate-700">{u.role === 'admin' ? 'YÖNETİCİ' : 'KULLANICI'}</div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={getPanelUser(u).isActive} disabled={u.role === 'admin'} onChange={() => toggleUser(u.id, 'isActive')} />
                    <span className="text-sm font-black text-slate-700">{getPanelUser(u).isActive ? 'AKTİF' : 'PASİF'}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" checked={getPanelUser(u).canEnterData} disabled={u.role === 'admin'} onChange={() => toggleUser(u.id, 'canEnterData')} />
                    <span className="text-sm font-black text-slate-700">VERİ GİRİŞİ</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="password" placeholder="Yeni şifre" value={passwordDrafts[u.id] || ''} onChange={(e) => setPasswordDrafts((p) => ({ ...p, [u.id]: e.target.value }))} className="min-w-0" />
                    <Button type="button" variant="outline" className="shrink-0" onClick={() => saveUserRow(u.id)}>KAYDET</Button>
                    {u.role !== 'admin' && (
                      <Button type="button" variant="danger" className="shrink-0" onClick={() => deleteUser(u.id)}>SİL</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {actionNotice.open && (
        <div className="fixed right-6 top-6 z-[140] min-w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className={`text-sm font-black ${actionNotice.tone === 'danger' ? 'text-rose-700' : 'text-teal-700'}`}>{actionNotice.title}</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">{actionNotice.message}</div>
        </div>
      )}

      <Modal open={!!deleteTargetUser} onClose={() => setDeleteTargetUser(null)} title="KULLANICIYI SİL" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
            {deleteTargetUser ? `${deleteTargetUser.displayName} kullanıcısı sistemden tamamen silinecek. Bu işlem geri alınamaz.` : ''}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteTargetUser(null)}>İPTAL</Button>
            <Button variant="danger" onClick={confirmDeleteUser}>TAMAMEN SİL</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!deleteSetTarget} onClose={() => setDeleteSetTarget(null)} title="SETİ SİL" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
            {deleteSetTarget ? `${deleteSetTarget.fullName} seti tamamen silinecek. Bu işlem geri alınamaz.` : ''}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteSetTarget(null)}>İPTAL</Button>
            <Button variant="danger" onClick={confirmDeleteSet}>TAMAMEN SİL</Button>
          </div>
        </div>
      </Modal>

      <Modal open={notificationModalOpen} onClose={() => setNotificationModalOpen(false)} title="VERİ GİRİŞ UYARISI" maxWidth="max-w-lg">
        <div className="space-y-4 py-2 text-center">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-xl font-black text-rose-700">Verileri 00.00’dan önce girin.</div>
          <div className="text-sm font-bold text-rose-600">Bu bildirim dikkat çekici uyarı olarak gönderilir.</div>
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setNotificationModalOpen(false)}>KAPAT</Button>
          </div>
        </div>
      </Modal>

      <Modal open={navigationWarningOpen} onClose={() => setNavigationWarningOpen(false)} title="KAYDEDİLMEMİŞ DEĞİŞİKLİKLER" maxWidth="max-w-md">
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">{navigationWarningMessage}</div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setNavigationWarningOpen(false)}>İPTAL</Button>
            <Button variant="ghost" onClick={discardPendingChangesAndNavigate}>DEĞİŞİKLİKLERİ SİL</Button>
            <Button onClick={handleWarningSaveAndContinue}>KAYDET VE DEVAM ET</Button>
          </div>
        </div>
      </Modal>

      <Modal open={blockDialogOpen} onClose={() => {
        setBlockDialogOpen(false);
        setShowResolvedAmountInput(false);
        setPendingResolveMode('cozuldu');
      }} title="BLOKE DURUMU" maxWidth="max-w-xl">
        <div className="space-y-4">
          {selectedBlockItem && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-black text-slate-950">{selectedBlockItem.personName} • {selectedBlockItem.accountName}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{formatMoney(selectedBlockItem.amount)} • {selectedBlockItem.note || 'Not yok'}</div>
            </div>
          )}

          {showResolvedAmountInput && (
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
              <div className="mb-2 text-sm font-black">ÇÖZÜLEN TUTAR</div>
              <Input type="number" value={resolvedAmountInput} onChange={(e) => setResolvedAmountInput(e.target.value)} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => setBlockAsResolved(pendingResolveMode)}>KAYDET</Button>
                <Button variant="outline" onClick={() => {
                  setShowResolvedAmountInput(false);
                  setPendingResolveMode('cozuldu');
                  setResolvedAmountInput(selectedBlockItem ? String(selectedBlockItem.resolvedAmount || selectedBlockItem.amount || 0) : '0');
                }}>İPTAL</Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBlockAsResolved('cozulmedi')}>ÇÖZÜLMEDİ</Button>
            <Button onClick={() => setBlockAsResolved('cozuldu')}>ÇÖZÜLDÜ</Button>
            <Button variant="outline" onClick={() => setBlockAsResolved('aktif_alindi')}>AKTİFE ALINDI</Button>
            <Button variant="outline" onClick={() => setBlockAsResolved('kapandi')}>KAPANDI</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!selectedGeneralSummary} onClose={() => setSelectedGeneralSummary(null)} title="DETAY LİSTE" maxWidth="max-w-5xl">
        <div className="space-y-3">
          {(selectedGeneralSummary ? generalSummaryDetails[selectedGeneralSummary] : []).length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">Kayıt yok</div>
          ) : (
            (selectedGeneralSummary ? generalSummaryDetails[selectedGeneralSummary] : []).map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4">
                {'accountName' in item ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-black text-slate-950">{item.personName} • {item.accountName}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">{item.note || 'Not yok'} • {item.editedBy || '-'} • {item.editedAt || '-'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-slate-950">{formatMoney(item.amount)}</div>
                      <div className="mt-1"><StatusBadge status={item.status} /></div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-black text-slate-950">{item.personName} • {item.accountName}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">{item.note || 'Not yok'} • {item.createdBy || '-'}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-slate-950">{formatMoney(item.amount)}</div>
                      <div className="mt-1 text-sm font-bold text-slate-500">{item.resultList || item.resolution}</div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
