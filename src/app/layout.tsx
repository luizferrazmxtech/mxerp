import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

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
  { href: "/financeiro/dre", rotulo: "DRE" },
  { href: "/fiscal", rotulo: "Notas fiscais" },
  { href: "/estoque/locais", rotulo: "Locais (prateleiras)" },
  { href: "/clientes", rotulo: "Clientes" },
  { href: "/servicos", rotulo: "Serviços" },
  { href: "/migracao", rotulo: "Migração" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-screen">
          <aside className="no-print hidden w-56 shrink-0 bg-slate-900 text-slate-200 md:block">
            <div className="px-5 py-5 text-lg font-bold tracking-tight text-white">
              MX<span className="text-marca">ERP</span>
            </div>
            <nav className="flex flex-col gap-0.5 px-2">
              {menu.map((m) => (
                <Link key={m.href} href={m.href} className="rounded px-3 py-2 text-sm hover:bg-slate-800">
                  {m.rotulo}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
