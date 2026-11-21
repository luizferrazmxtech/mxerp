/** Moldura das telas de entrada: fundo escuro com o logo e o cartão branco no meio. */
export function CaixaEntrada({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-topo p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marca/logo-escuro.svg" alt="MXTECH" className="mb-4 h-24 w-auto" />
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h1 className="text-[20px] font-semibold text-tinta">{titulo}</h1>
        <p className="mb-4 text-[13px] text-slate-500">{sub}</p>
        {children}
      </div>
    </div>
  );
}
