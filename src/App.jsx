
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
  const meta = STATUS_META[status] || STATUS_META.pasif;
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
  const [users, setUsers] = useState(() => getStoredUsers());
  const [bankList, setBankList] = useState(() => getStoredBanks());
  const [people, setPeople] = useState(SEED_PEOPLE);
  const [historyByDay, setHistoryByDay] = useState(() => seedHistory(SEED_PEOPLE));
  const [blockCenter, setBlockCenter] = useState(SEED_BLOCKS);
  const [currentUser, setCurrentUser] = useState(null);
  const [login, setLogin] = useState({ username: 'admin', password: 'admin123' });
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

  const dailyRows = historyByDay[selectedDay] || [];
  const displayedDailyRows = dailyRows.map((row) => pendingSetRows[row.id] || row);
  const visibleDailyRows = displayedDailyRows;
  const visiblePeople = people;
  const selectedRows = visibleDailyRows.filter((r) => r.personId === selectedPersonId);
  const visibleBlockCenter = blockCenter;
  const activeUsers = users.filter((u) => u.isActive);
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

  const groupedTotals = useMemo(() => {
    const positive = visibleDailyRows.filter((r) => r.status === 'aktif' || r.status === 'nfc');
    const negative = visibleDailyRows.filter((r) => r.status === 'bloke' || r.status === 'sifre_kilit');
    const closedItems = visibleBlockCenter.filter((b) => b.resultList === 'kapandi');
    const activatedItems = visibleBlockCenter.filter((b) => b.resultList === 'aktif_alindi');

    return {
      positiveAmount: positive.reduce((s, r) => s + Number(r.amount || 0), 0),
      positiveCount: positive.length + activatedItems.length,
      negativeAmount: negative.reduce((s, r) => s + Number(r.amount || 0), 0),
      negativeCount: negative.length,
      closedCount: closedItems.length,
      closedAmount: closedItems.reduce((sum, item) => sum + Number(item.resolvedAmount || item.amount || 0), 0),
      activatedCount: activatedItems.length,
      activatedAmount: activatedItems.reduce((sum, item) => sum + Number(item.resolvedAmount || item.amount || 0), 0),
    };
  }, [visibleDailyRows, visibleBlockCenter]);

  const personTotals = useMemo(() => {
    const totalAmount = selectedRows.reduce((s, r) => s + Number(r.amount || 0), 0);
    const activeAmount = selectedRows.filter((r) => r.status === 'aktif' || r.status === 'nfc').reduce((s, r) => s + Number(r.amount || 0), 0);
    const lockedAmount = selectedRows.filter((r) => r.status === 'bloke' || r.status === 'sifre_kilit').reduce((s, r) => s + Number(r.amount || 0), 0);
    return { totalAmount, activeAmount, lockedAmount, totalCount: selectedRows.length };
  }, [selectedRows]);

  const filteredBlockCenter = useMemo(() => {
    if (!filter.trim()) return visibleBlockCenter;
    return visibleBlockCenter.filter((b) => `${b.personName} ${b.accountName} ${b.note} ${b.type}`.toLowerCase().includes(filter.toLowerCase()));
  }, [visibleBlockCenter, filter]);

  const blockSummary = useMemo(() => {
    const resolvedItems = visibleBlockCenter.filter((item) => item.resolution === 'cozuldu');
    const unresolvedItems = visibleBlockCenter.filter((item) => item.resolution === 'cozulmedi');
    return {
      resolvedCount: resolvedItems.length,
      resolvedAmount: resolvedItems.reduce((sum, item) => sum + Number(item.resolvedAmount || item.amount || 0), 0),
      unresolvedCount: unresolvedItems.length,
      unresolvedAmount: unresolvedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    };
  }, [visibleBlockCenter]);

  const generalSummaryDetails = useMemo(() => ({
    positive: visibleDailyRows.filter((r) => r.status === 'aktif' || r.status === 'nfc'),
    negative: visibleDailyRows.filter((r) => r.status === 'bloke' || r.status === 'sifre_kilit'),
    activated: visibleBlockCenter.filter((b) => b.resultList === 'aktif_alindi'),
    closed: visibleBlockCenter.filter((b) => b.resultList === 'kapandi'),
  }), [visibleDailyRows, visibleBlockCenter]);

  const chartDailyTrend = useMemo(() => {
    const keys = Object.keys(historyByDay).sort();
    return keys.slice(-7).map((day) => {
      const rows = historyByDay[day] || [];
      const active = rows.filter((r) => r.status === 'aktif' || r.status === 'nfc').reduce((s, r) => s + Number(r.amount || 0), 0);
      const blocked = rows.filter((r) => r.status === 'bloke' || r.status === 'sifre_kilit').reduce((s, r) => s + Number(r.amount || 0), 0);
      return { day: day.slice(5), aktif: active, bloke: blocked };
    });
  }, [historyByDay]);

  const chartStatusMix = useMemo(() => {
    const rows = visibleDailyRows;
    return [
      { name: 'Aktif', value: rows.filter((r) => r.status === 'aktif').length },
      { name: 'NFC', value: rows.filter((r) => r.status === 'nfc').length },
      { name: 'Bloke', value: rows.filter((r) => r.status === 'bloke').length },
      { name: 'Şifre Kilit', value: rows.filter((r) => r.status === 'sifre_kilit').length },
      { name: 'Pasif', value: rows.filter((r) => r.status === 'pasif').length },
    ];
  }, [visibleDailyRows]);

  const pieColors = ['#0f766e', '#0891b2', '#e11d48', '#d97706', '#94a3b8'];

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

    if (filteredBlockCenter.length === 0) {
      doc.setFontSize(11);
      doc.text('Kayit yok.', 14, 32);
      doc.save(`bloke-merkezi-${selectedDay}.pdf`);
      return;
    }

    doc.setFontSize(11);
    let y = 34;
    filteredBlockCenter.forEach((item, index) => {
      const line = `${index + 1}. ${item.personName} | ${item.accountName} | ${formatMoney(item.amount)} | ${STATUS_META[item.type]?.label || item.type} | ${item.resolution}`;
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
    const rows = filteredBlockCenter.map((item) => ({
      Tarih: item.date,
      Sahis: item.personName,
      Hesap: item.accountName,
      Tutar: Number(item.amount || 0),
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
      [day]: people.flatMap((person) =>
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
      ),
    }));
  }

  function startNewDay() {
    const today = getTurkeyNow().date;
    if (historyByDay[today]) {
      setSelectedDay(today);
      showActionNotice('Bilgi', 'Zaten güncel gündesiniz.');
      return;
    }

    const sourceRows = historyByDay[selectedDay] || [];
    const carryStatuses = new Set(['aktif', 'nfc', 'bloke', 'sifre_kilit']);
    const nextDayRows = sourceRows.map((row) => {
      const shouldCarry = carryStatuses.has(row.status);
      return {
        ...row,
        amount: shouldCarry ? Number(row.amount || 0) : 0,
        status: shouldCarry ? row.status : 'pasif',
        note: shouldCarry ? row.note || '' : '',
        editedBy: '',
        editedAt: '',
      };
    });

    setHistoryByDay((prev) => ({ ...prev, [today]: nextDayRows }));
    setPendingSetRows({});
    setSelectedDay(today);
    showActionNotice('Yeni gün oluşturuldu', 'Aktif ve bloke kayıtları devralındı.');
  }

  function handleLogin() {
    const found = users.find((u) => u.username === login.username && u.password === login.password);
    if (!found) return showActionNotice('Hata', 'Giriş bilgileri hatalı.', 'danger');
    if (!found.isActive) return showActionNotice('Hata', 'Bu kullanıcı pasif durumda.', 'danger');
    setCurrentUser(found);
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

    setPendingSetRows((prev) => ({
      ...prev,
      [rowId]: {
        ...baseRow,
        [key]: value,
        editedBy: currentUser.displayName,
        editedAt: getTurkeyNow().dateTime,
      },
    }));
  }

  function saveSetDurumu() {
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

      const wasBlockedBefore = row.status === 'bloke' || row.status === 'sifre_kilit';
      const isBlockedNow = nextRow.status === 'bloke' || nextRow.status === 'sifre_kilit';
      if (!wasBlockedBefore && isBlockedNow) {
        const exists = blockCenter.some((b) => b.personName === row.personName && b.accountName === row.accountName && b.resultList === 'merkez');
        if (!exists) {
          newBlockItems.push({
            id: `b-${Date.now()}-${Math.random()}`,
            date: now.date,
            personName: row.personName,
            accountName: row.accountName,
            amount: Number(nextRow.amount || 0),
            type: nextRow.status,
            note: nextRow.note || '',
            resolution: 'cozulmedi',
            resultList: 'merkez',
            createdBy: currentUser.displayName,
          });
        }
      }

      return {
        ...nextRow,
        editedBy: nextRow.editedBy || currentUser.displayName,
        editedAt: nextRow.editedAt || now.dateTime,
      };
    });

    setHistoryByDay((prev) => ({ ...prev, [selectedDay]: nextRows }));
    if (newBlockItems.length) setBlockCenter((prev) => [...newBlockItems, ...prev]);
    setPendingSetRows({});
    setNavigationWarningOpen(false);

    if (pendingSection) {
      if (pendingSection === 'logout') {
        setPendingSection(null);
        setCurrentUser(null);
      } else {
        setActiveSection(pendingSection);
        setPendingSection(null);
      }
    } else {
      setActiveSection('genel');
    }

    showActionNotice('Kaydedildi', 'Set durumu kaydedildi.');
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
    setCurrentUser(null);
  }

  function saveUserPanelChanges() {
    if (!canManage) return false;

    const passwordEntries = Object.entries(passwordDrafts).filter(([, value]) => String(value || '').trim().length > 0);
    let nextUsers = users.map((u) => ({ ...u, ...(userPermissionDrafts[u.id] || {}) }));
    const updatedNames = [];

    for (const [userId, passwordValue] of passwordEntries) {
      const nextPassword = String(passwordValue || '').trim();
      const targetUser = nextUsers.find((u) => u.id === userId);
      if (!targetUser) continue;
      targetUser.password = nextPassword;
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

      if (nextUsers.some((u) => u.username.toLowerCase() === username)) {
        showActionNotice('Hata', 'Bu kullanıcı adı zaten kullanılıyor.', 'danger');
        return false;
      }

      nextUsers.push({
        id: `u-${Date.now()}`,
        username,
        password,
        displayName,
        role: newUserForm.role,
        isActive: true,
        canEnterData: true,
      });
      createdUserName = displayName;
      setNewUserForm({ displayName: '', username: '', password: '', role: 'user' });
    }

    setUsers(nextUsers);
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
  }

  function handleWarningSaveAndContinue() {
    if (showUsersPanel && hasUnsavedUserPanel()) {
      const ok = saveUserPanelChanges();
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
      addOrUpdatePerson();
      return;
    }

    saveSetDurumu();
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

  function addCustomBank() {
    if (!canManage) return;
    const name = newBankName.trim();
    if (!name) return showActionNotice('Hata', 'Banka adı girin.', 'danger');
    if (bankList.some((bank) => bank.toLowerCase() === name.toLowerCase())) {
      return showActionNotice('Hata', 'Bu banka zaten listede var.', 'danger');
    }
    setBankList((prev) => [...prev, name]);
    setNewBankName('');
    showActionNotice('Banka eklendi', `${name} listeye eklendi.`);
  }

  function removeCustomBank(bankName) {
    if (!canManage) return;
    setBankList((prev) => prev.filter((bank) => bank !== bankName));
    setNewAccountNames((prev) => prev.filter((bank) => bank !== bankName));
    setPeople((prev) => prev.map((person) => ({
      ...person,
      accountNames: person.accountNames.filter((bank) => bank !== bankName),
    })));
    setHistoryByDay((prev) => {
      const next = {};
      Object.keys(prev).forEach((day) => {
        next[day] = (prev[day] || []).filter((row) => row.accountName !== bankName);
      });
      return next;
    });
    showActionNotice('Banka silindi', `${bankName} listeden kaldırıldı.`, 'danger');
  }

  function addOrUpdatePerson() {
    if (!newPersonName.trim()) return showActionNotice('Hata', 'Ad soyad zorunlu.', 'danger');
    if (!newPersonDate) return showActionNotice('Hata', 'Tarih zorunlu.', 'danger');

    const count = Number(newAccountCount || 0);
    const finalNames = newAccountNames.slice(0, count).map((name) => name.trim());
    if (finalNames.length !== count || finalNames.some((name) => !name)) {
      return showActionNotice('Hata', 'Seçtiğiniz hesap sayısı kadar banka seçmek zorunlu.', 'danger');
    }

    if (editingPersonId) {
      const original = people.find((p) => p.id === editingPersonId);
      const updatedPerson = { id: editingPersonId, fullName: newPersonName.toUpperCase(), startDate: newPersonDate, accountNames: finalNames };
      setPeople((prev) => prev.map((p) => (p.id === editingPersonId ? updatedPerson : p)));

      setHistoryByDay((prev) => {
        const next = { ...prev };
        Object.keys(next).forEach((day) => {
          const others = (next[day] || []).filter((row) => row.personId !== editingPersonId);
          const rebuilt = finalNames.map((accountName, index) => {
            const oldRow = (prev[day] || []).find((r) => r.personId === editingPersonId && r.accountName === (original?.accountNames[index] || accountName));
            return {
              id: `${editingPersonId}-${index + 1}`,
              personId: editingPersonId,
              personName: updatedPerson.fullName,
              accountName,
              amount: oldRow?.amount || 0,
              status: oldRow?.status || 'pasif',
              note: oldRow?.note || '',
              editedBy: oldRow?.editedBy || '',
              editedAt: oldRow?.editedAt || '',
            };
          });
          next[day] = [...others, ...rebuilt];
        });
        return next;
      });

      resetPersonForm();
      showActionNotice('Güncellendi', 'Set bilgileri güncellendi.');
      return;
    }

    const id = `p-${Date.now()}`;
    const person = { id, fullName: newPersonName.toUpperCase(), startDate: newPersonDate, accountNames: finalNames };
    setPeople((prev) => [...prev, person]);
    setSelectedPersonId(id);
    setHistoryByDay((prev) => ({
      ...prev,
      [selectedDay]: [
        ...(prev[selectedDay] || []),
        ...person.accountNames.map((accountName, index) => ({
          id: `${id}-${index + 1}`,
          personId: id,
          personName: person.fullName,
          accountName,
          amount: 0,
          status: 'pasif',
          note: '',
          editedBy: '',
          editedAt: '',
        })),
      ],
    }));
    resetPersonForm();
    showActionNotice('Kaydedildi', 'Yeni set eklendi.');
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

  function confirmDeleteSet() {
    if (!deleteSetTarget) return;
    const targetId = deleteSetTarget.id;
    const targetName = deleteSetTarget.fullName;

    setPeople((prev) => prev.filter((p) => p.id !== targetId));
    setHistoryByDay((prev) => {
      const next = {};
      Object.keys(prev).forEach((day) => {
        next[day] = (prev[day] || []).filter((row) => row.personId !== targetId);
      });
      return next;
    });
    if (selectedPersonId === targetId) {
      const nextPerson = people.find((p) => p.id !== targetId);
      setSelectedPersonId(nextPerson?.id || '');
    }
    setDeleteSetTarget(null);
    showActionNotice('Set silindi', `${targetName} kaldırıldı.`, 'danger');
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

  function saveUserRow(userId) {
    if (!canManage) return;
    const nextPassword = String(passwordDrafts[userId] || '').trim();
    const permissionDraft = userPermissionDrafts[userId];
    const targetUser = users.find((u) => u.id === userId);
    if (!targetUser) return showActionNotice('Hata', 'Kullanıcı bulunamadı.', 'danger');

    if (!nextPassword && !permissionDraft) {
      showActionNotice('Bilgi', 'Kaydedilecek değişiklik yok.');
      return;
    }

    setUsers((prev) => prev.map((u) => {
      if (u.id !== userId) return u;
      return { ...u, ...(permissionDraft || {}), ...(nextPassword ? { password: nextPassword } : {}) };
    }));

    setPasswordDrafts((prev) => ({ ...prev, [userId]: '' }));
    setUserPermissionDrafts((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });

    showActionNotice('Kaydedildi', `${targetUser.displayName} için değişiklikler kaydedildi.`);
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

  function confirmDeleteUser() {
    if (!deleteTargetUser) return;
    const targetId = deleteTargetUser.id;
    const targetName = deleteTargetUser.displayName;

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
    showActionNotice('Kullanıcı silindi', `${targetName} sistemden tamamen kaldırıldı.`, 'danger');
  }

  function createNewUser() {
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
    setUsers((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        username,
        password,
        displayName,
        role: newUserForm.role,
        isActive: true,
        canEnterData: true,
      },
    ]);
    setNewUserForm({ displayName: '', username: '', password: '', role: 'user' });
    showActionNotice('Kullanıcı oluşturuldu', `${displayName} eklendi.`);
  }

  function openBlockResolution(item) {
    if (!canManage) return showActionNotice('Yetki yok', 'Bloke merkezini sadece yönetici düzenleyebilir.', 'danger');
    setSelectedBlockItem(item);
    setResolvedAmountInput(item.resolvedAmount ? String(item.resolvedAmount) : String(item.amount || 0));
    setShowResolvedAmountInput(false);
    setPendingResolveMode('cozuldu');
    setBlockDialogOpen(true);
  }

  function setBlockAsResolved(mode = 'cozuldu') {
    if (!selectedBlockItem) return;
    if (mode !== 'cozulmedi' && !showResolvedAmountInput) {
      setPendingResolveMode(mode);
      setShowResolvedAmountInput(true);
      return;
    }

    const finalResolvedAmount = Number(resolvedAmountInput || 0);
    setBlockCenter((prev) =>
      prev.map((b) => {
        if (b.id !== selectedBlockItem.id) return b;
        if (mode === 'aktif_alindi') return { ...b, resolution: 'cozuldu', resultList: 'aktif_alindi', resolvedAmount: finalResolvedAmount };
        if (mode === 'kapandi') return { ...b, resolution: 'cozuldu', resultList: 'kapandi', resolvedAmount: finalResolvedAmount };
        if (mode === 'cozulmedi') return { ...b, resolution: 'cozulmedi', resultList: 'merkez', resolvedAmount: 0 };
        return { ...b, resolution: 'cozuldu', resultList: 'merkez', resolvedAmount: finalResolvedAmount };
      })
    );
    setBlockDialogOpen(false);
    setSelectedBlockItem(null);
    setResolvedAmountInput('');
    setShowResolvedAmountInput(false);
    setPendingResolveMode('cozuldu');
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
    if (!currentUser) return;
    const refreshedUser = users.find((u) => u.id === currentUser.id);
    if (!refreshedUser) {
      setCurrentUser(null);
      return;
    }
    if (refreshedUser !== currentUser) {
      setCurrentUser(refreshedUser);
    }
  }, [users, currentUser]);

  useEffect(() => {
    if (!people.length) {
      setSelectedPersonId('');
      return;
    }
    if (!people.some((p) => p.id === selectedPersonId)) {
      setSelectedPersonId(people[0].id);
    }
  }, [people, selectedPersonId]);

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
                <Button
                  onClick={sendNotification}
                  className={notifyFlash ? 'bg-rose-600 hover:bg-rose-700 border-rose-600' : ''}
                >
                  <BellRing className="h-4 w-4" /> BİLDİRİM GÖNDER
                </Button>
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
                        return (
                          <div key={row.id} className={`grid grid-cols-[1.2fr_140px_180px_1fr_170px_220px] items-center gap-3 border-t border-slate-200 px-4 py-3 transition ${isPending ? 'bg-amber-50' : 'bg-white hover:bg-slate-50'}`}>
                            <div className="font-black text-slate-900">{liveRow.accountName}</div>
                            <Input type="number" value={liveRow.amount} onChange={(e) => updateRow(row.id, 'amount', e.target.value)} className="font-bold" />
                            <SelectBox value={liveRow.status} onChange={(e) => updateRow(row.id, 'status', e.target.value)} className="font-bold">
                              <option value="pasif">PASİF</option>
                              <option value="aktif">AKTİF</option>
                              <option value="nfc">NFC</option>
                              <option value="sifre_kilit">ŞİFRE KİLİT</option>
                              <option value="bloke">BLOKE</option>
                            </SelectBox>
                            <Input value={liveRow.note} onChange={(e) => updateRow(row.id, 'note', e.target.value)} placeholder="Not" className="font-bold" />
                            <div><StatusBadge status={liveRow.status} /></div>
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
                            while (next.length < count) next.push(BANK_OPTIONS[next.length % BANK_OPTIONS.length]);
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
                  {people.map((person) => (
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
                <SummaryCard title="KAPANAN HESAPLAR" value={visibleBlockCenter.filter((b) => b.resultList === 'kapandi').length} subtitle="Ayrı listede" tone="slate" />
                <SummaryCard title="AKTİFE ALINANLAR" value={visibleBlockCenter.filter((b) => b.resultList === 'aktif_alindi').length} subtitle="Ayrı listede" tone="teal" />
              </div>

              <Card>
                <div className="space-y-4 p-6">
                  <div>
                    <div className="text-lg font-black">BLOKE MERKEZİ</div>
                    <div className="text-sm text-slate-500">Tüm günlerdeki bloke kayıtları burada tutulur</div>
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
                      {filteredBlockCenter.length === 0 ? (
                        <div className="p-8 text-center text-sm font-bold text-slate-500">KAYIT YOK</div>
                      ) : (
                        filteredBlockCenter.map((item) => (
                          <div key={item.id} className="grid grid-cols-[1.4fr_160px_160px_180px_150px] items-center gap-3 border-t border-slate-200 px-4 py-3 hover:bg-slate-50">
                            <div>
                              <div className="font-black text-slate-950">{item.personName} • {item.accountName}</div>
                              <div className="text-xs font-bold text-slate-500">{item.date} • {item.createdBy} • {item.note || 'Not yok'}</div>
                            </div>
                            <div className="font-black text-slate-900">{formatMoney(item.amount)}</div>
                            <div><StatusBadge status={item.type} /></div>
                            <div className={`font-black ${item.resolution === 'cozulmedi' ? 'text-rose-700' : 'text-teal-700'}`}>{item.resolution === 'cozulmedi' ? 'ÇÖZÜLMEDİ' : 'ÇÖZÜLDÜ'}</div>
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
              {users.map((u) => (
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

      <Modal open={blockDialogOpen} onClose={() => setBlockDialogOpen(false)} title="BLOKE DURUMU" maxWidth="max-w-xl">
        <div className="space-y-4">
          {selectedBlockItem && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="font-black text-slate-950">{selectedBlockItem.personName} • {selectedBlockItem.accountName}</div>
              <div className="mt-1 text-sm font-semibold text-slate-500">{formatMoney(selectedBlockItem.amount)} • {selectedBlockItem.note || 'Not yok'}</div>
            </div>
          )}

          {showResolvedAmountInput && (
            <div>
              <div className="mb-2 text-sm font-black">Çözülen Tutar</div>
              <Input type="number" value={resolvedAmountInput} onChange={(e) => setResolvedAmountInput(e.target.value)} />
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
