import { NextResponse } from "next/server";
import { exigirUsuario } from "@/lib/auth/atual";
import { conectarML } from "@/lib/marketplaces/mercadolivre";

/**
 * Volta da autorização do Mercado Livre (quando a URL de redirecionamento do aplicativo aponta para o próprio ERP).
 * Se o ERP ainda não tem endereço público, a pessoa cola o endereço final na tela de configuração.
 */
export async function GET(req: Request) {
  await exigirUsuario(["ADMIN"]);
  const url = new URL(req.url);
  const tela = new URL("/marketplaces/mercado-livre", url);
  try {
    const c = await conectarML(url.toString());
    tela.searchParams.set("ok", `Conta ${c.contaNome} conectada`);
  } catch (e) {
    tela.searchParams.set("erro", e instanceof Error ? e.message : String(e));
  }
  return NextResponse.redirect(tela);
}
