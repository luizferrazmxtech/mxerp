import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { CANAIS, PRAZO_HORAS, ROTULO_PRIORIDADE } from "@/lib/chamados/chamados";
import { abrirChamadoAcao } from "@/lib/chamados/acoes";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormAcao from "@/components/financeiro/FormAcao";
import BuscaPessoa from "@/components/orcamentos/BuscaPessoa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Novo chamado" };

export default async function NovoChamado({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  await exigirUsuario();
  const sp = await searchParams;
  const [usuarios, cliente, categorias] = await Promise.all([
    prisma.usuario.findMany({ where: { ativo: true, acessoSistema: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    sp.cliente ? prisma.pessoa.findUnique({ where: { id: sp.cliente }, select: { id: true, nome: true } }) : null,
    prisma.chamado.findMany({ where: { categoria: { not: null } }, distinct: ["categoria"], select: { categoria: true }, take: 50 }),
  ]);
  return (
    <Pagina titulo="Novo chamado" icone="atendimento" trilha={[{ rotulo: "Atendimentos", href: "/chamados" }, { rotulo: "Novo chamado" }]}>
      <Bloco icone="atendimento" titulo={<>Abrir <b>chamado</b></>} subtitulo="Registre o pedido do cliente. Sem prazo informado, vale o da prioridade (urgente 4 h, alta 1 dia, normal 3 dias, baixa 7 dias).">
        <FormAcao acao={abrirChamadoAcao} className="grid gap-3 md:grid-cols-6" botao="Abrir chamado" classeBotao="btn md:col-span-1" limpar={false}>
          <div className="md:col-span-3"><span className="rotulo">Cliente</span><BuscaPessoa nome="clienteId" papel="cliente" inicial={cliente} placeholder="Digite o nome, CPF/CNPJ ou telefone" /></div>
          <label className="md:col-span-2"><span className="rotulo">Quem pediu (contato)</span><input name="contato" className="campo" placeholder="se não for cliente cadastrado" /></label>
          <label><span className="rotulo">Telefone</span><input name="telefone" className="campo" /></label>
          <label className="md:col-span-4"><span className="rotulo obrig">Assunto</span><input name="assunto" required maxLength={200} className="campo" placeholder="ex.: Impressora fiscal não liga" /></label>
          <label className="md:col-span-2"><span className="rotulo">Categoria</span>
            <input name="categoria" list="categorias-chamado" className="campo" placeholder="ex.: Suporte, Garantia, Financeiro" />
            <datalist id="categorias-chamado">{categorias.map((c) => <option key={c.categoria} value={c.categoria!} />)}</datalist></label>
          <label className="md:col-span-6"><span className="rotulo">Descrição</span><textarea name="descricao" rows={4} className="campo" /></label>
          <label><span className="rotulo">Canal</span>
            <select name="canal" className="campo">{Object.entries(CANAIS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label><span className="rotulo">Prioridade</span>
            <select name="prioridade" defaultValue="NORMAL" className="campo">{Object.entries(ROTULO_PRIORIDADE).map(([k, v]) => <option key={k} value={k}>{v} ({PRAZO_HORAS[k as keyof typeof PRAZO_HORAS] < 24 ? `${PRAZO_HORAS[k as keyof typeof PRAZO_HORAS]} h` : `${PRAZO_HORAS[k as keyof typeof PRAZO_HORAS] / 24} d`})</option>)}</select></label>
          <label className="md:col-span-2"><span className="rotulo">Responsável</span>
            <select name="responsavelId" className="campo"><option value="">Ninguém ainda</option>{usuarios.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
          <label><span className="rotulo">Prazo</span><input type="datetime-local" name="prazo" className="campo" /></label>
        </FormAcao>
      </Bloco>
    </Pagina>
  );
}
