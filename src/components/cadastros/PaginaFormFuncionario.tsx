import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usuarioAtual } from "@/lib/auth/atual";
import { ROTULO_PAPEL } from "@/lib/auth/permissoes";
import { LIBERACOES } from "@/lib/cadastros/funcionarios";
import { Pagina } from "@/components/ui/Pagina";
import FormFuncionario, { type InicialFuncionario } from "./FormFuncionario";

const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export default async function PaginaFormFuncionario({ id }: { id?: string }) {
  const [eu, empresas] = await Promise.all([usuarioAtual(), prisma.empresa.findMany({ orderBy: { razaoSocial: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } })]);
  const lojas = empresas.map((e) => ({ id: e.id, nome: e.nomeFantasia || e.razaoSocial, cnpj: cnpjFmt(e.cnpj) }));
  let inicial: InicialFuncionario = {
    nome: "", cpf: "", rg: "", nascimento: "", sexo: "", email: "", ativo: true, acessoSistema: false, papel: "OPERADOR", senha: "",
    tecnico: false, vendedor: false, observacoes: "", comissao: "", salario: "", liberacaoComissao: "PARCIAL", telefone: "", celular: "", celular2: "",
    cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", codigoMunicipio: "", uf: "", lojas: lojas.map((l) => l.id),
  };
  if (id) {
    const u = await prisma.usuario.findUnique({ where: { id }, omit: { foto: true } });
    if (!u) notFound();
    const [{ t: temFoto }] = await prisma.$queryRaw<{ t: boolean }[]>`SELECT foto IS NOT NULL AS t FROM "Usuario" WHERE id = ${id}`;
    const s = (x: string | null) => x ?? "";
    inicial = {
      id, temFoto, temSenha: !!u.senhaHash, nome: u.nome, cpf: s(u.cpf), rg: s(u.rg), nascimento: u.nascimento?.toISOString().slice(0, 10) ?? "", sexo: s(u.sexo),
      email: s(u.email), ativo: u.ativo, acessoSistema: u.acessoSistema, papel: u.papel, senha: "", tecnico: u.tecnico, vendedor: u.vendedor,
      observacoes: s(u.observacoes), comissao: u.comissao != null ? String(Number(u.comissao)).replace(".", ",") : "", liberacaoComissao: u.liberacaoComissao,
      salario: u.salario != null ? Number(u.salario).toFixed(2).replace(".", ",") : "",
      telefone: s(u.telefone), celular: s(u.celular), celular2: s(u.celular2), cep: s(u.cep), logradouro: s(u.logradouro), numero: s(u.numero),
      complemento: s(u.complemento), bairro: s(u.bairro), cidade: s(u.cidade), codigoMunicipio: s(u.codigoMunicipio), uf: s(u.uf),
      lojas: u.lojas.filter((l) => lojas.some((x) => x.id === l)).length ? u.lojas.filter((l) => lojas.some((x) => x.id === l)) : lojas.map((l) => l.id),
    };
  }
  const acao = id ? "Editar" : "Adicionar";
  return (
    <Pagina titulo={`${acao} funcionário`} trilha={[{ rotulo: "Funcionários", href: "/funcionarios" }, { rotulo: acao }]}>
      <FormFuncionario inicial={inicial} lojas={lojas} liberacoes={LIBERACOES} papeis={Object.entries(ROTULO_PAPEL)} admin={eu?.papel === "ADMIN"} />
    </Pagina>
  );
}
