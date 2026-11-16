"use server";

import { XMLParser } from "fast-xml-parser";
import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/atual";
import { lerPlanilha, type Linha } from "@/lib/migracao/planilha";
import { importarProdutos, importarServicos, type Resultado } from "@/lib/migracao/importar";

export type EstadoImportacao = { ok: boolean; mensagem: string; resultado?: Resultado } | null;

/** Itens (det/prod) de um XML de NF-e/NFC-e → linhas do importador de produtos. */
export async function produtosDoXml(xml: string): Promise<Linha[]> {
  const doc = new XMLParser({ ignoreAttributes: true, parseTagValue: false }).parse(xml);
  const inf = doc?.nfeProc?.NFe?.infNFe ?? doc?.NFe?.infNFe;
  if (!inf?.det) return [];
  const dets = Array.isArray(inf.det) ? inf.det : [inf.det];
  const s = (v: unknown) => (v == null ? "" : String(v));
  return dets.map((d: { prod: Record<string, unknown>; imposto?: { ICMS?: Record<string, { orig?: string }> } }) => {
    const p = d.prod;
    const icms = d.imposto?.ICMS ? Object.values(d.imposto.ICMS)[0] : undefined;
    const gtin = s(p.cEAN);
    return {
      codigo: s(p.cProd), nome: s(p.xProd), "codigo de barras": /^\d{8,14}$/.test(gtin) ? gtin : "", unidade: s(p.uCom),
      "valor de venda": s(p.vUnCom).replace(".", ","), ncm: s(p.NCM), cest: s(p.CEST), origem: s(icms?.orig),
    };
  });
}

export async function importarItensAcao(_: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  await exigirUsuario(["ADMIN", "GERENTE", "OPERADOR"]);
  const tipo = form.get("tipo") === "servicos" ? "servicos" : "produtos";
  const simular = form.get("modo") !== "gravar";
  const arquivos = form.getAll("arquivo").filter((a): a is File => a instanceof File && a.size > 0);
  if (!arquivos.length) return { ok: false, mensagem: "Escolha o arquivo" };
  try {
    let resultado: Resultado;
    if (tipo === "produtos" && form.get("nfe") === "1") {
      const vistos = new Map<string, Linha>();
      for (const a of arquivos) for (const l of await produtosDoXml(Buffer.from(await a.arrayBuffer()).toString("utf8"))) vistos.set(String(l.codigo), l);
      if (!vistos.size) return { ok: false, mensagem: "Nenhum item de NF-e encontrado nos XMLs" };
      resultado = await importarProdutos([...vistos.values()], { simular, importarEstoque: false });
    } else {
      const { linhas } = await lerPlanilha(arquivos[0].name, Buffer.from(await arquivos[0].arrayBuffer()));
      resultado = tipo === "servicos" ? await importarServicos(linhas, simular) : await importarProdutos(linhas, { simular, importarEstoque: form.get("estoque") === "1" });
    }
    if (!simular) revalidatePath(`/${tipo}`);
    return { ok: true, mensagem: simular ? "Simulação concluída, nada foi gravado." : "Importação concluída.", resultado };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : String(e) };
  }
}
