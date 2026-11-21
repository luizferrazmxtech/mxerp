/**
 * Resumo do que mudou ao salvar a OS, para o histórico ("OS alterada: + 2 × Câmera; total R$ 898,00 → R$ 1.298,00").
 * Função pura: recebe o antes e o depois já com os nomes dos itens.
 */
export type FotoOs = {
  itens: { chave: string; nome: string; quantidade: number; valorUnit: number }[];
  total: number;
  tecnicos: string[];
  equipe: string | null;
  saida: Date | null;
  observacoes: string | null;
  equipamentos: string[];
};

const q = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR", { maximumFractionDigits: 3 }));
const rs = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const lista = (l: string[]) => (l.length ? l.join(", ") : "—");
const data = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

export function resumoAlteracoes(a: FotoOs, d: FotoOs): string[] {
  const out: string[] = [];
  const agrupar = (l: FotoOs["itens"]) => {
    const m = new Map<string, { nome: string; quantidade: number; valorUnit: number }>();
    for (const i of l) {
      const x = m.get(i.chave);
      if (x) x.quantidade += i.quantidade;
      else m.set(i.chave, { nome: i.nome, quantidade: i.quantidade, valorUnit: i.valorUnit });
    }
    return m;
  };
  const antes = agrupar(a.itens), depois = agrupar(d.itens);
  for (const [k, x] of depois) {
    const y = antes.get(k);
    if (!y) out.push(`+ ${q(x.quantidade)} × ${x.nome}`);
    else {
      if (Math.abs(y.quantidade - x.quantidade) > 1e-9) out.push(`${x.nome}: quantidade ${q(y.quantidade)} → ${q(x.quantidade)}`);
      if (Math.abs(y.valorUnit - x.valorUnit) > 0.004) out.push(`${x.nome}: valor ${rs(y.valorUnit)} → ${rs(x.valorUnit)}`);
    }
  }
  for (const [k, y] of antes) if (!depois.has(k)) out.push(`− ${q(y.quantidade)} × ${y.nome}`);
  if (Math.abs(a.total - d.total) > 0.004) out.push(`total ${rs(a.total)} → ${rs(d.total)}`);
  if (lista(a.tecnicos) !== lista(d.tecnicos)) out.push(`técnico ${lista(a.tecnicos)} → ${lista(d.tecnicos)}`);
  if ((a.equipe ?? "") !== (d.equipe ?? "")) out.push(`equipe ${a.equipe ?? "—"} → ${d.equipe ?? "—"}`);
  if (d.saida && data(a.saida) !== data(d.saida)) out.push(`saída ${data(a.saida)} → ${data(d.saida)}`);
  if ((a.observacoes ?? "").trim() !== (d.observacoes ?? "").trim()) out.push("observações alteradas");
  const eqA = new Set(a.equipamentos), eqD = new Set(d.equipamentos);
  for (const e of eqD) if (!eqA.has(e)) out.push(`+ equipamento ${e}`);
  for (const e of eqA) if (!eqD.has(e)) out.push(`− equipamento ${e}`);
  return out;
}
