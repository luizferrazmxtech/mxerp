import type { TipoPessoa } from "@prisma/client";
import { prisma } from "@/lib/db";
import { proximoNumero } from "@/lib/sequencia";
import { PAPEIS, garantirCodigo, type PapelPessoa } from "@/lib/cadastros/pessoas";
import { entrada, resumoProduto, saida } from "@/lib/estoque/estoque";
import { campo, numeroBr, type Linha } from "./planilha";

/**
 * Importação das planilhas exportadas do sistema anterior (Gestão Click ou outro).
 * As colunas são reconhecidas por apelidos; rodar com `simular: true` mostra o
 * que seria feito sem gravar nada.
 */

export type Tipo = "clientes" | "fornecedores" | "transportadoras" | "produtos" | "servicos" | "os" | "orcamentos" | "vendas" | "compras" | "ajustes" | "receber" | "pagar";

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
  nome: ["nome", "razão social", "razao social", "nome razão social", "nome/razão social", "produto", "serviço", "servico", "descrição", "descricao"],
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
  rg: ["rg"],
  nascimento: ["data de nascimento", "nascimento"],
  nomeSocial: ["nome social"],
  responsavel: ["responsável", "responsavel"],
  cadastrado: ["cadastrado em", "data de cadastro"],
  // produtos
  gtin: ["código de barras", "codigo de barras", "codigo de barra", "gtin", "ean", "gtin/ean"],
  unidade: ["unidade", "un", "unid", "sigla da unidade", "unidade de saida", "unidade de entrada"],
  grupo: ["grupo", "grupo de produtos", "categoria"],
  preco: ["valor de venda", "valor varejo", "valor unitário", "valor unitario", "preço de venda", "preco de venda", "valor venda", "valor", "preço", "preco", "varejo"],
  custo: ["valor de custo", "preço de custo", "preco de custo", "custo", "custo médio", "custo medio"],
  estoque: ["estoque", "estoque atual", "quantidade", "saldo", "qtd estoque", "estoque disponível"],
  estoqueMinimo: ["estoque mínimo", "estoque minimo", "mínimo", "minimo"],
  unidadeCompra: ["unidade de compra"],
  fator: ["fator de conversao", "fator de conversão", "fator"],
  ncm: ["ncm", "código ncm", "codigo ncm"],
  cest: ["cest", "código cest", "codigo cest"],
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

