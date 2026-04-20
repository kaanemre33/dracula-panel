import { isNegativeStatus, normalizeBlockedStatus } from './status.js';

const PAYMENT_RESULT_LISTS = new Set(['setci_odemesi', 'set_odemesi']);

function getSourceRowKey(item) {
  return String(item?.source_row_key || item?.sourceRowKey || item?.row_key || item?.rowKey || '');
}

function getResultList(item) {
  return String(item?.result_list || item?.resultList || 'merkez');
}

function getResolution(item) {
  return String(item?.resolution || 'cozulmedi');
}

function getLifecycleResultList(item) {
  return String(item?.result_list || item?.resultList || 'merkez');
}

function getAmount(item) {
  return Number(item?.amount || 0);
}

function getResolvedAmount(item) {
  return Number(item?.resolved_amount ?? item?.resolvedAmount ?? 0);
}

function getSortValue(item) {
  return String(item?.created_at || item?.createdAt || item?.edited_at || item?.editedAt || item?.date || '');
}

function getMergedDuplicateNote(item) {
  const note = String(item?.note || '').trim();
  const suffix = 'Legacy duplicate acik blok kaydi otomatik kapatildi';
  return note ? `${note} | ${suffix}` : suffix;
}

export function getBlockLifecycleState(item) {
  if (!item) return 'unknown';
  const resultList = getLifecycleResultList(item);
  const resolution = getResolution(item);
  const amount = getAmount(item);
  const resolvedAmount = getResolvedAmount(item);
  if (PAYMENT_RESULT_LISTS.has(resultList)) return 'payment';
  const remainingAmount = resultList === 'merkez' && resolution === 'cozuldu'
    ? Math.max(0, amount - Math.max(0, Math.min(amount, resolvedAmount)))
    : resolution === 'cozulmedi'
      ? amount
      : 0;

  if (resultList === 'aktif_alindi') return 'activated';
  if (resultList === 'kapandi') return 'closed';
  if (resultList === 'merkez' && resolution === 'cozulmedi') return 'unresolved';
  if (remainingAmount > 0) return 'unresolved';
  if (resultList === 'merkez' && resolution === 'cozuldu') return 'resolved';
  return 'unknown';
}

export function buildLatestBlockMap(blockItems = []) {
  const sortedItems = [...blockItems].sort((left, right) => getSortValue(right).localeCompare(getSortValue(left)));
  const latestByRowKey = new Map();

  sortedItems.forEach((item) => {
    const sourceRowKey = getSourceRowKey(item);
    if (!sourceRowKey || latestByRowKey.has(sourceRowKey)) return;
    latestByRowKey.set(sourceRowKey, item);
  });

  return latestByRowKey;
}

export function buildBlockSeedFromTransaction(row, fallbackCreatedBy = '') {
  const fallbackNote = String(row?.note || '').trim() || 'Legacy durum senkronu';
  return {
    source_row_key: getSourceRowKey(row),
    date: row?.day || row?.date || '',
    person_name: row?.person_name || row?.personName || '',
    account_name: row?.account_name || row?.accountName || '',
    amount: getAmount(row),
    type: normalizeBlockedStatus(row?.status || row?.type),
    note: fallbackNote,
    resolution: 'cozulmedi',
    result_list: 'merkez',
    resolved_amount: 0,
    created_by: row?.edited_by || row?.editedBy || fallbackCreatedBy || 'SISTEM',
  };
}

export function collectNegativeStatusBlockRepairs(transactionRows = [], blockRows = [], fallbackCreatedBy = '') {
  const latestBlockByRowKey = buildLatestBlockMap(blockRows);
  const inserts = [];
  const updates = [];

  transactionRows.forEach((row) => {
    if (!isNegativeStatus(row?.status)) return;

    const sourceRowKey = getSourceRowKey(row);
    if (!sourceRowKey) return;

    const latestBlock = latestBlockByRowKey.get(sourceRowKey) || null;
    const desiredType = normalizeBlockedStatus(row?.status);
    const desiredAmount = getAmount(row);
    const desiredNote = String(row?.note || '').trim();

    if (!latestBlock || getBlockLifecycleState(latestBlock) !== 'unresolved') {
      inserts.push(buildBlockSeedFromTransaction(row, fallbackCreatedBy));
      return;
    }

    const currentType = normalizeBlockedStatus(latestBlock?.type);
    const currentAmount = getAmount(latestBlock);
    const currentNote = String(latestBlock?.note || '').trim();
    const currentDate = String(latestBlock?.date || '');
    const currentPersonName = String(latestBlock?.person_name || latestBlock?.personName || '');
    const currentAccountName = String(latestBlock?.account_name || latestBlock?.accountName || '');

    const needsUpdate =
      currentType !== desiredType ||
      currentAmount !== desiredAmount ||
      currentNote !== desiredNote ||
      currentDate !== String(row?.day || row?.date || '') ||
      currentPersonName !== String(row?.person_name || row?.personName || '') ||
      currentAccountName !== String(row?.account_name || row?.accountName || '');

    if (!needsUpdate) return;

    updates.push({
      id: latestBlock?.id,
      type: desiredType,
      amount: desiredAmount,
      note: desiredNote,
      date: row?.day || row?.date || '',
      person_name: row?.person_name || row?.personName || '',
      account_name: row?.account_name || row?.accountName || '',
      resolution: 'cozulmedi',
      result_list: 'merkez',
      resolved_amount: 0,
    });
  });

  return { inserts, updates };
}

export function collectDuplicateOpenBlockRepairs(blockRows = []) {
  const sortedItems = [...blockRows].sort((left, right) => getSortValue(right).localeCompare(getSortValue(left)));
  const seenOpenRows = new Set();
  const updates = [];

  sortedItems.forEach((item) => {
    const sourceRowKey = getSourceRowKey(item);
    if (!sourceRowKey || getBlockLifecycleState(item) !== 'unresolved') return;
    if (!item?.id) return;

    if (!seenOpenRows.has(sourceRowKey)) {
      seenOpenRows.add(sourceRowKey);
      return;
    }

    updates.push({
      id: item.id,
      resolution: 'cozuldu',
      result_list: 'merkez',
      resolved_amount: getAmount(item),
      note: getMergedDuplicateNote(item),
    });
  });

  return updates;
}
