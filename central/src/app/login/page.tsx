import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Formulario from "./Formulario";
import { entrar } from "./actions";
import { CaixaEntrada } from "./CaixaEntrada";

export const dynamic = "force-dynamic";
export default async function Login() {
  if (!(await prisma.admin.count())) redirect("/primeiro-acesso");
  return (
    <CaixaEntrada titulo="Central de revenda" sub="Clientes, mensalidades e backups do MXERP">
      <Formulario acao={entrar} />
    </CaixaEntrada>
  );
}
