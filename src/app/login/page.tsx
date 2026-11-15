import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/atual";
import FormLogin from "./FormLogin";
import PrimeiroAdmin from "./PrimeiroAdmin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

export default async function Login({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  if (await usuarioAtual()) redirect("/");
  const { voltar } = await searchParams;
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      {(await prisma.usuario.count()) === 0 ? <PrimeiroAdmin /> : <FormLogin voltar={voltar ?? "/"} />}
    </div>
  );
}
