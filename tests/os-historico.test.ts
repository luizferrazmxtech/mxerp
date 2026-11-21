import { describe, expect, it } from "vitest";
import { resumoAlteracoes, type FotoOs } from "@/lib/os/alteracoes";
import { fotosDoHistorico } from "@/lib/os/historicoFotos";

const base: FotoOs = { itens: [{ chave: "P1", nome: "Câmera", quantidade: 1, valorUnit: 400 }, { chave: "S1", nome: "Instalação", quantidade: 1, valorUnit: 400 }], total: 800, tecnicos: [], equipe: null, saida: null, observacoes: null, equipamentos: [] };

describe("resumo do que mudou na OS", () => {
  it("nada mudou: lista vazia", () => {
    expect(resumoAlteracoes(base, structuredClone(base))).toEqual([]);
  });
  it("itens incluídos, retirados, quantidade, valor, total e técnico", () => {
    const depois: FotoOs = { ...base, itens: [{ chave: "P1", nome: "Câmera", quantidade: 2, valorUnit: 450 }, { chave: "P2", nome: "Switch", quantidade: 1, valorUnit: 498 }], total: 1398, tecnicos: ["Ana"], equipamentos: ["DVR Intelbras"] };
    const r = resumoAlteracoes(base, depois);
    expect(r).toContain("Câmera: quantidade 1 → 2");
    expect(r.some((x) => x.startsWith("Câmera: valor"))).toBe(true);
    expect(r).toContain("+ 1 × Switch");
    expect(r).toContain("− 1 × Instalação");
    expect(r.some((x) => x.startsWith("total "))).toBe(true);
    expect(r).toContain("técnico — → Ana");
    expect(r).toContain("+ equipamento DVR Intelbras");
  });
});

describe("fotos no histórico", () => {
  it("liga cada 'Foto da instalação anexada' à foto mais próxima no tempo", () => {
    const t = (s: number) => new Date(Date.UTC(2026, 10, 21, 14, 0, s));
    const hist = [
      { id: "h1", descricao: "Foto da instalação anexada (Câmera)", createdAt: t(0) },
      { id: "h2", descricao: "Trabalho iniciado", createdAt: t(1) },
      { id: "h3", descricao: "Foto da instalação anexada", createdAt: t(30) },
    ];
    const m = fotosDoHistorico(hist, [{ id: "f2", createdAt: t(30) }, { id: "f1", createdAt: t(0) }, { id: "longe", createdAt: new Date(Date.UTC(2026, 10, 22)) }]);
    expect(Object.fromEntries(m)).toEqual({ h1: "f1", h3: "f2" });
  });
});
