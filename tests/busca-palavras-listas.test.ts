import { describe, expect, it } from "vitest";
import { cadaPalavra, contem, numeroPalavra, palavrasBusca } from "@/lib/busca/palavras";
import { wherePessoas } from "@/lib/cadastros/filtros";

describe("busca por palavras nas listas", () => {
  it("separa as palavras e reconhece número de documento", () => {
    expect(palavrasBusca("  silva   joão ")).toEqual(["silva", "joão"]);
    expect(palavrasBusca(undefined)).toEqual([]);
    expect(numeroPalavra("#8698")).toBe(8698);
    expect(numeroPalavra("rj45")).toBe(0);
  });

  it("cada palavra vira um OR, e as palavras juntas um AND (qualquer ordem)", () => {
    const w = cadaPalavra("araucarias condominio", (p) => [{ nome: contem(p) }]);
    expect(w).toEqual([
      { OR: [{ nome: { contains: "araucarias", mode: "insensitive" } }] },
      { OR: [{ nome: { contains: "condominio", mode: "insensitive" } }] },
    ]);
    expect(cadaPalavra("", (p) => [{ nome: contem(p) }])).toEqual([]);
  });

  it("clientes: nome, fantasia e documento por palavra", () => {
    const w = wherePessoas("cliente", { q: "monte 0001" }) as { AND: unknown[] };
    expect(JSON.stringify(w.AND)).toContain('"contains":"monte"');
    expect(JSON.stringify(w.AND)).toContain('"documento":{"contains":"0001"}');
  });
});
