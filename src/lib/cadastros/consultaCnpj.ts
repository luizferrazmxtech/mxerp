import type { Certificado } from "@/lib/fiscal/certificado";
import { consultarCadastroSefaz, endpointCadastro, type CadastroSefaz, type RetornoCadastro } from "@/lib/fiscal/consultaCadastro";
import type { Transporte } from "@/lib/fiscal/sefaz";
import { cnpjValido } from "./documentos";
import type { DadosCnpj } from "./tipos";

/**
 * Busca os dados de uma empresa pelo CNPJ para preencher o cadastro:
 *  1. Receita (razão social, fantasia, endereço, contato) pela base pública: BrasilAPI, depois CNPJ.ws, depois ReceitaWS;
 *  2. inscrição estadual direto na SEFAZ da UF da empresa (CadConsultaCadastro4) com o certificado A1 da loja;
 *  3. sem SEFAZ (UF sem o serviço, loja sem certificado, falha), a inscrição da base pública do CNPJ.ws.
 * Cada etapa que falha vira um aviso; só dá erro se nada responder.
 */

type Publico = {
  fonte: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacao: string;
  email: string;
  telefone: string;
  cnae: string;
  regime: DadosCnpj["regime"];
  endereco: NonNullable<DadosCnpj["endereco"]> | null;
  /** inscrições estaduais da base pública (só o CNPJ.ws traz); undefined = a fonte não informa */
  inscricoes?: { ie: string; uf: string; ativa: boolean }[];
};

export type DepsCnpj = {
  fetch?: typeof fetch;
  /** certificado A1 da loja atual; null = sem certificado (pula a SEFAZ) */
  cert?: Certificado | null;
  transporte?: Transporte;
  /** UF da loja: usada para a SEFAZ quando a base pública não respondeu */
  ufLoja?: string | null;
  /** tempo máximo de cada consulta, em ms */
  limite?: number;
};

const s = (v: unknown) => (v == null ? "" : String(v).trim());
const dig = (v: unknown) => s(v).replace(/\D/g, "");
/** opção pelo Simples/MEI → regime; null quando a fonte não diz */
const regime = (simples: boolean | null | undefined, mei: boolean | null | undefined): DadosCnpj["regime"] =>
  mei ? "MEI" : simples ? "SIMPLES_NACIONAL" : simples === false ? "REGIME_NORMAL" : null;
const simNao = (v: unknown) => (v === "Sim" || v === true ? true : v === "Não" || v === "Nao" || v === false ? false : null);
const telefone = (ddd: unknown, num: unknown) => {
  const d = dig(ddd) + dig(num);
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return d;
};
const cep = (v: unknown) => {
  const d = dig(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};
/** "RUA" + "DAS FLORES" → "RUA DAS FLORES" (sem repetir quando a fonte já junta os dois) */
const logradouro = (tipo: unknown, nome: unknown) => {
  const t = s(tipo), n = s(nome);
  return t && !n.toUpperCase().startsWith(t.toUpperCase() + " ") ? `${t} ${n}` : n;
};

async function json(f: typeof fetch, url: string, limite: number) {
  const r = await f(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(limite), cache: "no-store" });
  if (r.status === 404) throw new Error("CNPJ não encontrado");
  if (r.status === 429) throw new Error("limite de consultas atingido");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) as Record<string, unknown>;
}

