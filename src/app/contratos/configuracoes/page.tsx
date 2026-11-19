import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { configContratos } from "@/lib/contratos/config";
import { configEmailTela } from "@/lib/email/email";
import { Pagina } from "@/components/ui/Pagina";
import { FormConfigContratos, FormEmail } from "@/components/contratos/FormsConfig";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações de contratos" };

export default async function Configuracoes() {
  const [u, c, email, situacoes] = await Promise.all([
    usuarioAtual(), configContratos(), configEmailTela(),
    prisma.situacaoVendaConfig.findMany({ where: { financeiro: true }, orderBy: { ordem: "asc" }, select: { id: true, nome: true } }),
  ]);
  return (
    <Pagina titulo="Configurações" icone="configuracoes" trilha={[{ rotulo: "Contratos", href: "/contratos" }, { rotulo: "Configurações" }]}>
      <FormConfigContratos c={c} situacoes={situacoes} />
      <FormEmail c={email} admin={u?.papel === "ADMIN"} />
    </Pagina>
  );
}
