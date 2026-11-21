import { prisma } from "@/lib/db";
import { diaSP, moeda } from "@/lib/datas";
import TabelaFaturas from "@/components/TabelaFaturas";
import { Pagina, Aviso, Resumo, Abas, Lista } from "@/components/ui";
import Icone from "@/components/Icone";
import { processarAgora } from "../acoes";

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
  const vencidas = abertas.filter((f) => f.vencimento < hoje);
  const recebido = Number(pagasMes._sum.valorPago ?? pagasMes._sum.valor ?? 0);
  return (
    <Pagina titulo="Mensalidades" icone="mensalidades" trilha={[{ rotulo: "Mensalidades" }]}
      sub="Geradas sozinhas antes do vencimento, com boleto e Pix do Inter e e-mail ao cliente"
      acoes={<form action={processarAgora}><button className="btn-sec"><Icone nome="atualizar" size={15} /> Processar agora</button></form>}>
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      {sp.erro && <Aviso tipo="erro">{sp.erro}</Aviso>}
      <Resumo cartoes={[
        { rotulo: "Em aberto", valor: moeda(soma(abertas)), icone: "total", cor: "tinta", legenda: `${abertas.length} mensalidade(s)`, href: "/faturas?filtro=abertas", ativo: filtro === "abertas" },
        { rotulo: "Vencidas", valor: moeda(soma(vencidas)), icone: "atrasado", cor: "vermelho", legenda: `${vencidas.length} mensalidade(s)`, pct: soma(abertas) ? (soma(vencidas) / soma(abertas)) * 100 : 0, href: "/faturas?filtro=vencidas", ativo: filtro === "vencidas" },
        { rotulo: "A vencer", valor: moeda(soma(abertas) - soma(vencidas)), icone: "hoje", cor: "amarelo", legenda: `${abertas.length - vencidas.length} mensalidade(s)` },
        { rotulo: "Recebido no mês", valor: moeda(recebido), icone: "ok", cor: "verde", href: "/faturas?filtro=pagas", ativo: filtro === "pagas" },
      ]} />
      <Abas atual={filtro} itens={FILTROS.map(([k, r]) => ({ chave: k, rotulo: r, href: `/faturas?filtro=${k}` }))} />
      <Lista total={faturas.length}><TabelaFaturas faturas={faturas} volta={`/faturas?filtro=${filtro}`} /></Lista>
    </Pagina>
  );
}
