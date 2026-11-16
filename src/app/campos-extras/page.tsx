import Link from "next/link";
import { prisma } from "@/lib/db";
import { excluirCampoExtraAcao } from "@/lib/cadastros/auxiliares";
import { Pagina } from "@/components/ui/Pagina";
import BarraCadastro, { AcoesLinha } from "@/components/ui/BarraCadastro";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Campos extras" };

const ROT: Record<string, string> = { TEXTO: "Texto", NUMEROS: "Números", DATA: "Data", CPF: "CPF", CNPJ: "CNPJ", SELECAO_UNICA: "Seleção única", MULTIPLA_SELECAO: "Múltipla seleção" };

export default async function CamposExtras({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ent = sp.entidade === "PRODUTO" ? "PRODUTO" : "CLIENTE";
  const prod = ent === "PRODUTO";
  const base = prod ? "/campos-extras?entidade=PRODUTO" : "/campos-extras";
  const novo = prod ? "/campos-extras/adicionar?entidade=PRODUTO" : "/campos-extras/adicionar";
  const lista = await prisma.campoExtra.findMany({ where: { entidade: ent, ...(sp.q ? { nome: { contains: sp.q, mode: "insensitive" } } : {}) }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] });
  const total = await prisma.campoExtra.count({ where: { entidade: ent } });
  return (
    <Pagina titulo={prod ? "Campos extras de produtos" : "Campos extras de clientes"} icone="ajustes" trilha={[{ rotulo: "Campos extras", href: base }, { rotulo: "Listar" }]}>
      {total === 0 ? (
        <div className="cartao flex flex-col items-center px-4 py-12 text-center">
          <span className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icone nome="ajustes" size={30} /></span>
          <h2 className="text-[20px] font-semibold">Nenhum campo extra cadastrado</h2>
          <p className="mt-1 max-w-lg text-[13px] text-slate-500">{prod ? "Crie campos próprios para produtos e serviços, como Marca, Modelo ou Voltagem, e use-os para filtrar a lista de produtos." : "Crie campos próprios para o cadastro de clientes, como \"Como nos conheceu\" ou \"Segmento\", e use-os para filtrar e organizar seus clientes."}</p>
          <Link href={novo} className="btn mt-4"><Icone nome="mais" size={15} /> Adicionar campo extra</Link>
          <div className="mt-8 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
            {[["editar", "Formulário", "O campo aparece no cadastro do cliente, com máscara e validação conforme o tipo."], ["filtro", "Busca avançada", "Cada campo extra vira um filtro na busca avançada de clientes."], ["planilha", "Relatórios", "Os valores acompanham o cliente na visualização e nas exportações."]].map(([i, t, d]) => (
              <div key={t} className="rounded-md border border-slate-200 p-4 text-left"><Icone nome={i} size={18} className="mb-1 text-marca" /><div className="font-semibold">{t}</div><p className="text-[12px] text-slate-500">{d}</p></div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <BarraCadastro base="/campos-extras" params={sp} adicionar={{ href: novo }} placeholder="Buscar" avancada={false} />
          <div className="cartao overflow-x-auto">
            <table className="tabela">
              <thead><tr><th>Nome</th><th className="w-40">Tipo</th><th className="w-28">Obrigatório</th><th className="w-28 text-right">Ações</th></tr></thead>
              <tbody>{lista.map((c) => (
                <tr key={c.id}><td>{c.nome}</td><td>{ROT[c.tipo]}</td><td>{c.obrigatorio ? "Sim" : "Não"}</td>
                  <td><AcoesLinha ver={`/campos-extras/${c.id}`} editar={`/campos-extras/${c.id}`} excluir={<BotaoExcluir acao={excluirCampoExtraAcao.bind(null, c.id)} pergunta={`Excluir o campo ${c.nome}?`} />} /></td></tr>
              ))}</tbody>
            </table>
            <div className="border-t px-3 py-2.5 text-[12px] text-slate-600"><span className="rounded border px-2 py-1">Registros <span className="mx-1 text-slate-300">|</span> <b>{lista.length}</b> no total</span></div>
          </div>
        </>
      )}
    </Pagina>
  );
}
