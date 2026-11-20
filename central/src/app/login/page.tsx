import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Formulario from "./Formulario";
import { entrar } from "./actions";

export const dynamic = "force-dynamic";
export default async function Login() {
  if (!(await prisma.admin.count())) redirect("/primeiro-acesso");
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="cartao w-full max-w-sm p-6">
        <h1 className="mb-1 text-[20px] font-semibold"><span className="text-marca">MXTECH</span> Central</h1>
        <p className="mb-4 text-[13px] text-slate-500">Clientes, mensalidades e backups da revenda</p>
        <Formulario acao={entrar} />
      </div>
    </div>
  );
}
