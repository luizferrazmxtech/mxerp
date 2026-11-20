import { describe, expect, it } from "vitest";
import { situacaoEstoque } from "@/lib/itens/estoqueSituacao";
import { palavras } from "@/lib/busca/palavras";

describe("situação do estoque na busca", () => {
  it("falta, abaixo do mínimo, ok, acima do máximo, sem controle", () => {
    expect(situacaoEstoque(0, 5, null)).toBe("FALTA");
    expect(situacaoEstoque(-1, 0, null)).toBe("FALTA");
    expect(situacaoEstoque(3, 5, null)).toBe("ABAIXO");
    expect(situacaoEstoque(5, 5, null)).toBe("OK");
    expect(situacaoEstoque(30, 5, 20)).toBe("ACIMA");
    expect(situacaoEstoque(null, 5, 20)).toBe("SEM_CONTROLE");
  });
  it("palavras sem acento e minúsculas", () => {
    expect(palavras("  Conector  RJ45 Ação ")).toEqual(["conector", "rj45", "acao"]);
  });
});
