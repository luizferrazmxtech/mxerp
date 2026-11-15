import { describe, it, expect } from "vitest";
import { alocar } from "@/lib/estoque/alocacao";

describe("alocar", () => {
  it("prefere o local padrão", () => {
    const r = alocar(2, [
      { localId: "B", disponivel: 10 },
      { localId: "A", disponivel: 5 },
    ], "A");
    expect(r).toEqual([{ localId: "A", quantidade: 2 }]);
  });

  it("divide entre prateleiras, maior primeiro, e registra falta", () => {
    const r = alocar(10, [
      { localId: "A", disponivel: 3 },
      { localId: "B", disponivel: 4 },
      { localId: "C", disponivel: 0 },
    ]);
    expect(r).toEqual([
      { localId: "B", quantidade: 4 },
      { localId: "A", quantidade: 3 },
      { localId: null, quantidade: 3 },
    ]);
  });

  it("ignora locais com disponível negativo", () => {
    expect(alocar(1, [{ localId: "A", disponivel: -2 }])).toEqual([{ localId: null, quantidade: 1 }]);
  });

  it("recusa quantidade zero", () => {
    expect(() => alocar(0, [])).toThrow();
  });
});
