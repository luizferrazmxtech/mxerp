import { autorizadoCron } from "@/lib/auth";
import { processar } from "@/lib/faturas";

/** Chamado de hora em hora pelo agendador da VPS: baixa pagos, gera faturas, emite boletos, manda e-mails. */
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  if (!autorizadoCron(req)) return Response.json({ erro: "não autorizado" }, { status: 401 });
  return Response.json(await processar());
}
