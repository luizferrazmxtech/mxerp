import Link from "next/link";
import { prisma } from "@/lib/db";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { exigirUsuario } from "@/lib/auth/atual";
import { caixaAberto, resumoCaixa } from "@/lib/pdv/caixa";
import { pode } from "@/lib/auth/permissoesAcao";
import { brl, dataSP, horaSP } from "@/lib/ui/format";
import Icone from "@/components/Icone";
import Pdv from "./Pdv";
import { pixPagSeguroAtivo } from "@/lib/pagseguro/pagseguro";
import { pixInterAtivo } from "@/lib/financeiro/pixInter";
import AbrirCaixa from "./AbrirCaixa";
import FecharCaixa from "./FecharCaixa";
import MovimentoCaixa from "./MovimentoCaixa";

export const dynamic = "force-dynamic";
export const metadata = { title: "PDV" };

export default async function PdvPage({ searchParams }: { searchParams: Promise<{ acao?: string; voltar?: string }> }) {
  const u = await exigirUsuario();
  const caixa = await caixaAberto(u.id);
  if (!caixa) return <AbrirCaixa />;
  const { acao, voltar } = await searchParams;
  // sangria/reforço/fechar abertos pela lista de vendas balcão voltam para lá
  const volta = voltar?.startsWith("/vendas/") ? voltar : undefined;
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const formas = await prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } });
  const ordem = ["Dinheiro", "PIX", "PIX (PagSeguro)", "Cartão de débito", "Cartão de débito (PagSeguro)", "Cartão de crédito", "Cartão de crédito (PagSeguro)"];
  formas.sort((a, b) => (ordem.indexOf(a.nome) + 1 || 99) - (ordem.indexOf(b.nome) + 1 || 99));
  const resumo = await resumoCaixa(caixa.id);
  const pixAtivo = await pixPagSeguroAtivo();
  const pixInter = !!(await pixInterAtivo());
  const contas = acao === "sangria" || acao === "suprimento" || acao === "reforco"
    ? await prisma.contaBancaria.findMany({ where: { ativa: true, NOT: { nome: "Caixa" } }, orderBy: { nome: "asc" }, select: { id: true, nome: true } })
    : [];
  const movs = resumo.movimentos.length > 0 && (
    <div className="space-y-0.5 border-t pt-1">
      {resumo.movimentos.map((m) => (
        <div key={m.id} className="flex justify-between text-slate-600">
          <span>{m.tipo === "SANGRIA" ? "Sangria" : "Reforço"} {horaSP(m.createdAt)}{m.motivo ? ` · ${m.motivo}` : ""}</span>
          <span>{m.tipo === "SANGRIA" ? "−" : "+"}{brl(m.valor)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <Pdv formas={formas.map((f) => ({ id: f.id, nome: f.nome, diasPrazo: f.diasPrazo, pix: pixAtivo && f.pagseguro && f.tPag === "17", pixInter: pixInter && !f.pagseguro && f.tPag === "17", tPag: f.tPag, taxa: Number(f.taxa), taxas: f.taxas }))} podeDesconto={await pode(u.papel, "pdv.desconto")} podeSangria={await pode(u.papel, "pdv.sangria")} podeCancelar={await pode(u.papel, "pdv.cancelar")}
        caixa={{ numero: caixa.numero, operador: (await prisma.usuario.findUnique({ where: { id: caixa.usuarioId }, select: { nome: true } }))?.nome ?? "", abertoEm: `${dataSP(caixa.abertoEm)} ${horaSP(caixa.abertoEm)}`, vendas: resumo.vendas, total: resumo.total }} />
      {acao === "fechar" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-10 sm:p-4 sm:pt-20">
          <div className="cartao w-full max-w-md shadow-xl">
            <div className="flex items-center border-b px-4 py-3">
              <h3 className="text-[16px]">Fechar o <b>caixa</b></h3>
              <Link href={volta ?? "/pdv"} className="ml-auto text-slate-500 hover:text-black" aria-label="Fechar"><Icone nome="fechar" /></Link>
            </div>
            <div className="space-y-1 border-b p-4 text-[13px]">
              <div className="flex justify-between"><span>Caixa nº</span><span>{caixa.numero ?? "—"}</span></div>
              <div className="flex justify-between"><span>Abertura ({dataSP(caixa.abertoEm)} {horaSP(caixa.abertoEm)})</span><span>{brl(caixa.valorAbertura)}</span></div>
              {resumo.porForma.map(([f, v]) => <div key={f} className="flex justify-between"><span>{f}</span><span>{brl(v)}</span></div>)}
              <div className="flex justify-between border-t pt-1 font-semibold"><span>{resumo.vendas} venda(s)</span><span>{brl(resumo.total)}</span></div>
              {movs}
              <div className="flex justify-between text-marca-escura"><span>Dinheiro esperado na gaveta</span><span>{brl(resumo.dinheiroEsperado)}</span></div>
            </div>
            <div className="p-4"><FecharCaixa caixaId={caixa.id} linhas={resumo.esperadoPorForma.map(({ forma, esperado }) => ({ forma, esperado }))} /></div>
          </div>
        </div>
      )}
      {(acao === "sangria" || acao === "suprimento" || acao === "reforco") && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-3 pt-10 sm:p-4 sm:pt-20">
          <div className="cartao w-full max-w-md shadow-xl">
            <div className="flex items-center border-b px-4 py-3">
              <h3 className="text-[16px]"><b>{acao === "sangria" ? "Sangria" : "Reforço"}</b> do caixa</h3>
              <Link href={volta ?? "/pdv"} className="ml-auto text-slate-500 hover:text-black" aria-label="Fechar"><Icone nome="fechar" /></Link>
            </div>
            {movs && <div className="border-b p-4 text-[13px]">{movs}</div>}
            <div className="p-4"><MovimentoCaixa tipo={acao === "sangria" ? "SANGRIA" : "SUPRIMENTO"} contas={contas} disponivel={resumo.dinheiroEsperado} voltar={volta} /></div>
          </div>
        </div>
      )}
    </>
  );
}
