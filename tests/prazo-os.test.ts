import { describe, expect, it } from "vitest";
import { atrasada, dataPrevisao, prazoOs, textoPrazo } from "@/lib/os/prazo";

describe("prazo da OS", () => {
  it("conta os dias após a previsão pela data de saída (faturamento)", () => {
    // OS do Gestão Click: previsão só com a data (meia-noite UTC), saída às 19:41 de São Paulo
    const p = prazoOs({ entrada: new Date("2025-11-21T19:05:49Z"), previsao: new Date("2025-11-28T00:00:00Z"), saida: new Date("2026-11-15T22:41:39Z") });
    expect(p).toEqual({ base: "previsao", dias: 352, concluida: true });
    expect(atrasada(p)).toBe(true);
    expect(textoPrazo(p)).toBe("352 dias após a previsão");
    expect(dataPrevisao(new Date("2025-11-28T00:00:00Z"))).toBe("28/11/2025");
  });

  it("previsão do formulário (instante) no mesmo dia da saída fica no prazo", () => {
    const p = prazoOs({ entrada: new Date("2026-11-10T12:00:00Z"), previsao: new Date("2026-11-12T20:00:00Z"), saida: new Date("2026-11-12T23:30:00Z") });
    expect(p.dias).toBe(0);
    expect(textoPrazo(p)).toBe("no prazo");
  });

  it("sem previsão mostra quantos dias levou desde a abertura", () => {
    const p = prazoOs({ entrada: new Date("2026-02-05T13:32:42Z"), previsao: null, saida: new Date("2026-11-15T22:41:39Z") });
    expect(textoPrazo(p)).toBe("concluída em 283 dias (sem previsão)");
    expect(atrasada(p)).toBe(false);
  });

  it("OS aberta conta até hoje", () => {
    const agora = new Date("2026-11-22T15:00:00Z");
    expect(textoPrazo(prazoOs({ entrada: new Date("2026-11-20T12:00:00Z"), previsao: new Date("2026-11-25T00:00:00Z"), saida: null }, agora))).toBe("faltam 3 dias");
    expect(textoPrazo(prazoOs({ entrada: new Date("2026-11-20T12:00:00Z"), previsao: new Date("2026-11-21T00:00:00Z"), saida: null }, agora))).toBe("1 dia após a previsão");
  });
});
