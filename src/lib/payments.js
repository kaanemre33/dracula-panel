export const SETCI_PAYMENT_RESULT = 'setci_odemesi';
export const SET_PAYMENT_RESULT = 'set_odemesi';

export const SET_PAYMENT_MONTH_OPTIONS = [
  { value: 'month_1', label: '1. Ay' },
];

export function buildSetciPaymentSourceKey(rowKey) {
  return `setci::${encodeURIComponent(rowKey)}::${Date.now()}`;
}

export function buildSetPaymentSourceKey(personId, monthKey = 'month_1') {
  return `set-payment::${encodeURIComponent(personId)}::${monthKey}`;
}

export function isSetciPaymentLog(item) {
  return String(item?.resultList || '') === SETCI_PAYMENT_RESULT;
}

export function isSetPaymentLog(item) {
  return String(item?.resultList || '') === SET_PAYMENT_RESULT;
}

export function isAuditPaymentLog(item) {
  return isSetciPaymentLog(item) || isSetPaymentLog(item);
}

export function getSetPaymentPersonId(sourceRowKey = '') {
  const match = String(sourceRowKey || '').match(/^set-payment::(.+?)::/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function getSetPaymentMonthKey(sourceRowKey = '') {
  const match = String(sourceRowKey || '').match(/^set-payment::.+?::(.+)$/);
  return match ? match[1] : '';
}

export function getSetPaymentMonthLabel(monthKey = '') {
  return SET_PAYMENT_MONTH_OPTIONS.find((item) => item.value === monthKey)?.label || monthKey || '-';
}

export function getSetPaymentStatusLabel(status = '') {
  return status === 'odendi' ? 'ODENDI' : 'ODENMEDI';
}
