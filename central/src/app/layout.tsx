import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { adminAtual } from "@/lib/auth";
import { sair } from "./login/actions";

export const metadata: Metadata = { title: { default: "Central MXTECH", template: "%s · Central MXTECH" } };

const MENU = [
  { href: "/", rotulo: "Painel" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/faturas", rotulo: "Mensalidades" },
  { href: "/planos", rotulo: "Planos" },
  { href: "/tarefas", rotulo: "Tarefas da VPS" },
  { href: "/configuracoes", rotulo: "Configurações" },
];

export default async function Layout({ children }: { children: React.ReactNode }) {
  const admin = await adminAtual();
  return (
    <html lang="pt-BR">
      <body>
        {!admin ? (
          <main>{children}</main>
        ) : (
          <div className="min-h-screen">
            <header className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-topo px-4 py-2.5 text-white">
              <Link href="/" className="font-semibold"><span className="text-[#3fd1c6]">MXTECH</span> Central</Link>
              <nav className="flex flex-wrap gap-1">
                {MENU.map((m) => <Link key={m.href} href={m.href} className="rounded px-2.5 py-1 text-[14px] text-white/85 hover:bg-white/10 hover:text-white">{m.rotulo}</Link>)}
              </nav>
              <form action={sair} className="ml-auto flex items-center gap-3 text-[13px] text-white/70">
                {admin.nome}
                <button className="rounded border border-white/30 px-2 py-0.5 hover:bg-white/10">Sair</button>
              </form>
            </header>
            <main>{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
