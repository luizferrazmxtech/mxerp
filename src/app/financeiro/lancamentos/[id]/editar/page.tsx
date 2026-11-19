import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { opcoesConta } from "@/lib/financeiro/opcoes";
import { contaAvulsa } from "@/lib/financeiro/lista";
import { Pagina } from "@/components/ui/Pagina";
import FormConta from "@/components/financeiro/FormConta";
import { editarContaAcao } from "../../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Editar conta" };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default async function EditarConta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const l = await prisma.lancamento.findUnique({ where: { id }, include: { pessoa: { select: { id: true, nome: true } } } });
  if (!l) notFound();
  const titulo = l.tipo === "PAGAR" ? "Contas a pagar" : "Contas a receber";
  const voltar = `/financeiro/lancamentos/${l.id}`;
  if (l.pagoEm) {
    return (
      <Pagina titulo={titulo} icone={l.tipo === "PAGAR" ? "pagar" : "receber"} trilha={[{ rotulo: titulo, href: `/financeiro?tipo=${l.tipo}` }, { rotulo: "Editar" }]}>
        <p className="cartao p-4 text-[14px]">Esta conta já foi baixada. Estorne a baixa antes de editar. <Link href={voltar} className="sublinhado">Voltar</Link></p>
      </Pagina>
    );
  }
  const op = await opcoesConta(l.tipo);
  return (
    <Pagina titulo={titulo} icone={l.tipo === "PAGAR" ? "pagar" : "receber"} trilha={[{ rotulo: titulo, href: `/financeiro?tipo=${l.tipo}` }, { rotulo: "Editar" }]}>
      <FormConta acao={editarContaAcao} tipo={l.tipo} novo={false} travado={!contaAvulsa(l)} voltar={voltar} {...op}
        valores={{
          id: l.id, descricao: l.descricao, valor: Number(l.valor).toFixed(2).replace(".", ","), vencimento: iso(l.vencimento), competencia: iso(l.competencia),
          categoriaId: l.categoriaId, pessoa: l.pessoa, formaPagamentoId: l.formaPagamentoId, contaBancariaId: l.contaBancariaId,
          centroCustoId: l.centroCustoId, observacao: l.observacao,
        }} />
    </Pagina>
  );
}
