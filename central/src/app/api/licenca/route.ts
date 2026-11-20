import { prisma } from "@/lib/db";
import { licencaDoCliente } from "@/lib/licenca";

/** O sistema de cada cliente consulta aqui (pela rede interna da VPS) a situação, os limites e a fatura a pagar. */
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token.length < 20) return Response.json({ erro: "sem token" }, { status: 401 });
  const c = await prisma.cliente.findUnique({ where: { licencaToken: token }, select: { id: true } });
  if (!c) return Response.json({ erro: "token desconhecido" }, { status: 401 });
  return Response.json(await licencaDoCliente(c.id));
}
