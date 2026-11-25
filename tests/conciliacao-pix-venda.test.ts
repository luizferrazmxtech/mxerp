import { describe, expect, it } from "vitest";

const conc = await import("@/lib/financeiro/conciliacao");

const vazio = conc.montarHistorico([], []);
const pix = (id: string, hora: string, valor: number) => ({
  id, data: new Date("2026-11-23T00:00:00Z"), dataHora: new Date(`2026-11-23T${hora}:00-03:00`), valor,
  descricao: "Pix recebido - Matheus Guerrero Geremias - Matheus Guerrero Geremias", conta: "INTER", contaBancariaId: "c1",
});
const venda = (id: string, hora: string | null, valor: number, formaPix: boolean | null = true) => ({
  id, tipo: "RECEBER" as const, valor, vencimento: new Date("2026-11-23T00:00:00Z"), descricao: `Venda de nº ${id}`,
  pessoa: "CONSUMIDOR", pessoaId: "consumidor", pessoaNomes: ["CONSUMIDOR"], categoriaId: "rec", centroCustoId: null,
  momentos: hora ? [new Date(`2026-11-23T${hora}:00-03:00`)] : [], formaPix,
});
const hoje = new Date("2026-11-25T00:00:00Z");

describe("Pix recebido × venda do balcão no mesmo horário", () => {
  it("mesmo valor minutos depois da venda vira sugestão de alta confiança, mesmo com outro pagador", () => {
    const [l] = conc.analisar([pix("t1", "18:42", 40)], [venda("9228", "18:38", 40)], vazio, [], hoje);
    expect(l.acao).toBe("BAIXAR");
    expect(l.lancamentoId).toBe("9228");
    expect(l.confianca).toBeGreaterThanOrEqual(80);
    expect(l.motivos.join(" ")).toContain("venda às 18:38 (Pix às 18:42)");
  });

  it("vale o momento da venda mais perto do Pix (a conta é refeita quando a venda é editada)", () => {
    const v = { ...venda("9228", "20:15", 40), momentos: [new Date("2026-11-23T20:15:00-03:00"), new Date("2026-11-23T18:35:00-03:00")] };
    const [l] = conc.analisar([pix("t1", "18:42", 40)], [v], vazio, [], hoje);
    expect(l.confianca).toBeGreaterThanOrEqual(80);
    expect(l.motivos.join(" ")).toContain("venda às 18:35");
  });

  it("perto mas fora da regra: diz o horário da venda para conferir", () => {
    const [a] = conc.analisar([pix("t1", "18:42", 40)], [venda("a", "17:30", 40)], vazio, [], hoje);
    expect(a.candidatos[0].motivos.join(" ")).toContain("venda às 17:30, 72 min do Pix");
    const [b] = conc.analisar([pix("t1", "18:42", 40)], [venda("b", "18:40", 40, false)], vazio, [], hoje);
    expect(b.candidatos[0].motivos.join(" ")).toContain("em outra forma de pagamento");
  });

  it("fora da tolerância, valor diferente, forma não Pix ou conta importada continua sem sugestão", () => {
    for (const v of [venda("a", "17:30", 40), venda("b", "18:40", 41), venda("c", "18:40", 40, false), venda("d", null, 40)]) {
      const [l] = conc.analisar([pix("t1", "18:42", 40)], [v], vazio, [], hoje);
      expect(l.confianca, v.id).toBeLessThanOrEqual(30);
    }
  });

  it("duas vendas do mesmo valor perto do Pix ficam para escolha manual", () => {
    const [l] = conc.analisar([pix("t1", "18:42", 40)], [venda("a", "18:35", 40), venda("b", "18:45", 40)], vazio, [], hoje);
    expect(l.confianca).toBeLessThan(60);
  });

  it("cada venda vai para um Pix só", () => {
    const [a, b] = conc.analisar([pix("t1", "18:42", 40), pix("t2", "18:50", 40)], [venda("a", "18:41", 40)], vazio, [], hoje);
    expect([a.lancamentoId, b.lancamentoId].filter(Boolean)).toEqual(["a"]);
  });

  it("forma Pix pelo código da nota ou pelo nome", () => {
    expect(conc.ehPix({ tPag: "17", nome: "Qualquer" })).toBe(true);
    expect(conc.ehPix({ tPag: "99", nome: "PIX Inter" })).toBe(true);
    expect(conc.ehPix({ tPag: "01", nome: "Dinheiro" })).toBe(false);
  });
});
