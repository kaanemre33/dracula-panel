import { supabase } from './supabase'
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  BellRing,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  PieChart as PieChartIcon,
  Plus,
  Search,
  ShieldCheck,
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
import { useOnlineUsers } from './hooks/useOnlineUsers';
import {
  STATUS_META as SHARED_STATUS_META,
  STATUS_SELECT_OPTIONS,
  getStatusLabel as getStatusLabelLib,
  isManagerLockedStatus as isManagerLockedStatusLib,
  isNegativeStatus as isNegativeStatusLib,
  isPositiveStatus as isPositiveStatusLib,
  normalizeBlockedStatus as normalizeBlockedStatusLib,
  normalizeStatus as normalizeStatusLib,
  shouldRepairBlockStatus,
  shouldRepairTransactionStatus,
} from './lib/status';
import {
  SETCI_PAYMENT_RESULT,
  SET_PAYMENT_RESULT,
  buildSetPaymentSourceKey as buildSetPaymentSourceKeyLib,
  buildSetciPaymentSourceKey as buildSetciPaymentSourceKeyLib,
  getSetPaymentMonthKey,
  getSetPaymentMonthLabel,
  getSetPaymentPersonId,
  getSetPaymentStatusLabel,
  isAuditPaymentLog as isAuditPaymentLogLib,
  isSetPaymentLog as isSetPaymentLogLib,
  isSetciPaymentLog as isSetciPaymentLogLib,
} from './lib/payments';
import {
  buildLatestBlockMap,
  collectDuplicateOpenBlockRepairs,
  collectNegativeStatusBlockRepairs,
  getBlockLifecycleState,
} from './lib/blockSync';
import { appendStructuredSheet, renderPdfHeader, renderPdfSection } from './lib/exportHelpers';
import { BlockStatusModal } from './components/BlockStatusModal';
import { ReportMenu } from './components/ReportMenu';
import { SetPaymentsPanel } from './components/SetPaymentsPanel';
import { SetciPaymentModal } from './components/SetciPaymentModal';
import { Button, Card, Input, Modal, SelectBox, SidebarButton, StatusBadge, SummaryCard } from './components/ui';

const APP_TIME_ZONE = 'Europe/Istanbul';
const STORAGE_THEME = 'set-panel-theme-v1';
const STORAGE_BANKS = 'set-panel-banks-v1';
const STORAGE_CURRENT_USER = 'set-panel-current-user-v1';
const STORAGE_REPORT_DAY = 'set-panel-report-day-v1';

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
/* legacy inline status notes removed in favor of src/lib/status.js
legacy status options removed

const STATUS_META = {
  pasif: { label: 'PASİF', className: 'border-slate-200 bg-slate-100 text-slate-700', icon: Ban },
  aktif: { label: 'AKTİF', className: 'border-teal-200 bg-teal-100 text-teal-800', icon: BadgeCheck },
  nfc: { label: 'NFC', className: 'border-cyan-200 bg-cyan-100 text-cyan-800', icon: Smartphone },
  sifre_kilit: { label: 'ŞİFRE KİLİT', className: 'border-amber-200 bg-amber-100 text-amber-800', icon: Lock },
  bloke: { label: 'BLOKE', className: 'border-rose-200 bg-rose-100 text-rose-800', icon: AlertTriangle },
};

legacy valid statuses removed
legacy aliases removed {
  active: 'aktif',
  blocked: 'bloke',
  block: 'bloke',
  kilit: 'sifre_kilit',
  password_lock: 'sifre_kilit',
  sifre: 'sifre_kilit',
  sifrekilit: 'sifre_kilit',
  sifre_kilit: 'sifre_kilit',
  legacy_invalid_status: 'bloke',
};

legacy toStatusKey removed {
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

legacy normalize helpers removed
*/

const STATUS_OPTIONS = STATUS_SELECT_OPTIONS.map((item) => item.value);
const STATUS_META = SHARED_STATUS_META;

function normalizeStatus(value, fallback = 'pasif') {
  return normalizeStatusLib(value, fallback);
}

function normalizeBlockedStatus(value) {
  return normalizeBlockedStatusLib(value);
}

const SEED_PEOPLE = [];

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

function getStoredReportDay() {
  try {
    const raw = window.localStorage.getItem(STORAGE_REPORT_DAY);
    return /^\d{4}-\d{2}-\d{2}$/.test(String(raw || '')) ? raw : TODAY;
  } catch {
    return TODAY;
  }
}

function clearStoredCurrentUser() {
  try {
    window.localStorage.removeItem(STORAGE_CURRENT_USER);
    window.history.replaceState({}, '', window.location.pathname);
  } catch {}
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

function formatDisplayDateTime(value) {
  if (!value) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}$/.test(String(value))) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed).replace(',', '');
}

function normalizeDisplayName(value) {
  return String(value || '').trim().toLocaleUpperCase('tr-TR');
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLocaleLowerCase('en-US');
}

function getStatusLabel(status) {
  return getStatusLabelLib(status);
}

function isManagerLockedStatus(status) {
  return isManagerLockedStatusLib(status);
}

function getSectionLabel(section) {
  if (section === 'genel') return 'Genel Özet';
  if (section === 'durum') return 'Durum Ayarla';
  if (section === 'bloke') return 'Bloke Takibi';
  if (section === 'giris') return 'Set Bilgi Girişi';
  return 'Panel';
}

function getSummaryModalTitle(key) {
  if (key === 'positive') return 'Aktif + NFC Detayları';
  if (key === 'negative') return 'Bloke + Şifre Kilit Detayları';
  if (key === 'activated') return 'Aktife Alınan Hesaplar';
  if (key === 'closed') return 'Kapanan Hesaplar';
  if (key === 'setci') return 'Setci Odemesi Kayitlari';
  return 'Detay Liste';
}

function isPositiveStatus(status) {
  return isPositiveStatusLib(status);
}

function isNegativeStatus(status) {
  return isNegativeStatusLib(status);
}

function getResolvedReleaseAmount(item) {
  if (!item) return 0;
  const totalAmount = Number(item.amount || 0);
  if (isAuditPaymentLog(item)) return 0;
  if (item.resultList === 'kapandi' || item.resultList === 'aktif_alindi') return 0;
  if (item.resultList !== 'merkez' || item.resolution !== 'cozuldu') return 0;
  return Math.max(0, Math.min(totalAmount, Number(item.resolvedAmount || 0)));
}

