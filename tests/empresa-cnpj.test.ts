import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { pfxDeTeste } from "./helpers/certificado-teste";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;

const { prisma } = await import("@/lib/db");
const { conferirIeEmpresa } = await import("@/lib/empresa/empresas");
const { lerCertificado } = await import("@/lib/fiscal/certificado");
type Transporte = import("@/lib/fiscal/sefaz").Transporte;

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);
const CNPJ = "07105759000188";

const ret = (cStat: string, cads: [string, string][] = []) =>
  `<E><retConsCad versao="2.00"><infCons><cStat>${cStat}</cStat><xMotivo>M${cStat}</xMotivo><UF>SP</UF>` +
  cads.map(([ie, sit]) => `<infCad><IE>${ie}</IE><CNPJ>${CNPJ}</CNPJ><UF>SP</UF><cSit>${sit}</cSit><xNome>ACAB</xNome></infCad>`).join("") +
  `</infCons></retConsCad></E>`;
const transp = (x: string | Error): Transporte => async () => { if (x instanceof Error) throw x; return x; };

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));
beforeEach(async () => { await prisma.$executeRawUnsafe(`TRUNCATE "Empresa" CASCADE`); });

const criar = (ie: string | null, uf = "SP") => prisma.empresa.create({ data: { razaoSocial: "ACAB LTDA", cnpj: CNPJ, uf, inscricaoEstadual: ie } });

describe("conferência da IE da empresa na SEFAZ ao enviar o certificado", () => {
  it("grava a IE habilitada da SEFAZ quando a cadastrada está vazia ou diferente", async () => {
    const e = await criar(null);
    expect(await conferirIeEmpresa(e.id, { cert, transporte: transp(ret("112", [["111", "0"], ["637271680113", "1"]])) })).toMatch(/atualizada.*637271680113/);
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id: e.id } })).inscricaoEstadual).toBe("637271680113");
    expect(await conferirIeEmpresa(e.id, { cert, transporte: transp(ret("111", [["637271680113", "1"]])) })).toMatch(/conferida/);
  });

  it("falha, 259 ou UF sem serviço não mexem na IE", async () => {
    const e = await criar("123");
    expect(await conferirIeEmpresa(e.id, { cert, transporte: transp(new Error("ECONNRESET")) })).toMatch(/Não deu para conferir.*ECONNRESET/);
    expect(await conferirIeEmpresa(e.id, { cert, transporte: transp(ret("259")) })).toMatch(/não tem inscrição/);
    expect((await prisma.empresa.findUniqueOrThrow({ where: { id: e.id } })).inscricaoEstadual).toBe("123");
    const rj = await prisma.empresa.update({ where: { id: e.id }, data: { uf: "RJ" } });
    expect(await conferirIeEmpresa(rj.id, { cert, transporte: transp(ret("111", [["9", "1"]])) })).toBeNull();
  });
});
