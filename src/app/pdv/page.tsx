import Link from "next/link";
import { prisma } from "@/lib/db";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { exigirUsuario } from "@/lib/auth/atual";
import { caixaAberto, resumoCaixa } from "@/lib/pdv/caixa";
import { brl, dataSP, horaSP } from "@/lib/ui/format";
import Icone from "@/components/Icone";
import Pdv from "./Pdv";
import AbrirCaixa from "./AbrirCaixa";
import FecharCaixa from "./FecharCaixa";
import MovimentoCaixa from "./MovimentoCaixa";

export const dynamic = "force-dynamic";
export const metadata = { title: "PDV" };

export default async function PdvPage({ searchParams }: { searchParams: Promise<{ acao?: string }> }) {
  const u = await exigirUsuario();
  const caixa = await caixaAberto(u.id);
  if (!caixa) return <AbrirCaixa />;
  const { acao } = await searchParams;
  await prisma.$transaction((tx) => garantirPadroes(tx));
  const formas = await prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" } });
  const ordem = ["Dinheiro", "PIX", "Cartão de débito", "Cartão de crédito"];
  formas.sort((a, b) => (ordem.indexOf(a.nome) + 1 || 99) - (ordem.indexOf(b.nome) + 1 || 99));
  const resumo = await resumoCaixa(caixa.id);
  const contas = acao === "sangria" || acao === "suprimento"
    ? await prisma.contaBancaria.findMany({ where: { ativa: true, NOT: { nome: "Caixa" } }, orderBy: { nome: "asc" }, select: { id: true, nome: true } })
    : [];
  const movs = resumo.movimentos.length > 0 && (
    <div className="space-y-0.5 border-t pt-1">
      {resumo.movimentos.map((m) => (
        <div key={m.id} className="flex justify-between text-slate-600">
          <span>{m.tipo === "SANGRIA" ? "Sangria" : "Suprimento"} {horaSP(m.createdAt)}{m.motivo ? ` · ${m.motivo}` : ""}</span>
          <span>{m.tipo === "SANGRIA" ? "−" : "+"}{brl(m.valor)}</span>
        </div>
      ))}
    </div>
  );
  return (
    <>
      <Pdv formas={formas.map((f) => ({ id: f.id, nome: f.nome, diasPrazo: f.diasPrazo }))}
        caixa={{ abertoEm: `${dataSP(caixa.abertoEm)} ${horaSP(caixa.abertoEm)}`, vendas: resumo.vendas, total: resumo.total }} />
      {acao === "fechar" && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20">
          <div className="cartao w-full max-w-md shadow-xl">
            <div className="flex items-center border-b px-4 py-3">
              <h3 className="text-[16px]">Fechar o <b>caixa</b></h3>
              <Link href="/pdv" className="ml-auto text-slate-500 hover:text-black" aria-label="Fechar"><Icone nome="fechar" /></Link>
            </div>
            <div className="space-y-1 border-b p-4 text-[13px]">
              <div className="flex justify-between"><span>Abertura ({dataSP(caixa.abertoEm)} {horaSP(caixa.abertoEm)})</span><span>{brl(caixa.valorAbertura)}</span></div>
              {resumo.porForma.map(([f, v]) => <div key={f} className="flex justify-between"><span>{f}</span><span>{brl(v)}</span></div>)}
              <div className="flex justify-between border-t pt-1 font-semibold"><span>{resumo.vendas} venda(s)</span><span>{brl(resumo.total)}</span></div>
              {movs}
              <div className="flex justify-between text-marca-escura"><span>Dinheiro esperado na gaveta</span><span>{brl(resumo.dinheiroEsperado)}</span></div>
            </div>
            <div className="p-4"><FecharCaixa caixaId={caixa.id} esperado={resumo.dinheiroEsperado} /></div>
          </div>
        </div>
      )}
      {(acao === "sangria" || acao === "suprimento") && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-20">
          <div className="cartao w-full max-w-md shadow-xl">
            <div className="flex items-center border-b px-4 py-3">
              <h3 className="text-[16px]"><b>{acao === "sangria" ? "Sangria" : "Suprimento"}</b> do caixa</h3>
              <Link href="/pdv" className="ml-auto text-slate-500 hover:text-black" aria-label="Fechar"><Icone nome="fechar" /></Link>
            </div>
            {movs && <div className="border-b p-4 text-[13px]">{movs}</div>}
            <div className="p-4"><MovimentoCaixa tipo={acao === "sangria" ? "SANGRIA" : "SUPRIMENTO"} contas={contas} disponivel={resumo.dinheiroEsperado} /></div>
          </div>
        </div>
      )}
    </>
  );
}
