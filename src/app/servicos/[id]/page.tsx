import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { excluirServicoAcao } from "@/lib/itens/acoes";
import { brl, dataSP, horaSP, num2 } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import Suspenso from "@/components/ui/Suspenso";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar serviço" };

const ABAS = [
  { chave: "valores", rotulo: "Valores", icone: "valor" }, { chave: "fiscal", rotulo: "Fiscal", icone: "fiscal" },
  { chave: "detalhes", rotulo: "Detalhes", icone: "detalhes" }, { chave: "lojas", rotulo: "Lojas", icone: "lojas" },
];
const pct = (v: unknown) => (v == null ? "—" : `${num2(v as number)}%`);

function Selo({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return <div className={`flex items-center gap-1.5 text-[12px] ${ok ? "text-emerald-700" : "text-slate-400 line-through"}`}><Icone nome={ok ? "ok" : "fechar"} size={13} /> {children}</div>;
}

export default async function VerServico({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await prisma.servico.findUnique({ where: { id }, include: { fornecedores: { include: { fornecedor: { select: { id: true, nome: true } } } } } });
  if (!s) notFound();
  const aba = ABAS.some((a) => a.chave === sp.aba) ? sp.aba! : "valores";
  const [foto, campos, empresas, usos] = await Promise.all([
    prisma.anexo.findFirst({ where: { entidade: "FOTO_SERVICO", entidadeId: id }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], select: { id: true } }),
    prisma.campoExtra.findMany({ where: { entidade: "PRODUTO" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true } }),
    prisma.osItemServico.aggregate({ where: { servicoId: id }, _count: true, _sum: { quantidade: true } }),
  ]);
  const base = `/servicos/${id}`;
  const ce = (s.camposExtras ?? {}) as Record<string, string>;
  const lojas = s.lojas.length ? s.lojas : empresas.map((e) => e.id);
  const margem = Number(s.custo) > 0 ? ((Number(s.preco) - Number(s.custo)) / Number(s.custo)) * 100 : null;

  return (
    <Pagina titulo="Visualizar serviço" trilha={[{ rotulo: "Serviços", href: "/servicos" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="servicos" size={18} /> Serviço #{s.codigo}
            {s.ativo ? <Pilula rotulo="Ativo" cor="border-emerald-300 bg-emerald-50 text-emerald-700" /> : <Pilula rotulo="Inativo" cor="border-red-300 bg-red-50 text-red-700" />}</h2>
          <p className="text-[12px] text-slate-500">Criado em {s.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href={`${base}/editar`} className="btn-laranja"><Icone nome="editar" size={15} /> Editar serviço</Link>
          <Suspenso direita classe="btn-sec px-2" botao={<Icone nome="opcoes" size={15} />}>
            <BotaoExcluir acao={excluirServicoAcao.bind(null, id)} pergunta={`Excluir ${s.nome}?`} depois="/servicos" rotulo="Excluir" />
          </Suspenso>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="cartao h-fit p-4 text-[13px]">
          <div className="mb-3 flex flex-col items-center text-center">
            {foto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/cadastros/anexo/${foto.id}`} alt="" className="mb-2 h-40 w-40 rounded object-contain" />
              : <span className="mb-2 flex h-40 w-40 flex-col items-center justify-center rounded bg-slate-100 text-slate-400"><Icone nome="foto" size={40} /><span className="text-[12px]">Sem fotos</span></span>}
            <div className="font-semibold uppercase">{s.nome}</div>
          </div>
          <dl className="space-y-1 border-t pt-3">
            <div><b>Código:</b> {s.codigo}</div>
            <div><b>Tipo:</b> Serviço</div>
            <div><b>Usado em OS:</b> {usos._count} vez(es)</div>
          </dl>
          <div className="mt-3 space-y-1 border-t pt-3">
            <Selo ok={!!s.codigoTributacaoNacional}>Pronto para NFS-e</Selo>
            <Selo ok={s.reterIss}>Reter ISS</Selo>
          </div>
          <div className="mt-3 border-t pt-2 text-[11px] text-slate-500">Atualizado em {dataSP(s.updatedAt)} {horaSP(s.updatedAt)}</div>
          <Link href={`${base}/editar`} className="btn mt-2 w-full">Editar serviço</Link>
        </aside>

        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            {ABAS.map((a) => <Link key={a.chave} href={a.chave === "valores" ? base : `${base}?aba=${a.chave}`} className={`aba ${aba === a.chave ? "aba-ativa" : ""}`}><Icone nome={a.icone} size={14} /> {a.rotulo}</Link>)}
          </nav>

          {aba === "valores" && (
            <div className="cartao p-4">
              <div className="grid gap-3 text-[13px] sm:grid-cols-4">
                <div><div className="text-slate-500">Valor de custo</div><div className="text-[16px] font-semibold">{brl(s.custo)}</div></div>
                <div><div className="text-slate-500">Lucro</div><div className="text-[16px] font-semibold">{margem == null ? "—" : `${num2(margem)}%`}</div></div>
                <div><div className="text-slate-500">Comissão</div><div className="text-[16px] font-semibold">{pct(s.comissao)}</div></div>
                <div><div className="text-slate-500">Valor de venda</div><div className="text-[18px] font-semibold text-marca">{brl(s.preco)}</div></div>
              </div>
            </div>
          )}

          {aba === "fiscal" && (
            <div className="space-y-3 text-[13px]">
              <div className="cartao p-4">
                <h3 className="mb-2 font-semibold">Dados fiscais (NFS-e)</h3>
                <dl className="grid gap-2 sm:grid-cols-2">
                  {[["Atividade", s.atividade], ["Código do serviço (LC 116)", s.codigoLc116], ["Código de tributação nacional", s.codigoTributacaoNacional], ["Código de tributação municipal", s.codigoTributacaoMunicipal],
                    ["Código NBS", s.codigoNbs], ["CNAE", s.cnae], ["Descrição da atividade", s.descricaoAtividade]].map(([k, v]) => <div key={k as string}><b>{k}:</b> {v || "—"}</div>)}
                </dl>
              </div>
              <div className="cartao p-4">
                <h3 className="mb-2 font-semibold">Alíquotas</h3>
                <div className="grid gap-2 sm:grid-cols-6">
                  {[["ISS", s.aliquotaIss], ["COFINS", s.aliquotaCofins], ["PIS", s.aliquotaPis], ["CSLL", s.aliquotaCsll], ["IR", s.aliquotaIr], ["INSS", s.aliquotaInss]].map(([k, v]) => <div key={k as string}><div className="text-slate-500">{k as string}</div>{pct(v)}</div>)}
                </div>
              </div>
              <div className="cartao space-y-1 p-4">
                <h3 className="mb-2 font-semibold">Opções de cálculo</h3>
                <Selo ok={s.descontarImpostos}>Descontar impostos do valor total</Selo>
                <Selo ok={s.descontarDeducoes}>Descontar deduções no valor total</Selo>
                <Selo ok={s.construcaoCivil}>Serviço de construção civil</Selo>
                <Selo ok={s.reterIss}>Reter ISS</Selo>
              </div>
            </div>
          )}

          {aba === "detalhes" && (
            <div className="space-y-3 text-[13px]">
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Campos extras</h3>{campos.length ? campos.map((c) => <div key={c.id}><b>{c.nome}:</b> {ce[c.id] || "—"}</div>) : "Nenhum campo extra cadastrado."}</div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Fornecedores</h3>{s.fornecedores.length ? s.fornecedores.map((f) => <div key={f.id}><Link href={`/fornecedores/${f.fornecedor.id}`} className="text-marca hover:underline">{f.fornecedor.nome}</Link>{f.codigo && ` · código ${f.codigo}`}</div>) : "Nenhum fornecedor vinculado."}</div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Descrição</h3><p className="whitespace-pre-wrap">{s.descricao || "—"}</p></div>
            </div>
          )}

          {aba === "lojas" && (
            <div className="grid gap-3 sm:grid-cols-2">
              {empresas.map((e) => <div key={e.id} className={`cartao p-3 text-[13px] ${lojas.includes(e.id) ? "" : "opacity-50"}`}><b className="uppercase">{e.nomeFantasia || e.razaoSocial}</b><div className="text-[11px]">{lojas.includes(e.id) ? "Disponível nesta loja" : "Indisponível"}</div></div>)}
            </div>
          )}
        </section>
      </div>
    </Pagina>
  );
}
