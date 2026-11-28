import { prisma } from "@/lib/db";
import { certificadoDaEmpresa, type Certificado } from "./certificado";
import { ClienteNfse, idDps, type DadosDps, type TransporteRest } from "./nfse";
import { numeroNfseDoXml } from "./numeroNota";

/**
 * NFS-e sem o XML no MXERP (as emitidas no Gestão Click vêm do backup só com número, DPS e valor): busca no portal
 * nacional com o certificado da empresa emissora. Sem a chave, acha pela DPS (série + número) em GET /dps/{id}; com a
 * chave, baixa o XML em GET /nfse/{chave}. Vale para qualquer empresa e origem: a tela da nota fica igual à das
 * emitidas pelo MXERP (DANFSe, XML, PDF).
 */
export async function completarNfse(notaId: string, deps: { cert?: Certificado; transporte?: TransporteRest } = {}): Promise<{ ok: boolean; mensagem: string }> {
  const n = await prisma.notaFiscal.findUnique({ where: { id: notaId } });
  if (!n || n.modelo !== "NFSE") return { ok: false, mensagem: "NFS-e não encontrada" };
  if (n.xml) return { ok: true, mensagem: "A NFS-e já tem o XML" };
  if (!["AUTORIZADA", "CANCELADA"].includes(n.status)) return { ok: false, mensagem: "A NFS-e não foi autorizada" };
  const e = n.empresaId ? await prisma.empresa.findUnique({ where: { id: n.empresaId } }) : null;
  if (!e) return { ok: false, mensagem: "Empresa emissora não encontrada" };
  const agora = new Date();
  try {
    const cliente = new ClienteNfse(deps.cert ?? certificadoDaEmpresa(e), n.ambiente === "PRODUCAO" ? 1 : 2, deps.transporte);
    let chave = n.chave;
    if (!chave) {
      if (!e.codigoMunicipio) return { ok: false, mensagem: "Informe o código IBGE do município da empresa emissora" };
      const r = await cliente.chaveDaDps(idDps({ prestador: { cnpj: e.cnpj, codigoMunicipio: e.codigoMunicipio } as DadosDps["prestador"], serie: String(n.serie), numero: n.numero }));
      if (!r.chave) {
        await prisma.notaFiscal.update({ where: { id: n.id }, data: { consultadaEm: agora } });
        return { ok: false, mensagem: `O portal nacional não achou a DPS ${n.serie}/${n.numero}: ${r.mensagem}` };
      }
      chave = r.chave;
    }
    const b = await cliente.baixar(chave);
    // a chave já fica gravada mesmo se o XML não vier: o DANFSe do portal abre pela chave
    const numeroNfse = numeroNfseDoXml(b.xml);
    await prisma.notaFiscal.update({
      where: { id: n.id },
      data: { chave, consultadaEm: agora, ...(b.xml ? { xml: b.xml } : {}), ...(numeroNfse ? { numeroNfse } : {}) },
    });
    return b.xml ? { ok: true, mensagem: "XML da NFS-e baixado do portal nacional" } : { ok: false, mensagem: `Chave achada, mas o XML não veio: ${b.mensagem}` };
  } catch (err) {
    await prisma.notaFiscal.update({ where: { id: n.id }, data: { consultadaEm: agora } }).catch(() => undefined);
    return { ok: false, mensagem: `Portal nacional da NFS-e: ${(err as Error).message}` };
  }
}

/** Tenta de novo no máximo uma vez por hora quando a tela da nota abre (o portal cai com frequência). */
export const deveBuscarXml = (n: { modelo: string; xml: string | null; status: string; empresaId: string | null; consultadaEm: Date | null }, agora = new Date()) =>
  n.modelo === "NFSE" && !n.xml && !!n.empresaId && ["AUTORIZADA", "CANCELADA"].includes(n.status)
  && (!n.consultadaEm || agora.getTime() - n.consultadaEm.getTime() > 3600_000);
