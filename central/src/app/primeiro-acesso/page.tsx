import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Formulario from "../login/Formulario";
import { criarPrimeiro } from "../login/actions";

export const dynamic = "force-dynamic";
export default async function PrimeiroAcesso() {
  if (await prisma.admin.count()) redirect("/login");
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="cartao w-full max-w-sm p-6">
        <h1 className="mb-1 text-[20px] font-semibold">Primeiro acesso</h1>
        <p className="mb-4 text-[13px] text-slate-500">Crie o administrador da Central. Esta tela só aparece uma vez.</p>
        <Formulario acao={criarPrimeiro} primeiro />
      </div>
    </div>
  );
}
