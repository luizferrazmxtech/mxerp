export default function RodapeLista({ total }: { total: number }) {
  return <div className="border-t px-3 py-2.5 text-[12px] text-slate-600"><span className="rounded border px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{total}</b> no total</span></div>;
}
