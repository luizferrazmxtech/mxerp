import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Formulario from "../login/Formulario";
import { criarPrimeiro } from "../login/actions";
import { CaixaEntrada } from "../login/CaixaEntrada";

export const dynamic = "force-dynamic";
export default async function PrimeiroAcesso() {
  if (await prisma.admin.count()) redirect("/login");
  return (
    <CaixaEntrada titulo="Primeiro acesso" sub="Crie o administrador da Central. Esta tela só aparece uma vez.">
      <Formulario acao={criarPrimeiro} primeiro />
    </CaixaEntrada>
  );
}
