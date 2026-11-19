import { prisma } from "@/lib/db";
import { diaSP } from "@/lib/datas";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { opcoesConta } from "@/lib/financeiro/opcoes";
import { Pagina } from "@/components/ui/Pagina";
import FormConta from "@/components/financeiro/FormConta";
import { adicionarContaAcao } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar conta" };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Adicionar conta a pagar/receber. Com ?copia=id, abre preenchida com os dados de outra conta (Duplicar). */
export default async function AdicionarConta({ searchParams }: { searchParams: Promise<{ tipo?: string; copia?: string }> }) {
  const sp = await searchParams;
  const copia = sp.copia ? await prisma.lancamento.findUnique({ where: { id: sp.copia }, include: { pessoa: { select: { id: true, nome: true } } } }) : null;
  const tipo = (copia?.tipo ?? sp.tipo) === "PAGAR" ? "PAGAR" : "RECEBER";
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const op = await opcoesConta(tipo);
  const titulo = tipo === "PAGAR" ? "Contas a pagar" : "Contas a receber";
  return (
    <Pagina titulo={titulo} icone={tipo === "PAGAR" ? "pagar" : "receber"} trilha={[{ rotulo: titulo, href: `/financeiro?tipo=${tipo}` }, { rotulo: copia ? "Duplicar" : "Adicionar" }]}>
      <FormConta acao={adicionarContaAcao} tipo={tipo} novo voltar={`/financeiro?tipo=${tipo}`} {...op}
        valores={copia ? {
          descricao: copia.descricao.replace(/\s*\(\d+\/\d+\)$/, ""), valor: Number(copia.valor).toFixed(2).replace(".", ","), vencimento: iso(diaSP()),
          categoriaId: copia.categoriaId, pessoa: copia.pessoa, formaPagamentoId: copia.formaPagamentoId, contaBancariaId: copia.contaBancariaId,
          centroCustoId: copia.centroCustoId, observacao: copia.observacao,
        } : { vencimento: iso(diaSP()) }} />
    </Pagina>
  );
}
