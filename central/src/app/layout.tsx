import type { Metadata } from "next";
import "./globals.css";
import { adminAtual } from "@/lib/auth";
import { garantirClienteZero } from "@/lib/clienteZero";
import Shell from "@/components/Shell";
import { sair } from "./login/actions";

export const metadata: Metadata = { title: { default: "Central MXTECH", template: "%s · Central MXTECH" }, icons: { icon: "/marca/logo-claro.svg" } };

export default async function Layout({ children }: { children: React.ReactNode }) {
  const admin = await adminAtual();
  if (admin) await garantirClienteZero().catch(() => {});
  return (
    <html lang="pt-BR">
      <body>
        {!admin ? <main>{children}</main> : <Shell admin={{ nome: admin.nome, email: admin.email }} sair={sair}>{children}</Shell>}
      </body>
    </html>
  );
}
