import { describe, expect, it } from "vitest";
import { conferirSenha, hashSenha } from "@/lib/auth/senha";
import { podeAcessar } from "@/lib/auth/permissoes";

describe("login", () => {
  it("senha com scrypt e sal", async () => {
    const a = await hashSenha("minha-senha-1");
    const b = await hashSenha("minha-senha-1");
    expect(a).not.toBe(b);
    expect(await conferirSenha("minha-senha-1", a)).toBe(true);
    expect(await conferirSenha("minha-senha-2", a)).toBe(false);
    await expect(hashSenha("curta")).rejects.toThrow(/8 caracteres/);
  });

  it("permissões por área", () => {
    expect(podeAcessar("ADMIN", "/migracao")).toBe(true);
    expect(podeAcessar("GERENTE", "/migracao")).toBe(false);
    expect(podeAcessar("GERENTE", "/financeiro/dre")).toBe(true);
    expect(podeAcessar("TECNICO", "/financeiro")).toBe(false);
    expect(podeAcessar("TECNICO", "/financeiroX")).toBe(true); // prefixo só casa por segmento
    expect(podeAcessar("TECNICO", "/os/123")).toBe(true);
    expect(podeAcessar("TECNICO", "/pdv")).toBe(false);
    expect(podeAcessar("CAIXA", "/pdv")).toBe(true);
    expect(podeAcessar("CAIXA", "/fiscal/abc")).toBe(true);
    expect(podeAcessar("CAIXA", "/fiscal")).toBe(false);
    expect(podeAcessar("OPERADOR", "/api/notas/1/xml")).toBe(false);
    expect(podeAcessar("OPERADOR", "/usuarios")).toBe(false);
  });
});
