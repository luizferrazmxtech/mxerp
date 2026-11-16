"use client";

import { useEffect, useId, useRef, useState } from "react";

export type Municipio = { codigo: string; nome: string; uf: string };
let cache: Promise<Municipio[]> | null = null;

/** Lista de municípios do IBGE (baixada uma vez por sessão do navegador). */
export function municipios(): Promise<Municipio[]> {
  cache ??= fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado")
    .then((r) => r.json())
    .then((l: Record<string, string | number>[]) => l.map((m) => ({ codigo: String(m["municipio-id"]), nome: String(m["municipio-nome"]), uf: String(m["UF-sigla"]) })))
    .catch(() => { cache = null; return []; });
  return cache;
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Consulta o CEP no ViaCEP. */
export async function buscarCep(cep: string) {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`).then((x) => x.json());
    if (r.erro) return null;
    return { logradouro: r.logradouro as string, bairro: r.bairro as string, cidade: r.localidade as string, uf: r.uf as string, codigoMunicipio: r.ibge as string, complemento: (r.complemento as string) || "" };
  } catch { return null; }
}

/** Campo "Cidade/UF" com autocompletar (guarda também o código IBGE, usado nas notas). */
export function CidadeUF({ cidade, uf, onChange }: { cidade: string; uf: string; onChange: (m: { cidade: string; uf: string; codigoMunicipio: string }) => void }) {
  const [txt, setTxt] = useState(cidade ? `${cidade}${uf ? "/" + uf : ""}` : "");
  const [lista, setLista] = useState<Municipio[]>([]);
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setTxt(cidade ? `${cidade}${uf ? "/" + uf : ""}` : ""); }, [cidade, uf]);
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("click", fora);
    return () => document.removeEventListener("click", fora);
  }, []);
  async function digitar(v: string) {
    setTxt(v);
    const [n, u] = v.split("/").map((x) => sem(x.trim()));
    if ((n ?? "").length < 2) { setLista([]); return; }
    const todos = await municipios();
    setLista(todos.filter((m) => sem(m.nome).startsWith(n) && (!u || sem(m.uf).startsWith(u))).slice(0, 12));
    setAberto(true);
  }
  return (
    <div ref={ref} className="relative">
      <input className="campo" placeholder="Digite para buscar" value={txt} onChange={(e) => digitar(e.target.value)}
        onBlur={() => {
          // texto livre "Cidade/UF" quando o IBGE não responde
          const [n, u] = txt.split("/").map((x) => x.trim());
          if (n && n !== cidade && !lista.length) onChange({ cidade: n, uf: (u ?? uf).toUpperCase().slice(0, 2), codigoMunicipio: "" });
        }} />
      {aberto && lista.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-white text-[13px] shadow-lg">
          {lista.map((m) => (
            <li key={m.codigo}>
              <button type="button" className="block w-full px-3 py-1.5 text-left hover:bg-slate-100"
                onClick={() => { onChange({ cidade: m.nome, uf: m.uf, codigoMunicipio: m.codigo }); setAberto(false); setLista([]); }}>
                {m.nome}/{m.uf}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Campo com lista de sugestões (Tipo de endereço: Comercial/Residencial/Entrega). */
export function CampoSugestao({ valor, opcoes, onChange, placeholder = "Digite para buscar" }: { valor: string; opcoes: string[]; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId();
  return (
    <>
      <input className="campo" list={id} placeholder={placeholder} value={valor} onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>{opcoes.map((o) => <option key={o} value={o} />)}</datalist>
    </>
  );
}
