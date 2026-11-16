"use server";

import { XMLParser } from "fast-xml-parser";
import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { lerPlanilha, type Linha } from "@/lib/migracao/planilha";
import { importarPessoas, type Resultado } from "@/lib/migracao/importar";
import { PAPEIS, type PapelPessoa } from "./pessoas";

export type EstadoImportacao = { ok: boolean; mensagem: string; resultado?: Resultado } | null;

/** Destinatário (para clientes) ou emitente (para fornecedores) de um XML de NF-e/NFC-e → linha do importador. */
export async function pessoaDoXml(xml: string, papel: PapelPessoa): Promise<Linha | null> {
  const doc = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(xml);
  const inf = doc?.nfeProc?.NFe?.infNFe ?? doc?.NFe?.infNFe;
  const p = papel === "cliente" ? inf?.dest : papel === "fornecedor" ? inf?.emit : inf?.transp?.transporta;
  if (!p) return null;
  const e = p.enderDest ?? p.enderEmit ?? {};
  const s = (v: unknown) => (v == null ? "" : String(v));
  return {
    nome: s(p.xNome), "nome fantasia": s(p.xFant), documento: s(p.CNPJ || p.CPF || p.idEstrangeiro), "tipo de pessoa": p.CPF ? "física" : p.idEstrangeiro ? "estrangeiro" : "jurídica",
    ie: s(p.IE), email: s(p.email), telefone: s(e.fone),
    cep: s(e.CEP), logradouro: s(e.xLgr ?? p.xEnder), numero: s(e.nro), complemento: s(e.xCpl), bairro: s(e.xBairro),
    cidade: s(e.xMun ?? p.xMun), uf: s(e.UF ?? p.UF), "codigo ibge": s(e.cMun),
  };
}

export async function importarPessoasAcao(_: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR"]);
  const papel = String(form.get("papel")) as PapelPessoa;
  if (!PAPEIS[papel]) return { ok: false, mensagem: "Cadastro inválido" };
  const simular = form.get("modo") !== "gravar";
  const arquivos = form.getAll("arquivo").filter((a): a is File => a instanceof File && a.size > 0);
  if (!arquivos.length) return { ok: false, mensagem: "Escolha o arquivo" };
  try {
    let linhas: Linha[] = [];
    if (form.get("nfe") === "1") {
      for (const a of arquivos) {
        const l = await pessoaDoXml(Buffer.from(await a.arrayBuffer()).toString("utf8"), papel);
        if (l) linhas.push(l);
      }
      if (!linhas.length) return { ok: false, mensagem: "Nenhum XML de NF-e válido com " + (papel === "cliente" ? "destinatário" : "emitente") };
    } else {
      linhas = (await lerPlanilha(arquivos[0].name, Buffer.from(await arquivos[0].arrayBuffer()))).linhas;
    }
    const resultado = await importarPessoas(linhas, papel, simular);
    if (!simular) revalidatePath(PAPEIS[papel].base);
    return { ok: true, mensagem: simular ? "Simulação concluída, nada foi gravado." : "Importação concluída.", resultado };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}
