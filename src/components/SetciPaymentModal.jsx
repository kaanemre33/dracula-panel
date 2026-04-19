import { Button, Input, Modal, SelectBox } from './ui';

export function SetciPaymentModal({
  open,
  onClose,
  selectedPerson,
  selectedDay,
  draft,
  setDraft,
  eligibleRows,
  formatMoney,
  onSave,
}) {
  return (
    <Modal open={open} onClose={onClose} title="SETCI ODEMESI" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-900">{selectedPerson?.fullName || 'Kisi secilmedi'}</div>
          <div className="mt-1 text-xs font-bold text-slate-500">{selectedDay} rapor gunu icin odeme kaydi olusturulur.</div>
        </div>
        <div>
          <div className="mb-2 text-sm font-black">HESAP</div>
          <SelectBox value={draft.rowId} onChange={(e) => setDraft((prev) => ({ ...prev, rowId: e.target.value }))}>
            {eligibleRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.accountName} - {formatMoney(row.amount)}
              </option>
            ))}
          </SelectBox>
        </div>
        <div>
          <div className="mb-2 text-sm font-black">ALINAN TUTAR</div>
          <Input
            type="number"
            value={draft.amount}
            onChange={(e) => setDraft((prev) => ({ ...prev, amount: e.target.value }))}
            placeholder="0"
          />
        </div>
        <div>
          <div className="mb-2 text-sm font-black">NOT</div>
          <Input
            value={draft.note}
            onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))}
            placeholder="Setci Odemesi notu"
          />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs font-bold text-slate-500">
          Odeme kaydi blocks tablosunda audit olarak tutulur, ilgili hesap bakiyesi ayni anda dusulur.
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>IPTAL</Button>
          <Button onClick={onSave}>KAYDET</Button>
        </div>
      </div>
    </Modal>
  );
}
