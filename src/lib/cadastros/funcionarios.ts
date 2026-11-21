import type { LiberacaoComissao, PapelUsuario } from "@prisma/client";
import { conferirLimiteUsuarios } from "@/lib/licenca/licenca";
import { prisma } from "@/lib/db";
import { hashSenha } from "@/lib/auth/senha";

export const LIBERACOES: { valor: LiberacaoComissao; rotulo: string }[] = [
  { valor: "GERADO_FINANCEIRO", rotulo: "Integral, assim que for gerado financeiro" },
  { valor: "PRIMEIRA_PARCELA", rotulo: "Integral, quando o cliente pagar a 1a parcela" },
  { valor: "ULTIMA_PARCELA", rotulo: "Integral, quando o cliente pagar a última parcela" },
  { valor: "PARCIAL", rotulo: "Parcial, conforme o recebimento das parcelas" },
];

export type DadosFuncionario = {
  nome: string; cpf: string; rg: string; nascimento: string; sexo: string; email: string; ativo: boolean;
  acessoSistema: boolean; papel: PapelUsuario; senha: string; tecnico: boolean; vendedor: boolean; observacoes: string;
  comissao: string; liberacaoComissao: LiberacaoComissao;
  telefone: string; celular: string; celular2: string;
  cep: string; logradouro: string; numero: string; complemento: string; bairro: string; cidade: string; codigoMunicipio: string; uf: string;
  lojas: string[];
};

const t = (s: string | undefined | null) => (s ?? "").trim() || null;
const PAPEIS: PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR", "TECNICO", "CAIXA"];

/** Cria/altera funcionário. Só administrador mexe em acesso, perfil e senha. */
export async function salvarFuncionario(d: DadosFuncionario, editor: { id: string; papel: PapelUsuario }, id?: string) {
  if (!d.nome.trim()) throw new Error("Informe o nome");
  if (!d.lojas?.length) throw new Error("Selecione no mínimo uma loja.");
  const email = t(d.email)?.toLowerCase() ?? null;
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("E-mail inválido");
  if (email) {
    const outro = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
    if (outro && outro.id !== id) throw new Error("Já existe funcionário com esse e-mail");
  }
  const atual = id ? await prisma.usuario.findUniqueOrThrow({ where: { id }, select: { senhaHash: true, acessoSistema: true, papel: true, ativo: true } }) : null;
  const admin = editor.papel === "ADMIN";
  const comissao = d.comissao.trim() ? Number(d.comissao.replace(",", ".")) : null;
  if (comissao !== null && !(comissao >= 0 && comissao <= 100)) throw new Error("Comissão deve ficar entre 0 e 100%");
  const cpf = d.cpf.replace(/\D/g, "") || null;
  if (cpf && cpf.length !== 11) throw new Error("CPF deve ter 11 dígitos");

  const dados = {
    nome: d.nome.trim(), cpf, rg: t(d.rg), nascimento: d.nascimento ? new Date(d.nascimento + "T00:00:00Z") : null, sexo: t(d.sexo),
    email, ativo: d.ativo, observacoes: t(d.observacoes), tecnico: d.tecnico, vendedor: d.vendedor,
    comissao, liberacaoComissao: d.liberacaoComissao,
    telefone: t(d.telefone), celular: t(d.celular), celular2: t(d.celular2),
    cep: d.cep.replace(/\D/g, "") || null, logradouro: t(d.logradouro), numero: t(d.numero), complemento: t(d.complemento), bairro: t(d.bairro),
    cidade: t(d.cidade), codigoMunicipio: t(d.codigoMunicipio), uf: t(d.uf)?.toUpperCase().slice(0, 2) ?? null, lojas: d.lojas,
  };
  // acesso ao sistema
  let acesso: { acessoSistema?: boolean; papel?: PapelUsuario; senhaHash?: string } = {};
  if (admin) {
    const papel = PAPEIS.includes(d.papel) ? d.papel : "OPERADOR";
    if (d.acessoSistema && !email) throw new Error("Para permitir acesso ao sistema, informe o e-mail (é o login).");
    if (d.acessoSistema && !atual?.senhaHash && !d.senha) throw new Error("Defina a senha inicial para liberar o acesso.");
    if (id === editor.id && (!d.acessoSistema || !d.ativo || papel !== "ADMIN")) throw new Error("Você não pode tirar o seu próprio acesso de administrador");
    acesso = { acessoSistema: d.acessoSistema, papel, ...(d.senha ? { senhaHash: await hashSenha(d.senha) } : {}) };
  } else if (!id) {
    acesso = { acessoSistema: false };
  }
  // passa a ter acesso agora: conta no limite de usuários do plano
  if (d.ativo && (acesso.acessoSistema ?? atual?.acessoSistema) && !(atual?.ativo && atual.acessoSistema)) await conferirLimiteUsuarios(id);
  const u = id
    ? await prisma.usuario.update({ where: { id }, data: { ...dados, ...acesso } })
    : await prisma.usuario.create({ data: { ...dados, ...acesso } });
  // perdeu o acesso (ou trocou a senha): derruba as sessões
  if (atual && (!u.acessoSistema || !u.ativo || acesso.senhaHash)) await prisma.sessao.deleteMany({ where: { usuarioId: u.id } });
  return u;
}

export async function excluirFuncionario(id: string, editorId: string) {
  if (id === editorId) return { ok: false, mensagem: "Você não pode excluir o seu próprio cadastro." };
  const u = await prisma.usuario.findUniqueOrThrow({
    where: { id },
    select: { nome: true, _count: { select: { osComoTecnico: true, osComoVendedor: true, vendas: true, movimentos: true, caixas: true, clientesVendedor: true } } },
  });
  const c = u._count;
  if (c.osComoTecnico + c.osComoVendedor + c.vendas + c.movimentos + c.caixas + c.clientesVendedor > 0) {
    await prisma.$transaction([
      prisma.usuario.update({ where: { id }, data: { ativo: false, acessoSistema: false } }),
      prisma.sessao.deleteMany({ where: { usuarioId: id } }),
    ]);
    return { ok: true, mensagem: `${u.nome} tem OS, vendas ou movimentos e foi inativado em vez de excluído.` };
  }
  await prisma.$transaction([
    prisma.anexo.deleteMany({ where: { entidade: "USUARIO", entidadeId: id } }),
    prisma.usuario.delete({ where: { id } }),
  ]);
  return { ok: true, mensagem: `${u.nome} excluído.` };
}
