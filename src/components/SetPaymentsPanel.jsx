import { Button, Input, SelectBox } from './ui';
import { getSetPaymentStatusLabel } from '../lib/payments';

export function SetPaymentsPanel({
  person,
  draft,
  setDraft,
  onSave,
  savedPayment,
  formatDisplayDateTime,
}) {
  if (!person) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
        Set odemeleri ve banka eklenme tarihleri icin duzenlemek istediginiz seti secin.
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-black tracking-[0.16em] text-slate-600">SET ODEMELERI</div>
          <div className="mt-2 text-lg font-black text-slate-950">{person.fullName}</div>
          <div className="mt-1 text-sm font-semibold text-slate-500">Set alinma tarihi: {person.startDate || '-'}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600">
          Banka sayisi: <span className="font-black text-slate-950">{person.accountNames.length}</span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[200px_180px_minmax(0,1fr)_auto] xl:items-end">
        <div>
          <div className="mb-2 text-sm font-black">1. AY DURUMU</div>
          <SelectBox
            value={draft.month1Status}
            onChange={(e) => setDraft((prev) => ({ ...prev, month1Status: e.target.value }))}
          >
            <option value="odenmedi">ODENMEDI</option>
            <option value="odendi">ODENDI</option>
          </SelectBox>
        </div>
        <div>
          <div className="mb-2 text-sm font-black">1. AY TUTARI</div>
          <Input
            type="number"
            value={draft.month1Amount}
            onChange={(e) => setDraft((prev) => ({ ...prev, month1Amount: e.target.value }))}
            placeholder="0"
          />
        </div>
        <div>
          <div className="mb-2 text-sm font-black">NOT</div>
          <Input
            value={draft.month1Note}
            onChange={(e) => setDraft((prev) => ({ ...prev, month1Note: e.target.value }))}
            placeholder="Set odemesi notu"
          />
        </div>
        <Button onClick={onSave}>SET ODEME KAYDET</Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-sm font-black tracking-[0.16em] text-slate-600">SETE EKLENEN BANKALAR</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {person.accounts.map((account) => (
            <div key={account.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <div className="font-black text-slate-900">{account.bankName}</div>
              <div className="mt-1 text-xs font-bold text-slate-500">Eklenme tarihi: {formatDisplayDateTime(account.createdAt)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-500">
        Son kayit durumu: {getSetPaymentStatusLabel(draft.month1Status)}. Bu alan blocks tablosunda audit olarak tutulur.
        {savedPayment && (
          <div className="mt-2">
            Son degisiklik: {formatDisplayDateTime(savedPayment.createdAt || savedPayment.date)} • {savedPayment.createdBy || '-'}
          </div>
        )}
      </div>
    </div>
  );
}