export async function brasilApi(cnpj: string, f: typeof fetch, limite: number): Promise<Publico> {
  const j = await json(f, `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, limite);
  return {
    fonte: "BrasilAPI",
    razaoSocial: s(j.razao_social),
    nomeFantasia: s(j.nome_fantasia),
    situacao: s(j.descricao_situacao_cadastral),
    email: s(j.email).toLowerCase(),
    telefone: telefone("", j.ddd_telefone_1),
    cnae: dig(j.cnae_fiscal),
    regime: regime(simNao(j.opcao_pelo_simples), simNao(j.opcao_pelo_mei)),
    endereco: {
      cep: cep(j.cep), logradouro: logradouro(j.descricao_tipo_de_logradouro, j.logradouro), numero: s(j.numero), complemento: s(j.complemento),
      bairro: s(j.bairro), cidade: s(j.municipio), uf: s(j.uf).toUpperCase(), codigoMunicipio: s(j.codigo_municipio_ibge),
    },
  };
}

export async function cnpjWs(cnpj: string, f: typeof fetch, limite: number): Promise<Publico> {
  const j = await json(f, `https://publica.cnpj.ws/cnpj/${cnpj}`, limite);
  const e = (j.estabelecimento ?? {}) as Record<string, unknown>;
  const cidade = (e.cidade ?? {}) as Record<string, unknown>;
  const estado = (e.estado ?? {}) as Record<string, unknown>;
  const ies = (e.inscricoes_estaduais ?? []) as Record<string, unknown>[];
  return {
    fonte: "CNPJ.ws",
    razaoSocial: s(j.razao_social),
    nomeFantasia: s(e.nome_fantasia),
    situacao: s(e.situacao_cadastral),
    email: s(e.email).toLowerCase(),
    telefone: telefone(e.ddd1, e.telefone1),
    cnae: dig((e.atividade_principal as Record<string, unknown> | undefined)?.id),
    regime: j.simples ? regime(simNao((j.simples as Record<string, unknown>).simples), simNao((j.simples as Record<string, unknown>).mei)) : null,
    endereco: {
      cep: cep(e.cep), logradouro: logradouro(e.tipo_logradouro, e.logradouro), numero: s(e.numero), complemento: s(e.complemento),
      bairro: s(e.bairro), cidade: s(cidade.nome), uf: s(estado.sigla).toUpperCase(), codigoMunicipio: s(cidade.ibge_id),
    },
    inscricoes: ies.map((i) => ({ ie: dig(i.inscricao_estadual), uf: s((i.estado as Record<string, unknown> | undefined)?.sigla).toUpperCase(), ativa: i.ativo === true })),
  };
}

export async function receitaWs(cnpj: string, f: typeof fetch, limite: number): Promise<Publico> {
  const j = await json(f, `https://receitaws.com.br/v1/cnpj/${cnpj}`, limite);
  if (s(j.status) === "ERROR") throw new Error(s(j.message) || "CNPJ não encontrado");
  return {
    fonte: "ReceitaWS",
    razaoSocial: s(j.nome),
    nomeFantasia: s(j.fantasia),
    situacao: s(j.situacao),
    email: s(j.email).toLowerCase(),
    telefone: s(j.telefone).split("/")[0].trim(),
    cnae: dig((j.atividade_principal as Record<string, unknown>[] | undefined)?.[0]?.code),
    regime: j.simples ? regime(simNao((j.simples as Record<string, unknown>).optante), simNao((j.simei as Record<string, unknown> | undefined)?.optante)) : null,
    endereco: {
      cep: cep(j.cep), logradouro: s(j.logradouro), numero: s(j.numero), complemento: s(j.complemento),
      bairro: s(j.bairro), cidade: s(j.municipio), uf: s(j.uf).toUpperCase(), codigoMunicipio: "",
    },
  };
}

/** Escolhe a IE do CNPJ na resposta da SEFAZ: a habilitada; se houver várias, a primeira (e avisa). */
function escolherIe(cads: CadastroSefaz[]) {
  const hab = cads.filter((c) => c.habilitada && c.ie);
  return { escolhida: hab[0] ?? null, habilitadas: hab, inativas: cads.filter((c) => !c.habilitada && c.ie) };
}

const comLimite = <T>(p: Promise<T>, ms: number, msg: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);

export async function buscarDadosCnpj(valor: string, deps: DepsCnpj = {}): Promise<DadosCnpj> {
  const cnpj = dig(valor);
  if (!cnpjValido(cnpj)) throw new Error("CNPJ inválido: confira os dígitos");
  const f = deps.fetch ?? fetch;
  const limite = deps.limite ?? 8000;
  const avisos: string[] = [];
  const fontes: string[] = [];

  // 1. Receita pela base pública
  let pub: Publico | null = null;
  const falhas: string[] = [];
  for (const fonte of [brasilApi, cnpjWs, receitaWs]) {
    try {
      pub = await fonte(cnpj, f, limite);
      if (pub.razaoSocial) break;
      pub = null;
    } catch (e) {
      const m = (e as Error).message;
      if (m === "CNPJ não encontrado" && fonte === brasilApi) {
        // a BrasilAPI é a fonte mais completa; se ela diz que não existe, não adianta insistir nas outras
        falhas.push(m);
        break;
      }
      falhas.push(`${fonte === brasilApi ? "BrasilAPI" : fonte === cnpjWs ? "CNPJ.ws" : "ReceitaWS"}: ${(e as Error).name === "TimeoutError" ? "sem resposta" : m}`);
    }
  }
  if (pub) fontes.push(`Receita (${pub.fonte})`);
  if (pub && pub.situacao && pub.situacao.toUpperCase() !== "ATIVA") avisos.push(`Situação na Receita: ${pub.situacao}`);

  const r: DadosCnpj = {
    cnpj, razaoSocial: pub?.razaoSocial ?? "", nomeFantasia: pub?.nomeFantasia ?? "", situacao: pub?.situacao ?? "",
    email: pub?.email ?? "", telefone: pub?.telefone ?? "", endereco: pub?.endereco ?? null,
    cnae: pub?.cnae ?? "", regime: pub?.regime ?? null,
    inscricaoEstadual: null, contribuinteIcms: null, fontes, avisos,
  };

  // 2. Inscrição estadual pela SEFAZ da UF da empresa
  const uf = (pub?.endereco?.uf || deps.ufLoja || "").toUpperCase();
  let sefazResolveu = false;
  if (uf && deps.cert && endpointCadastro(uf)) {
    try {
      const ret: RetornoCadastro = await comLimite(consultarCadastroSefaz(uf, cnpj, deps.cert, deps.transporte), limite + 4000, "sem resposta");
      if (ret.ok) {
        const { escolhida, habilitadas, inativas } = escolherIe(ret.cadastros);
        if (escolhida) {
          r.inscricaoEstadual = escolhida.ie;
          r.contribuinteIcms = "CONTRIBUINTE";
          if (habilitadas.length > 1) avisos.push(`A empresa tem ${habilitadas.length} inscrições habilitadas em ${uf} (${habilitadas.map((c) => c.ie).join(", ")}). Usei a primeira.`);
        } else {
          r.inscricaoEstadual = "";
          r.contribuinteIcms = "NAO_CONTRIBUINTE";
          if (inativas.length) avisos.push(`Inscrição estadual ${inativas.map((c) => c.ie).join(", ")} não habilitada na SEFAZ-${uf}`);
        }
        // sem base pública, o cadastro da SEFAZ supre nome e endereço
        const c = escolhida ?? ret.cadastros[0];
        if (!pub && c) {
          r.razaoSocial = c.razaoSocial;
          r.nomeFantasia = c.nomeFantasia;
          r.cnae = c.cnae;
          r.regime = /simples/i.test(c.regime) ? "SIMPLES_NACIONAL" : c.regime ? "REGIME_NORMAL" : null;
          if (c.endereco) r.endereco = { ...c.endereco, cep: cep(c.endereco.cep), uf: c.uf || uf };
        }
        fontes.push(`IE pela SEFAZ-${uf}`);
        sefazResolveu = true;
      } else if (ret.naoContribuinte) {
        r.inscricaoEstadual = "";
        r.contribuinteIcms = "NAO_CONTRIBUINTE";
        fontes.push(`SEFAZ-${uf}: sem inscrição estadual`);
        sefazResolveu = true;
      } else {
        avisos.push(`SEFAZ-${uf} respondeu ${ret.cStat} - ${ret.xMotivo}`);
      }
    } catch (e) {
      avisos.push(`SEFAZ-${uf} não respondeu (${(e as Error).message}). Inscrição estadual pela base pública.`);
    }
  } else if (uf && !deps.cert) {
    avisos.push("A loja não tem certificado A1: a inscrição estadual veio da base pública e pode estar desatualizada.");
  } else if (uf && !endpointCadastro(uf)) {
    avisos.push(`A SEFAZ-${uf} não oferece consulta de cadastro: a inscrição estadual veio da base pública.`);
  }

  // 3. Inscrição estadual pela base pública (CNPJ.ws é a única que traz)
  if (!sefazResolveu && uf) {
    let ies = pub?.inscricoes;
    if (ies === undefined) {
      try { ies = (await cnpjWs(cnpj, f, limite)).inscricoes; } catch { /* sem IE pública: o campo fica como está */ }
    }
    if (ies !== undefined) {
      const daUf = ies.filter((i) => i.uf === uf && i.ie);
      const ativa = daUf.find((i) => i.ativa);
      if (ativa) {
        r.inscricaoEstadual = ativa.ie;
        r.contribuinteIcms = "CONTRIBUINTE";
        fontes.push("IE pela base pública (CNPJ.ws)");
      } else if (daUf.length) {
        avisos.push(`Inscrição estadual ${daUf.map((i) => i.ie).join(", ")} consta como inativa na base pública`);
      } else {
        avisos.push(`Nenhuma inscrição estadual em ${uf} na base pública: confira se a empresa é contribuinte de ICMS.`);
      }
    }
  }

  if (!pub && !sefazResolveu) throw new Error(`Não consegui consultar o CNPJ (${falhas.join("; ") || "sem resposta"}). Preencha os dados à mão.`);
  if (!pub) avisos.unshift(`Base pública indisponível (${falhas.join("; ")}): nome e endereço vieram da SEFAZ.`);
  return r;
}
