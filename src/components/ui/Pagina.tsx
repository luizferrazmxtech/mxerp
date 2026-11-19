import Link from "next/link";
import Icone from "@/components/Icone";

/** Título da página com ícone à esquerda e trilha "Início > Módulo > Ação" à direita. */
export function Pagina({ titulo, icone, trilha, children, acoes }: {
  titulo: React.ReactNode;
  icone?: string;
  trilha: { rotulo: string; href?: string }[];
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="no-print -mx-4 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-200 px-4 pb-3 md:-mx-5 md:px-5">
        <h1 className="flex items-center gap-2 text-[24px] font-medium text-[#212529]">
          {icone && <Icone nome={icone} size={22} />}
          {titulo}
        </h1>
        {acoes}
        <nav className="ml-auto flex items-center gap-1 text-[12px] text-slate-500">
          <Link href="/" className="flex items-center gap-1 hover:underline"><Icone nome="inicio" size={12} /> Início</Link>
          {trilha.map((t, i) => (
            <span key={i} className="flex items-center gap-1">
              <span>›</span>
              {t.href ? <Link href={t.href} className="hover:underline">{t.rotulo}</Link> : <span className="font-semibold text-slate-700">{t.rotulo}</span>}
            </span>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}

/** Bloco de formulário: cabeçalho cinza "Informe os **dados** da …" com subtítulo pequeno. */
export function Bloco({ icone, titulo, subtitulo, acoes, children, className = "", corpo = "p-4" }: {
  icone?: string; titulo: React.ReactNode; subtitulo?: string; acoes?: React.ReactNode; children?: React.ReactNode; className?: string; corpo?: string;
}) {
  return (
    <section className={`cartao mb-3 overflow-visible ${className}`}>
      <div className="flex items-start gap-2 rounded-t-md border-b border-slate-200 bg-[#f7f7f7] px-4 py-3">
        <div className="flex-1">
          <h2 className="flex items-center gap-1.5 text-[17px] font-light text-slate-800 [&_b]:font-semibold">
            {icone && <Icone nome={icone} size={15} />} {titulo}
          </h2>
          {subtitulo && <p className="mt-0.5 text-[11px] text-slate-500">{subtitulo}</p>}
        </div>
        {acoes}
      </div>
      {children !== undefined && <div className={corpo}>{children}</div>}
    </section>
  );
}

/** Situação em pílula com bolinha, como nas listas do Gestão Click. */
export function Pilula({ rotulo, cor }: { rotulo: string; cor: string }) {
  return <span className={`pilula ${cor}`}>{rotulo}</span>;
}

/** Rodapé das listagens: "Registros | N no total". */
export function RodapeLista({ total, mostrando, mais }: { total: number; mostrando: number; mais?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-3 py-2.5 text-[12px] text-slate-600">
      <span>Registros <span className="mx-1 text-slate-300">|</span> <b>{total}</b> no total</span>
      {mostrando < total && <span>mostrando {mostrando}</span>}
      {mais && mostrando < total && <Link href={mais} className="text-marca hover:underline">mostrar mais</Link>}
    </div>
  );
}

/** Rótulo pequeno + campo, no grid de 4 colunas dos formulários. */
export function Campo({ rotulo, obrigatorio, children, className = "" }: { rotulo: string; obrigatorio?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={`rotulo ${obrigatorio ? "obrig" : ""}`}>{rotulo}</span>
      {children}
    </label>
  );
}
