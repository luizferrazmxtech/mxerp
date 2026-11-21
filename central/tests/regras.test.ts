import { describe, expect, it } from "vitest";
import { situacaoLicenca, REGUA_PADRAO } from "@/lib/regua";
import { competenciasDevidas } from "@/lib/faturas";
import { vencimentoDe } from "@/lib/datas";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const ativo = { situacao: "ATIVO", liberadoAte: null };

describe("régua de bloqueio", () => {
  it("em dia sem atraso, aviso com 5, só leitura com 10, bloqueio com 30", () => {
    const f = [{ vencimento: d("2026-12-10") }];
    expect(situacaoLicenca(ativo, [], d("2026-12-20")).situacao).toBe("EM_DIA");
    expect(situacaoLicenca(ativo, f, d("2026-12-14")).situacao).toBe("EM_DIA");
    expect(situacaoLicenca(ativo, f, d("2026-12-15"))).toEqual({ situacao: "AVISO", diasAtraso: 5 });
    expect(situacaoLicenca(ativo, f, d("2026-12-20")).situacao).toBe("SO_LEITURA");
    expect(situacaoLicenca(ativo, f, d("2027-01-09")).situacao).toBe("BLOQUEADO");
  });
  it("conta pela fatura mais antiga", () => {
    expect(situacaoLicenca(ativo, [{ vencimento: d("2027-01-10") }, { vencimento: d("2026-12-10") }], d("2027-01-12")).diasAtraso).toBe(33);
  });
  it("liberação manual segura em aviso até a data", () => {
    const c = { situacao: "ATIVO", liberadoAte: d("2027-01-15") };
    expect(situacaoLicenca(c, [{ vencimento: d("2026-12-01") }], d("2027-01-14")).situacao).toBe("AVISO");
    expect(situacaoLicenca(c, [{ vencimento: d("2026-12-01") }], d("2027-01-16")).situacao).toBe("BLOQUEADO");
  });
  it("suspenso fica bloqueado", () => {
    expect(situacaoLicenca({ situacao: "SUSPENSO", liberadoAte: null }, [], d("2027-01-01"), REGUA_PADRAO).situacao).toBe("BLOQUEADO");
  });
});

describe("mensalidades devidas", () => {
  it("vencimento em mês curto usa o último dia", () => {
    expect(vencimentoDe("2027-02", 30).toISOString().slice(0, 10)).toBe("2027-02-28");
  });
  it("gera do início da cobrança até a que vence dentro da antecedência", () => {
    const r = competenciasDevidas(d("2026-12-15"), 10, d("2027-01-02"), 10).map((x) => x.competencia);
    // dez/2026 venceria dia 10, antes do início (15/12): não cobra; jan/2027 vence 10/01, dentro de 10 dias
    expect(r).toEqual(["2027-01"]);
    expect(competenciasDevidas(d("2026-12-01"), 10, d("2027-02-05"), 10).map((x) => x.competencia)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
});
