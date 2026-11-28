import { chaveDoc } from "@/lib/sequencia";
import { prisma } from "@/lib/db";
import { DOCUMENTOS } from "@/lib/orcamentos/config";
import { configOs } from "@/lib/os/config";
import { Pagina } from "@/components/ui/Pagina";
import FormConfigOs from "@/components/os/FormConfigOs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Configurações de OS" };

const GRUPOS = [DOCUMENTOS[0], DOCUMENTOS[1], { grupo: "Atividades da OS", itens: [["atividades", "Atividades da OS"]] as [string, string][] }, DOCUMENTOS[2]];

export default async function Configuracoes() {
  const [c, seq, max] = await Promise.all([configOs(), prisma.sequencia.findUnique({ where: { chave: await chaveDoc("OS") } }), prisma.ordemServico.aggregate({ _max: { numero: true } })]);
  return (
    <Pagina titulo="Configurações" icone="configuracoes" trilha={[{ rotulo: "Ordens de serviços", href: "/os" }, { rotulo: "Configurações" }]}>
      <FormConfigOs ultimo={Math.max(seq?.valor ?? 0, max._max.numero ?? 0)} c={c} grupos={GRUPOS} />
    </Pagina>
  );
}
