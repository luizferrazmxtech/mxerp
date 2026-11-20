import { prisma } from "./db";
import { ler } from "./config";
import { diaSP, dataBR, moeda } from "./datas";
import { situacaoLicenca, type SituacaoLicenca } from "./regua";

export type Licenca = {
  situacao: SituacaoLicenca;
  diasAtraso: number;
  mensagem: string | null;
  maxEmpresas: number;
  maxUsuarios: number;
  plano: string;
  fatura: { competencia: string; vencimento: string; valor: number; linhaDigitavel: string | null; pixCopiaECola: string | null; link: string | null } | null;
  verificadoEm: string;
};

/** O que o sistema do cliente recebe ao consultar a licença (situação, limites e a fatura a pagar). */
export async function licencaDoCliente(clienteId: string, hoje = diaSP()): Promise<Licenca> {
  const c = await prisma.cliente.findUniqueOrThrow({ where: { id: clienteId }, include: { plano: true, faturas: { where: { situacao: "ABERTA" }, orderBy: { vencimento: "asc" } } } });
  const [regua, geral] = await Promise.all([ler("regua"), ler("geral")]);
  const vencidas = c.faturas.filter((f) => f.vencimento <= hoje);
  const { situacao, diasAtraso } = situacaoLicenca(c, vencidas, hoje, regua);
  const f = c.faturas[0] ?? null;
  const prazo = (dias: number) => dataBR(new Date(f!.vencimento.getTime() + dias * 86400000));
  const mensagem =
    situacao === "EM_DIA" ? null
    : situacao === "AVISO" ? `Mensalidade de ${moeda(f?.valor as unknown as number)} em aberto há ${diasAtraso} dia(s).${f ? ` O sistema fica só para consulta em ${prazo(regua.diasLeitura)}.` : ""}`
    : situacao === "SO_LEITURA" ? `Mensalidade em aberto há ${diasAtraso} dia(s): o sistema está só para consulta.${f ? ` Bloqueio total em ${prazo(regua.diasBloqueio)}.` : ""}`
    : c.situacao === "ATIVO" ? `Sistema bloqueado por mensalidade em aberto há ${diasAtraso} dia(s).` : "Sistema suspenso. Fale com a MXTECH.";
  return {
    situacao, diasAtraso, mensagem,
    maxEmpresas: c.maxEmpresas ?? c.plano.maxEmpresas, maxUsuarios: c.maxUsuarios ?? c.plano.maxUsuarios, plano: c.plano.nome,
    fatura: f ? {
      competencia: f.competencia, vencimento: f.vencimento.toISOString().slice(0, 10), valor: Number(f.valor),
      linhaDigitavel: f.linhaDigitavel, pixCopiaECola: f.pixCopiaECola,
      link: geral.urlPublica && f.codigoSolicitacao ? `${geral.urlPublica.replace(/\/+$/, "")}/boleto/${f.id}/${c.licencaToken.slice(0, 16)}` : null,
    } : null,
    verificadoEm: new Date().toISOString(),
  };
}
