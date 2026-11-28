import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/empresa/atual", () => ({ lojasDoUsuario: async () => [{ id: "mx" }] }));
const { GET } = await import("@/app/api/loja/abrir/route");

describe("/api/loja/abrir", () => {
  it("redireciona com caminho relativo (atrás do proxy req.url é localhost:3000) e troca a empresa", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/loja/abrir?loja=mx&ir=%2Fos%2Fabc"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/os/abc");
    expect(res.cookies.get("mxerp_loja")?.value).toBe("mx");
  });

  it("empresa sem acesso: abre sem trocar; destino externo vira o início", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/api/loja/abrir?loja=outra&ir=%2F%2Fevil.com"));
    expect(res.headers.get("location")).toBe("/");
    expect(res.cookies.get("mxerp_loja")).toBeUndefined();
  });
});
