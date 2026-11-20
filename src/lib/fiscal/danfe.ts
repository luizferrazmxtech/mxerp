import { XMLParser } from "fast-xml-parser";

/** Dados da NF-e/NFC-e lidos do XML autorizado, para montar o DANFE (A4 ou simplificado). */
type No = Record<string, unknown>;
const txt = (v: unknown) => (v == null ? "" : String(v));
const num = (v: unknown) => Number(v ?? 0) || 0;
const lista = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export type Endereco = { logradouro: string; numero: string; complemento: string; bairro: string; municipio: string; uf: string; cep: string; fone: string };
export type ItemDanfe = { codigo: string; descricao: string; ncm: string; cst: string; cfop: string; unidade: string; quantidade: number; valorUnit: number; valorTotal: number; desconto: number; bcIcms: number; vIcms: number; aliqIcms: number; vIpi: number; aliqIpi: number; infAdProd: string };

const endereco = (e: No | undefined): Endereco => ({
  logradouro: txt(e?.xLgr), numero: txt(e?.nro), complemento: txt(e?.xCpl), bairro: txt(e?.xBairro),
  municipio: txt(e?.xMun), uf: txt(e?.UF), cep: txt(e?.CEP), fone: txt(e?.fone),
});

export function lerDanfe(xml: string) {
  const doc = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", parseTagValue: false }).parse(xml) as No;
  const proc = doc.nfeProc as No | undefined;
  const nfe = (proc?.NFe ?? doc.NFe) as No;
  const inf = nfe.infNFe as No;
  const ide = inf.ide as No, emit = inf.emit as No, dest = inf.dest as No | undefined;
  const tot = ((inf.total as No)?.ICMSTot ?? {}) as No;
  const prot = ((proc?.protNFe as No)?.infProt ?? {}) as No;
  const transp = (inf.transp ?? {}) as No;
  const pag = lista((inf.pag as No)?.detPag as No | No[]);
  const dup = lista(((inf.cobr as No)?.dup) as No | No[]);
  const itens: ItemDanfe[] = lista(inf.det as No | No[]).map((d) => {
    const p = d.prod as No;
    const icmsGrupo = Object.values(((d.imposto as No)?.ICMS ?? {}) as No)[0] as No | undefined;
    const ipi = (((d.imposto as No)?.IPI as No)?.IPITrib ?? {}) as No;
    return {
      codigo: txt(p.cProd), descricao: txt(p.xProd), ncm: txt(p.NCM), cfop: txt(p.CFOP), unidade: txt(p.uCom),
      cst: `${txt(icmsGrupo?.orig)}${txt(icmsGrupo?.CSOSN ?? icmsGrupo?.CST)}`,
      quantidade: num(p.qCom), valorUnit: num(p.vUnCom), valorTotal: num(p.vProd), desconto: num(p.vDesc),
      bcIcms: num(icmsGrupo?.vBC), vIcms: num(icmsGrupo?.vICMS), aliqIcms: num(icmsGrupo?.pICMS),
      vIpi: num(ipi.vIPI), aliqIpi: num(ipi.pIPI), infAdProd: txt(d.infAdProd),
    };
  });
  const supl = nfe.infNFeSupl as No | undefined;
  return {
    chave: txt(inf["@Id"]).replace(/^NFe/, ""),
    modelo: txt(ide.mod), numero: txt(ide.nNF), serie: txt(ide.serie), natOp: txt(ide.natOp), tpNF: txt(ide.tpNF),
    emissao: txt(ide.dhEmi), saida: txt(ide.dhSaiEnt), tpAmb: txt(ide.tpAmb),
    emitente: { nome: txt(emit.xNome), fantasia: txt(emit.xFant), cnpj: txt(emit.CNPJ ?? emit.CPF), ie: txt(emit.IE), im: txt(emit.IM), endereco: endereco(emit.enderEmit as No) },
    destinatario: dest ? { nome: txt(dest.xNome), documento: txt(dest.CNPJ ?? dest.CPF), ie: txt(dest.IE), email: txt(dest.email), endereco: endereco(dest.enderDest as No) } : null,
    itens,
    totais: {
      bcIcms: num(tot.vBC), vIcms: num(tot.vICMS), bcSt: num(tot.vBCST), vSt: num(tot.vST), vProd: num(tot.vProd), vFrete: num(tot.vFrete),
      vSeg: num(tot.vSeg), vDesc: num(tot.vDesc), vOutro: num(tot.vOutro), vIpi: num(tot.vIPI), vNF: num(tot.vNF), vTotTrib: num(tot.vTotTrib),
      vII: num(tot.vII), vPis: num(tot.vPIS), vCofins: num(tot.vCOFINS),
    },
    modFrete: txt(transp.modFrete),
    transportadora: (() => {
      const t = (transp.transporta ?? {}) as No, v = (transp.veicTransp ?? {}) as No;
      return { nome: txt(t.xNome), documento: txt(t.CNPJ ?? t.CPF), ie: txt(t.IE), endereco: txt(t.xEnder), municipio: txt(t.xMun), uf: txt(t.UF), placa: txt(v.placa), ufPlaca: txt(v.UF), antt: txt(v.RNTC) };
    })(),
    volumes: lista(transp.vol as No | No[]).map((v) => ({ quantidade: txt(v.qVol), especie: txt(v.esp), marca: txt(v.marca), numeracao: txt(v.nVol), pesoBruto: num(v.pesoB), pesoLiquido: num(v.pesoL) })),
    pagamentos: pag.map((p) => ({ tPag: txt(p.tPag), valor: num(p.vPag) })),
    duplicatas: dup.map((d) => ({ numero: txt(d.nDup), vencimento: txt(d.dVenc), valor: num(d.vDup) })),
    infCpl: txt((inf.infAdic as No)?.infCpl),
    protocolo: txt(prot.nProt), dataProtocolo: txt(prot.dhRecbto),
    qrCode: txt(supl?.qrCode), urlChave: txt(supl?.urlChave),
  };
}

export type Danfe = ReturnType<typeof lerDanfe>;

export const MOD_FRETE: Record<string, string> = {
  "0": "0 - Por conta do emitente", "1": "1 - Por conta do destinatário", "2": "2 - Por conta de terceiros",
  "3": "3 - Próprio, do remetente", "4": "4 - Próprio, do destinatário", "9": "9 - Sem frete",
};
