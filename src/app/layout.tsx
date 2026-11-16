import type { Metadata } from "next";
import "./globals.css";
import { usuarioAtual } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import AppShell from "@/components/shell/AppShell";
import { menuDoPapel } from "@/components/shell/menu";
import { sair } from "./login/actions";

export const metadata: Metadata = {
  title: { default: "MXTECH · Gestão", template: "%s · MXTECH" },
  description: "Gestão MXTECH: OS, vendas, estoque, financeiro e notas",
};

const PAPEL: Record<string, string> = { ADMIN: "Administrador", GERENTE: "Gerente", OPERADOR: "Atendente", TECNICO: "Técnico", CAIXA: "Caixa" };
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioAtual();
  const empresa = usuario ? await prisma.empresa.findFirst({ select: { razaoSocial: true, nomeFantasia: true, cnpj: true } }) : null;
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@300;400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {!usuario ? (
          <main>{children}</main>
        ) : (
          <AppShell
            menu={menuDoPapel(usuario.papel)}
            usuario={{ nome: usuario.nome, papel: PAPEL[usuario.papel] ?? usuario.papel }}
            empresa={{ nome: empresa?.nomeFantasia || empresa?.razaoSocial || "MXTECH", cnpj: empresa ? cnpjFmt(empresa.cnpj) : null }}
            sair={sair}
          >
            {children}
          </AppShell>
        )}
      </body>
    </html>
  );
}
