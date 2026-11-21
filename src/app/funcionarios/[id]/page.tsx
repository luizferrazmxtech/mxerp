import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ROTULO_PAPEL } from "@/lib/auth/permissoes";
import { LIBERACOES } from "@/lib/cadastros/funcionarios";
import { excluirAnexoAcao, excluirFuncionarioAcao } from "@/lib/cadastros/acoes";
import { data, dataSP, horaSP } from "@/lib/ui/format";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import BotaoExcluir from "@/components/ui/BotaoExcluir";
import Icone from "@/components/Icone";
import { FormAnexo } from "@/components/cadastros/FormsVer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visualizar funcionário" };

export default async function VerFuncionario({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ id }, { aba = "detalhes" }] = await Promise.all([params, searchParams]);
  const u = await prisma.usuario.findUnique({ where: { id }, omit: { foto: true, senhaHash: true } });
  if (!u) notFound();
  const [{ t: temFoto, s: temSenha }] = await prisma.$queryRaw<{ t: boolean; s: boolean }[]>`SELECT foto IS NOT NULL AS t, "senhaHash" IS NOT NULL AS s FROM "Usuario" WHERE id = ${id}`;
  const [empresas, anexos, vendas, os] = await Promise.all([
    prisma.empresa.findMany({ where: { id: { in: u.lojas } }, select: { nomeFantasia: true, razaoSocial: true } }),
    prisma.anexo.findMany({ where: { entidade: "USUARIO", entidadeId: id }, select: { id: true, nome: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.venda.count({ where: { vendedorId: id } }),
    prisma.ordemServico.count({ where: { OR: [{ tecnicoId: id }, { vendedorId: id }] } }),
  ]);
  const liberado = u.ativo && u.acessoSistema && temSenha;
  const base = `/funcionarios/${id}`;
  const linha = (k: string, v: React.ReactNode) => <div key={k}><dt className="inline font-semibold">{k}: </dt><dd className="inline">{v || ""}</dd></div>;
  return (
    <Pagina voltar="/funcionarios" titulo="Visualizar funcionário" trilha={[{ rotulo: "Funcionários", href: "/funcionarios" }, { rotulo: "Visualizar" }]}>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[18px]"><Icone nome="funcionarios" size={18} /> {u.nome.toUpperCase()}
            {liberado ? <Pilula rotulo="Liberado" cor="border-emerald-300 bg-emerald-50 text-emerald-700" /> : <Pilula rotulo="Bloqueado" cor="border-slate-300 bg-slate-50 text-slate-600" />}</h2>
          <p className="text-[12px] text-slate-500">Criado em {u.createdAt.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" })}</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Link href={`${base}/editar`} className="btn-laranja"><Icone nome="editar" size={15} /> Editar cadastro</Link>
          <BotaoExcluir acao={excluirFuncionarioAcao.bind(null, id)} pergunta={`Excluir ${u.nome}?`} depois="/funcionarios" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="cartao h-fit p-4 text-[13px]">
          <div className="mb-3 flex flex-col items-center text-center">
            {temFoto
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={`/api/cadastros/foto/funcionario/${id}`} alt="" className="mb-2 h-36 w-36 rounded object-cover" />
              : <span className="mb-2 flex h-36 w-36 items-center justify-center rounded bg-slate-200 text-slate-400"><Icone nome="pessoa" size={72} /></span>}
            <div className="font-semibold uppercase">{u.nome}</div>
            <div className="text-[12px] text-slate-500">{u.email}</div>
          </div>
          <dl className="space-y-1 border-t pt-3">
            {linha("CPF", u.cpf?.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"))}
            {linha("RG", u.rg)}
            {linha("Nascimento", u.nascimento ? data(u.nascimento) : "")}
            {linha("Sexo", u.sexo === "M" ? "Masculino" : u.sexo === "F" ? "Feminino" : "")}
            {linha("Telefone", u.telefone)}
            {linha("Celular", [u.celular, u.celular2].filter(Boolean).join(" / "))}
            {linha("Situação", u.ativo ? "Ativo" : "Inativo")}
            {linha("Funções", [u.tecnico && "Técnico", u.vendedor && "Vendedor"].filter(Boolean).join(", "))}
          </dl>
          <div className="mt-3 border-t pt-2 text-[11px] text-slate-500">Atualizado em {dataSP(u.updatedAt)} {horaSP(u.updatedAt)}</div>
        </aside>
        <section>
          <nav className="mb-3 flex flex-wrap gap-1">
            <Link href={base} className={`aba ${aba !== "anexos" ? "aba-ativa" : ""}`}><Icone nome="detalhes" size={14} /> Detalhes</Link>
            <Link href={`${base}?aba=anexos`} className={`aba ${aba === "anexos" ? "aba-ativa" : ""}`}><Icone nome="anexos" size={14} /> Anexos</Link>
          </nav>
          {aba === "anexos" ? (
            <div className="cartao p-4">
              <FormAnexo entidade="USUARIO" entidadeId={id} caminho={base} />
              {anexos.map((a) => (
                <div key={a.id} className="flex items-center gap-2 border-b py-2 text-[13px]">
                  <a href={`/api/cadastros/anexo/${a.id}`} className="text-marca hover:underline">{a.nome}</a>
                  <span className="text-slate-500">{dataSP(a.createdAt)}</span>
                  <span className="ml-auto"><BotaoExcluir acao={excluirAnexoAcao.bind(null, a.id)} pergunta={`Excluir ${a.nome}?`} /></span>
                </div>
              ))}
              {!anexos.length && <p className="text-[13px] text-slate-500">Nenhum anexo.</p>}
            </div>
          ) : (
            <div className="space-y-3 text-[13px]">
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Acesso ao sistema</h3>
                <dl className="space-y-1">{linha("Acesso", liberado ? "Liberado" : "Bloqueado")}{linha("Login", u.email)}{linha("Perfil", ROTULO_PAPEL[u.papel])}</dl></div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Comissionamento</h3>
                <dl className="space-y-1">{linha("Salário combinado", u.salario != null ? Number(u.salario).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "")}{linha("Comissão", u.comissao != null ? `${String(Number(u.comissao)).replace(".", ",")}%` : "")}
                  {linha("Liberação da comissão", LIBERACOES.find((l) => l.valor === u.liberacaoComissao)?.rotulo)}
                  {linha("Vendas", vendas)}{linha("Ordens de serviço", os)}</dl></div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Endereço</h3>
                {[u.logradouro, u.numero, u.complemento, u.bairro, u.cidade && `${u.cidade}/${u.uf ?? ""}`, u.cep && `CEP ${u.cep}`].filter(Boolean).join(", ") || <span className="text-slate-500">Sem endereço.</span>}</div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Lojas de acesso</h3>{empresas.map((e) => e.nomeFantasia || e.razaoSocial).join(", ") || "—"}</div>
              <div className="cartao p-4"><h3 className="mb-2 font-semibold">Observações</h3><p className="whitespace-pre-wrap">{u.observacoes || <span className="text-slate-500">Sem observações.</span>}</p></div>
            </div>
          )}
        </section>
      </div>
    </Pagina>
  );
}
