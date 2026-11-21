import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-com-mais-de-16";

const { prisma } = await import("@/lib/db");
const lic = await import("@/lib/licenca/licenca");
type Licenca = import("@/lib/licenca/licenca").Licenca;

const base: Licenca = { situacao: "EM_DIA", diasAtraso: 0, mensagem: null, maxEmpresas: 1, maxUsuarios: 2, plano: "Essencial", fatura: null, verificadoEm: "" };
const responde = (l: Partial<Licenca> | "fora") => (async () => (l === "fora" ? new Response("x", { status: 503 }) : Response.json({ ...base, ...l }))) as unknown as typeof fetch;

beforeAll(() => {
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" });
});

beforeEach(async () => {
  delete process.env.CENTRAL_URL; delete process.env.LICENCA_TOKEN;
  lic.limparCacheLicenca();
  await prisma.configuracao.deleteMany({ where: { chave: "licenca" } });
});

const ligar = () => { process.env.CENTRAL_URL = "http://central:3000"; process.env.LICENCA_TOKEN = "token-de-teste-1234567890"; };

describe("licença da revenda", () => {
  it("sem Central configurada o sistema é livre", async () => {
    expect(await lic.licencaAtual()).toBeNull();
    await expect(lic.conferirLimiteEmpresas()).resolves.toBeUndefined();
  });

  it("guarda a última resposta e usa quando a Central cai", async () => {
    ligar();
    expect((await lic.licencaAtual({ forcar: true, fetch: responde({ situacao: "AVISO", mensagem: "atraso" }) }))?.situacao).toBe("AVISO");
    expect((await lic.licencaAtual({ forcar: true, fetch: responde("fora") }))?.situacao).toBe("AVISO");
  });

  it("limite de CNPJs e de usuários do plano", async () => {
    ligar();
    await lic.licencaAtual({ forcar: true, fetch: responde({ maxEmpresas: 0, maxUsuarios: 0 }) });
    await expect(lic.conferirLimiteEmpresas()).rejects.toThrow(/permite 0 CNPJ/);
    await expect(lic.conferirLimiteUsuarios()).rejects.toThrow(/permite 0 usuário/);
    await lic.licencaAtual({ forcar: true, fetch: responde({ maxEmpresas: 999, maxUsuarios: 999 }) });
    await expect(lic.conferirLimiteEmpresas()).resolves.toBeUndefined();
  });

  it("só leitura impede gravar, mas deixa consultar e entrar", async () => {
    ligar();
    await lic.licencaAtual({ forcar: true, fetch: responde({ situacao: "SO_LEITURA", mensagem: "Mensalidade em aberto há 12 dia(s)" }) });
    await expect(prisma.unidade.create({ data: { sigla: "ZZT", nome: "teste" } })).rejects.toThrow(/só consulta/);
    await expect(prisma.unidade.count()).resolves.toBeTypeOf("number");
    await expect(prisma.configuracao.upsert({ where: { chave: "teste-licenca" }, create: { chave: "teste-licenca", valor: 1 }, update: { valor: 1 } })).resolves.toBeTruthy();
    await prisma.configuracao.delete({ where: { chave: "teste-licenca" } });
    await lic.licencaAtual({ forcar: true, fetch: responde({ situacao: "EM_DIA" }) });
    const u = await prisma.unidade.create({ data: { sigla: "ZZT", nome: "teste" } });
    await prisma.unidade.delete({ where: { id: u.id } });
  });
});
