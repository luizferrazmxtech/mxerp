import { prisma } from "@/lib/db";
import { excluirMensagemCompraAcao } from "@/lib/compras/acoes";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Link from "next/link";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modelos de e-mail de compras" };

export default async function Mensagens({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lista = await prisma.modeloMensagem.findMany({ where: { tipo: { in: ["COMPRA", "COTACAO"] }, ...(sp.q ? { assunto: { contains: sp.q, mode: "insensitive" } } : {}) }, orderBy: [{ tipo: "asc" }, { padrao: "desc" }, { assunto: "asc" }] });
  return (
    <Pagina titulo="Modelos de e-mail" icone="email" trilha={[{ rotulo: "Compras", href: "/compras" }, { rotulo: "Modelos de e-mail" }]}>
      <BarraCadastro base="/compras/mensagens" params={sp} adicionar={{ href: "/compras/mensagens/adicionar" }} placeholder="Buscar pelo assunto" avancada={false} />
      <p className="mb-2 text-[12px] text-slate-500">Para um modelo de cotação, <Link href="/compras/mensagens/adicionar?tipo=COTACAO" className="text-marca underline"><Icone nome="mais" size={11} className="inline" /> adicione aqui</Link>.</p>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Assunto</th><th className="w-60">Modelo</th><th className="w-28 text-right">Ações</th></tr></thead>
          <tbody>{lista.map((m) => (
            <tr key={m.id}><td>{m.assunto}{m.padrao && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[11px] text-sky-700">Padrão</span>}</td><td>{m.tipo === "COTACAO" ? "Cotação" : "Compra"}</td>
              <td><AcoesLinha ver={`/compras/mensagens/${m.id}`} editar={`/compras/mensagens/${m.id}`} excluir={<BotaoExcluir acao={excluirMensagemCompraAcao.bind(null, m.id)} pergunta={`Excluir a mensagem ${m.assunto}?`} />} /></td></tr>
          ))}</tbody>
        </table>
        <div className="border-t px-3 py-2.5 text-[12px] text-slate-600"><span className="rounded border px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b> no total</span></div>
      </div>
    </Pagina>
  );
}
