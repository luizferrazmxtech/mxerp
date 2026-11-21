/** Moldura das telas sem login da Área do Cliente (entrar, esqueci a senha, criar senha): logo da empresa e um cartão. */
export default async function CaixaAcesso({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactNode }) {
  const { nomeEmpresaPortal } = await import("@/lib/portal/empresa");
  const empresa = await nomeEmpresaPortal();
  return (
    <div className="flex min-h-screen flex-col items-center justify-start bg-fundo px-4 pt-10 pb-8 sm:justify-center sm:pt-0">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex flex-col items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/area-cliente/logo" alt={empresa} className="h-14 w-auto max-w-[220px] object-contain" />
          <div className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">Área do Cliente</div>
        </div>
        <div className="cartao p-5 sm:p-6">
          <h1 className="text-[20px] font-semibold text-[#212529]">{titulo}</h1>
          {subtitulo && <p className="mt-1 text-[13px] text-slate-500">{subtitulo}</p>}
          <div className="mt-4">{children}</div>
        </div>
        <p className="mt-4 text-center text-[11px] text-slate-400">{empresa}</p>
      </div>
    </div>
  );
}
