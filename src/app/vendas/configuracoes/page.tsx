import { prisma } from "@/lib/db";
import { DOCUMENTOS } from "@/lib/orcamentos/config";
import { configVenda } from "@/lib/vendas/config";
import { Pagina } from "@/components/ui/Pagina";
import { FormConfigVenda } from "@/components/vendas/FormsAuxVenda";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações de vendas" };

export default async function Configuracoes() {
  const [c, seq, max, seqDev, maxDev] = await Promise.all([
    configVenda(),
    prisma.sequencia.findUnique({ where: { chave: "VENDA" } }),
    prisma.venda.aggregate({ _max: { numero: true } }),
    prisma.sequencia.findUnique({ where: { chave: "DEVOLUCAO" } }),
    prisma.devolucao.aggregate({ _max: { numero: true } }),
  ]);
  return (
    <Pagina titulo="Configurações" icone="configuracoes" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Configurações" }]}>
      <FormConfigVenda ultimo={Math.max(seq?.valor ?? 0, max._max.numero ?? 0)} ultimaDev={Math.max(seqDev?.valor ?? 0, maxDev._max.numero ?? 0)} c={c} grupos={DOCUMENTOS} />
    </Pagina>
  );
}
