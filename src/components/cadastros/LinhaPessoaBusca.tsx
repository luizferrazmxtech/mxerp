import type { PessoaBusca } from "@/lib/cadastros/tipos";

const fone = (t?: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
  if (d.length === 10) return d.replace(/^(\d{2})(\d{4})(\d{4})$/, "($1) $2-$3");
  return t ?? "";
};

/** Linha da lista suspensa de clientes/fornecedores/transportadoras: nome, fantasia, contato e etiquetas com borda. */
export default function LinhaPessoaBusca({ p }: { p: PessoaBusca }) {
  const contato = [fone(p.celular || p.telefone), p.email].filter(Boolean).join(" · ");
  return (
    <span className="block">
      <span className="flex items-baseline gap-1.5">
        {p.codigo && <span className="font-mono text-[11px] text-slate-500">{p.codigo}</span>}
        <span className="font-semibold text-slate-800">{p.nome}</span>
        {p.fantasia && p.fantasia !== p.nome && <i className="truncate text-slate-500">({p.fantasia})</i>}
      </span>
      {contato && <span className="block truncate text-[11px] text-slate-500">{contato}</span>}
      {p.etiquetas?.length ? (
        <span className="mt-1 flex flex-wrap gap-1">
          {p.etiquetas.map((e, i) => (
            <span key={i} className={`etiqueta ${e.cor} ${e.mono ? "tabular-nums" : ""}`}>{e.rotulo}</span>
          ))}
        </span>
      ) : p.documento ? <span className="block text-[11px] text-slate-500">{p.documento}</span> : null}
    </span>
  );
}