export async function importarPessoas(linhas: Linha[], papel: PapelPessoa, simular = true): Promise<Resultado> {
  const r = novoResultado(`${papel === "transportadora" ? "transportadoras" : papel === "cliente" ? "clientes" : "fornecedores"}` as Tipo, simular, linhas.length);
  const cfg = PAPEIS[papel];
  const vistos = new Set<string>();
  let maiorCodigo = 0;
  for (const [i, l] of linhas.entries()) {
    const nome = c(l, "nome");
    if (!nome) { r.ignorados.push({ linha: i + 2, motivo: "sem nome" }); continue; }
    const tipoTxt = c(l, "tipoPessoa");
    const estrangeiro = /estrang/i.test(tipoTxt);
    let doc = estrangeiro ? c(l, "documento") || null : digitos(c(l, "documento")) || null;
    if (doc && !estrangeiro && ![11, 14].includes(doc.length)) { r.avisos.push(`Linha ${i + 2}: documento "${c(l, "documento")}" inválido, importado sem documento`); doc = null; }
    if (doc && vistos.has(doc)) { r.ignorados.push({ linha: i + 2, motivo: `documento ${doc} repetido` }); continue; }
    if (doc) vistos.add(doc);
    const codigoTxt = c(l, "codigo");
    const legado = codigoTxt ? `${papel}:${codigoTxt}` : null;
    const tipoPessoa = (estrangeiro ? "ESTRANGEIRO" : doc?.length === 11 || /f[ií]sica|^pf$/i.test(tipoTxt) ? "FISICA" : "JURIDICA") as TipoPessoa;
    const enderecos = l.__enderecos ? (JSON.parse(l.__enderecos) as Linha[]) : [];
    const nasc = c(l, "nascimento");
    const cadastrado = c(l, "cadastrado");
    const dados = {
      nome: nome.slice(0, 200),
      fantasia: c(l, "fantasia") || null,
      documento: doc,
      tipoPessoa,
      nomeSocial: c(l, "nomeSocial") || null,
      rg: c(l, "rg") || null,
      nascimento: /^\d{2}\/\d{2}\/\d{4}/.test(nasc) ? new Date(`${nasc.slice(6, 10)}-${nasc.slice(3, 5)}-${nasc.slice(0, 2)}T00:00:00Z`) : /^\d{4}-\d{2}-\d{2}/.test(nasc) ? new Date(nasc.slice(0, 10) + "T00:00:00Z") : null,
      inscricaoEstadual: c(l, "ie") || null,
      inscricaoMunicipal: c(l, "im") || null,
      responsavel: c(l, "responsavel") || null,
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
      include: { _count: { select: { enderecos: true } } },
    });
    if (simular) { if (existente) r.atualizados++; else r.criados++; continue; }
    const listaEnd = (enderecos.length ? enderecos : dados.logradouro || dados.cep || dados.cidade ? [{ cep: dados.cep ?? "", logradouro: dados.logradouro ?? "", numero: dados.numero ?? "", complemento: dados.complemento ?? "", bairro: dados.bairro ?? "", cidade: dados.cidade ?? "", uf: dados.uf ?? "", codigomunicipio: dados.codigoMunicipio ?? "" }] : [])
      .map((e, ordem) => ({ ordem, tipo: e.tipo || null, cep: digitos(e.cep ?? "") || null, logradouro: e.logradouro || null, numero: e.numero || null, complemento: e.complemento || null, bairro: e.bairro || null, cidade: e.cidade || null, codigoMunicipio: digitos(e.codigomunicipio ?? "") || null, uf: (e.uf ?? "").toUpperCase().slice(0, 2) || null }));
    // código do sistema anterior vira o código do cadastro, quando livre
    const n = Number(codigoTxt);
    const codigoLegado = Number.isInteger(n) && n > 0 && !(await prisma.pessoa.findFirst({ where: { [cfg.codigo]: n, ...(existente ? { NOT: { id: existente.id } } : {}) }, select: { id: true } })) ? n : null;
    if (codigoLegado) maiorCodigo = Math.max(maiorCodigo, codigoLegado);
    await prisma.$transaction(async (tx) => {
      if (existente) {
        // campos vazios na planilha não apagam o que já existe (ex.: fornecedor sem endereço que já era cliente)
        const preenchidos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== null && v !== ""));
        await tx.pessoa.update({
          where: { id: existente.id },
          data: { ...preenchidos, [papel]: true,
            ...(existente.idLegado === legado && cadastrado && dataBrHora(cadastrado) ? { createdAt: dataBrHora(cadastrado)! } : {}), ...(existente[cfg.codigo] == null && codigoLegado ? { [cfg.codigo]: codigoLegado } : {}),
            ...(existente._count.enderecos === 0 && listaEnd.length ? { enderecos: { create: listaEnd } } : {}) },
        });
        if (existente[cfg.codigo] == null && !codigoLegado) await garantirCodigo(tx, existente.id, papel);
        r.atualizados++;
      } else {
        await tx.pessoa.create({
          data: {
            ...dados, idLegado: legado, cliente: papel === "cliente", fornecedor: papel === "fornecedor", transportadora: papel === "transportadora",
            [cfg.codigo]: codigoLegado ?? (await proximoNumero(tx, cfg.sequencia)),
            ...(cadastrado && dataBrHora(cadastrado) ? { createdAt: dataBrHora(cadastrado)! } : {}),
            enderecos: { create: listaEnd },
          },
        });
        r.criados++;
      }
    });
  }
  if (!simular && maiorCodigo) {
    await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES (${cfg.sequencia}, ${maiorCodigo})
      ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, EXCLUDED.valor)`;
  }
  return r;
}

function dataBrHora(s: string): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s.trim());
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "12"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`) : null;
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
  const movimentados: string[] = [];
  const custosCorrigidos: string[] = [];
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
      // só preenche a conversão quando a planilha traz (reimportar não apaga a que foi ajustada à mão)
      ...(c(l, "unidadeCompra") && numeroBr(c(l, "fator")) > 0 ? { unidadeCompra: c(l, "unidadeCompra").toUpperCase().slice(0, 6), fatorConversao: numeroBr(c(l, "fator")) } : {}),
    };
    const estoque = numeroBr(c(l, "estoque"));
    if (estoque < 0) negativos.push(`${codigo} (${estoque})`);
    const existente = await prisma.produto.findUnique({ where: { codigo } });
    if (simular) {
      if (existente && Math.abs(Number(existente.custo) - dados.custo) > 0.00005) custosCorrigidos.push(`${codigo} (${Number(existente.custo).toFixed(2)} → ${dados.custo.toFixed(4)})`);
      if (existente) r.atualizados++; else r.criados++;
      continue;
    }

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
    // custo corrigido (ex.: era por caixa e passou a ser por metro): leva o custo novo às peças das OS, vendas e
    // entradas de implantação que guardaram o custo antigo, para a margem e a DRE ficarem certas
    if (existente && Math.abs(Number(existente.custo) - dados.custo) > 0.00005) {
      const antigo = existente.custo;
      const n = (await Promise.all([
        prisma.osItemProduto.updateMany({ where: { produtoId: prod.id, custoUnit: antigo }, data: { custoUnit: dados.custo } }),
        prisma.vendaItem.updateMany({ where: { produtoId: prod.id, custoUnit: antigo }, data: { custoUnit: dados.custo } }),
        prisma.movimentoEstoque.updateMany({ where: { produtoId: prod.id, custoUnit: antigo }, data: { custoUnit: dados.custo } }),
      ])).reduce((s, x) => s + x.count, 0);
      custosCorrigidos.push(`${codigo} (${Number(antigo).toFixed(2)} → ${dados.custo.toFixed(4)}${n ? `, ${n} lançamentos` : ""})`);
    }
    if (existente) r.atualizados++; else r.criados++;
    // valor de venda padrão (tabela Valores de venda) acompanha o preço importado
    const padrao = await prisma.tipoValor.findFirst({ where: { padrao: true } });
    if (padrao) {
      const lucro = dados.custo > 0 ? Math.min(9999999, Math.round(((dados.precoVenda - dados.custo) / dados.custo) * 10000) / 100) : 0;
      await prisma.produtoValor.upsert({
        where: { produtoId_tipoValorId: { produtoId: prod.id, tipoValorId: padrao.id } },
        create: { produtoId: prod.id, tipoValorId: padrao.id, valor: dados.precoVenda, lucroUtilizado: lucro },
        update: { valor: dados.precoVenda, lucroUtilizado: lucro },
      });
    }

    // o saldo só é ajustado enquanto o produto não teve movimento real no ERP (OS, venda, compra…)
    const jaMovimentou = existente && (await prisma.movimentoEstoque.count({ where: { produtoId: prod.id, NOT: { origemTipo: "IMPLANTACAO" } } })) > 0;
    if (jaMovimentou && opts.importarEstoque !== false) movimentados.push(codigo);
    if (opts.importarEstoque !== false && !jaMovimentou) {
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
  if (custosCorrigidos.length) r.avisos.push(`${custosCorrigidos.length} produtos já cadastrados ${simular ? "terão" : "tiveram"} o custo corrigido, junto com as peças de OS e vendas que usavam o custo antigo: ${custosCorrigidos.slice(0, 40).join(", ")}${custosCorrigidos.length > 40 ? "…" : ""}`);
  if (negativos.length) r.avisos.push(`${negativos.length} produtos com estoque negativo no sistema antigo ${simular ? "entrarão" : "entraram"} com 0 — conte-os no inventário: ${negativos.slice(0, 30).join(", ")}${negativos.length > 30 ? "…" : ""}`);
  if (movimentados.length) r.avisos.push(`${movimentados.length} produtos já movimentados no ERP mantiveram o estoque atual: ${movimentados.slice(0, 30).join(", ")}${movimentados.length > 30 ? "…" : ""}`);
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
      nome: nome.slice(0, 200), preco: numeroBr(c(l, "preco")), custo: numeroBr(c(l, "custo")),
      codigoTributacaoNacional: cTrib.length === 6 ? cTrib : null, ativo: !inativo(c(l, "situacao")), idLegado: `servico:${codigo}`,
    };
    const existente = await prisma.servico.findUnique({ where: { codigo } });
    if (simular) { if (existente) r.atualizados++; else r.criados++; continue; }
    if (existente) { await prisma.servico.update({ where: { id: existente.id }, data: dados }); r.atualizados++; }
    else { await prisma.servico.create({ data: { ...dados, codigo } }); r.criados++; }
  }
  return r;
}
