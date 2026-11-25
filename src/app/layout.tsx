import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { usuarioAtual } from "@/lib/auth/atual";
import AppShell from "@/components/shell/AppShell";
import { menuDoPapel } from "@/components/shell/menu";
import { acoesLiberadas } from "@/lib/auth/permissoesAcao";
import { sair } from "./login/actions";
import { lojasDoUsuario, lojaAtual, nomeLoja } from "@/lib/empresa/atual";
import { trocarLoja } from "./empresas/actions";
import { licencaAtual } from "@/lib/licenca/licenca";
import FaixaLicenca from "@/components/licenca/FaixaLicenca";

export const metadata: Metadata = {
  title: { default: "MXTECH · Gestão", template: "%s · MXTECH" },
  description: "Gestão MXTECH: OS, vendas, estoque, financeiro e notas",
};

const PAPEL: Record<string, string> = { ADMIN: "Administrador", GERENTE: "Gerente", OPERADOR: "Atendente", TECNICO: "Técnico", CAIXA: "Caixa" };
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Área do Cliente: o cliente vê só o portal, mesmo que um funcionário esteja logado no mesmo navegador
  const portal = (await headers()).get("x-mx-portal") === "1";
  const usuario = portal ? null : await usuarioAtual();
  const [empresa, lojas] = usuario ? await Promise.all([lojaAtual(), lojasDoUsuario()]) : [null, []];
  const licenca = usuario ? await licencaAtual() : null;
  const acoes = usuario ? await acoesLiberadas(usuario.papel, ["relatorios.ver"]) : undefined;
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
            menu={menuDoPapel(usuario.papel, acoes)}
            usuario={{ nome: usuario.nome, papel: PAPEL[usuario.papel] ?? usuario.papel }}
            empresa={{ nome: empresa ? nomeLoja(empresa) : "MXTECH", cnpj: empresa ? cnpjFmt(empresa.cnpj) : null }}
            lojas={lojas.map((l) => ({ id: l.id, nome: nomeLoja(l), cnpj: cnpjFmt(l.cnpj), atual: l.id === empresa?.id }))}
            trocarLoja={trocarLoja}
            sair={sair}
          >
            {licenca && <FaixaLicenca l={licenca} />}
            {children}
          </AppShell>
        )}
      </body>
    </html>
  );
}
