import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const perm = await import("@/lib/auth/permissoesAcao");

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});
beforeEach(async () => {
  await prisma.permissaoPapel.deleteMany({});
  perm.limparCachePermissoes();
});

describe("permissões por ação", () => {
  it("sem configuração vale o padrão de antes", async () => {
    expect(await perm.pode("GERENTE", "venda.excluir")).toBe(true);
    expect(await perm.pode("OPERADOR", "venda.excluir")).toBe(false);
    expect(await perm.pode("CAIXA", "pdv.desconto")).toBe(true);
    expect(await perm.pode("TECNICO", "os.situacao")).toBe(true);
  });

  it("a tela grava só as exceções, o ADMIN nunca perde, e voltar ao padrão limpa", async () => {
    // marca tudo como o padrão, mas tira desconto do CAIXA e dá exclusão de venda ao OPERADOR
    const marcadas = new Set<string>();
    for (const m of await perm.matrizPermissoes()) for (const p of perm.PAPEIS_CONFIGURAVEIS) if (m.papeis[p].padrao) marcadas.add(`${p}:${m.acao}`);
    marcadas.delete("CAIXA:pdv.desconto");
    marcadas.add("OPERADOR:venda.excluir");
    await perm.salvarPermissoes(marcadas);
    expect(await prisma.permissaoPapel.count()).toBe(2);
    expect(await perm.pode("CAIXA", "pdv.desconto")).toBe(false);
    expect(await perm.pode("OPERADOR", "venda.excluir")).toBe(true);
    expect(await perm.pode("ADMIN", "pdv.desconto")).toBe(true);
    const linha = (await perm.matrizPermissoes()).find((m) => m.acao === "pdv.desconto")!;
    expect(linha.papeis.CAIXA).toEqual({ pode: false, padrao: true });

    // salvar de novo igual não cria nada a mais
    await perm.salvarPermissoes(marcadas);
    expect(await prisma.permissaoPapel.count()).toBe(2);

    await perm.salvarPermissoes(new Set(), true);
    expect(await prisma.permissaoPapel.count()).toBe(0);
    expect(await perm.pode("CAIXA", "pdv.desconto")).toBe(true);
  });

  it("relatórios e números do Início são só do administrador até serem liberados", async () => {
    for (const p of perm.PAPEIS_CONFIGURAVEIS) {
      expect(await perm.pode(p, "relatorios.ver")).toBe(false);
      expect(await perm.pode(p, "inicio.indicadores")).toBe(false);
    }
    expect(await perm.pode("ADMIN", "relatorios.ver")).toBe(true);
    expect([...(await perm.acoesLiberadas("OPERADOR", ["relatorios.ver", "os.situacao"]))]).toEqual(["os.situacao"]);
    const marcadas = new Set<string>(["GERENTE:relatorios.ver"]);
    for (const m of await perm.matrizPermissoes()) for (const p of perm.PAPEIS_CONFIGURAVEIS) if (m.papeis[p].padrao) marcadas.add(`${p}:${m.acao}`);
    await perm.salvarPermissoes(marcadas);
    expect(await perm.pode("GERENTE", "relatorios.ver")).toBe(true);
    expect(await perm.pode("OPERADOR", "relatorios.ver")).toBe(false);
  });
});
