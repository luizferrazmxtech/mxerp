import { prisma } from "@/lib/db";
import { diaSP, moeda } from "@/lib/datas";
import TabelaFaturas from "@/components/TabelaFaturas";
import { Pagina, Aviso, Resumo } from "@/components/ui";
import { processarAgora } from "../acoes";
import Link from "next/link";

export const dynamic = "force-dynamic";

const FILTROS = [["abertas", "Em aberto"], ["vencidas", "Vencidas"], ["pagas", "Pagas"], ["todas", "Todas"]] as const;

export default async function Faturas({ searchParams }: { searchParams: Promise<{ filtro?: string; ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const filtro = sp.filtro ?? "abertas";
  const hoje = diaSP();
  const where = filtro === "abertas" ? { situacao: "ABERTA" as const } : filtro === "vencidas" ? { situacao: "ABERTA" as const, vencimento: { lt: hoje } } : filtro === "pagas" ? { situacao: "PAGA" as const } : {};
  const [faturas, abertas, pagasMes] = await Promise.all([
    prisma.fatura.findMany({ where, include: { cliente: true }, orderBy: [{ vencimento: filtro === "pagas" || filtro === "todas" ? "desc" : "asc" }], take: 300 }),
    prisma.fatura.findMany({ where: { situacao: "ABERTA" }, select: { valor: true, vencimento: true } }),
    prisma.fatura.aggregate({ where: { situacao: "PAGA", pagaEm: { gte: new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)) } }, _sum: { valorPago: true, valor: true } }),
  ]);
  const soma = (xs: { valor: unknown }[]) => xs.reduce((s, f) => s + Number(f.valor), 0);
  return (
    <Pagina titulo="Mensalidades" sub="Geradas sozinhas antes do vencimento, com boleto/Pix do Inter e e-mail ao cliente"
      acoes={<form action={processarAgora}><button className="btn-sec">Processar agora</button></form>}>
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      {sp.erro && <Aviso tipo="erro">{sp.erro}</Aviso>}
      <Resumo itens={[
        { rotulo: "Em aberto", valor: moeda(soma(abertas)), cor: "#d97706" },
        { rotulo: "Vencido", valor: moeda(soma(abertas.filter((f) => f.vencimento < hoje))), cor: "#dc2626" },
        { rotulo: "Recebido no mês", valor: moeda(Number(pagasMes._sum.valorPago ?? pagasMes._sum.valor ?? 0)), cor: "#1f9d55" },
        { rotulo: "Mensalidades listadas", valor: faturas.length },
      ]} />
      <div className="mb-3 flex gap-1">{FILTROS.map(([k, r]) => <Link key={k} href={`/faturas?filtro=${k}`} className={`aba ${filtro === k ? "aba-ativa" : ""}`}>{r}</Link>)}</div>
      <div className="cartao"><TabelaFaturas faturas={faturas} volta={`/faturas?filtro=${filtro}`} /></div>
    </Pagina>
  );
}
