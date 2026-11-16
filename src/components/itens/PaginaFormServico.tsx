import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Pagina } from "@/components/ui/Pagina";
import FormServico, { type InicialServico } from "./FormServico";

const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
const n = (v: unknown, casas = 2) => (v == null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 4 }));

export default async function PaginaFormServico({ id }: { id?: string }) {
  const [empresas, campos] = await Promise.all([
    prisma.empresa.findMany({ select: { id: true, nomeFantasia: true, razaoSocial: true, cnpj: true } }),
    prisma.campoExtra.findMany({ where: { entidade: "PRODUTO" }, orderBy: [{ ordem: "asc" }, { nome: "asc" }] }),
  ]);
  let inicial: InicialServico = {
    nome: "", codigo: "", comissao: "", custo: "0,00", preco: "0,00", descricao: "", ativo: true, camposExtras: {},
    atividade: "", codigoLc116: "", codigoTributacaoMunicipal: "", codigoTributacaoNacional: "", codigoNbs: "", cnae: "", descricaoAtividade: "",
    aliquotaIss: "", aliquotaCofins: "", aliquotaPis: "", aliquotaCsll: "", aliquotaIr: "", aliquotaInss: "",
    descontarImpostos: false, descontarDeducoes: false, construcaoCivil: false, reterIss: false,
    fornecedores: [], lojas: empresas.map((e) => e.id), fotos: [],
  };
  if (id) {
    const s = await prisma.servico.findUnique({ where: { id }, include: { fornecedores: { include: { fornecedor: { select: { nome: true } } } } } });
    if (!s) notFound();
    const fotos = await prisma.anexo.findMany({ where: { entidade: "FOTO_SERVICO", entidadeId: id }, orderBy: [{ ordem: "asc" }, { createdAt: "asc" }], select: { id: true } });
    const t = (x: string | null) => x ?? "";
    inicial = {
      id, nome: s.nome, codigo: s.codigo, comissao: n(s.comissao), custo: n(s.custo), preco: n(s.preco), descricao: t(s.descricao), ativo: s.ativo,
      camposExtras: (s.camposExtras ?? {}) as Record<string, string>,
      atividade: t(s.atividade), codigoLc116: t(s.codigoLc116), codigoTributacaoMunicipal: t(s.codigoTributacaoMunicipal), codigoTributacaoNacional: t(s.codigoTributacaoNacional),
      codigoNbs: t(s.codigoNbs), cnae: t(s.cnae), descricaoAtividade: t(s.descricaoAtividade),
      aliquotaIss: n(s.aliquotaIss), aliquotaCofins: n(s.aliquotaCofins), aliquotaPis: n(s.aliquotaPis), aliquotaCsll: n(s.aliquotaCsll), aliquotaIr: n(s.aliquotaIr), aliquotaInss: n(s.aliquotaInss),
      descontarImpostos: s.descontarImpostos, descontarDeducoes: s.descontarDeducoes, construcaoCivil: s.construcaoCivil, reterIss: s.reterIss,
      fornecedores: s.fornecedores.map((f) => ({ fornecedorId: f.fornecedorId, nome: f.fornecedor.nome, codigo: t(f.codigo) })),
      lojas: s.lojas.length ? s.lojas : empresas.map((e) => e.id), fotos: fotos.map((f) => f.id),
    };
  }
  const acao = id ? "Editar" : "Adicionar";
  return (
    <Pagina titulo={`${acao} serviço`} trilha={[{ rotulo: "Serviços", href: "/servicos" }, { rotulo: acao }]}>
      <FormServico inicial={inicial} op={{ lojas: empresas.map((e) => ({ id: e.id, nome: e.nomeFantasia || e.razaoSocial, cnpj: cnpjFmt(e.cnpj) })), campos: campos.map((c) => ({ id: c.id, nome: c.nome })) }} />
    </Pagina>
  );
}
