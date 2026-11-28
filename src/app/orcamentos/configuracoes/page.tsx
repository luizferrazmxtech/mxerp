import { chaveDoc } from "@/lib/sequencia";
import { prisma } from "@/lib/db";
import { configOrcamento, DOCUMENTOS } from "@/lib/orcamentos/config";
import { Pagina } from "@/components/ui/Pagina";
import { FormConfigOrc } from "@/components/orcamentos/FormsAuxOrc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações de orçamentos" };

export default async function Configuracoes() {
  const [c, seq, max] = await Promise.all([
    configOrcamento(),
    prisma.sequencia.findUnique({ where: { chave: await chaveDoc("ORCAMENTO") } }),
    prisma.orcamento.aggregate({ _max: { numero: true } }),
  ]);
  const ultimo = Math.max(seq?.valor ?? 0, max._max.numero ?? 0);
  return (
    <Pagina titulo="Configurações" icone="configuracoes" trilha={[{ rotulo: "Orçamentos", href: "/orcamentos" }, { rotulo: "Configurações" }]}>
      <FormConfigOrc ultimo={ultimo} c={c} grupos={DOCUMENTOS} />
    </Pagina>
  );
}
