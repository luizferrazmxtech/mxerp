import { redirect } from "next/navigation";
import CaixaAcesso from "@/components/portal/CaixaAcesso";
import { clienteAtual } from "@/lib/portal/atual";
import FormEntrar from "./FormEntrar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Área do Cliente" };

export default async function Entrar({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  if (await clienteAtual()) redirect("/area-cliente");
  const { voltar } = await searchParams;
  return (
    <CaixaAcesso titulo="Entrar" subtitulo="Acompanhe suas ordens de serviço, compras, notas fiscais e boletos.">
      <FormEntrar voltar={voltar ?? "/area-cliente"} />
    </CaixaAcesso>
  );
}
