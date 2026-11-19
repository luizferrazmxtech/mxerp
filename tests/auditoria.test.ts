import { describe, expect, it } from "vitest";
import { somarMeses } from "@/lib/financeiro/lancamentos";
import { lerNumero } from "@/lib/itens/tipos";

describe("parcelas mensais", () => {
  it("vencimento no dia 31 cai no último dia dos meses mais curtos, sem pular fevereiro", () => {
    const d = new Date("2027-01-31T00:00:00Z");
    expect([0, 1, 2, 3].map((i) => somarMeses(d, i).toISOString().slice(0, 10))).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
    expect(somarMeses(new Date("2027-11-15T00:00:00Z"), 2).toISOString().slice(0, 10)).toBe("2028-01-15");
  });
});

describe("valores digitados", () => {
  it("aceita vírgula ou ponto como decimal", () => {
    expect(lerNumero("49.90")).toBe(49.9);
    expect(lerNumero("49,90")).toBe(49.9);
    expect(lerNumero("1.234,56")).toBe(1234.56);
  });
});
