import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { usuarioAtual } from "@/lib/auth/atual";
import { podeAcessar } from "@/lib/auth/permissoes";
import { sair } from "./login/actions";

export const metadata: Metadata = {
  title: "MXERP",
  description: "Gestão MXTECH: OS, vendas, estoque, financeiro e notas",
};

const menu = [
  { href: "/", rotulo: "Início" },
  { href: "/os", rotulo: "Ordens de serviço" },
  { href: "/pdv", rotulo: "PDV" },
  { href: "/vendas", rotulo: "Vendas" },
  { href: "/estoque", rotulo: "Estoque" },
  { href: "/financeiro", rotulo: "Financeiro" },
  { href: "/financeiro/conciliacao", rotulo: "Conciliação" },
  { href: "/financeiro/dre", rotulo: "DRE" },
  { href: "/fiscal", rotulo: "Notas fiscais" },
  { href: "/estoque/locais", rotulo: "Locais (prateleiras)" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/servicos", rotulo: "Serviços" },
  { href: "/usuarios", rotulo: "Usuários" },
  { href: "/migracao", rotulo: "Migração" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual();
  return (
    <html lang="pt-BR">
      <body>
        {!usuario ? (
          <main className="p-4">{children}</main>
        ) : (
          <div className="flex min-h-screen">
            <aside className="no-print hidden w-56 shrink-0 flex-col bg-slate-900 text-slate-200 md:flex">
              <div className="px-5 py-5 text-lg font-bold tracking-tight text-white">
                MX<span className="text-marca">ERP</span>
              </div>
              <nav className="flex flex-col gap-0.5 px-2">
                {menu.filter((m) => podeAcessar(usuario.papel, m.href)).map((m) => (
                  <Link key={m.href} href={m.href} className="rounded px-3 py-2 text-sm hover:bg-slate-800">
                    {m.rotulo}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto border-t border-slate-800 px-5 py-4 text-sm">
                <div className="truncate text-white">{usuario.nome}</div>
                <div className="mt-1 flex gap-3 text-slate-400">
                  <Link href="/conta" className="hover:text-white">Minha senha</Link>
                  <form action={sair}><button className="hover:text-white">Sair</button></form>
                </div>
              </div>
            </aside>
            <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
          </div>
        )}
      </body>
    </html>
  );
}
