import { prisma } from "@/lib/db";
import { entrada, resumoProduto, saida } from "@/lib/estoque/estoque";
import { campo, numeroBr, type Linha } from "./planilha";

/**
 * Importação das planilhas exportadas do sistema anterior (Gestão Click ou outro).
 * As colunas são reconhecidas por apelidos; rodar com `simular: true` mostra o
 * que seria feito sem gravar nada.
 */

export type Tipo = "clientes" | "fornecedores" | "produtos" | "servicos";

export type Resultado = {
  tipo: Tipo;
  simulado: boolean;
  lidas: number;
  criados: number;
  atualizados: number;
  ignorados: { linha: number; motivo: string }[];
  avisos: string[];
};

export const COLUNAS = {
  codigo: ["código", "codigo", "cód", "cod", "id", "código interno", "referência", "referencia"],
  nome: ["nome", "razão social", "razao social", "nome razão social", "nome/razão social", "descrição", "descricao", "produto", "serviço", "servico"],
  fantasia: ["nome fantasia", "fantasia", "apelido"],
  documento: ["cpf/cnpj", "cnpj/cpf", "cpf cnpj", "cnpj", "cpf", "documento", "cpf ou cnpj"],
  tipoPessoa: ["tipo de pessoa", "tipo pessoa", "tipo"],
  ie: ["inscrição estadual", "inscricao estadual", "ie", "rg/ie", "ie/rg"],
  im: ["inscrição municipal", "inscricao municipal", "im"],
  email: ["e-mail", "email"],
  telefone: ["telefone", "fone", "telefone comercial", "telefone 1"],
  celular: ["celular", "telefone celular", "whatsapp"],
  cep: ["cep"],
  logradouro: ["logradouro", "endereço", "endereco", "rua"],
  numero: ["número", "numero", "nº", "n"],
  complemento: ["complemento"],
  bairro: ["bairro"],
  cidade: ["cidade", "município", "municipio"],
  codigoMunicipio: ["código ibge", "codigo ibge", "ibge", "código do município", "cod municipio"],
  uf: ["uf", "estado"],
  situacao: ["situação", "situacao", "ativo", "status"],
  observacoes: ["observações", "observacoes", "obs"],
  // produtos
  gtin: ["código de barras", "codigo de barras", "gtin", "ean", "gtin/ean"],
  unidade: ["unidade", "un", "unid", "sigla da unidade"],
  grupo: ["grupo", "grupo de produtos", "categoria"],
  preco: ["valor de venda", "preço de venda", "preco de venda", "valor venda", "valor", "preço", "preco", "varejo"],
  custo: ["valor de custo", "preço de custo", "preco de custo", "custo", "custo médio", "custo medio"],
  estoque: ["estoque", "estoque atual", "quantidade", "saldo", "qtd estoque", "estoque disponível"],
  estoqueMinimo: ["estoque mínimo", "estoque minimo", "mínimo", "minimo"],
  ncm: ["ncm", "código ncm", "codigo ncm"],
  cest: ["cest"],
  origem: ["origem", "origem da mercadoria"],
  localizacao: ["localização", "localizacao", "local", "prateleira", "endereço no estoque"],
  cTribNac: ["código de tributação nacional", "codigo tributacao nacional", "ctribnac", "item lista de serviço", "item da lista de servico", "lc 116"],
} as const;

const c = (l: Linha, k: keyof typeof COLUNAS) => campo(l, [...COLUNAS[k]]);
const digitos = (s: string) => s.replace(/\D/g, "");
const inativo = (s: string) => /inativ|nao|não|^0$|false/i.test(s);

