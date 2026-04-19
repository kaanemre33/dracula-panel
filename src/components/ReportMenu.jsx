import { Download } from 'lucide-react';
import { Button } from './ui';

export function ReportMenu({
  open,
  menuRef,
  selectedPerson,
  onToggle,
  onGeneralPdf,
  onGeneralExcel,
  onPersonPdf,
  onPersonExcel,
}) {
  return (
    <div className="relative" ref={menuRef}>
      <Button variant="outline" onClick={onToggle}>
        <Download className="h-4 w-4" /> RAPOR AL
      </Button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
          <div className="px-2 py-1 text-[11px] font-black tracking-[0.18em] text-slate-500">GENEL RAPOR</div>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50"
            onClick={onGeneralPdf}
          >
            <span>Genel Rapor PDF</span>
            <span className="text-xs text-slate-500">indir</span>
          </button>
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50"
            onClick={onGeneralExcel}
          >
            <span>Genel Rapor Excel</span>
            <span className="text-xs text-slate-500">indir</span>
          </button>
          <div className="mt-2 border-t border-slate-200 px-2 py-1 text-[11px] font-black tracking-[0.18em] text-slate-500">KISI BAZLI RAPOR</div>
          <button
            type="button"
            disabled={!selectedPerson}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            onClick={onPersonPdf}
          >
            <span>Kisi Bazli Rapor PDF</span>
            <span className="text-xs text-slate-500">indir</span>
          </button>
          <button
            type="button"
            disabled={!selectedPerson}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            onClick={onPersonExcel}
          >
            <span>Kisi Bazli Rapor Excel</span>
            <span className="text-xs text-slate-500">indir</span>
          </button>
        </div>
      )}
    </div>
  );
}
