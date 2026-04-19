import { Button, Input, Modal } from './ui';

export function BlockStatusModal({
  open,
  onClose,
  selectedBlockItem,
  historyRowByKey,
  blockNoteInput,
  setBlockNoteInput,
  showResolvedAmountInput,
  setShowResolvedAmountInput,
  resolvedAmountInput,
  setResolvedAmountInput,
  pendingResolveMode,
  setPendingResolveMode,
  setBlockAsResolved,
  formatMoney,
  formatDisplayDateTime,
  getBlockCreatedDisplayValue,
  getBlockChangedAt,
  getBlockChangedBy,
}) {
  const noteMissing = !String(blockNoteInput || '').trim();

  return (
    <Modal open={open} onClose={onClose} title="BLOKE DURUMU" maxWidth="max-w-xl">
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
          <div className="mb-2 text-sm font-black">NOT *</div>
          <Input
            value={blockNoteInput}
            onChange={(e) => setBlockNoteInput(e.target.value)}
            placeholder="Bu islem icin aciklama zorunludur"
            className="font-bold"
          />
          <div className={`mt-2 text-xs font-bold ${noteMissing ? 'text-rose-600' : 'text-slate-500'}`}>
            {noteMissing ? 'Bu islem icin aciklama (not) girmek zorunludur.' : 'Aciklama kayit ve audit icin zorunludur.'}
          </div>
        </div>

        {showResolvedAmountInput && (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
            <div className="mb-2 text-sm font-black">COZULEN TUTAR</div>
            <Input type="number" value={resolvedAmountInput} onChange={(e) => setResolvedAmountInput(e.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => setBlockAsResolved(pendingResolveMode)} disabled={noteMissing}>KAYDET</Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowResolvedAmountInput(false);
                  setPendingResolveMode('cozuldu');
                  setResolvedAmountInput(selectedBlockItem ? String(selectedBlockItem.resolvedAmount || selectedBlockItem.amount || 0) : '0');
                }}
              >
                IPTAL
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setBlockAsResolved('cozulmedi')}>COZULMEDI</Button>
          <Button onClick={() => setBlockAsResolved('cozuldu')}>COZULDU</Button>
          <Button variant="outline" onClick={() => setBlockAsResolved('aktif_alindi')}>AKTIFE ALINDI</Button>
          <Button variant="outline" onClick={() => setBlockAsResolved('kapandi')}>KAPANDI</Button>
        </div>
      </div>
    </Modal>
  );
}
