/**
 * Configuração da tributação da NFS-e (padrão nacional) de cada empresa, como no Gestão Click:
 * natureza de operação, apuração dos tributos (Simples), imunidade, suspensão da exigibilidade e os códigos
 * da prefeitura. Guardada em Empresa.configNfse (JSON). Arquivo sem prisma: a tela de empresas usa as listas.
 */
export type ConfigNfse = {
  /** tribISSQN da DPS: 1 operação tributável, 2 imunidade, 4 não incidência */
  natureza: 1 | 2 | 4;
  /** regApTribSN (só ME/EPP do Simples): 1 federais e municipal pelo SN, 2 federais pelo SN e ISS por fora, 3 tudo por fora */
  apuracao: 1 | 2 | 3;
  /** tpImunidade (com natureza = imunidade) */
  tpImunidade: number | null;
  /** tpSusp: 1 decisão judicial, 2 processo administrativo (exigibilidade do ISS suspensa) */
  tpSusp: 1 | 2 | null;
  nProcesso: string | null;
  /** códigos guardados como no Gestão Click (acesso à prefeitura); a DPS 1.00 não tem campo para eles */
  tipoOperacao: string | null;
  indicadorOperacao: string | null;
  /** manda a inscrição municipal na DPS (desligar quando a Sefin recusar com E0120: município sem cadastro complementar) */
  enviarIm: boolean;
  /** % aproximado dos tributos do Simples na NFS-e (pTotTribSN, só ME/EPP); vazio = 6% */
  pTotTribSN: number | null;
};

export const NATUREZAS_NFSE: [number, string][] = [
  [1, "Operação tributável - Não reter PIS/Cofins"], [2, "Imunidade"], [4, "Não incidência"],
];
export const APURACOES_NFSE: [number, string][] = [
  [1, "Regime de apuração dos tributos federais e municipal pelo Simples Nacional"],
  [2, "Tributos federais pelo Simples Nacional e ISSQN por fora (legislação municipal)"],
  [3, "Tributos federais e municipal por fora do Simples Nacional"],
];
export const IMUNIDADES_NFSE: [number, string][] = [
  [0, "Imunidade (tipo não informado)"], [1, "Patrimônio, renda ou serviços, uns dos outros (CF 150, VI, a)"],
  [2, "Templos de qualquer culto (CF 150, VI, b)"], [3, "Partidos, sindicatos, educação e assistência social (CF 150, VI, c)"],
  [4, "Livros, jornais, periódicos e papel (CF 150, VI, d)"], [5, "Fonogramas e videofonogramas (CF 150, VI, e)"],
];
export const SUSPENSOES_NFSE: [number, string][] = [[1, "Exigibilidade suspensa por decisão judicial"], [2, "Exigibilidade suspensa por processo administrativo"]];

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const pct = (v: unknown) => {
  const n = typeof v === "string" ? Number(v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v) : num(v);
  return n !== null && Number.isFinite(n) && n > 0 && n < 100 ? Math.round(n * 100) / 100 : null;
};
const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Lê o JSON gravado (ou o formulário já convertido) com os padrões: tributável, tudo pelo Simples. */
export function lerConfigNfse(v: unknown): ConfigNfse {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const natureza = num(o.natureza);
  const apuracao = num(o.apuracao);
  const tpImunidade = num(o.tpImunidade);
  const tpSusp = num(o.tpSusp);
  return {
    natureza: natureza === 2 || natureza === 4 ? natureza : 1,
    apuracao: apuracao === 2 || apuracao === 3 ? apuracao : 1,
    tpImunidade: tpImunidade !== null && tpImunidade >= 0 && tpImunidade <= 5 ? tpImunidade : null,
    tpSusp: tpSusp === 1 || tpSusp === 2 ? tpSusp : null,
    nProcesso: txt(o.nProcesso)?.slice(0, 30) ?? null,
    tipoOperacao: txt(o.tipoOperacao),
    indicadorOperacao: txt(o.indicadorOperacao),
    enviarIm: o.enviarIm !== false && o.enviarIm !== "0" && o.enviarIm !== "false",
    pTotTribSN: pct(o.pTotTribSN),
  };
}

/** Confere antes de gravar (a DPS seria recusada). */
export function validarConfigNfse(c: ConfigNfse) {
  if (c.tpSusp && !c.nProcesso) throw new Error("NFS-e: informe o número do processo da suspensão");
  if (c.nProcesso && (!/\d/.test(c.nProcesso) || c.nProcesso.replace(/\D/g, "").length > 30)) throw new Error("NFS-e: o número do processo da suspensão tem até 30 dígitos (só números)");
  if (!c.tpSusp && c.nProcesso) throw new Error("NFS-e: escolha o tipo de suspensão do número de processo informado");
}
