import { redirect } from "next/navigation";
import { usuarioAtual } from "@/lib/auth/atual";
import FormLogin from "./FormLogin";
import PrimeiroAdmin from "./PrimeiroAdmin";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entrar" };

const DESTAQUES = [
  "Ordens de serviço com reserva de peças",
  "Vendas, PDV e estoque por local",
  "Financeiro, conciliação e notas fiscais",
];

/** Tela de entrada: painel da marca à esquerda (some no celular) e o formulário à direita. */
export default async function Login({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  if (await usuarioAtual()) redirect("/");
  const { voltar } = await searchParams;
  const primeiro = (await prisma.usuario.count()) === 0;
  return (
    <div className="flex min-h-screen bg-fundo">
      <aside className="relative hidden w-[44%] max-w-[620px] flex-col justify-between overflow-hidden bg-topo p-10 text-white lg:flex">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rotate-12 rounded-[64px] border-[28px] border-marca/25" />
        <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 -rotate-12 rounded-[56px] border-[24px] border-white/5" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-escuro.svg" alt="MXTECH" className="relative h-28 w-auto self-start" />
        <div className="relative">
          <h1 className="text-[32px] font-light leading-tight">Gestão completa da <b className="font-semibold text-marca">sua assistência</b></h1>
          <ul className="mt-6 space-y-3 text-[15px] text-slate-300">
            {DESTAQUES.map((d) => (
              <li key={d} className="flex items-center gap-3"><span className="h-2 w-2 rotate-45 rounded-[2px] bg-marca" />{d}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-[12px] text-slate-500">© {new Date().getFullYear()} MXTECH · qualified assistance</p>
      </aside>

      <section className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-claro.svg" alt="MXTECH" className="mb-6 h-20 w-auto lg:hidden" />
        <div className="w-full max-w-sm">
          {primeiro ? <PrimeiroAdmin /> : <FormLogin voltar={voltar ?? "/"} />}
        </div>
        <p className="mt-8 text-[12px] text-slate-400 lg:hidden">© {new Date().getFullYear()} MXTECH</p>
      </section>
    </div>
  );
}
