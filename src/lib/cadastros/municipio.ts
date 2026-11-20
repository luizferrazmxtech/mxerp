import { prisma } from "@/lib/db";
import { normalizar } from "@/lib/migracao/planilha";

/**
 * Código IBGE do município (obrigatório no endereço da NF-e). O cadastro vindo do Gestão Click não traz esse código,
 * então ele é descoberto pela cidade/UF (lista oficial do IBGE) ou, sem cidade, pelo CEP (ViaCEP), e gravado no cliente.
 */

type Fetch = typeof fetch;
const cacheUf = new Map<string, Promise<Map<string, string>>>();

async function municipiosDaUf(uf: string, f: Fetch): Promise<Map<string, string>> {
  const chave = uf.toUpperCase();
  let p = cacheUf.get(chave);
  if (!p) {
    p = f(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${chave}/municipios`, { signal: AbortSignal.timeout(8000) })
      .then((r) => {
        if (!r.ok) throw new Error(`IBGE respondeu ${r.status}`);
        return r.json() as Promise<{ id: number; nome: string }[]>;
      })
      .then((lista) => new Map(lista.map((m) => [normalizar(m.nome), String(m.id)])));
    cacheUf.set(chave, p);
    p.catch(() => cacheUf.delete(chave)); // tenta de novo na próxima vez
  }
  return p;
}

export type EnderecoCep = { logradouro?: string; bairro?: string; cidade?: string; uf?: string; codigoMunicipio?: string };

async function viaCep(cep: string, f: Fetch): Promise<EnderecoCep | null> {
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const r = await f(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = (await r.json()) as Record<string, string | boolean>;
  if (j.erro) return null;
  return { logradouro: (j.logradouro as string) || undefined, bairro: (j.bairro as string) || undefined, cidade: j.localidade as string, uf: j.uf as string, codigoMunicipio: (j.ibge as string) || undefined };
}

/** Código IBGE pela cidade e UF (ex.: "São Carlos", "SP" → 3548906). null se não achar. */
export async function codigoIbge(cidade: string, uf: string, f: Fetch = fetch): Promise<string | null> {
  if (!cidade || !uf) return null;
  try {
    return (await municipiosDaUf(uf, f)).get(normalizar(cidade)) ?? null;
  } catch {
    return null;
  }
}

type PessoaEnd = { id: string; cep: string | null; cidade: string | null; uf: string | null; codigoMunicipio: string | null; logradouro: string | null; bairro: string | null };

/**
 * Completa o que dá para descobrir sozinho no endereço do cliente (código IBGE; pelo CEP também cidade, UF,
 * rua e bairro que estiverem vazios) e grava no cadastro. Devolve a pessoa atualizada. Nunca lança erro.
 */
export async function completarEndereco<T extends PessoaEnd>(p: T, f: Fetch = fetch): Promise<T> {
  if (p.codigoMunicipio && p.cidade && p.uf && p.logradouro && p.bairro) return p;
  const dados: Partial<PessoaEnd> = {};
  try {
    if (!p.codigoMunicipio && p.cidade && p.uf) {
      const c = await codigoIbge(p.cidade, p.uf, f);
      if (c) dados.codigoMunicipio = c;
    }
    const faltaAlgo = !(dados.codigoMunicipio ?? p.codigoMunicipio) || !p.cidade || !p.uf || !p.logradouro || !p.bairro;
    if (faltaAlgo && p.cep) {
      const e = await viaCep(p.cep, f);
      if (e) {
        if (!p.cidade && e.cidade) dados.cidade = e.cidade;
        if (!p.uf && e.uf) dados.uf = e.uf;
        if (!p.logradouro && e.logradouro) dados.logradouro = e.logradouro;
        if (!p.bairro && e.bairro) dados.bairro = e.bairro;
        // o código do CEP só vale se o CEP é da mesma cidade do cadastro
        const mesmaCidade = !p.cidade || (e.cidade && normalizar(e.cidade) === normalizar(p.cidade));
        if (!dados.codigoMunicipio && !p.codigoMunicipio && e.codigoMunicipio && mesmaCidade) dados.codigoMunicipio = e.codigoMunicipio;
      }
    }
  } catch { /* sem internet: segue com o que tem */ }
  if (!Object.keys(dados).length) return p;
  try {
    await prisma.pessoa.update({ where: { id: p.id }, data: dados });
  } catch { /* não impede a nota */ }
  return { ...p, ...dados };
}

/** Preenche o código IBGE de todos os cadastros que têm cidade e UF (uma vez, depois da importação do Gestão Click). */
export async function preencherCodigosIbge(f: Fetch = fetch) {
  const pessoas = await prisma.pessoa.findMany({ where: { codigoMunicipio: null, cidade: { not: null }, uf: { not: null } }, select: { id: true, cidade: true, uf: true } });
  let ok = 0;
  const semCodigo: string[] = [];
  for (const p of pessoas) {
    const c = await codigoIbge(p.cidade!, p.uf!, f);
    if (c) { await prisma.pessoa.update({ where: { id: p.id }, data: { codigoMunicipio: c } }); ok++; }
    else semCodigo.push(`${p.cidade}/${p.uf}`);
  }
  return { total: pessoas.length, preenchidos: ok, semCodigo: [...new Set(semCodigo)] };
}