function getCurrentBlockedAmount(item) {
  if (!item) return 0;
  if (isAuditPaymentLog(item)) return 0;
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

function getRowFinancialBreakdown(row, blockItem) {
  const normalizedStatus = normalizeStatus(row?.status, 'pasif');
  const baseAmount = Number(row?.amount || 0);

  if (!baseAmount) {
    return {
      baseAmount: 0,
      positiveAmount: 0,
      negativeAmount: 0,
      releasedAmount: 0,
    };
  }

  if (!isNegativeStatus(normalizedStatus)) {
    return {
      baseAmount,
      positiveAmount: isPositiveStatus(normalizedStatus) ? baseAmount : 0,
      negativeAmount: 0,
      releasedAmount: 0,
    };
  }

  if (!blockItem) {
    return {
      baseAmount,
      positiveAmount: 0,
      negativeAmount: baseAmount,
      releasedAmount: 0,
    };
  }

  const releasedAmount = Math.max(0, Math.min(baseAmount, getResolvedReleaseAmount(blockItem)));
  const negativeAmount = Math.max(0, Math.min(baseAmount, getCurrentBlockedAmount(blockItem)));

  return {
    baseAmount,
    positiveAmount: releasedAmount,
    negativeAmount,
    releasedAmount,
  };
}

/* legacy payment helpers moved to src/lib/payments.js
function buildSetciPaymentSourceKey(rowKey) {
  return `setci::${encodeURIComponent(rowKey)}::${Date.now()}`;
}

function isSetciPaymentLog(item) {
  return String(item?.resultList || '') === SETCI_PAYMENT_RESULT;
}
*/

function buildSetciPaymentSourceKey(rowKey) {
  return buildSetciPaymentSourceKeyLib(rowKey);
}

function isSetciPaymentLog(item) {
  return isSetciPaymentLogLib(item);
}

function isSetPaymentLog(item) {
  return isSetPaymentLogLib(item);
}

function isAuditPaymentLog(item) {
  return isAuditPaymentLogLib(item);
}

function buildSetPaymentSourceKey(personId, monthKey = 'month_1') {
  return buildSetPaymentSourceKeyLib(personId, monthKey);
}

function buildHistoryRowMap(historyByDay = {}) {
  const next = new Map();
  Object.values(historyByDay).forEach((rows) => {
    (rows || []).forEach((row) => {
      if (!row?.id) return;
      next.set(row.id, row);
    });
  });
  return next;
}

function getBlockCreatedDisplayValue(item) {
  return formatDisplayDateTime(item?.createdAt || item?.date || '');
}

function getBlockChangedAt(item, historyRowByKey) {
  if (!item?.sourceRowKey) return item?.createdAt || item?.date || '';
  return historyRowByKey.get(item.sourceRowKey)?.editedAt || item?.createdAt || item?.date || '';
}

function getBlockChangedBy(item, historyRowByKey) {
  if (!item?.sourceRowKey) return item?.createdBy || '';
  return historyRowByKey.get(item.sourceRowKey)?.editedBy || item?.createdBy || '';
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

/* legacy ui primitives moved to src/components/ui.jsx
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
*/

export default function App() {
  const [theme, setTheme] = useState(() => getStoredTheme());
  const [users, setUsers] = useState([]);
  const [bankList, setBankList] = useState(() => getStoredBanks());
  const [people, setPeople] = useState([]);
  const [historyByDay, setHistoryByDay] = useState({});
  const [blockCenter, setBlockCenter] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [login, setLogin] = useState({ username: '', password: '' });
  const [selectedDay, setSelectedDay] = useState(() => getStoredReportDay());
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
  const [blockNoteInput, setBlockNoteInput] = useState('');
  const [setciPaymentModalOpen, setSetciPaymentModalOpen] = useState(false);
  const [setciPaymentDraft, setSetciPaymentDraft] = useState({ rowId: '', amount: '', note: '' });
  const [setPaymentDraft, setSetPaymentDraft] = useState({ month1Status: 'odenmedi', month1Amount: '', month1Note: '' });
  const [notificationModalOpen, setNotificationModalOpen] = useState(false);
  const [reportMenuOpen, setReportMenuOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ displayName: '', username: '', password: '', role: 'user' });
  const [passwordDrafts, setPasswordDrafts] = useState({});
  const [userPermissionDrafts, setUserPermissionDrafts] = useState({});
  const [newPersonName, setNewPersonName] = useState('');
  const [newPersonDate, setNewPersonDate] = useState(() => getStoredReportDay());
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
  const [dataReady, setDataReady] = useState(false);
  const reportMenuRef = useRef(null);

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
  const selectedPerson = visiblePeople.find((person) => person.id === selectedPersonId) || null;
  const selectedRows = visibleDailyRows.filter((r) => r.personId === selectedPersonId);
  const eligibleSetciRows = useMemo(
    () => selectedRows.filter((row) => isPositiveStatus(row.status) && Number(row.amount || 0) > 0),
    [selectedRows]
  );
  const visibleBlockCenter = canManage
    ? blockCenter
    : blockCenter.filter((item) => {
        const sourcePersonId = getPersonIdFromRowKey(item.sourceRowKey);
        return visiblePersonIds.has(sourcePersonId) || ownerVisiblePeople.some((person) => person.fullName === item.personName);
      });
  const visibleRowKeySet = useMemo(() => new Set(visibleDailyRows.map((row) => row.id)), [visibleDailyRows]);
  const historyRowByKey = useMemo(() => buildHistoryRowMap(historyByDay), [historyByDay]);
  const latestVisibleBlockByRowKey = useMemo(() => buildLatestBlockMap(visibleBlockCenter), [visibleBlockCenter]);
  const latestVisibleBlockItems = useMemo(() => Array.from(latestVisibleBlockByRowKey.values()), [latestVisibleBlockByRowKey]);
  const visibleSetciPayments = useMemo(
    () => visibleBlockCenter.filter((item) => isSetciPaymentLog(item)),
    [visibleBlockCenter]
  );
  const visibleSetPayments = useMemo(
    () => visibleBlockCenter.filter((item) => isSetPaymentLog(item)),
    [visibleBlockCenter]
  );
  const currentDaySetciPayments = useMemo(
    () => visibleSetciPayments.filter((item) => item.date === selectedDay),
    [visibleSetciPayments, selectedDay]
  );
  const setPaymentTargetPersonId = editingPersonId || selectedPersonId || '';
  const setPaymentTargetPerson = useMemo(
    () => visiblePeople.find((person) => person.id === setPaymentTargetPersonId) || people.find((person) => person.id === setPaymentTargetPersonId) || null,
    [visiblePeople, people, setPaymentTargetPersonId]
  );
  const selectedSetPaymentLogs = useMemo(() => {
    if (!setPaymentTargetPerson) return [];
    const personId = setPaymentTargetPerson.id;
    return visibleSetPayments
      .filter((item) => getSetPaymentPersonId(item.sourceRowKey) === personId)
      .sort((left, right) => String(right.createdAt || right.date || '').localeCompare(String(left.createdAt || left.date || '')));
  }, [setPaymentTargetPerson, visibleSetPayments]);
  const monthOneSetPayment = useMemo(() => {
    if (!setPaymentTargetPerson) return null;
    const sourceKey = buildSetPaymentSourceKey(setPaymentTargetPerson.id, 'month_1');
    return selectedSetPaymentLogs.find((item) => item.sourceRowKey === sourceKey) || null;
  }, [selectedSetPaymentLogs, setPaymentTargetPerson]);
  const currentDayBlockItems = useMemo(
    () => latestVisibleBlockItems.filter((item) => visibleRowKeySet.has(item.sourceRowKey)),
    [latestVisibleBlockItems, visibleRowKeySet]
  );
  const currentDayBlockByRowKey = useMemo(() => buildLatestBlockMap(currentDayBlockItems), [currentDayBlockItems]);
  const derivedCurrentDayBlockItems = useMemo(
    () =>
      visibleDailyRows.reduce((items, row) => {
        const normalizedStatus = normalizeStatus(row.status, 'pasif');
        if (!isNegativeStatus(normalizedStatus)) return items;

        const latestBlockItem = currentDayBlockByRowKey.get(row.id);
        if (latestBlockItem && getBlockLifecycleState(latestBlockItem) === 'unresolved') return items;

        items.push({
          id: `derived-${row.id}`,
          sourceRowKey: row.id,
          date: selectedDay,
          personName: row.personName,
          accountName: row.accountName,
          amount: Number(row.amount || 0),
          type: normalizeBlockedStatus(normalizedStatus),
          note: row.note || '',
          resolution: 'cozulmedi',
          resultList: 'merkez',
          resolvedAmount: 0,
          createdBy: row.editedBy || '',
          createdAt: row.editedAt || selectedDay,
          isDerived: true,
        });

        return items;
      }, []),
    [visibleDailyRows, currentDayBlockByRowKey, selectedDay]
  );
  const mergedBlockCenterItems = useMemo(() => {
    const actualBlockItems = latestVisibleBlockItems.filter((item) => !isAuditPaymentLog(item));
    const mergedByRowKey = new Map();
    const itemsWithoutRowKey = [];

    actualBlockItems.forEach((item) => {
      if (!item?.sourceRowKey) {
        itemsWithoutRowKey.push(item);
        return;
      }
      mergedByRowKey.set(item.sourceRowKey, item);
    });

    derivedCurrentDayBlockItems.forEach((item) => {
      if (!item?.sourceRowKey) {
        itemsWithoutRowKey.push(item);
        return;
      }
      mergedByRowKey.set(item.sourceRowKey, item);
    });

    return [...itemsWithoutRowKey, ...Array.from(mergedByRowKey.values())].sort((left, right) =>
      String(right.createdAt || right.date || '').localeCompare(String(left.createdAt || left.date || ''))
    );
  }, [latestVisibleBlockItems, derivedCurrentDayBlockItems]);
  const activeUsers = canManage ? users.filter((u) => u.isActive && !u.isDeleted) : users.filter((u) => u.id === currentUser?.id && u.isActive && !u.isDeleted);
  const onlineUsers = useOnlineUsers(currentUser, getSectionLabel(activeSection));

  const hasUnsavedSetBilgiGirisi = useMemo(() => {
    const count = Number(newAccountCount || 0);
    const selectedNames = newAccountNames.slice(0, count);
    if (editingPersonId) return false;
    const hasNameStarted = newPersonName.trim().length > 0;
    const hasDateChanged = newPersonDate !== selectedDay;
    const hasCountChanged = newAccountCount !== '5';
    const hasCustomNames = selectedNames.some((name, index) => (name || '').trim() !== (DEFAULT_ACCOUNT_NAMES[index] || '').trim());
    return hasNameStarted || hasDateChanged || hasCountChanged || hasCustomNames;
  }, [newPersonName, newPersonDate, newAccountCount, newAccountNames, editingPersonId, selectedDay]);

  function hasUnsavedAny() {
    return (activeSection === 'durum' && Object.keys(pendingSetRows).length > 0) ||
      (activeSection === 'giris' && hasUnsavedSetBilgiGirisi);
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
    const financialRows = visibleDailyRows.map((row) => {
      const breakdown = getRowFinancialBreakdown(row, currentDayBlockByRowKey.get(row.id));
      return {
        ...row,
        positiveAmount: breakdown.positiveAmount,
        negativeAmount: breakdown.negativeAmount,
      };
    });
    const negativeRows = visibleDailyRows
      .filter((row) => isNegativeStatus(row.status))
      .map((row) => {
        const breakdown = getRowFinancialBreakdown(row, currentDayBlockByRowKey.get(row.id));
        return {
          ...row,
          effectiveAmount: breakdown.negativeAmount,
        };
      });
    const closedItems = currentDayBlockItems.filter((item) => getBlockLifecycleState(item) === 'closed');
    const activatedItems = currentDayBlockItems.filter((item) => getBlockLifecycleState(item) === 'activated');

    return {
      positiveAmount: visibleDailyRows.reduce((sum, row) => {
        const breakdown = getRowFinancialBreakdown(row, currentDayBlockByRowKey.get(row.id));
        return sum + breakdown.positiveAmount;
      }, 0),
      positiveCount: financialRows.filter((row) => Number(row.positiveAmount || 0) > 0).length,
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
    const activeAmount = selectedRows.reduce((sum, row) => {
      const breakdown = getRowFinancialBreakdown(row, currentDayBlockByRowKey.get(row.id));
      return sum + breakdown.positiveAmount;
    }, 0);
    const lockedAmount = selectedRows.reduce((sum, row) => {
      const breakdown = getRowFinancialBreakdown(row, currentDayBlockByRowKey.get(row.id));
      return sum + breakdown.negativeAmount;
    }, 0);
    return { totalAmount, activeAmount, lockedAmount, totalCount: selectedRows.length };
  }, [selectedRows, currentDayBlockByRowKey]);

  const filteredBlockCenter = useMemo(() => {
    if (!filter.trim()) return mergedBlockCenterItems;
    return mergedBlockCenterItems.filter((b) =>
      `${b.personName} ${b.accountName} ${b.note} ${b.type} ${b.resultList} ${b.resolution}`.toLowerCase().includes(filter.toLowerCase())
    );
  }, [mergedBlockCenterItems, filter]);

  const blockTableRows = useMemo(
    () => filteredBlockCenter.filter((item) => getBlockLifecycleState(item) === 'unresolved'),
    [filteredBlockCenter]
  );

  const blockSummary = useMemo(() => {
    const unresolvedItems = mergedBlockCenterItems.filter((item) => getBlockLifecycleState(item) === 'unresolved');
    const resolvedItems = mergedBlockCenterItems.filter((item) => getBlockLifecycleState(item) === 'resolved');
    const closedItems = mergedBlockCenterItems.filter((item) => getBlockLifecycleState(item) === 'closed');
    const activatedItems = mergedBlockCenterItems.filter((item) => getBlockLifecycleState(item) === 'activated');
    return {
      resolvedCount: resolvedItems.length,
      resolvedAmount: resolvedItems.reduce((sum, item) => sum + getResolvedReleaseAmount(item), 0),
      unresolvedCount: unresolvedItems.length,
      unresolvedAmount: unresolvedItems.reduce((sum, item) => sum + getCurrentBlockedAmount(item), 0),
      closedCount: closedItems.length,
      activatedCount: activatedItems.length,
    };
  }, [mergedBlockCenterItems]);

  const generalSummaryDetails = useMemo(() => ({
    positive: visibleDailyRows.flatMap((row) => {
      const blockItem = currentDayBlockByRowKey.get(row.id);
      const breakdown = getRowFinancialBreakdown(row, blockItem);

      if (isPositiveStatus(row.status)) {
        return [{ ...row, amount: breakdown.positiveAmount }];
      }

      if (!breakdown.positiveAmount) return [];

      return [{
        ...row,
        amount: breakdown.positiveAmount,
        status: 'aktif',
        note: `${blockItem?.note || row.note || 'Not yok'} - Blokeden cikan tutar`,
        editedBy: getBlockChangedBy(blockItem, historyRowByKey) || row.editedBy,
        editedAt: getBlockChangedAt(blockItem, historyRowByKey) || row.editedAt,
      }];
    }),
    negative: visibleDailyRows
      .filter((row) => isNegativeStatus(row.status))
      .map((row) => {
        const blockItem = currentDayBlockByRowKey.get(row.id);
        const effectiveAmount = getRowFinancialBreakdown(row, blockItem).negativeAmount;
        if (!effectiveAmount) return null;
        if (!blockItem || effectiveAmount === Number(row.amount || 0)) {
          return { ...row, amount: effectiveAmount };
        }
        return {
          ...row,
          amount: effectiveAmount,
          note: `${blockItem?.note || row.note || 'Not yok'} - Kalan bloke: ${formatMoney(effectiveAmount)}`,
        };
      })
      .filter(Boolean),
    activated: currentDayBlockItems.filter((item) => getBlockLifecycleState(item) === 'activated'),
    closed: currentDayBlockItems.filter((item) => getBlockLifecycleState(item) === 'closed'),
    setci: currentDaySetciPayments,
  }), [visibleDailyRows, currentDayBlockItems, currentDayBlockByRowKey, historyRowByKey, currentDaySetciPayments]);

  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const allSetPaymentRows = useMemo(
    () =>
      visibleSetPayments.map((item) => {
        const personId = getSetPaymentPersonId(item.sourceRowKey);
        const person = personById.get(personId);
        return {
          ...item,
          personId,
          monthKey: getSetPaymentMonthKey(item.sourceRowKey),
          monthLabel: getSetPaymentMonthLabel(getSetPaymentMonthKey(item.sourceRowKey)),
          setPaymentStatusLabel: getSetPaymentStatusLabel(item.resolution),
          setStartDate: person?.startDate || '',
          bankCount: person?.accountNames?.length || 0,
          bankList: (person?.accounts || [])
            .map((account) => `${account.bankName} (${formatDisplayDateTime(account.createdAt)})`)
            .join(' | '),
        };
      }),
    [visibleSetPayments, personById]
  );

  const selectedPersonAccountMeta = useMemo(
    () => new Map((selectedPerson?.accounts || []).map((account) => [account.bankName, account])),
    [selectedPerson]
  );

  const selectedPersonReportRows = useMemo(() => {
    if (!selectedPersonId) return [];
    const latestBlockByRowKey = buildLatestBlockMap(visibleBlockCenter);

    return Object.keys(historyByDay)
      .sort((left, right) => right.localeCompare(left))
      .flatMap((day) =>
        (historyByDay[day] || [])
          .filter((row) => row.personId === selectedPersonId)
          .map((row) => {
            const blockItem = latestBlockByRowKey.get(row.id);
            const normalizedStatus = normalizeStatus(row.status, 'pasif');
            const breakdown = getRowFinancialBreakdown(row, blockItem);

            return {
              ...row,
              day,
              status: normalizedStatus,
              amount: breakdown.baseAmount,
              positiveAmount: breakdown.positiveAmount,
              negativeAmount: breakdown.negativeAmount,
              statusLabel: getStatusLabel(normalizedStatus),
              blockResultLabel: blockItem ? getBlockResultMeta(blockItem).label : '-',
              blockResultList: blockItem?.resultList || '-',
              blockResolution: blockItem?.resolution || '-',
              blockNote: blockItem?.note || '',
              blockCreatedAt: blockItem?.createdAt || '',
              blockChangedAt: getBlockChangedAt(blockItem, historyRowByKey),
              blockChangedBy: getBlockChangedBy(blockItem, historyRowByKey),
              accountCreatedAt: selectedPersonAccountMeta.get(row.accountName)?.createdAt || '',
              setStartDate: selectedPerson?.startDate || '',
            };
          })
      );
  }, [historyByDay, selectedPersonId, visibleBlockCenter, selectedPersonAccountMeta, historyRowByKey, selectedPerson?.startDate]);

  const selectedPersonSetciPayments = useMemo(() => {
    if (!selectedPerson) return [];
    return visibleSetciPayments
      .filter((item) => item.personName === selectedPerson.fullName)
      .sort((left, right) => String(right.createdAt || right.date || '').localeCompare(String(left.createdAt || left.date || '')));
  }, [selectedPerson, visibleSetciPayments]);

  const selectedPersonSetPaymentRows = useMemo(() => {
    if (!selectedPerson) return [];
    return allSetPaymentRows
      .filter((item) => item.personId === selectedPerson.id)
      .sort((left, right) => String(right.createdAt || right.date || '').localeCompare(String(left.createdAt || left.date || '')));
  }, [selectedPerson, allSetPaymentRows]);

  const setciPaymentSummary = useMemo(() => ({
    count: currentDaySetciPayments.length,
    amount: currentDaySetciPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  }), [currentDaySetciPayments]);

  const onlineUsersSummary = useMemo(() => {
    if (!onlineUsers.length) {
      return {
        title: 'Aktif kullanıcı yok',
        detail: 'Şu anda panelde canlı işlem yapan bir kullanıcı görünmüyor.',
      };
    }

    const names = onlineUsers.map((user) => `${user.displayName}${user.pageLabel ? ` (${user.pageLabel})` : ''}`);
    return {
      title: `${onlineUsers.length} aktif kullanıcı`,
      detail: names.join(', '),
    };
  }, [onlineUsers]);

  const chartDailyTrend = useMemo(() => {
    const keys = Object.keys(historyByDay).sort();
    const latestBlockByRowKey = buildLatestBlockMap(visibleBlockCenter);
    return keys.slice(-7).map((day) => {
      const rows = historyByDay[day] || [];
      const active = rows.reduce((sum, row) => {
        const breakdown = getRowFinancialBreakdown(row, latestBlockByRowKey.get(row.id));
        return sum + breakdown.positiveAmount;
      }, 0);
      const blocked = rows.reduce((sum, row) => {
        const breakdown = getRowFinancialBreakdown(row, latestBlockByRowKey.get(row.id));
        return sum + breakdown.negativeAmount;
      }, 0);
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
  const username = normalizeUsername(row.username || '');
  const displayName = normalizeDisplayName(row.display_name || row.displayName || username);
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
    .map((row) => {
      const accounts = (grouped[row.id] || [])
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((acc) => ({
          id: acc.id,
          bankName: acc.bank_name,
          sortOrder: Number(acc.sort_order || 0),
          createdAt: acc.created_at || '',
        }));

      return {
        id: row.id,
        fullName: row.full_name,
        startDate: row.start_date || TODAY,
        createdByUserId: row.created_by || '',
        createdAt: row.created_at || '',
        accounts,
        accountNames: accounts.map((acc) => acc.bankName),
      };
    });
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
  const resultList = row.result_list || 'merkez';
  const normalizedType = resultList === SET_PAYMENT_RESULT ? normalizeStatus(row.type, 'pasif') : normalizeBlockedStatus(row.type);
  return {
    id: row.id,
    sourceRowKey: row.source_row_key || '',
    date: row.date || TODAY,
    personName: row.person_name || '',
    accountName: row.account_name || '',
    amount: Number(row.amount || 0),
    type: normalizedType,
    note: row.note || '',
    resolution: row.resolution || 'cozulmedi',
    resultList,
    resolvedAmount: Number(row.resolved_amount || 0),
    createdBy: row.created_by || '',
    createdAt: row.created_at || '',
  };
}

async function repairLegacyStatusRows(transactionRows = [], blockRows = []) {
  const txFixes = transactionRows.filter((row) => shouldRepairTransactionStatus(row.status));
  const blockFixes = blockRows.filter((row) => {
    if ((row.result_list || '') === SET_PAYMENT_RESULT) {
      return shouldRepairTransactionStatus(row.type);
    }
    return shouldRepairBlockStatus(row.type);
  });
  const normalizedTransactions = transactionRows.map((row) => ({
    ...row,
    status: normalizeStatus(row.status, 'pasif'),
  }));
  const normalizedBlocks = blockRows.map((row) => ({
    ...row,
    type: (row.result_list || '') === SET_PAYMENT_RESULT
      ? normalizeStatus(row.type, 'pasif')
      : normalizeBlockedStatus(row.type),
  }));
  const blockRepairs = collectNegativeStatusBlockRepairs(normalizedTransactions, normalizedBlocks);
  const duplicateBlockRepairs = collectDuplicateOpenBlockRepairs(normalizedBlocks);

  if (
    !txFixes.length &&
    !blockFixes.length &&
    !blockRepairs.inserts.length &&
    !blockRepairs.updates.length &&
    !duplicateBlockRepairs.length
  ) {
    return {
      txFixedCount: 0,
      blockFixedCount: 0,
      insertedBlockCount: 0,
      updatedBlockCount: 0,
      duplicateBlockCount: 0,
      didRepair: false,
    };
  }

  await Promise.all([
    ...txFixes.map((row) =>
      supabase
        .from('transactions')
        .update({ status: normalizeStatus(row.status, 'pasif') })
        .eq('row_key', row.row_key)
        .then(({ error }) => {
          if (error) throw error;
        })
    ),
    ...blockFixes.map((row) =>
      supabase
        .from('blocks')
        .update({
          type: (row.result_list || '') === SET_PAYMENT_RESULT
            ? normalizeStatus(row.type, 'pasif')
            : normalizeBlockedStatus(row.type),
        })
        .eq('id', row.id)
        .then(({ error }) => {
          if (error) throw error;
        })
    ),
    ...blockRepairs.updates
      .filter((row) => row.id)
      .map((row) =>
        supabase
          .from('blocks')
          .update({
            type: row.type,
            amount: Number(row.amount || 0),
            note: row.note || '',
            date: row.date || TODAY,
            person_name: row.person_name || '',
            account_name: row.account_name || '',
            resolution: 'cozulmedi',
            result_list: 'merkez',
            resolved_amount: 0,
          })
          .eq('id', row.id)
          .then(({ error }) => {
            if (error) throw error;
          })
      ),
    ...duplicateBlockRepairs.map((row) =>
      supabase
        .from('blocks')
        .update({
          resolution: row.resolution,
          result_list: row.result_list,
          resolved_amount: Number(row.resolved_amount || 0),
          note: row.note || '',
        })
        .eq('id', row.id)
        .then(({ error }) => {
          if (error) throw error;
        })
    ),
  ]);

  if (blockRepairs.inserts.length) {
    const { error: insertRepairError } = await supabase.from('blocks').insert(
      blockRepairs.inserts.map((item) => ({
        source_row_key: item.source_row_key,
        date: item.date || TODAY,
        person_name: item.person_name || '',
        account_name: item.account_name || '',
        amount: Number(item.amount || 0),
        type: item.type,
        note: item.note || '',
        resolution: 'cozulmedi',
        result_list: 'merkez',
        resolved_amount: 0,
        created_by: item.created_by || '',
      }))
    );
    if (insertRepairError) throw insertRepairError;
  }

  return {
    txFixedCount: txFixes.length,
    blockFixedCount: blockFixes.length,
    insertedBlockCount: blockRepairs.inserts.length,
    updatedBlockCount: blockRepairs.updates.length,
    duplicateBlockCount: duplicateBlockRepairs.length,
    didRepair: true,
  };
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
    let [usersRes, banksRes, peopleRes, accountsRes, txRes, blocksRes] = await Promise.all([
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

    try {
      const repairSummary = await repairLegacyStatusRows(txRes.data || [], blocksRes.data || []);
      if (repairSummary?.didRepair) {
        [txRes, blocksRes] = await Promise.all([
          supabase.from('transactions').select('*').order('day', { ascending: true }),
          supabase.from('blocks').select('*').order('created_at', { ascending: false }),
        ]);
        if (txRes.error) throw txRes.error;
        if (blocksRes.error) throw blocksRes.error;
      }
    } catch {}

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
    setSelectedDay((prev) => {
      const preferredDay = prev || getStoredReportDay();
      return preferredDay && nextHistory[preferredDay] ? preferredDay : getLatestHistoryDay(nextHistory);
    });
    setBlockCenter(nextBlocks);
    setDataReady(true);
    return { users: nextUsers, banks: nextBanks, people: nextPeople, history: nextHistory, blocks: nextBlocks };
  } finally {
    setAppLoading(false);
  }
}

  function handleExportPDF() {
    const doc = new jsPDF();
    const generatedAt = getTurkeyNow().dateTime;
    let y = renderPdfHeader(doc, 'SET YONETIM PANELI RAPORU', [
      `Rapor Gunu: ${selectedDay}`,
      `Olusturma: ${generatedAt}`,
      `Aktif + NFC Bakiye: ${formatMoney(groupedTotals.positiveAmount)}`,
      `Bloke + Sifre Kilit: ${formatMoney(groupedTotals.negativeAmount)}`,
      `Aktife Alinan Hesaplar: ${groupedTotals.activatedCount}`,
      `Kapanan Hesaplar: ${groupedTotals.closedCount}`,
      `Setci Odemesi: ${formatMoney(setciPaymentSummary.amount)} / ${setciPaymentSummary.count} kayit`,
      `Canli Kullanicilar: ${onlineUsersSummary.detail}`,
    ]);

    y = renderPdfSection(
      doc,
      'SET DURUMU',
      visibleDailyRows.map((row, idx) => {
        const breakdown = getRowFinancialBreakdown(row, currentDayBlockByRowKey.get(row.id));
        const person = personById.get(row.personId);
        const accountMeta = (person?.accounts || []).find((account) => account.bankName === row.accountName);
        return `${idx + 1}. ${row.personName} | ${row.accountName} | Set Alinma: ${person?.startDate || '-'} | Banka Eklenme: ${formatDisplayDateTime(accountMeta?.createdAt || '')} | Kayit: ${formatMoney(row.amount)} | Aktif+NFC: ${formatMoney(breakdown.positiveAmount)} | Bloke: ${formatMoney(breakdown.negativeAmount)} | Durum: ${getStatusLabel(row.status)} | Not: ${row.note || 'Not yok'} | Islem: ${row.editedBy || '-'} | Tarih: ${row.editedAt || '-'}`;
      }),
      y
    );

    if (allSetPaymentRows.length) {
      y = renderPdfSection(
        doc,
        'SET ODEMELERI',
        allSetPaymentRows.map((item, index) => `${index + 1}. ${item.personName} | ${item.monthLabel} | ${item.setPaymentStatusLabel} | Tutar: ${formatMoney(item.amount)} | Set Alinma: ${item.setStartDate || '-'} | Banka Sayisi: ${item.bankCount} | Bankalar: ${item.bankList || '-'} | Not: ${item.note || 'Not yok'} | Islem: ${item.createdBy || '-'} | Tarih: ${formatDisplayDateTime(item.createdAt || item.date)}`),
        y
      );
    }

    if (currentDaySetciPayments.length) {
      y = renderPdfSection(
        doc,
        'SETCI ODEMESI KAYITLARI',
        currentDaySetciPayments.map((item, index) => `${index + 1}. ${item.personName} | ${item.accountName} | ${formatMoney(item.amount)} | ${item.createdBy || '-'} | ${formatDisplayDateTime(item.createdAt || item.date)} | ${item.note || 'Not yok'}`),
        y
      );
    }

    doc.save(`set-yonetim-paneli-${selectedDay}.pdf`);
  }

  function handleExportExcel() {
    const workbook = XLSX.utils.book_new();
    const generatedAt = getTurkeyNow().dateTime;

    appendStructuredSheet(workbook, {
      sheetName: 'Set Durumu',
      title: 'Set Yönetim Paneli Raporu',
      summaryRows: [
        `Rapor Gunu: ${selectedDay}`,
        `Olusturma: ${generatedAt}`,
        `Aktif + NFC Bakiye: ${formatMoney(groupedTotals.positiveAmount)}`,
        `Bloke + Sifre Kilit: ${formatMoney(groupedTotals.negativeAmount)}`,
      ],
      columns: [
        { key: 'personName', label: 'Şahıs', width: 22 },
        { key: 'accountName', label: 'Hesap', width: 22 },
        { key: 'setStartDate', label: 'Set Alınma Tarihi', width: 16 },
        { key: 'accountCreatedAt', label: 'Banka Eklenme Tarihi', width: 20 },
        { key: 'amount', label: 'Kayıt Tutarı', width: 14, type: 'currency' },
        { key: 'positiveAmount', label: 'Aktif + NFC', width: 14, type: 'currency' },
        { key: 'negativeAmount', label: 'Bloke + Şifre Kilit', width: 18, type: 'currency' },
        { key: 'statusLabel', label: 'Durum', width: 16 },
        { key: 'note', label: 'Not', width: 28 },
        { key: 'editedBy', label: 'İşlemi Yapan', width: 20 },
        { key: 'editedAt', label: 'Son Değişiklik', width: 20 },
      ],
      rows: visibleDailyRows.map((row) => {
        const breakdown = getRowFinancialBreakdown(row, currentDayBlockByRowKey.get(row.id));
        const person = personById.get(row.personId);
        const accountMeta = (person?.accounts || []).find((account) => account.bankName === row.accountName);
        return {
          ...row,
          setStartDate: person?.startDate || '',
          accountCreatedAt: formatDisplayDateTime(accountMeta?.createdAt || ''),
          positiveAmount: Number(breakdown.positiveAmount || 0),
          negativeAmount: Number(breakdown.negativeAmount || 0),
          statusLabel: getStatusLabel(row.status),
        };
      }),
    });

    if (allSetPaymentRows.length) {
      appendStructuredSheet(workbook, {
        sheetName: 'Set Odemeleri',
        title: 'Set Ödemeleri',
        summaryRows: [
          `Rapor Gunu: ${selectedDay}`,
          `Olusturma: ${generatedAt}`,
        ],
        columns: [
          { key: 'personName', label: 'Şahıs', width: 22 },
          { key: 'monthLabel', label: 'Dönem', width: 12 },
          { key: 'setPaymentStatusLabel', label: 'Durum', width: 14 },
          { key: 'amount', label: 'Tutar', width: 14, type: 'currency' },
          { key: 'setStartDate', label: 'Set Alınma Tarihi', width: 16 },
          { key: 'bankCount', label: 'Banka Sayısı', width: 12, type: 'number' },
          { key: 'bankList', label: 'Sete Eklenen Bankalar', width: 42 },
          { key: 'note', label: 'Not', width: 28 },
          { key: 'createdBy', label: 'İşlemi Yapan', width: 18 },
          { key: 'createdAt', label: 'Değişiklik Tarihi', width: 20, value: (row) => formatDisplayDateTime(row.createdAt || row.date) },
        ],
        rows: allSetPaymentRows,
      });
    }

    if (currentDaySetciPayments.length) {
      appendStructuredSheet(workbook, {
        sheetName: 'Setci Odemesi',
        title: 'Setçi Ödemesi Kayıtları',
        summaryRows: [
          `Rapor Gunu: ${selectedDay}`,
          `Olusturma: ${generatedAt}`,
        ],
        columns: [
          { key: 'date', label: 'Rapor Gunu', width: 14 },
          { key: 'personName', label: 'Şahıs', width: 22 },
          { key: 'accountName', label: 'Hesap', width: 22 },
          { key: 'amount', label: 'Alınan Tutar', width: 14, type: 'currency' },
          { key: 'createdBy', label: 'İşlemi Yapan', width: 18 },
          { key: 'createdAt', label: 'Değişiklik Tarihi', width: 20, value: (row) => formatDisplayDateTime(row.createdAt || row.date) },
          { key: 'note', label: 'Not', width: 28 },
        ],
        rows: currentDaySetciPayments,
      });
    }

    XLSX.writeFile(workbook, `set-yonetim-paneli-${selectedDay}.xlsx`);
  }

  function handlePersonExportPDF() {
    if (!selectedPerson) {
      showActionNotice('Bilgi', 'Önce rapor almak istediğiniz kişiyi seçin.');
      return;
    }

    const doc = new jsPDF();
    let y = renderPdfHeader(doc, `${selectedPerson.fullName} SET RAPORU`, [
      `Rapor Gunu: ${selectedDay}`,
      `Set Alinma Tarihi: ${selectedPerson.startDate || '-'}`,
      `Toplam Hesap: ${selectedPerson.accountNames.length}`,
      `Kayit Sayisi: ${selectedPersonReportRows.length}`,
    ]);

    y = renderPdfSection(
      doc,
      'KISI BAZLI HAREKETLER',
      selectedPersonReportRows.map((row, idx) => `${idx + 1}. ${row.day} | ${row.accountName} | Set Alinma: ${row.setStartDate || '-'} | Banka Eklenme: ${formatDisplayDateTime(row.accountCreatedAt)} | Kayit: ${formatMoney(row.amount)} | Aktif+NFC: ${formatMoney(row.positiveAmount)} | Bloke: ${formatMoney(row.negativeAmount)} | ${row.statusLabel} | ${row.note || 'Not yok'} | ${row.editedBy || '-'} | ${row.editedAt || '-'} | Bloke Sonucu: ${row.blockResultLabel}`),
      y
    );

    if (selectedPersonSetPaymentRows.length) {
      y = renderPdfSection(
        doc,
        'SET ODEMELERI',
        selectedPersonSetPaymentRows.map((item, idx) => `${idx + 1}. ${item.monthLabel} | ${item.setPaymentStatusLabel} | ${formatMoney(item.amount)} | Set Alinma: ${item.setStartDate || '-'} | Banka Sayisi: ${item.bankCount} | Bankalar: ${item.bankList || '-'} | Not: ${item.note || 'Not yok'} | ${item.createdBy || '-'} | ${formatDisplayDateTime(item.createdAt || item.date)}`),
        y
      );
    }

    if (selectedPersonSetciPayments.length) {
      y = renderPdfSection(
        doc,
        'SETCI ODEMESI KAYITLARI',
        selectedPersonSetciPayments.map((item, idx) => `${idx + 1}. ${item.date} | ${item.accountName} | ${formatMoney(item.amount)} | ${item.createdBy || '-'} | ${formatDisplayDateTime(item.createdAt || item.date)} | ${item.note || 'Not yok'}`),
        y
      );
    }

    doc.save(`set-raporu-${selectedPerson.fullName}-${selectedDay}.pdf`);
  }

  function handlePersonExportExcel() {
    if (!selectedPerson) {
      showActionNotice('Bilgi', 'Önce rapor almak istediğiniz kişiyi seçin.');
      return;
    }

    const workbook = XLSX.utils.book_new();
    const generatedAt = getTurkeyNow().dateTime;

    appendStructuredSheet(workbook, {
      sheetName: 'Kisi Raporu',
      title: `${selectedPerson.fullName} Kişi Bazlı Rapor`,
      summaryRows: [
        `Rapor Gunu: ${selectedDay}`,
        `Set Alinma Tarihi: ${selectedPerson.startDate || '-'}`,
        `Olusturma: ${generatedAt}`,
      ],
      columns: [
        { key: 'day', label: 'Gun', width: 14 },
        { key: 'personName', label: 'Şahıs', width: 22 },
        { key: 'accountName', label: 'Hesap', width: 22 },
        { key: 'setStartDate', label: 'Set Alınma Tarihi', width: 16 },
        { key: 'accountCreatedAt', label: 'Banka Eklenme Tarihi', width: 20, value: (row) => formatDisplayDateTime(row.accountCreatedAt) },
        { key: 'amount', label: 'Kayıt Tutarı', width: 14, type: 'currency' },
        { key: 'positiveAmount', label: 'Aktif + NFC', width: 14, type: 'currency' },
        { key: 'negativeAmount', label: 'Bloke + Şifre Kilit', width: 18, type: 'currency' },
        { key: 'statusLabel', label: 'Durum', width: 16 },
        { key: 'note', label: 'Not', width: 28 },
        { key: 'editedBy', label: 'Düzenleyen', width: 18 },
        { key: 'editedAt', label: 'Düzenleme Tarihi', width: 20 },
        { key: 'blockResultLabel', label: 'Bloke Sonucu', width: 16 },
        { key: 'blockNote', label: 'Bloke Notu', width: 28 },
        { key: 'blockCreatedAt', label: 'Bloke Kayıt Tarihi', width: 20, value: (row) => formatDisplayDateTime(row.blockCreatedAt) },
        { key: 'blockChangedAt', label: 'Bloke Değişiklik Tarihi', width: 22, value: (row) => formatDisplayDateTime(row.blockChangedAt) },
        { key: 'blockChangedBy', label: 'Bloke İşlemi Yapan', width: 18 },
      ],
      rows: selectedPersonReportRows,
    });

    if (selectedPersonSetPaymentRows.length) {
      appendStructuredSheet(workbook, {
        sheetName: 'Set Odemeleri',
        title: `${selectedPerson.fullName} Set Ödemeleri`,
        summaryRows: [
          `Rapor Gunu: ${selectedDay}`,
          `Olusturma: ${generatedAt}`,
        ],
        columns: [
          { key: 'monthLabel', label: 'Dönem', width: 12 },
          { key: 'setPaymentStatusLabel', label: 'Durum', width: 14 },
          { key: 'amount', label: 'Tutar', width: 14, type: 'currency' },
          { key: 'setStartDate', label: 'Set Alınma Tarihi', width: 16 },
          { key: 'bankCount', label: 'Banka Sayısı', width: 12, type: 'number' },
          { key: 'bankList', label: 'Sete Eklenen Bankalar', width: 42 },
          { key: 'note', label: 'Not', width: 28 },
          { key: 'createdBy', label: 'İşlemi Yapan', width: 18 },
          { key: 'createdAt', label: 'Değişiklik Tarihi', width: 20, value: (row) => formatDisplayDateTime(row.createdAt || row.date) },
        ],
        rows: selectedPersonSetPaymentRows,
      });
    }

    if (selectedPersonSetciPayments.length) {
      appendStructuredSheet(workbook, {
        sheetName: 'Setci Odemesi',
        title: `${selectedPerson.fullName} Setçi Ödemesi`,
        summaryRows: [
          `Rapor Gunu: ${selectedDay}`,
          `Olusturma: ${generatedAt}`,
        ],
        columns: [
          { key: 'date', label: 'Gun', width: 14 },
          { key: 'personName', label: 'Şahıs', width: 22 },
          { key: 'accountName', label: 'Hesap', width: 22 },
          { key: 'amount', label: 'Alınan Tutar', width: 14, type: 'currency' },
          { key: 'createdBy', label: 'İşlemi Yapan', width: 18 },
          { key: 'createdAt', label: 'Tarih', width: 20, value: (row) => formatDisplayDateTime(row.createdAt || row.date) },
          { key: 'note', label: 'Not', width: 28 },
        ],
        rows: selectedPersonSetciPayments,
      });
    }
    XLSX.writeFile(workbook, `set-raporu-${selectedPerson.fullName}-${selectedDay}.xlsx`);
  }

  function handleBlockExportPDF() {
    const doc = new jsPDF();
    let y = renderPdfHeader(doc, 'BLOKE MERKEZI RAPORU', [
      `Rapor Gunu: ${selectedDay}`,
      `Olusturma: ${getTurkeyNow().dateTime}`,
      `Acik Bloke Sayisi: ${blockSummary.unresolvedCount}`,
      `Acik Bloke Tutari: ${formatMoney(blockSummary.unresolvedAmount)}`,
    ]);

    if (blockTableRows.length === 0) {
      renderPdfSection(doc, '', ['Kayit yok.'], y);
      doc.save(`bloke-merkezi-${selectedDay}.pdf`);
      return;
    }

    renderPdfSection(
      doc,
      'ACIK BLOKE KAYITLARI',
      blockTableRows.map((item, index) => `${index + 1}. ${item.personName} | ${item.accountName} | ${formatMoney(getCurrentBlockedAmount(item))} | ${STATUS_META[item.type]?.label || item.type} | Bloke Olma: ${getBlockCreatedDisplayValue(item)} | Not: ${item.note || 'Not yok'} | Cozum: ${item.resolution} | Sonuc: ${item.resultList} | Olusturan: ${item.createdBy || '-'} | Son Degisiklik: ${formatDisplayDateTime(getBlockChangedAt(item, historyRowByKey))} | Son Islem: ${getBlockChangedBy(item, historyRowByKey) || '-'}`),
      y
    );
    doc.save(`bloke-merkezi-${selectedDay}.pdf`);
  }

  function handleBlockExportExcel() {
    const workbook = XLSX.utils.book_new();
    appendStructuredSheet(workbook, {
      sheetName: 'Bloke Merkezi',
      title: 'Bloke Merkezi Raporu',
      summaryRows: [
        `Rapor Gunu: ${selectedDay}`,
        `Olusturma: ${getTurkeyNow().dateTime}`,
      ],
      columns: [
        { key: 'date', label: 'Rapor Günü', width: 14 },
        { key: 'blockCreatedAt', label: 'Bloke Olma Tarihi', width: 20 },
        { key: 'personName', label: 'Şahıs', width: 22 },
        { key: 'accountName', label: 'Hesap', width: 22 },
        { key: 'amount', label: 'Tutar', width: 14, type: 'currency' },
        { key: 'typeLabel', label: 'Durum', width: 16 },
        { key: 'note', label: 'Not', width: 28 },
        { key: 'resolution', label: 'Çözüm', width: 14 },
        { key: 'resultList', label: 'Sonuc', width: 16 },
        { key: 'createdBy', label: 'Oluşturan Kullanıcı', width: 18 },
        { key: 'changedAt', label: 'Son Değişiklik Tarihi', width: 22 },
        { key: 'changedBy', label: 'İşlemi Yapan Kullanıcı', width: 18 },
      ],
      rows: blockTableRows.map((item) => ({
        ...item,
        blockCreatedAt: getBlockCreatedDisplayValue(item),
        amount: Number(getCurrentBlockedAmount(item) || 0),
        typeLabel: STATUS_META[item.type]?.label || item.type,
        changedAt: formatDisplayDateTime(getBlockChangedAt(item, historyRowByKey)),
        changedBy: getBlockChangedBy(item, historyRowByKey),
      })),
    });
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
    if (historyByDay[day]) {
      setSelectedDay(day);
      return true;
    }
    showActionNotice('Bilgi', 'Yeni bir rapor gunu acmak icin Yeni Gune Basla butonunu kullanin.');
    return false;
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
      editedBy: row.editedBy || '',
      editedAt: row.editedAt || '',
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
      edited_by: row.editedBy || '',
      edited_at: row.editedAt || '',
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
      const username = normalizeUsername(login.username);
      const password = String(login.password || '').trim();
      if (!username || !password) {
        showActionNotice('Hata', 'Kullanıcı adı ve şifre zorunludur.', 'danger');
        return;
      }
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      const matchedUser = data?.[0] || null;
      if (error || !matchedUser) {
        showActionNotice('Hata', 'Giriş bilgileri hatalı.', 'danger');
        return;
      }

      const savedPassword = String(matchedUser.password || '').trim();
      if (savedPassword !== password) {
        showActionNotice('Hata', 'Giriş bilgileri hatalı.', 'danger');
        return;
      }

      const normalizedUser = normalizeUserRecord(matchedUser);
      if (normalizedUser.isDeleted) {
        showActionNotice('Hata', 'Bu kullanıcı silinmiş durumda.', 'danger');
        return;
      }
      if (!normalizedUser.isActive) {
        showActionNotice('Hata', 'Bu kullanıcı pasif durumda.', 'danger');
        return;
      }

      setCurrentUser(normalizedUser);
      setLogin({ username: '', password: '' });
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
    const persistedStatus = normalizeStatus(currentRow?.status, 'pasif');

    if (key === 'status' && !canManage && isManagerLockedStatus(persistedStatus) && nextValue !== persistedStatus) {
      showActionNotice('Yetki yok', 'BLOKE ve ÅžÄ°FRE KÄ°LÄ°T durumunu sadece yÃ¶netici deÄŸiÅŸtirebilir.', 'danger');
      return;
    }

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

  const lockedStatusViolation = Object.values(pendingSetRows).find((nextRow) => {
    const currentRow = (historyByDay[selectedDay] || []).find((row) => row.id === nextRow.id);
    const previousStatus = normalizeStatus(currentRow?.status, 'pasif');
    const nextStatus = normalizeStatus(nextRow?.status, 'pasif');
    return !canManage && isManagerLockedStatus(previousStatus) && nextStatus !== previousStatus;
  });

  if (lockedStatusViolation) {
    showActionNotice('Yetki yok', 'BLOKE ve SIFRE KILIT durumunu sadece yonetici geri degistirebilir.', 'danger');
    return;
  }

  const latestBlockByRowKey = buildLatestBlockMap(blockCenter);
  const newBlockItems = [];
  const updatedBlockItems = [];
  const nextRows = (historyByDay[selectedDay] || []).map((row) => {
    const nextRow = pendingSetRows[row.id];
    if (!nextRow) return row;

    const previousStatus = normalizeStatus(row.status, 'pasif');
    const nextStatus = normalizeStatus(nextRow.status, 'pasif');
    const isBlockedNow = nextStatus === 'bloke' || nextStatus === 'sifre_kilit';
    const sourceRowKey = makeRowKey(selectedDay, nextRow.personId, nextRow.accountName);
    const latestBlockItem = latestBlockByRowKey.get(sourceRowKey) || null;
    const latestBlockLifecycle = getBlockLifecycleState(latestBlockItem);
    const hasOpenBlock = latestBlockLifecycle === 'unresolved';

    if (isBlockedNow) {
      const carriedResolvedAmount = Math.max(
        0,
        Math.min(Number(nextRow.amount || 0), Number(latestBlockItem?.resolvedAmount || 0))
      );
      const syncedBlockItem = {
        id: latestBlockItem?.id,
        sourceRowKey,
        date: selectedDay,
        personName: nextRow.personName,
        accountName: nextRow.accountName,
        amount: Number(nextRow.amount || 0),
        type: normalizeBlockedStatus(nextStatus),
        note: nextRow.note || latestBlockItem?.note || '',
        resolution: carriedResolvedAmount > 0 ? 'cozuldu' : 'cozulmedi',
        resultList: 'merkez',
        resolvedAmount: carriedResolvedAmount,
        createdBy: latestBlockItem?.createdBy || currentUser.displayName,
      };

      if (hasOpenBlock && latestBlockItem?.id) updatedBlockItems.push(syncedBlockItem);
      else newBlockItems.push(syncedBlockItem);
    } else if (hasOpenBlock && latestBlockItem?.id) {
      let resultList = 'merkez';
      let resolution = 'cozulmedi';

      if (nextStatus === 'pasif') {
        resultList = 'kapandi';
        resolution = 'cozuldu';
      } else if (isPositiveStatus(nextStatus)) {
        resultList = 'aktif_alindi';
        resolution = 'cozuldu';
      }

      updatedBlockItems.push({
        id: latestBlockItem.id,
        sourceRowKey,
        date: selectedDay,
        personName: nextRow.personName,
        accountName: nextRow.accountName,
        amount: Number(latestBlockItem.amount || nextRow.amount || 0),
        type: normalizeBlockedStatus(latestBlockItem.type || previousStatus),
        note: nextRow.note || latestBlockItem.note || 'Durum tablosundan guncellendi',
        resolution,
        resultList,
        resolvedAmount: Number(latestBlockItem.resolvedAmount || 0),
        createdBy: latestBlockItem.createdBy || currentUser.displayName,
      });
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

    if (updatedBlockItems.length) {
      await Promise.all(
        updatedBlockItems.map(async (item) => {
          const { error: blockError } = await supabase
            .from('blocks')
            .update({
              date: item.date,
              person_name: item.personName,
              account_name: item.accountName,
              amount: Number(item.amount || 0),
              type: normalizeBlockedStatus(item.type),
              note: item.note || '',
              resolution: item.resolution,
              result_list: item.resultList,
              resolved_amount: Number(item.resolvedAmount || 0),
            })
            .eq('id', item.id);
          if (blockError) throw blockError;
        })
      );
    }

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
        clearStoredCurrentUser();
        setLogin({ username: '', password: '' });
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
    if (hasUnsavedAny()) {
      setPendingSection('logout');
      setNavigationWarningMessage('Lütfen girdiğiniz verileri kaydedin.');
      setNavigationWarningOpen(true);
      return;
    }
    clearStoredCurrentUser();
    setLogin({ username: '', password: '' });
    setCurrentUser(null);
  }

  async function createOrRestoreUser(draftUser) {
    const displayName = normalizeDisplayName(draftUser.displayName);
    const username = normalizeUsername(draftUser.username);
    const password = String(draftUser.password || '').trim();

    if (!displayName || !username || !password) {
      throw new Error('Yeni kullanıcı için ad, kullanıcı adı ve şifre zorunludur.');
    }

    const { data: existingUsers, error: existingError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .order('created_at', { ascending: false });

    if (existingError) throw existingError;

    const activeMatch = (existingUsers || []).find((user) => Boolean(user.is_active ?? user.isActive));
    if (activeMatch) {
      throw new Error('Bu kullanıcı adı zaten kullanılıyor.');
    }

    const inactiveMatch = (existingUsers || [])[0];
    if (inactiveMatch) {
      const { error: restoreError } = await supabase
        .from('users')
        .update({
          username,
          password,
          role: draftUser.role,
          display_name: displayName,
          is_active: true,
          can_enter_data: true,
        })
        .eq('id', inactiveMatch.id);

      if (restoreError) throw restoreError;
      return { action: 'restored', displayName };
    }

    const { error: createError } = await supabase.from('users').insert({
      username,
      password,
      role: draftUser.role,
      display_name: displayName,
      is_active: true,
      can_enter_data: true,
    });

    if (createError) throw createError;
    return { action: 'created', displayName };
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
      const createdUser = await createOrRestoreUser(newUserForm);
      createdUserName = createdUser.displayName;
      setNewUserForm({ displayName: '', username: '', password: '', role: 'user' });
      await loadUsersFromDb();
      setPasswordDrafts({});
      setUserPermissionDrafts({});

      if (updatedNames.length > 0) {
        showActionNotice('KullanÄ±cÄ± bÃ¶lÃ¼mÃ¼ kaydedildi', `${updatedNames.length} ÅŸifre gÃ¼ncellendi ve ${createdUserName} eklendi.`);
      } else {
        showActionNotice('KullanÄ±cÄ± oluÅŸturuldu', `${createdUserName} eklendi.`);
      }

      return true;

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
      clearStoredCurrentUser();
      setLogin({ username: '', password: '' });
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
    setNewPersonDate(selectedDay);
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
    const hasDuplicateAccounts = new Set(finalNames.map((name) => name.toLocaleLowerCase('tr-TR'))).size !== finalNames.length;
    if (finalNames.length !== count || finalNames.some((name) => !name)) {
      return showActionNotice('Hata', 'Seçtiğiniz hesap sayısı kadar banka seçmek zorunlu.', 'danger');
    }

    if (hasDuplicateAccounts) {
      return showActionNotice('Hata', 'Ayni banka ayni sette birden fazla kez kullanilamaz.', 'danger');
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

        {
        const existingAccounts = original.accounts || [];
        const existingAccountByName = new Map(existingAccounts.map((account) => [account.bankName, account]));
        const retainedAccountIds = new Set();
        const accountOrderUpdates = [];
        const newAccountPayload = [];

        finalNames.forEach((bankName, index) => {
          const existingAccount = existingAccountByName.get(bankName);
          if (existingAccount) {
            retainedAccountIds.add(existingAccount.id);
            if (Number(existingAccount.sortOrder || 0) !== index + 1) {
              accountOrderUpdates.push({ id: existingAccount.id, sort_order: index + 1 });
            }
            return;
          }

          newAccountPayload.push({
            person_id: editingPersonId,
            bank_name: bankName,
            sort_order: index + 1,
          });
        });

        for (const accountUpdate of accountOrderUpdates) {
          const { error: updateAccountError } = await supabase
            .from('accounts')
            .update({ sort_order: accountUpdate.sort_order })
            .eq('id', accountUpdate.id);
          if (updateAccountError) throw updateAccountError;
        }

        const removedAccountIds = existingAccounts
          .filter((account) => !retainedAccountIds.has(account.id))
          .map((account) => account.id);

        if (removedAccountIds.length) {
          const { error: deleteAccountsError } = await supabase.from('accounts').delete().in('id', removedAccountIds);
          if (deleteAccountsError) throw deleteAccountsError;
        }

        if (newAccountPayload.length) {
          const { error: insertAccountsError } = await supabase.from('accounts').insert(newAccountPayload);
          if (insertAccountsError) throw insertAccountsError;
        }

        const originalAccountNames = original.accountNames || [];
        const rebuiltTransactions = [];
        Object.keys(historyByDay).forEach((day) => {
          finalNames.forEach((accountName, index) => {
            const fallbackAccountName = originalAccountNames.includes(accountName)
              ? accountName
              : originalAccountNames[index] || accountName;
            const oldRow = (historyByDay[day] || []).find(
              (row) =>
                row.personId === editingPersonId &&
                (row.accountName === accountName || row.accountName === fallbackAccountName)
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
          const previousIndex = originalAccountNames.findIndex((name) => name === block.account_name);
          const mappedAccountName = finalNames.includes(block.account_name)
            ? block.account_name
            : finalNames[previousIndex] || finalNames[0] || block.account_name;

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
        showActionNotice('Guncellendi', 'Set bilgileri Supabase uzerinde guncellendi.');
        return;
        }

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
    setNewPersonDate(person.startDate || selectedDay);
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
    const createdUser = await createOrRestoreUser(newUserForm);
    await loadUsersFromDb();
    setNewUserForm({ displayName: '', username: '', password: '', role: 'user' });
    showActionNotice(createdUser.action === 'restored' ? 'Kullanici geri alindi' : 'Kullanici olusturuldu', `${createdUser.displayName} eklendi.`);
    return;
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


  function openSetciPaymentModal() {
    if (!canManage) {
      showActionNotice('Yetki yok', 'Setci Odemesi kaydini sadece yonetici olusturabilir.', 'danger');
      return;
    }
    if (Object.keys(pendingSetRows).length > 0) {
      showActionNotice('Bilgi', 'Once durum ekranindaki degisiklikleri kaydedin.');
      return;
    }
    if (!selectedPerson || eligibleSetciRows.length === 0) {
      showActionNotice('Bilgi', 'Setci Odemesi icin bakiyesi olan AKTIF veya NFC hesap secili olmali.');
      return;
    }
    setSetciPaymentDraft({
      rowId: eligibleSetciRows[0].id,
      amount: '',
      note: '',
    });
    setSetciPaymentModalOpen(true);
  }

  async function saveSetciPayment() {
    if (!canManage) return;

    const targetRow = selectedRows.find((row) => row.id === setciPaymentDraft.rowId);
    const paymentAmount = Number(setciPaymentDraft.amount || 0);
    const paymentNote = String(setciPaymentDraft.note || '').trim();

    if (!targetRow) {
      showActionNotice('Hata', 'Setci Odemesi icin hesap bulunamadi.', 'danger');
      return;
    }
    if (!isPositiveStatus(targetRow.status)) {
      showActionNotice('Hata', 'Setci Odemesi sadece AKTIF veya NFC hesaplardan alinabilir.', 'danger');
      return;
    }
    if (!paymentAmount || paymentAmount <= 0) {
      showActionNotice('Hata', 'Setci Odemesi tutari sifirdan buyuk olmali.', 'danger');
      return;
    }

    const currentAmount = Number(targetRow.amount || 0);
    if (paymentAmount > currentAmount) {
      showActionNotice('Hata', 'Setci Odemesi mevcut hesap bakiyesini asamaz.', 'danger');
      return;
    }

    const now = getTurkeyNow();

    try {
      setAppLoading(true);
      const { error: paymentLogError } = await supabase.from('blocks').insert({
        source_row_key: buildSetciPaymentSourceKey(targetRow.id),
        date: selectedDay,
        person_name: targetRow.personName,
        account_name: targetRow.accountName,
        amount: paymentAmount,
        type: 'bloke',
        note: paymentNote || 'Setci Odemesi',
        resolution: 'cozuldu',
        result_list: SETCI_PAYMENT_RESULT,
        resolved_amount: 0,
        created_by: currentUser?.displayName || '',
      });
      if (paymentLogError) throw paymentLogError;

      const { error: txError } = await supabase
        .from('transactions')
        .update({
          amount: Math.max(0, currentAmount - paymentAmount),
          edited_by: currentUser?.displayName || '',
          edited_at: now.dateTime,
        })
        .eq('row_key', targetRow.id);
      if (txError) throw txError;

      await loadSupabaseAppData();
      setSetciPaymentModalOpen(false);
      setSetciPaymentDraft({ rowId: '', amount: '', note: '' });
      showActionNotice('Setci Odemesi kaydedildi', `${targetRow.personName} / ${targetRow.accountName} icin ${formatMoney(paymentAmount)} kaydedildi.`);
    } catch (err) {
      showActionNotice('Hata', err?.message || 'Setci Odemesi kaydedilemedi.', 'danger');
    } finally {
      setAppLoading(false);
    }
  }

  async function saveSetPayment() {
    if (!setPaymentTargetPerson) {
      showActionNotice('Bilgi', 'Set odemesi icin once bir set secin.', 'danger');
      return;
    }

    const paymentAmount = Math.max(0, Number(setPaymentDraft.month1Amount || 0));
    const paymentNote = String(setPaymentDraft.month1Note || '').trim();
    const sourceKey = buildSetPaymentSourceKey(setPaymentTargetPerson.id, 'month_1');
    const existingPayment = selectedSetPaymentLogs.find((item) => item.sourceRowKey === sourceKey);

    const payload = {
      source_row_key: sourceKey,
      date: selectedDay,
      person_name: setPaymentTargetPerson.fullName,
      account_name: 'SET ODEMESI / 1. AY',
      amount: paymentAmount,
      type: 'pasif',
      note: paymentNote || 'Set odemesi',
      resolution: setPaymentDraft.month1Status === 'odendi' ? 'odendi' : 'odenmedi',
      result_list: SET_PAYMENT_RESULT,
      resolved_amount: 0,
      created_by: currentUser?.displayName || '',
    };

    try {
      setAppLoading(true);

      if (existingPayment?.id) {
        const { error } = await supabase.from('blocks').update(payload).eq('id', existingPayment.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('blocks').insert(payload);
        if (error) throw error;
      }

      await loadSupabaseAppData();
      showActionNotice(
        'Set odemesi kaydedildi',
        `${setPaymentTargetPerson.fullName} icin 1. ay durumu ${getSetPaymentStatusLabel(payload.resolution)} olarak guncellendi.`
      );
    } catch (err) {
      showActionNotice('Hata', err?.message || 'Set odemesi kaydedilemedi.', 'danger');
    } finally {
      setAppLoading(false);
    }
  }

  function openBlockResolution(item) {
    if (!canManage) return showActionNotice('Yetki yok', 'Bloke merkezini sadece yönetici düzenleyebilir.', 'danger');
    setSelectedBlockItem(item);
    setResolvedAmountInput(item.resolvedAmount ? String(item.resolvedAmount) : String(item.amount || 0));
    setBlockNoteInput(item.note || historyRowByKey.get(item.sourceRowKey)?.note || '');
    setShowResolvedAmountInput(false);
    setPendingResolveMode('cozuldu');
    setBlockDialogOpen(true);
  }

async function setBlockAsResolved(mode = 'cozuldu') {
  if (!selectedBlockItem) return;
  const nextBlockNote = String(blockNoteInput || '').trim();
  if (!nextBlockNote) {
    showActionNotice('Hata', 'Bu islem icin aciklama (not) girmek zorunludur', 'danger');
    return;
  }
  if (mode !== 'cozulmedi' && !showResolvedAmountInput) {
    setPendingResolveMode(mode);
    setShowResolvedAmountInput(true);
    return;
  }

  const finalResolvedAmount = Math.max(
    0,
    Math.min(Number(selectedBlockItem?.amount || 0), Number(resolvedAmountInput || 0))
  );
  const now = getTurkeyNow();
  let payload;
  if (mode === 'aktif_alindi') payload = { resolution: 'cozuldu', result_list: 'aktif_alindi', resolved_amount: 0, note: nextBlockNote };
  else if (mode === 'kapandi') payload = { resolution: 'cozuldu', result_list: 'kapandi', resolved_amount: 0, note: nextBlockNote };
  else if (mode === 'cozulmedi') payload = { resolution: 'cozulmedi', result_list: 'merkez', resolved_amount: 0, note: nextBlockNote };
  else payload = { resolution: 'cozuldu', result_list: 'merkez', resolved_amount: finalResolvedAmount, note: nextBlockNote };

  try {
    setAppLoading(true);
    let targetBlockId = selectedBlockItem.id;

    if (!targetBlockId || selectedBlockItem.isDerived) {
      const { data: existingRows, error: existingRowsError } = await supabase
        .from('blocks')
        .select('*')
        .eq('source_row_key', selectedBlockItem.sourceRowKey)
        .order('created_at', { ascending: false })
        .limit(1);
      if (existingRowsError) throw existingRowsError;

      const latestExistingBlock = existingRows?.[0] ? normalizeBlockRecord(existingRows[0]) : null;
      if (latestExistingBlock && getBlockLifecycleState(latestExistingBlock) === 'unresolved') {
        targetBlockId = latestExistingBlock.id;
      } else {
        const { data: insertedBlock, error: insertError } = await supabase
          .from('blocks')
          .insert({
            source_row_key: selectedBlockItem.sourceRowKey,
            date: selectedBlockItem.date || selectedDay,
            person_name: selectedBlockItem.personName,
            account_name: selectedBlockItem.accountName,
            amount: Number(selectedBlockItem.amount || 0),
            type: normalizeBlockedStatus(selectedBlockItem.type),
            note: nextBlockNote,
            resolution: 'cozulmedi',
            result_list: 'merkez',
            resolved_amount: 0,
            created_by: currentUser?.displayName || selectedBlockItem.createdBy || '',
          })
          .select('*')
          .single();
        if (insertError) throw insertError;
        targetBlockId = insertedBlock?.id;
      }
    }

    const { error } = await supabase.from('blocks').update(payload).eq('id', targetBlockId);
    if (error) throw error;

    if (selectedBlockItem.sourceRowKey) {
      const blockedStatus = normalizeBlockedStatus(selectedBlockItem.type);
      let txPatch = {
        edited_by: currentUser?.displayName || selectedBlockItem.createdBy || '',
        edited_at: now.dateTime,
        note: nextBlockNote,
      };

      if (mode === 'aktif_alindi') {
        txPatch = { ...txPatch, status: 'aktif' };
      } else if (mode === 'kapandi') {
        txPatch = { ...txPatch, status: 'pasif', amount: 0 };
      } else if (mode === 'cozulmedi') {
        txPatch = { ...txPatch, status: blockedStatus };
      } else {
        const isFullyResolved = finalResolvedAmount >= Number(selectedBlockItem.amount || 0);
        txPatch = { ...txPatch, status: isFullyResolved ? 'aktif' : blockedStatus };
      }

      const { error: txError } = await supabase.from('transactions').update(txPatch).eq('row_key', selectedBlockItem.sourceRowKey);
      if (txError) throw txError;
    }

    await loadSupabaseAppData();
    setBlockDialogOpen(false);
    setSelectedBlockItem(null);
    setResolvedAmountInput('');
    setBlockNoteInput('');
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
  clearStoredCurrentUser();
}, []);

useEffect(() => {
  if (!currentUser) {
    setDataReady(false);
    return;
  }
  loadSupabaseAppData().catch((err) => {
    showActionNotice('Hata', err?.message || 'Supabase verileri yüklenemedi.', 'danger');
  });
}, [currentUser?.id]);
  useEffect(() => {
    try {
      if (selectedDay) window.localStorage.setItem(STORAGE_REPORT_DAY, selectedDay);
    } catch {}
  }, [selectedDay]);

  useEffect(() => {
    if (!reportMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (reportMenuRef.current?.contains(event.target)) return;
      setReportMenuOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setReportMenuOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [reportMenuOpen]);

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
    if (!setPaymentTargetPerson) {
      setSetPaymentDraft({ month1Status: 'odenmedi', month1Amount: '', month1Note: '' });
      return;
    }

    setSetPaymentDraft({
      month1Status: monthOneSetPayment?.resolution === 'odendi' ? 'odendi' : 'odenmedi',
      month1Amount: monthOneSetPayment ? String(Number(monthOneSetPayment.amount || 0)) : '',
      month1Note: monthOneSetPayment?.note || '',
    });
  }, [setPaymentTargetPerson?.id, monthOneSetPayment?.id, monthOneSetPayment?.resolution, monthOneSetPayment?.amount, monthOneSetPayment?.note]);


useEffect(() => {
  if (!currentUser || !dataReady) return;
  if (historyByDay[selectedDay]) return;
  const latestDay = getLatestHistoryDay(historyByDay);
  if (latestDay && latestDay !== selectedDay) {
    setSelectedDay(latestDay);
  }
}, [currentUser, dataReady, selectedDay, historyByDay]);

  useEffect(() => {
    const handler = (e) => {
      if (hasUnsavedAny()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingSetRows, hasUnsavedSetBilgiGirisi, activeSection]);

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
              <SidebarButton active={activeSection === 'durum'} icon={PieChartIcon} label="Durum Ayarla" onClick={() => handleSectionChange('durum')} />
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
                      }}
                      className="max-w-[220px] font-bold"
                    />
                    <Button variant="outline" onClick={startNewDay}>YENİ GÜNE BAŞLA</Button>
                    <ReportMenu
                      open={reportMenuOpen}
                      menuRef={reportMenuRef}
                      selectedPerson={selectedPerson}
                      onToggle={() => setReportMenuOpen((open) => !open)}
                      onGeneralPdf={() => {
                        setReportMenuOpen(false);
                        handleExportPDF();
                      }}
                      onGeneralExcel={() => {
                        setReportMenuOpen(false);
                        handleExportExcel();
                      }}
                      onPersonPdf={() => {
                        if (!selectedPerson) return;
                        setReportMenuOpen(false);
                        handlePersonExportPDF();
                      }}
                      onPersonExcel={() => {
                        if (!selectedPerson) return;
                        setReportMenuOpen(false);
                        handlePersonExportExcel();
                      }}
                    />
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-700">
                      <span className={`h-2 w-2 rounded-full ${onlineUsers.length ? 'bg-teal-500' : 'bg-slate-400'}`} />
                      {onlineUsersSummary.title}
                    </div>
                    <div className="mt-1 text-xs font-bold text-slate-500">{onlineUsersSummary.detail}</div>
                  </div>
                </div>

                <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                  <span className={`h-2 w-2 rounded-full ${onlineUsers.length ? 'bg-teal-500' : 'bg-slate-400'}`} />
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
              </div>
            </div>
          </Card>

          {activeSection === 'genel' && (
            <>
              <div className={`grid gap-4 ${canManage ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
                {canManage && (
                  <SummaryCard
                    title="SETCI ODEMESI"
                    value={formatMoney(setciPaymentSummary.amount)}
                    subtitle={`Bugun alinan: ${setciPaymentSummary.count}`}
                    tone="cyan"
                    onClick={() => setSelectedGeneralSummary('setci')}
                  />
                )}
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
                <div className="grid gap-5 p-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
                  <div className="space-y-4">
                    <div className="mb-2 text-sm font-black">ŞAHIS SEÇ</div>
                    <SelectBox value={selectedPersonId} onChange={(e) => setSelectedPersonId(e.target.value)}>
                      {visiblePeople.map((p) => (
                        <option key={p.id} value={p.id}>{p.fullName}</option>
                      ))}
                    </SelectBox>
                    {selectedPerson && (
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                          <div className="text-[11px] font-black tracking-[0.16em] text-slate-500">SET ALINMA TARIHI</div>
                          <div className="mt-2 text-sm font-black text-slate-950">{selectedPerson.startDate || '-'}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                          <div className="text-[11px] font-black tracking-[0.16em] text-slate-500">BANKA SAYISI</div>
                          <div className="mt-2 text-sm font-black text-slate-950">{selectedPerson.accountNames.length}</div>
                        </div>
                      </div>
                    )}
                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="w-full sm:w-auto" onClick={openSetciPaymentModal}>
                          <Plus className="h-4 w-4" /> SETCI ODEMESI
                        </Button>
                      </div>
                    )}
                    {canManage && (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                        Secili kisinin AKTIF veya NFC hesabindan dusulen Setci Odemesi burada kayda alinir.
                      </div>
                    )}
                    <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                      Set duzenleme islemleri Set Bilgi Girisi ekranindan yapilir.
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <SummaryCard title="TOPLAM BAKİYE" value={formatMoney(personTotals.totalAmount)} subtitle={`Toplam hesap sayısı: ${personTotals.totalCount}`} tone="slate" />
                      <SummaryCard title="AKTİF + NFC" value={formatMoney(personTotals.activeAmount)} subtitle="Olumlu durum" tone="teal" />
                      <SummaryCard title="BLOKE + ŞİFRE KİLİT" value={formatMoney(personTotals.lockedAmount)} subtitle="Olumsuz durum" tone="rose" />
                    </div>
                    <div className="hidden rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                      Set duzenleme islemleri Set Bilgi Girisi ekranindan yapilir.
                    </div>
                    <div className="hidden flex-wrap gap-2">
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
                        const persistedRow = (historyByDay[selectedDay] || []).find((item) => item.id === row.id);
                        const activeBlockItem = currentDayBlockByRowKey.get(row.id) || null;
                        const blockManagedLifecycle = getBlockLifecycleState(activeBlockItem);
                        const isBlockManagedRow = blockManagedLifecycle === 'unresolved';
                        const statusLockedForUser = !canManage && isManagerLockedStatus(persistedRow?.status);
                        const rowTone = isBlockManagedRow
                          ? liveStatus === 'sifre_kilit'
                            ? 'bg-amber-50/70 hover:bg-amber-50/80'
                            : 'bg-rose-50/70 hover:bg-rose-50/80'
                          : isPending
                            ? 'bg-amber-50'
                            : 'bg-white hover:bg-slate-50';
                        const rowHintClass = liveStatus === 'sifre_kilit' ? 'text-amber-700' : 'text-rose-700';
                        return (
                          <div key={row.id} className={`grid grid-cols-[1.2fr_140px_180px_1fr_170px_220px] items-center gap-3 border-t border-slate-200 px-4 py-3 transition ${rowTone}`}>
                            <div>
                              <div className="font-black text-slate-900">{liveRow.accountName}</div>
                              {isBlockManagedRow && (
                                <div className={`mt-1 text-[11px] font-black tracking-[0.12em] ${rowHintClass}`}>
                                  BLOK MERKEZINDEN YONETILIR
                                </div>
                              )}
                            </div>
                            <Input
                              type="number"
                              value={liveRow.amount}
                              onChange={(e) => updateRow(row.id, 'amount', e.target.value)}
                              className="font-bold"
                              disabled={isBlockManagedRow}
                            />
                            <SelectBox
                              value={liveStatus}
                              onChange={(e) => updateRow(row.id, 'status', e.target.value)}
                              className="font-bold"
                              disabled={statusLockedForUser || isBlockManagedRow}
                            >
                              {STATUS_SELECT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </SelectBox>
                            <Input
                              value={liveRow.note}
                              onChange={(e) => updateRow(row.id, 'note', e.target.value)}
                              placeholder={isBlockManagedRow ? 'Bloke merkezi notu' : 'Not'}
                              className="font-bold"
                              disabled={isBlockManagedRow}
                            />
                            <div className="space-y-1">
                              <div><StatusBadge status={liveStatus} /></div>
                              {isBlockManagedRow && (
                                <div className={`text-[11px] font-black ${rowHintClass}`}>
                                  {liveStatus === 'sifre_kilit' ? 'SIFRE KILIT BLOK KAYDI ACIK' : 'BLOKE KAYDI ACIK'}
                                </div>
                              )}
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-right">
                              <div className="text-sm font-black text-slate-900">{liveRow.editedBy || currentUser?.displayName || '-'}</div>
                              <div className="text-xs font-bold text-slate-500">{liveRow.editedAt || '-'}</div>
                              {isBlockManagedRow && (
                                <div className={`mt-1 text-[11px] font-black ${rowHintClass}`}>
                                  BLOK MERKEZI
                                </div>
                              )}
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
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="outline" onClick={resetPersonForm}>
                      <Plus className="h-4 w-4" /> YENI EKLE
                    </Button>
                    {selectedPersonId && (
                      <Button variant="outline" onClick={() => beginEditPerson(selectedPersonId)}>
                        <Pencil className="h-4 w-4" /> DUZENLE
                      </Button>
                    )}
                    {selectedPersonId && canManage && (
                      <Button
                        variant="danger"
                        onClick={() => {
                          const target = people.find((p) => p.id === selectedPersonId);
                          if (target) setDeleteSetTarget(target);
                        }}
                      >
                        <Trash2 className="h-4 w-4" /> SIL
                      </Button>
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
                      <div className="mb-2 text-sm font-black">SET ALINMA TARIHI</div>
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

                  <SetPaymentsPanel
                    person={setPaymentTargetPerson}
                    draft={setPaymentDraft}
                    setDraft={setSetPaymentDraft}
                    onSave={saveSetPayment}
                    savedPayment={monthOneSetPayment}
                    formatDisplayDateTime={formatDisplayDateTime}
                  />

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
                          <div className="mt-1 text-sm font-semibold text-slate-500">Set alinma tarihi: {person.startDate || '-'}</div>
                          <div className="mt-1 text-xs font-bold text-slate-500">
                            1. Ay odemesi:{' '}
                            {getSetPaymentStatusLabel(
                              allSetPaymentRows.find((item) => item.personId === person.id && item.monthKey === 'month_1')?.resolution || 'odenmedi'
                            )}
                          </div>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">{person.accountNames.length} banka</span>
                      </div>
                      <div className="mt-3 grid gap-2 md:grid-cols-2">
                        {(person.accounts || []).map((account) => (
                          <div key={account.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-sm font-black text-slate-900">{account.bankName}</div>
                            <div className="mt-1 text-xs font-bold text-slate-500">Eklenme: {formatDisplayDateTime(account.createdAt)}</div>
                          </div>
                        ))}
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
                            <div>
                              <div className="font-black text-slate-900">{formatMoney(getCurrentBlockedAmount(item))}</div>
                              <div className="mt-1 text-xs font-bold text-slate-500">{getBlockCreatedDisplayValue(item)}</div>
                            </div>
                            <div><StatusBadge status={item.type} /></div>
                            <div>
                              <div className={`font-black ${getBlockResultMeta(item).className}`}>{getBlockResultMeta(item).label}</div>
                              <div className="mt-1 text-xs font-bold text-slate-500">{formatDisplayDateTime(getBlockChangedAt(item, historyRowByKey))}</div>
                            </div>
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

      <SetciPaymentModal
        open={setciPaymentModalOpen}
        onClose={() => {
          setSetciPaymentModalOpen(false);
          setSetciPaymentDraft({ rowId: '', amount: '', note: '' });
        }}
        selectedPerson={selectedPerson}
        selectedDay={selectedDay}
        draft={setciPaymentDraft}
        setDraft={setSetciPaymentDraft}
        eligibleRows={eligibleSetciRows}
        formatMoney={formatMoney}
        onSave={saveSetciPayment}
      />

      {actionNotice.open && (
        <div className="fixed right-6 top-6 z-[140] min-w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl">
          <div className={`text-sm font-black ${actionNotice.tone === 'danger' ? 'text-rose-700' : 'text-teal-700'}`}>{actionNotice.title}</div>
          <div className="mt-1 text-sm font-semibold text-slate-600">{actionNotice.message}</div>
        </div>
      )}

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

      <BlockStatusModal
        open={blockDialogOpen}
        onClose={() => {
          setBlockDialogOpen(false);
          setBlockNoteInput('');
          setShowResolvedAmountInput(false);
          setPendingResolveMode('cozuldu');
        }}
        selectedBlockItem={selectedBlockItem}
        historyRowByKey={historyRowByKey}
        blockNoteInput={blockNoteInput}
        setBlockNoteInput={setBlockNoteInput}
        showResolvedAmountInput={showResolvedAmountInput}
        setShowResolvedAmountInput={setShowResolvedAmountInput}
        resolvedAmountInput={resolvedAmountInput}
        setResolvedAmountInput={setResolvedAmountInput}
        pendingResolveMode={pendingResolveMode}
        setPendingResolveMode={setPendingResolveMode}
        setBlockAsResolved={setBlockAsResolved}
        formatMoney={formatMoney}
        formatDisplayDateTime={formatDisplayDateTime}
        getBlockCreatedDisplayValue={getBlockCreatedDisplayValue}
        getBlockChangedAt={getBlockChangedAt}
        getBlockChangedBy={getBlockChangedBy}
      />

      {false && (<Modal open={blockDialogOpen} onClose={() => {
        setBlockDialogOpen(false);
        setBlockNoteInput('');
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

          {selectedBlockItem && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-black tracking-[0.16em] text-slate-500">BLOKE OLMA TARIHI</div>
                <div className="mt-2 text-sm font-black text-slate-900">{getBlockCreatedDisplayValue(selectedBlockItem)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-black tracking-[0.16em] text-slate-500">SON DEGISIKLIK</div>
                <div className="mt-2 text-sm font-black text-slate-900">{formatDisplayDateTime(getBlockChangedAt(selectedBlockItem, historyRowByKey))}</div>
                <div className="mt-1 text-xs font-bold text-slate-500">{getBlockChangedBy(selectedBlockItem, historyRowByKey) || selectedBlockItem.createdBy || '-'}</div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 text-sm font-black">NOT</div>
            <Input value={blockNoteInput} onChange={(e) => setBlockNoteInput(e.target.value)} placeholder="Bloke notu" className="font-bold" />
          </div>

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
      </Modal>)}

      <Modal open={!!selectedGeneralSummary} onClose={() => setSelectedGeneralSummary(null)} title={getSummaryModalTitle(selectedGeneralSummary)} maxWidth="max-w-5xl">
        <div className="space-y-3">
          {(selectedGeneralSummary ? generalSummaryDetails[selectedGeneralSummary] : []).length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">Kayıt yok</div>
          ) : (
            (selectedGeneralSummary ? generalSummaryDetails[selectedGeneralSummary] : []).map((item, idx) => (
              <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4">
                {selectedGeneralSummary === 'setci' ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-black text-slate-950">{item.personName} â€¢ {item.accountName}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-500">{item.note || 'Not yok'} â€¢ {item.createdBy || '-'} â€¢ {formatDisplayDateTime(item.createdAt || item.date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-slate-950">{formatMoney(item.amount)}</div>
                      <div className="mt-1 text-sm font-bold text-slate-500">Setci Odemesi</div>
                    </div>
                  </div>
                ) : 'accountName' in item ? (
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
