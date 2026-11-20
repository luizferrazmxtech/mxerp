import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { cancelarInventarioAcao, concluirInventarioAcao } from "@/lib/compras/acoes";
import { brl } from "@/lib/ui/format";
import { Pagina } from "@/components/ui/Pagina";
import BotaoAcao from "@/components/ui/BotaoAcao";
import Icone from "@/components/Icone";
import { ContagemInventario, LeitorInventario } from "@/components/estoque/FormsEstoque";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventário" };

const SIT: Record<string, [string, string]> = {
  CONTANDO: ["Em contagem", "border-orange-300 bg-orange-50 text-orange-700"],
  CONCLUIDO: ["Concluído", "border-emerald-300 bg-emerald-50 text-emerald-700"],
  CANCELADO: ["Cancelado", "border-slate-300 bg-slate-50 text-slate-600"],
};
const ESCOPO: Record<string, string> = { TODOS: "Todos com controle de estoque", GRUPOS: "De grupos", FORNECEDORES: "De fornecedores", PRODUTOS: "Produtos escolhidos" };

export default async function VerInventario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await prisma.inventario.findUnique({
    where: { id },
    include: { itens: { include: { produto: { select: { codigo: true, nome: true, unidade: true } } }, orderBy: { produto: { nome: "asc" } } } },
  });
  if (!inv) notFound();
  const ajustes = await prisma.ajusteEstoque.findMany({ where: { inventarioId: id }, orderBy: { numero: "asc" }, select: { id: true, numero: true, tipo: true, total: true } });
  const aberto = inv.situacao === "CONTANDO";
  const contados = inv.itens.filter((i) => i.contado != null);
  const divergentes = contados.filter((i) => Number(i.contado) !== Number(i.saldoInicial));
  const [rotulo, corSit] = SIT[inv.situacao] ?? SIT.CONTANDO;
  const cega = inv.contagemCega && aberto;
  return (
    <Pagina voltar="/estoque/inventarios" titulo="Inventário" trilha={[{ rotulo: "Inventários", href: "/estoque/inventarios" }, { rotulo: `Nº ${inv.numero}` }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="inventario" size={18} /> Inventário #{inv.numero} · {inv.descricao} <span className={`pilula ${corSit}`}>{rotulo}</span></h2>
          <p className="text-[12px] text-slate-500">Data {inv.data.toLocaleDateString("pt-BR", { timeZone: "UTC" })} · responsável {inv.responsavelNome.toUpperCase()}{inv.motivo ? ` · ${inv.motivo}` : ""}</p>
        </div>
        {aberto && (
          <div className="ml-auto flex gap-2">
            <BotaoAcao className="btn-sec" icone="fechar" acao={cancelarInventarioAcao.bind(null, id)} confirmar="Cancelar este inventário? Nada muda no estoque.">Cancelar inventário</BotaoAcao>
            <BotaoAcao className="btn" icone="ok" acao={concluirInventarioAcao.bind(null, id)} confirmar={`Concluir o inventário? ${contados.length} produto(s) contado(s) terão o saldo acertado com ajustes de estoque. Os não contados ficam como estão.`}>Concluir inventário</BotaoAcao>
          </div>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-3">
          <div className="cartao p-4 text-[13px]">
            <div className="text-slate-500">Contados</div>
            <div className="mb-2 text-[26px] font-semibold text-marca">{contados.length} <span className="text-[14px] text-slate-500">de {inv.itens.length}</span></div>
            <dl className="space-y-1.5 border-t pt-2">
              <div className="flex"><span className="text-slate-500">Produtos</span><b className="ml-auto text-right">{ESCOPO[inv.escopo]}</b></div>
              {!cega && <div className="flex"><span className="text-slate-500">Com diferença</span><b className="ml-auto">{divergentes.length}</b></div>}
              <div className="flex"><span className="text-slate-500">Contagem cega</span><b className="ml-auto">{inv.contagemCega ? "Sim" : "Não"}</b></div>
              <div className="flex"><span className="text-slate-500">Somar leituras repetidas</span><b className="ml-auto">{inv.somarLeituras ? "Sim" : "Não"}</b></div>
              <div className="flex"><span className="text-slate-500">Considerar movimento</span><b className="ml-auto">{inv.considerarMovimento ? "Sim" : "Não"}</b></div>
              {inv.concluidoEm && <div className="flex"><span className="text-slate-500">Concluído em</span><b className="ml-auto">{inv.concluidoEm.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</b></div>}
            </dl>
          </div>
          {ajustes.length > 0 && (
            <div className="cartao p-4 text-[13px]">
              <b>Ajustes gerados</b>
              {ajustes.map((a) => <Link key={a.id} href={`/estoque/ajustes/${a.id}`} className="mt-1 flex text-marca hover:underline">#{a.numero} · {a.tipo === "SAIDA" ? "Saída" : "Entrada"}<span className="ml-auto">{brl(a.total)}</span></Link>)}
            </div>
          )}
        </aside>
        <section className="space-y-3">
          {aberto && <div className="cartao p-4"><b className="mb-2 block text-[14px]"><Icone nome="leitor" size={15} className="mr-1 inline" />Contagem por leitor</b><LeitorInventario id={id} /></div>}
          <div className="cartao">
            {aberto ? (
              <ContagemInventario id={id} cega={cega} itens={inv.itens.map((i) => ({ id: i.id, codigo: i.produto.codigo, nome: i.produto.nome, unidade: i.produto.unidade, saldo: Number(i.saldoInicial), contado: i.contado == null ? null : Number(i.contado) }))} />
            ) : (
              <div className="max-h-[70vh] overflow-auto">
                <table className="tabela">
                  <thead><tr><th className="w-32">Código</th><th>Produto</th><th className="w-28 text-right">Saldo no início</th><th className="w-28 text-right">Contado</th><th className="w-28 text-right">Diferença</th></tr></thead>
                  <tbody>{inv.itens.map((i) => {
                    const dif = i.contado == null ? null : Number(i.contado) - Number(i.saldoInicial);
                    return <tr key={i.id}><td className="font-mono text-[12px]">{i.produto.codigo}</td><td>{i.produto.nome}</td><td className="text-right">{Number(i.saldoInicial).toLocaleString("pt-BR")}</td>
                      <td className="text-right">{i.contado == null ? "—" : Number(i.contado).toLocaleString("pt-BR")}</td>
                      <td className={`text-right ${dif == null ? "text-slate-400" : dif < 0 ? "text-red-600" : dif > 0 ? "text-emerald-700" : ""}`}>{dif == null ? "—" : (dif > 0 ? "+" : "") + dif.toLocaleString("pt-BR")}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </Pagina>
  );
}