function novoResultado(tipo: Tipo, simular: boolean, lidas: number): Resultado {
  return { tipo, simulado: simular, lidas, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
}

export async function importarPessoas(linhas: Linha[], papel: "cliente" | "fornecedor", simular = true): Promise<Resultado> {
  const r = novoResultado(papel === "cliente" ? "clientes" : "fornecedores", simular, linhas.length);
  const vistos = new Set<string>();
  for (const [i, l] of linhas.entries()) {
    const nome = c(l, "nome");
    if (!nome) { r.ignorados.push({ linha: i + 2, motivo: "sem nome" }); continue; }
    let doc = digitos(c(l, "documento")) || null;
    if (doc && ![11, 14].includes(doc.length)) { r.avisos.push(`Linha ${i + 2}: documento "${c(l, "documento")}" inválido, importado sem documento`); doc = null; }
    if (doc && vistos.has(doc)) { r.ignorados.push({ linha: i + 2, motivo: `documento ${doc} repetido` }); continue; }
    if (doc) vistos.add(doc);
    const legado = c(l, "codigo") ? `${papel}:${c(l, "codigo")}` : null;
    const tipoTxt = c(l, "tipoPessoa");
    const dados = {
      nome: nome.slice(0, 200),
      fantasia: c(l, "fantasia") || null,
      documento: doc,
      tipoPessoa: (doc?.length === 11 || /f[ií]sica|^pf$/i.test(tipoTxt) ? "FISICA" : "JURIDICA") as "FISICA" | "JURIDICA",
      inscricaoEstadual: c(l, "ie") || null,
      contribuinteIcms: (/isent/i.test(c(l, "ie")) ? "ISENTO" : digitos(c(l, "ie")) ? "CONTRIBUINTE" : "NAO_CONTRIBUINTE") as "ISENTO" | "CONTRIBUINTE" | "NAO_CONTRIBUINTE",
      email: c(l, "email") || null,
      telefone: c(l, "telefone") || null,
      celular: c(l, "celular") || null,
      cep: digitos(c(l, "cep")) || null,
      logradouro: c(l, "logradouro") || null,
      numero: c(l, "numero") || null,
      complemento: c(l, "complemento") || null,
      bairro: c(l, "bairro") || null,
      cidade: c(l, "cidade") || null,
      codigoMunicipio: digitos(c(l, "codigoMunicipio")) || null,
      uf: c(l, "uf").toUpperCase().slice(0, 2) || null,
      observacoes: c(l, "observacoes") || null,
      ativo: !inativo(c(l, "situacao")),
    };
    const existente = await prisma.pessoa.findFirst({
      where: { OR: [...(doc ? [{ documento: doc }] : []), ...(legado ? [{ idLegado: legado }] : [])] },
    });
    if (simular) { if (existente) r.atualizados++; else r.criados++; continue; }
    if (existente) {
      await prisma.pessoa.update({ where: { id: existente.id }, data: { ...dados, [papel]: true } });
      r.atualizados++;
    } else {
      await prisma.pessoa.create({ data: { ...dados, idLegado: legado, cliente: papel === "cliente", fornecedor: papel === "fornecedor" } });
      r.criados++;
    }
  }
  return r;
}

/**
 * Produtos. O estoque informado vira saldo no local indicado na planilha
 * (coluna Localização) ou no local de implantação. Estoque negativo vira zero
 * e entra na lista para contar.
 */
export async function importarProdutos(linhas: Linha[], opts: { simular?: boolean; localImplantacao?: string; importarEstoque?: boolean } = {}): Promise<Resultado> {
  const simular = opts.simular ?? true;
  const r = novoResultado("produtos", simular, linhas.length);
  const codigoLocal = (opts.localImplantacao ?? "IMPLANTACAO").toUpperCase();
  let localPadrao = await prisma.local.findUnique({ where: { codigo: codigoLocal } });
  if (!localPadrao && !simular) {
    const dep = await prisma.deposito.upsert({ where: { nome: "Loja" }, create: { nome: "Loja" }, update: {} });
    localPadrao = await prisma.local.create({ data: { depositoId: dep.id, codigo: codigoLocal, descricao: "Saldo vindo da migração, ainda sem prateleira" } });
  }
  const negativos: string[] = [];
  const semNcm: string[] = [];
  const vistos = new Set<string>();

  for (const [i, l] of linhas.entries()) {
    const codigo = c(l, "codigo") || c(l, "gtin");
    const nome = c(l, "nome");
    if (!codigo || !nome) { r.ignorados.push({ linha: i + 2, motivo: !codigo ? "sem código" : "sem nome" }); continue; }
    if (vistos.has(codigo)) { r.ignorados.push({ linha: i + 2, motivo: `código ${codigo} repetido` }); continue; }
    vistos.add(codigo);
    const ncm = digitos(c(l, "ncm"));
    if (ncm.length !== 8) semNcm.push(codigo);
    const grupoNome = c(l, "grupo") || null;
    const dados = {
      nome: nome.slice(0, 200),
      gtin: digitos(c(l, "gtin")) || null,
      unidade: (c(l, "unidade") || "UN").toUpperCase().slice(0, 6),
      precoVenda: numeroBr(c(l, "preco")),
      custo: numeroBr(c(l, "custo")),
      estoqueMinimo: numeroBr(c(l, "estoqueMinimo")),
      ncm: ncm.length === 8 ? ncm : null,
      cest: digitos(c(l, "cest")) || null,
      origem: Number(digitos(c(l, "origem")).slice(0, 1) || 0),
      ativo: !inativo(c(l, "situacao")),
      idLegado: `produto:${codigo}`,
    };
    const estoque = numeroBr(c(l, "estoque"));
    if (estoque < 0) negativos.push(`${codigo} (${estoque})`);
    const existente = await prisma.produto.findUnique({ where: { codigo } });
    if (simular) { if (existente) r.atualizados++; else r.criados++; continue; }

    const grupoId = grupoNome
      ? (await prisma.grupoProduto.upsert({ where: { nome: grupoNome }, create: { nome: grupoNome }, update: {} })).id
      : null;
    // local: coluna "Localização" (cria se não existir) ou local de implantação
    const locTxt = c(l, "localizacao").toUpperCase().replace(/\s+/g, "-");
    let local = localPadrao!;
    if (locTxt) {
      local = (await prisma.local.findUnique({ where: { codigo: locTxt } })) ??
        (await prisma.local.create({ data: { depositoId: localPadrao!.depositoId, codigo: locTxt } }));
    }
    const prod = existente
      ? await prisma.produto.update({ where: { id: existente.id }, data: { ...dados, grupoId } })
      : await prisma.produto.create({ data: { ...dados, codigo, grupoId, localPadraoId: locTxt ? local.id : null } });
    if (existente) r.atualizados++; else r.criados++;

    if (opts.importarEstoque !== false) {
      // ajusta o saldo físico do produto para o valor da planilha (nunca negativo)
      await prisma.$transaction(async (tx) => {
        const atual = (await resumoProduto(tx, prod.id)).fisico;
        const alvo = Math.max(0, estoque);
        const dif = Math.round((alvo - atual) * 10000) / 10000;
        if (dif > 0) await entrada(tx, { produtoId: prod.id, localId: local.id, quantidade: dif, custoUnit: dados.custo, origemTipo: "IMPLANTACAO", observacao: "Migração" });
        if (dif < 0) await saida(tx, { produtoId: prod.id, localId: local.id, quantidade: -dif, origemTipo: "IMPLANTACAO", observacao: "Migração" });
      });
    }
  }
  if (negativos.length) r.avisos.push(`${negativos.length} produtos com estoque negativo no sistema antigo ${simular ? "entrarão" : "entraram"} com 0 — conte-os no inventário: ${negativos.slice(0, 30).join(", ")}${negativos.length > 30 ? "…" : ""}`);
  if (semNcm.length) r.avisos.push(`${semNcm.length} produtos sem NCM válido (necessário para nota fiscal): ${semNcm.slice(0, 30).join(", ")}${semNcm.length > 30 ? "…" : ""}`);
  return r;
}

export async function importarServicos(linhas: Linha[], simular = true): Promise<Resultado> {
  const r = novoResultado("servicos", simular, linhas.length);
  for (const [i, l] of linhas.entries()) {
    const nome = c(l, "nome");
    const codigo = c(l, "codigo") || nome.slice(0, 20).toUpperCase();
    if (!nome) { r.ignorados.push({ linha: i + 2, motivo: "sem nome" }); continue; }
    const cTrib = digitos(c(l, "cTribNac"));
    const dados = {
      nome: nome.slice(0, 200), preco: numeroBr(c(l, "preco")),
      codigoTributacaoNacional: cTrib.length === 6 ? cTrib : null, ativo: !inativo(c(l, "situacao")), idLegado: `servico:${codigo}`,
    };
    const existente = await prisma.servico.findUnique({ where: { codigo } });
    if (simular) { if (existente) r.atualizados++; else r.criados++; continue; }
    if (existente) { await prisma.servico.update({ where: { id: existente.id }, data: dados }); r.atualizados++; }
    else { await prisma.servico.create({ data: { ...dados, codigo } }); r.criados++; }
  }
  return r;
}
