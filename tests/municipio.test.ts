import { describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
const { codigoIbge } = await import("@/lib/cadastros/municipio");

const resposta = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

describe("código IBGE pela cidade", () => {
  it("acha pela cidade e UF, sem acento e sem diferença de maiúsculas", async () => {
    let chamadas = 0;
    const f = (async (url: string) => {
      chamadas++;
      expect(url).toContain("/estados/SP/municipios");
      return resposta([{ id: 3548906, nome: "São Carlos" }, { id: 3550308, nome: "São Paulo" }]);
    }) as unknown as typeof fetch;
    expect(await codigoIbge("SAO CARLOS", "sp", f)).toBe("3548906");
    expect(await codigoIbge("são paulo", "SP", f)).toBe("3550308");
    expect(await codigoIbge("Cidade Inventada", "SP", f)).toBeNull();
    expect(chamadas).toBe(1); // a lista da UF é baixada uma vez só
  });

  it("sem internet devolve null (a nota mostra o que falta, não quebra)", async () => {
    const f = (async () => { throw new Error("sem rede"); }) as unknown as typeof fetch;
    expect(await codigoIbge("Ribeirão Preto", "MG", f)).toBeNull();
  });
});
