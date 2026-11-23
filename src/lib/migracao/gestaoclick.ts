import JSZip from "jszip";
import { createHash } from "node:crypto";
import { prisma, type Tx } from "@/lib/db";
import { liberarDocumento, reservarItem } from "@/lib/estoque/estoque";
import { baixarLancamento } from "@/lib/financeiro/lancamentos";
import { enumDe } from "@/lib/os/ordens";
import { lancaEstoque, lancaFinanceiro } from "@/lib/compras/tipos";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { proximoNumero } from "@/lib/sequencia";
import { lerPlanilha, normalizar, numeroBr, type Linha } from "./planilha";
import { importarPessoas, importarProdutos, importarServicos, type Resultado } from "./importar";
import { LOJA_ATUAL, naLoja } from "@/lib/empresa/loja";

/**
 * Backup completo do Gestão Click (.zip com uma pasta por módulo e planilhas
 * .xlsx; tabelas grandes vêm partidas em _1, _2…).
 */

export type Tabelas = Record<string, Linha[]>;

/** Lê o zip e junta as partes: "vendas/vendas_produtos_2.xlsx" entra em tabelas["vendas_produtos"]. */
export async function lerBackupGestaoClick(zip: Buffer): Promise<Tabelas> {
  const z = await JSZip.loadAsync(zip);
  const t: Tabelas = {};
  const nomes = Object.keys(z.files).filter((n) => /\.xlsx$/i.test(n) && !z.files[n].dir).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  if (!nomes.length) throw new Error("O arquivo não parece um backup do Gestão Click (nenhuma planilha .xlsx dentro do zip)");
  for (const n of nomes) {
    const base = n.split("/").pop()!.replace(/\.xlsx$/i, "");
    const chave = base === "produtos_2" ? "produtos" : base.replace(/_\d+$/, "");
    const { linhas } = await lerPlanilha(n, await z.files[n].async("nodebuffer"));
    (t[chave] ??= []).push(...linhas);
  }
  if (!t.clientes && !t.produtos) throw new Error("Backup sem clientes nem produtos: confira se é o backup completo do Gestão Click");
  return t;
}

export type Etapas = { cadastros?: boolean; estoque?: boolean; os?: boolean; orcamentos?: boolean; vendas?: boolean; compras?: boolean; receber?: boolean; pagar?: boolean; pagarVencidas?: boolean; historico?: boolean; pagas?: boolean; notas?: boolean; contratos?: boolean };
/** Segunda empresa (outro Gestão Click): tudo entra nesta loja, sem misturar números nem estoque com a primeira. */
export type Destino = { empresaId: string };

const chaveNome = (s: string | undefined) => normalizar(s ?? "");
const sim = (s: string) => (/^n[aã]o$/i.test(s.trim()) ? "Não" : "Sim");

/** "02/06/2025" ou "02/06/2025 17:56:24" → Date (meia-noite UTC; para @db.Date). */
export function dataBr(s: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((s ?? "").trim());
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : null;
}
/** Data e hora de São Paulo → instante. */
function dataHoraBr(s: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2})(?::(\d{2}))?)?/.exec((s ?? "").trim());
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "12"}:${m[5] ?? "00"}:${m[6] ?? "00"}-03:00`) : null;
}

// ---------- cadastros: transformam o layout do Gestão Click no layout que os importadores entendem

function linhasPessoas(cad: Linha[] | undefined, ends: Linha[] | undefined, tipoCol: string) {
  // todos os endereços; o principal (o primeiro) é o que não é só de entrega
  const ends2 = new Map<string, Linha[]>();
  for (const e of ends ?? []) (ends2.get(e.codigo) ?? ends2.set(e.codigo, []).get(e.codigo)!).push(e);
  return (cad ?? []).map((c) => {
    const lista = [...(ends2.get(c.codigo) ?? [])].sort((x, y) => Number(/entrega/i.test(x.tipo ?? "")) - Number(/entrega/i.test(y.tipo ?? "")));
    const e = lista[0] ?? {};
    const pj = c[tipoCol] === "PJ";
    const razao = c["razao social"];
    const nome = c.nome || c["nome fantasia"];
    return {
      codigo: c.codigo,
      nome: pj && razao ? razao : nome || razao || "",
      "nome fantasia": pj && razao && nome && chaveNome(nome) !== chaveNome(razao) ? nome : "",
      documento: pj ? c.cnpj || c.cpf : c.cpf || c.cnpj,
      "tipo de pessoa": c[tipoCol] === "PF" ? "física" : /estrang/i.test(c[tipoCol] ?? "") ? "estrangeiro" : "jurídica",
      rg: c.rg ?? "", "data de nascimento": c["data de nascimento"] ?? "", "nome social": c["nome social"] ?? "",
      ie: c["inscricao estadual"] ?? "", "inscricao municipal": c["inscricao municipal"] ?? "", responsavel: c.responsavel ?? "",
      email: c["e mail"] ?? "",
      telefone: c.telefone ?? "",
      celular: c.celular ?? "",
      observacoes: c.observacoes ?? "",
      "cadastrado em": c["cadastrado em"] ?? "",
      cep: e.cep ?? "", logradouro: e.logradouro ?? "", numero: e.numero ?? "", complemento: e.complemento ?? "",
      bairro: e.bairro ?? "", cidade: e.cidade ?? "", uf: e.uf ?? "",
      __enderecos: JSON.stringify(lista.map((x) => ({ tipo: x.tipo ?? "", cep: x.cep ?? "", logradouro: x.logradouro ?? "", numero: x.numero ?? "", complemento: x.complemento ?? "", bairro: x.bairro ?? "", cidade: x.cidade ?? "", uf: x.uf ?? "" }))),
      ativo: sim(c.ativo ?? c.situacao ?? ""),
    } as Linha;
  });
}

/** Unidade do Gestão Click → sigla de até 6 letras (a da NF-e). */
export function siglaUnidade(u: string | undefined) {
  const k = chaveNome(u ?? "");
  const MAPA: Record<string, string> = {
    unidade: "UN", un: "UN", un1: "UN", unid: "UN", peca: "PC", pc: "PC", metro: "MT", mt: "MT", m: "M",
    "metro quadrado": "M2", m2: "M2", quilograma: "KG", kg: "KG", caixa: "CX", cx: "CX", cx1: "CX", pacote: "PCT",
  };
  if (MAPA[k]) return MAPA[k];
  const t = (u ?? "").trim().toUpperCase().replace(/\s+/g, "");
  return t ? t.slice(0, 6) : "UN";
}

/**
 * No Gestão Click o estoque e o preço de venda são por unidade de SAÍDA, mas o custo é por unidade de ENTRADA
 * (ex.: cabo comprado em caixa de 305 m e vendido por metro). O backup não traz o fator de conversão:
 * quando as unidades diferem e o custo passa do preço de venda, tenta achar a metragem no nome ("305M");
 * se não achar, zera o custo e avisa (melhor sem custo do que com custo de uma caixa inteira por metro).
 */
export function custoPorSaida(x: Linha): { custo: number; ajuste?: string; semCusto?: boolean; unidadeCompra?: string; fator?: number } {
  const custo = numeroBr(x["valor de custo"] ?? "");
  const venda = numeroBr(x["valor varejo"] ?? "");
  const ent = siglaUnidade(x["unidade de entrada"]);
  const sai = siglaUnidade(x["unidade de saida"]);
  if (!x["unidade de entrada"] || ent === sai || custo <= 0 || venda <= 0 || custo <= venda) return { custo };
  const metros = sai === "MT" || sai === "M" ? /(\d{2,4})\s*(M|MT|METROS?)\b/i.exec(x.produto ?? "") : null;
  if (metros) {
    const fator = Number(metros[1]);
    return { custo: Math.round((custo / fator) * 10000) / 10000, unidadeCompra: ent, fator, ajuste: `${x.codigo}: ${custo.toFixed(2)} por ${ent} ÷ ${fator} = ${(custo / fator).toFixed(4)} por ${sai}` };
  }
  return { custo: 0, semCusto: true };
}

function linhasProdutos(p: Linha[] | undefined) {
  return (p ?? []).map((x) => {
    const un = siglaUnidade(x["unidade de saida"] || x["unidade de entrada"]);
    return {
      codigo: x.codigo, "codigo de barras": x["codigo de barra"] ?? "", nome: x.produto, grupo: x.grupo ?? "",
      unidade: un, "valor de venda": x["valor varejo"] ?? "", "valor de custo": custoPorSaida(x).custo.toFixed(4).replace(".", ","),
      // conversão achada pela metragem do nome (1 CX = 305 MT) vai para o cadastro: a próxima nota já converte
      "unidade de compra": custoPorSaida(x).unidadeCompra ?? "", "fator de conversao": custoPorSaida(x).fator ? String(custoPorSaida(x).fator) : "",
      "estoque atual": x["estoque atual"] ?? "", "estoque minimo": x["estoque minimo"] ?? "",
      ncm: x["codigo ncm"] ?? "", cest: x["codigo cest"] ?? "", ativo: sim(x.ativo ?? ""),
    } as Linha;
  });
}

/** Avisos da conversão de custo (entrada ≠ saída), para a simulação mostrar antes de gravar. */
function avisosUnidades(p: Linha[] | undefined, simular: boolean) {
  const ajustados: string[] = [];
  const semCusto: string[] = [];
  for (const x of p ?? []) {
    const r = custoPorSaida(x);
    if (r.ajuste) ajustados.push(r.ajuste);
    if (r.semCusto) semCusto.push(`${x.codigo} (${x.produto}: ${x["valor de custo"]} por ${x["unidade de entrada"]}, venda ${x["valor varejo"]} por ${x["unidade de saida"]})`);
  }
  const av: string[] = [];
  if (ajustados.length) av.push(`${ajustados.length} produtos comprados em caixa e vendidos por metro ${simular ? "terão" : "tiveram"} o custo dividido pela metragem do nome: ${ajustados.join("; ")}`);
  if (semCusto.length) av.push(`${semCusto.length} produtos têm o custo do Gestão Click por unidade de entrada, maior que o preço de venda, sem como converter: ${simular ? "entrarão" : "entraram"} com custo 0. Informe o custo por unidade de venda no cadastro: ${semCusto.join("; ")}`);
  return av;
}

function linhasServicos(s: Linha[] | undefined) {
  return (s ?? []).map((x) => ({ codigo: x["codigo interno"] || "", nome: x.servico, valor: x["valor unitario"] ?? "" }) as Linha);
}

// ---------- ordens de serviço (todas, na situação atual do Gestão Click)

/**
 * As OS entram com produtos, serviços, equipamentos, parcelas e histórico, na situação em que estão no Gestão Click.
 * Como nas vendas: as que estão em situação que reserva (Em aberto, Em andamento) reservam as peças; as que já lançaram
 * estoque lá (Concretizada, CONCLUIDA - FATURAR) entram sem movimento, porque o saldo do backup já vem descontado,
 * e devolvem as peças se forem canceladas ou editadas aqui (ver estadoEfetivo em os/ordens.ts). Nenhuma lança financeiro:
 * as contas em aberto vêm do próprio backup.
 */
async function importarOs(t: Tabelas, simular: boolean, historico = true): Promise<Resultado> {
  const todas = t.ordens_servicos ?? [];
  const r: Resultado = { tipo: "os", simulado: simular, lidas: todas.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  const N = "n da os";
  const agrupa = agruparPor(N);
  const prods = agrupa(t.ordens_servicos_produtos), servs = agrupa(t.ordens_servicos_servicos), equips = agrupa(t.ordens_servicos_equipamentos);
  const parcs = agrupa(t.ordens_servicos_pagamentos), hist = agrupa(t.ordens_servicos_situacoes);
  const situacoes = await prisma.situacaoOsConfig.findMany({ orderBy: { ordem: "asc" } });
  const sitPorNome = new Map(situacoes.map((s) => [chaveNome(s.nome), s]));
  const padrao = situacoes.find((s) => s.padrao) ?? situacoes[0];
  const ctx = await contextoComercial(t);
  const ultimaData = (hs: Linha[]) => hs.reduce<Date | null>((m, h) => { const d = dataHoraBr(h.data); return d && (!m || d >= m) ? d : m; }, null);
  const situacaoDe = (hs: Linha[]) => {
    // a última pela data; empate fica com a ordem do arquivo
    let ult: Linha | undefined, q = -Infinity;
    for (const [i, h] of hs.entries()) { const v = (dataHoraBr(h.data)?.getTime() ?? 0) + i / 1000; if (v >= q) { q = v; ult = h; } }
    return ult?.situacao ?? padrao?.nome ?? "";
  };
  const parcelasDe = (pg: Linha[], data: Date) => pg.map((x, i) => ({ numero: i + 1, vencimento: dataBr(x.vencimento) ?? data, valor: numeroBr(x["valor da parcela"]).toFixed(2), formaPagamentoId: ctx.formaPorNome(x["forma de pagamento"]), observacao: x.observacao || null }));
  const historicoDe = (hs: Linha[], data: Date) => hs.map((h) => ({ descricao: h.observacao || "Situação alterada", situacao: h.situacao || null, usuarioNome: h.funcionario || null, createdAt: dataHoraBr(h.data) ?? data }));

  const semProduto = new Set<string>(), semCliente = new Set<string>(), semSituacao = new Set<string>();
  const porSituacao = new Map<string, number>(), situacaoNova = new Map<string, number>();
  const mexidasNoErp: number[] = [], renumeradas: string[] = [];
  let fechadas = 0;
  const nomeSitDe = (id: string | null) => situacoes.find((s) => s.id === id)?.nome ?? "sem situação";
  const atualizarSituacaoImportada = (osId: string, sit: (typeof situacoes)[number], mudouEm: Date, novos: Linha[], data: Date) =>
    prisma.$transaction(async (tx) => {
      // o saldo do Gestão Click já desconta as peças das OS concretizadas lá, então aqui só se mexe na reserva;
      // OS que já teve baixa de verdade no MXERP não é tocada
      const baixas = await tx.movimentoEstoque.count({ where: { origemTipo: "OS", origemId: osId } });
      if (!baixas) {
        if (sit.estoque !== "RESERVAR") await liberarDocumento(tx, "OS", osId);
        else if (!(await tx.reserva.count({ where: { origemTipo: "OS", origemId: osId, status: "ATIVA" } })))
          for (const it of await tx.osItemProduto.findMany({ where: { osId } }))
            if (Number(it.quantidade) > 0) await reservarItem(tx, { produtoId: it.produtoId, quantidade: Number(it.quantidade), origemTipo: "OS", origemId: osId, origemItemId: it.id });
      }
      await tx.ordemServico.update({
        where: { id: osId },
        data: { situacaoId: sit.id, situacao: enumDe(sit), ...(sit.preencherSaida ? { saida: mudouEm } : sit.estoque === "RESERVAR" ? { saida: null } : {}), historico: { create: historicoDe(novos, data) } },
      });
    }, { timeout: 30000 });
  let maior = 0, reservadas = 0;
  for (const o of todas) {
    const numero = Number(o[N]);
    if (!numero) { r.ignorados.push({ linha: 0, motivo: "OS sem número" }); continue; }
    maior = Math.max(maior, numero);
    const ps = prods.get(o[N]) ?? [], ss = servs.get(o[N]) ?? [], hs = hist.get(o[N]) ?? [], eq = equips.get(o[N]) ?? [], pg = parcs.get(o[N]) ?? [];
    for (const p of ps) if (!ctx.codProduto.has(chaveNome(p.produto))) semProduto.add(p.produto);
    if (!ctx.codCliente.has(chaveNome(o.cliente))) semCliente.add(o.cliente);
    const nomeSit = situacaoDe(hs);
    const sit = sitPorNome.get(chaveNome(nomeSit)) ?? padrao;
    if (!sitPorNome.has(chaveNome(nomeSit))) semSituacao.add(nomeSit);
    const data = dataHoraBr(o["cadastrado em"]) ?? dataBr(o.data) ?? new Date();

    const existe = await prisma.ordemServico.findFirst({ where: destino ? { idLegado: leg(`os:${numero}`) } : { OR: [{ idLegado: `os:${numero}` }, { numero }] }, select: { id: true, idLegado: true, situacaoId: true, updatedAt: true, _count: { select: { parcelas: true } } } });
    if (existe && !simular) await moverParaLoja("ordemServico", existe.id, lojaDe(o.loja), "OS");
    // OS de uma importação anterior que mudou de situação no Gestão Click depois disso: passa para a situação atual
    if (existe && existe.idLegado === leg(`os:${numero}`) && sit && sitPorNome.has(chaveNome(nomeSit)) && existe.situacaoId !== sit.id) {
      const mudouEm = ultimaData(hs);
      if (mudouEm && mudouEm > existe.updatedAt) {
        situacaoNova.set(`${nomeSitDe(existe.situacaoId)} → ${sit.nome}`, (situacaoNova.get(`${nomeSitDe(existe.situacaoId)} → ${sit.nome}`) ?? 0) + 1);
        if (!simular) await atualizarSituacaoImportada(existe.id, sit, mudouEm, hs.filter((h) => (dataHoraBr(h.data)?.getTime() ?? 0) > existe.updatedAt.getTime()), data);
      } else if (mudouEm) mexidasNoErp.push(numero);
    }
    if (existe) {
      // OS trazida por uma importação anterior (só as abertas, sem parcelas): completa o que faltava
      if (existe.idLegado === leg(`os:${numero}`) && existe._count.parcelas === 0 && pg.length) {
        if (!simular)
          await prisma.ordemServico.update({
            where: { id: existe.id },
            data: {
              vendedorId: ctx.usuarioPorNome(o.vendedor), centroCusto: o["centro de custo"] || null, condicao: pg.length > 1 ? "PARCELADO" : "AVISTA",
              formaPagamentoId: ctx.formaPorNome(pg[0]?.["forma de pagamento"]), parcelas: { create: parcelasDe(pg, data) }, historico: { create: historicoDe(hs, data) },
            },
          });
        r.atualizados++;
      } else r.ignorados.push({ linha: numero, motivo: `OS ${numero} já existe no ERP` });
      continue;
    }
    if (!historico && !emAberto(sit)) { fechadas++; continue; }
    porSituacao.set(sit?.nome ?? nomeSit, (porSituacao.get(sit?.nome ?? nomeSit) ?? 0) + 1);
    if (sit?.estoque === "RESERVAR") reservadas++;
    if (simular) { r.criados++; continue; }
    if (!sit) throw new Error("Cadastre ao menos uma situação de OS antes de importar");

    const num = await numeroLivre("ordemServico", "OS", numero);
    if (num.trocado) renumeradas.push(`${numero} → ${num.numero}`);
    await prisma.$transaction(async (tx) => {
      const cliente = await ctx.cliente(tx, o.cliente, "uma OS");
      const itens = [];
      for (const [i, p] of ps.entries()) {
        const q = numeroBr(p.quantidade) || 1, vu = numeroBr(p["valor unitario"]), d = numeroBr(p.desconto ?? "");
        const produto = await ctx.produto(tx, p.produto, vu);
        if (!produto) continue;
        itens.push({ ordem: i, produtoId: produto.id, quantidade: q, valorUnit: vu.toFixed(2), custoUnit: produto.custo, desconto: d.toFixed(2), subtotal: (numeroBr(p["valor total"] ?? "") || vu * q - d).toFixed(2) });
      }
      const servicos = [];
      for (const [i, s] of ss.entries()) {
        const q = numeroBr(s.quantidade) || 1, vu = numeroBr(s["valor unitario"]), d = numeroBr(s.desconto ?? "");
        const servico = await ctx.servico(tx, s.servico, vu);
        servicos.push({ ordem: i, servicoId: servico.id, quantidade: q, valorUnit: vu.toFixed(2), desconto: d.toFixed(2), subtotal: (numeroBr(s["valor total"] ?? "") || vu * q - d).toFixed(2) });
      }
      const totalProdutos = itens.reduce((a, x) => a + Number(x.subtotal), 0);
      const totalServicos = servicos.reduce((a, x) => a + Number(x.subtotal), 0);
      const frete = numeroBr(o["valor frete"] ?? ""), desconto = numeroBr(o["desconto valor"] ?? "");
      const os = await tx.ordemServico.create({
        data: {
          numero: num.numero, idLegado: leg(`os:${numero}`), empresaId: lojaDe(o.loja), clienteId: cliente.id, vendedorId: ctx.usuarioPorNome(o.vendedor),
          entrada: data, previsao: dataBr(o["prazo de entrega"]), saida: sit.preencherSaida ? ultimaData(hs) : null,
          canal: o["canal de venda"] || "Presencial", centroCusto: o["centro de custo"] || null,
          observacoes: o.observacoes || null, observacaoInterna: o["observacoes interna"] || null,
          situacaoId: sit.id, situacao: enumDe(sit),
          frete: frete.toFixed(2), desconto: desconto.toFixed(2),
          totalProdutos: totalProdutos.toFixed(2), totalServicos: totalServicos.toFixed(2),
          total: (numeroBr(o["total do pedido"] ?? "") || totalProdutos + totalServicos + frete - desconto).toFixed(2),
          condicao: pg.length > 1 ? "PARCELADO" : "AVISTA", formaPagamentoId: ctx.formaPorNome(pg[0]?.["forma de pagamento"]),
          criadoPorId: ctx.usuarioPorNome(o["cadastrado por"]),
          createdAt: data, updatedAt: dataHoraBr(o["modificado em"]) ?? data,
          servicos: { create: servicos },
          equipamentos: {
            create: eq.filter((x) => x.equipamento || x.defeitos || x.marca || x.modelo).map((x, i) => ({
              ordem: i + 1, equipamento: x.equipamento || "Equipamento", marca: x.marca || null, modelo: x.modelo || null, serie: x.serie || null,
              condicoes: x.condicoes || null, defeitos: x.defeitos || null, acessorios: x.acessorios || null,
              solucao: x.solucao || null, laudo: x["laudo tecnico"] || null, garantia: x["termos de garantia"] || null,
            })),
          },
          parcelas: { create: parcelasDe(pg, data) },
          historico: { create: historicoDe(hs, data) },
        },
      });
      for (const it of itens) {
        const item = await tx.osItemProduto.create({ data: { ...it, osId: os.id } });
        if (sit.estoque === "RESERVAR" && it.quantidade > 0) await reservarItem(tx, { produtoId: it.produtoId, quantidade: it.quantidade, origemTipo: "OS", origemId: os.id, origemItemId: item.id });
      }
      await tx.osHistorico.create({ data: { osId: os.id, descricao: `${sit.estoque === "LANCAR" ? "Migrada do Gestão Click (peças já baixadas lá)" : "Migrada do Gestão Click"}${num.trocado || destino ? ` · ${notaTroca(numero)}` : ""}`, situacao: nomeSit } });
    }, { timeout: 30000 });
    r.criados++;
  }
  // numeração continua de onde o Gestão Click parou
  const maxVenda = Math.max(0, ...(t.vendas ?? []).map((v) => Number(v["n do pedido"]) || 0));
  if (!simular) {
    for (const [chave, valor] of [["OS", maior], ["VENDA", maxVenda]] as const)
      if (valor > 0) await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES (${chave}, ${valor}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${valor})`;
  }
  r.avisos.push(`A numeração continua do Gestão Click: próxima OS nº ${maior + 1}${maxVenda ? `, próxima venda nº ${maxVenda + 1}` : ""}.`);
  if (porSituacao.size) r.avisos.push(`OS novas por situação: ${[...porSituacao].map(([k, v]) => `${k} ${v}`).join(", ")}. ${reservadas} em aberto ou em andamento ${simular ? "vão reservar" : "reservaram"} as peças; as concretizadas entram sem mexer no estoque nem no financeiro (o backup já traz o saldo e as contas em aberto).`);
  if (renumeradas.length) r.avisos.push(`${renumeradas.length} OS tinham o mesmo número de uma OS da outra empresa e ganharam número novo (o do Gestão Click fica no histórico): ${renumeradas.slice(0, 20).join(", ")}${renumeradas.length > 20 ? "…" : ""}`);
  if (fechadas) r.avisos.push(`${fechadas} OS já concluídas ou canceladas no Gestão Click ficaram de fora (histórico desmarcado).`);
  if (situacaoNova.size) r.avisos.push(`${[...situacaoNova.values()].reduce((a, b) => a + b, 0)} OS já trazidas antes mudaram de situação no Gestão Click e ${simular ? "vão passar" : "passaram"} para a atual (a reserva das peças acompanha): ${[...situacaoNova].map(([k, v]) => `${k}: ${v}`).join("; ")}.`);
  if (mexidasNoErp.length) r.avisos.push(`${mexidasNoErp.length} OS foram alteradas no MXERP depois da importação anterior e ficaram como estão no MXERP: ${mexidasNoErp.slice(0, 30).join(", ")}${mexidasNoErp.length > 30 ? "…" : ""}`);
  if (r.atualizados) r.avisos.push(`${r.atualizados} OS já trazidas antes ${simular ? "vão ganhar" : "ganharam"} as parcelas, o vendedor e o histórico do Gestão Click.`);
  if (semProduto.size) r.avisos.push(`${semProduto.size} produtos citados em OS não existem mais no cadastro e ${simular ? "serão criados" : "foram criados"} como inativos (código GC-…), sem estoque: ${[...semProduto].slice(0, 20).join("; ")}${semProduto.size > 20 ? "…" : ""}`);
  if (semCliente.size) r.avisos.push(`${semCliente.size} clientes de OS não estão no cadastro e ${simular ? "serão criados" : "foram criados"} só com o nome: ${[...semCliente].slice(0, 20).join("; ")}${semCliente.size > 20 ? "…" : ""}`);
  if (semSituacao.size) r.avisos.push(`Situações sem correspondente no ERP (entraram na situação padrão): ${[...semSituacao].join(", ")}`);
  return r;
}

// ---------- apoio comum a orçamentos e vendas (o histórico comercial)

async function contextoComercial(t: Tabelas) {
  const codProduto = new Map<string, string>();
  for (const p of t.produtos ?? []) if (!codProduto.has(chaveNome(p.produto))) codProduto.set(chaveNome(p.produto), p.codigo);
  const codServico = new Map<string, string>();
  for (const s of t.servicos ?? []) codServico.set(chaveNome(s.servico), s["codigo interno"] || s.servico.slice(0, 20).toUpperCase());
  const codCliente = new Map<string, string>();
  for (const c of t.clientes ?? []) for (const n of [c.nome, c["razao social"]]) if (n && !codCliente.has(chaveNome(n))) codCliente.set(chaveNome(n), c.codigo);
  const formas = await prisma.formaPagamento.findMany({ select: { id: true, nome: true } });
  const formaPorNome = (n: string | undefined) => {
    if (!n) return null;
    const k = chaveNome(n);
    return formas.find((f) => chaveNome(f.nome) === k)?.id ?? formas.find((f) => chaveNome(f.nome) === chaveNome(formaPara(n) ?? ""))?.id ?? null;
  };
  const usuarios = await prisma.usuario.findMany({ select: { id: true, nome: true } });
  const usuarioPorNome = (n: string | undefined) => (n ? usuarios.find((u) => chaveNome(u.nome) === chaveNome(n))?.id ?? null : null);

  /** Cliente pelo código do cadastro ou pelo nome; sem cadastro, entra só com o nome. */
  const cliente = async (tx: Tx, nome: string, origem: string) => {
    const codCli = codCliente.get(chaveNome(nome));
    return (codCli && (await tx.pessoa.findUnique({ where: { idLegado: leg(`cliente:${codCli}`) } }))) ||
      (await tx.pessoa.findFirst({ where: { OR: [{ nome: { equals: nome, mode: "insensitive" } }, { fantasia: { equals: nome, mode: "insensitive" } }] } })) ||
      (await tx.pessoa.create({ data: { nome: nome || "Cliente não informado", idLegado: `cliente-orc:${nome}`, observacoes: `Criado na migração a partir de ${origem}`, codigoCliente: await proximoNumero(tx, "CLIENTE") } }));
  };
  /** Produto pelo código; se já foi excluído no Gestão Click, entra inativo e sem estoque para o documento ficar completo. */
  const produto = async (tx: Tx, nome: string, valor: number) => {
    const cod = codProduto.get(chaveNome(nome));
    return (cod ? await tx.produto.findUnique({ where: { codigo: cod }, select: { id: true, custo: true } }) : null) ?? (nome ? await tx.produto.upsert({
      where: { idLegado: `produto-orc:${chaveNome(nome)}` }, update: {}, select: { id: true, custo: true },
      create: { codigo: "GC-" + createHash("sha1").update(chaveNome(nome)).digest("hex").slice(0, 8).toUpperCase(), nome: nome.slice(0, 200), precoVenda: valor.toFixed(2), ativo: false, controlaEstoque: false, idLegado: `produto-orc:${chaveNome(nome)}` },
    }) : null);
  };
  const servico = async (tx: Tx, nome: string, valor: number) => {
    const codigo = codServico.get(chaveNome(nome)) ?? nome.slice(0, 20).toUpperCase();
    return tx.servico.upsert({ where: { codigo }, create: { codigo, nome, preco: valor, idLegado: `servico:${codigo}` }, update: {}, select: { id: true } });
  };
  return { codProduto, codCliente, formaPorNome, usuarioPorNome, cliente, produto, servico };
}

const agruparPor = (col: string) => (ls: Linha[] | undefined) => {
  const m = new Map<string, Linha[]>();
  for (const l of ls ?? []) m.set(l[col], [...(m.get(l[col]) ?? []), l]);
  return m;
};

// ---------- vendas (todas: histórico comercial, base para trocas e devoluções)

/**
 * As vendas entram com itens, parcelas e histórico, na situação atual do Gestão Click.
 * Estoque e financeiro já estão no backup (saldo atual e contas em aberto), então as vendas
 * concretizadas não geram movimento nem lançamento. As que estão em aberto/andamento reservam as peças,
 * como no MXERP. Se uma venda migrada concretizada for cancelada ou editada, o estoque volta (ver pedidos.ts).
 */
async function importarVendas(t: Tabelas, simular: boolean, historico = true): Promise<Resultado> {
  const todas = t.vendas ?? [];
  const r: Resultado = { tipo: "vendas", simulado: simular, lidas: todas.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  const N = "n do pedido";
  const agrupa = agruparPor(N);
  const prods = agrupa(t.vendas_produtos), servs = agrupa(t.vendas_servicos), parcs = agrupa(t.vendas_pagamentos), hist = agrupa(t.vendas_historicos);
  const situacoes = await prisma.situacaoVendaConfig.findMany({ orderBy: { ordem: "asc" } });
  const sitPorNome = new Map(situacoes.map((s) => [chaveNome(s.nome), s]));
  const padrao = situacoes.find((s) => s.padrao) ?? situacoes[0];
  const ctx = await contextoComercial(t);
  const ENUM = { RESERVAR: "ABERTA", LANCAR: "CONCLUIDA", NAO: "CANCELADA" } as const;

  const semProduto = new Set<string>(), semCliente = new Set<string>(), semSituacao = new Set<string>();
  const renumeradas: string[] = [];
  let maior = 0, reservadas = 0, fechadas = 0;
  for (const v of todas) {
    const numero = Number(v[N]);
    if (!numero) { r.ignorados.push({ linha: 0, motivo: "Venda sem número" }); continue; }
    maior = Math.max(maior, numero);
    const ps = prods.get(v[N]) ?? [], ss = servs.get(v[N]) ?? [], hs = hist.get(v[N]) ?? [];
    for (const p of ps) if (!ctx.codProduto.has(chaveNome(p.produto))) semProduto.add(p.produto);
    const consumidor = !v.cliente || /^consumidor/i.test(v.cliente.trim());
    if (!consumidor && !ctx.codCliente.has(chaveNome(v.cliente))) semCliente.add(v.cliente);
    const nomeSit = hs.length ? hs[hs.length - 1].situacao : padrao?.nome ?? "";
    const sit = sitPorNome.get(chaveNome(nomeSit)) ?? padrao;
    if (!sitPorNome.has(chaveNome(nomeSit))) semSituacao.add(nomeSit);
    const existe = await prisma.venda.findFirst({ where: destino ? { idLegado: leg(`venda:${numero}`) } : { OR: [{ idLegado: `venda:${numero}` }, { numero }] }, select: { id: true } });
    if (existe && !simular) await moverParaLoja("venda", existe.id, lojaDe(v.loja), "VENDA");
    if (existe) { r.ignorados.push({ linha: numero, motivo: `Venda ${numero} já existe no ERP` }); continue; }
    if (!historico && !emAberto(sit)) { fechadas++; continue; }
    if (sit?.estoque === "RESERVAR") reservadas++;
    if (simular) { r.criados++; continue; }
    if (!sit) throw new Error("Cadastre ao menos uma situação de venda antes de importar");
    const num = await numeroLivre("venda", "VENDA", numero);
    if (num.trocado) renumeradas.push(`${numero} → ${num.numero}`);

    await prisma.$transaction(async (tx) => {
      const cliente = consumidor ? null : await ctx.cliente(tx, v.cliente, "uma venda");
      const itens = [];
      for (const [i, p] of ps.entries()) {
        const q = numeroBr(p.quantidade) || 1, vu = numeroBr(p["valor unitario"]), d = numeroBr(p.desconto ?? "");
        const produto = await ctx.produto(tx, p.produto, vu);
        if (!produto) continue;
        itens.push({ ordem: i, produtoId: produto.id, quantidade: q, valorUnit: vu.toFixed(2), custoUnit: produto.custo, desconto: d.toFixed(2), subtotal: (numeroBr(p["valor total"] ?? "") || vu * q - d).toFixed(2) });
      }
      const servicos = [];
      for (const [i, s] of ss.entries()) {
        const q = numeroBr(s.quantidade) || 1, vu = numeroBr(s["valor unitario"]), d = numeroBr(s.desconto ?? "");
        const servico = await ctx.servico(tx, s.servico, vu);
        servicos.push({ ordem: i, servicoId: servico.id, quantidade: q, valorUnit: vu.toFixed(2), desconto: d.toFixed(2), subtotal: (numeroBr(s["valor total"] ?? "") || vu * q - d).toFixed(2) });
      }
      const pg = parcs.get(v[N]) ?? [];
      const totalProdutos = itens.reduce((a, x) => a + Number(x.subtotal), 0);
      const totalServicos = servicos.reduce((a, x) => a + Number(x.subtotal), 0);
      const data = dataBr(v.data) ?? new Date();
      const venda = await tx.venda.create({
        data: {
          numero: num.numero, idLegado: leg(`venda:${numero}`), empresaId: lojaDe(v.loja), tipo: itens.length === 0 && servicos.length > 0 ? "SERVICO" : "PEDIDO",
          clienteId: cliente?.id ?? null, vendedorId: ctx.usuarioPorNome(v.vendedor), data, prazoEntrega: dataBr(v["prazo de entrega"]),
          canal: v["canal de venda"] || "Presencial", centroCusto: v["centro de custo"] || null,
          observacoes: v.observacoes || null, observacaoInterna: v["observacoes interna"] || null,
          situacaoId: sit.id, situacao: ENUM[sit.estoque],
          frete: numeroBr(v["valor frete"] ?? "").toFixed(2), desconto: numeroBr(v["desconto valor"] ?? "").toFixed(2),
          totalProdutos: totalProdutos.toFixed(2), totalServicos: totalServicos.toFixed(2), total: (numeroBr(v["total do pedido"] ?? "") || totalProdutos + totalServicos).toFixed(2),
          condicao: pg.length > 1 ? "PARCELADO" : "AVISTA", formaPagamentoId: ctx.formaPorNome(pg[0]?.["forma de pagamento"]),
          criadoPorId: ctx.usuarioPorNome(v["cadastrado por"]),
          createdAt: dataHoraBr(v["cadastrado em"]) ?? data, updatedAt: dataHoraBr(v["modificado em"]) ?? dataHoraBr(v["cadastrado em"]) ?? data,
          servicos: { create: servicos },
          parcelas: { create: pg.map((x, i) => ({ numero: i + 1, vencimento: dataBr(x.vencimento) ?? data, valor: numeroBr(x["valor da parcela"]).toFixed(2), formaPagamentoId: ctx.formaPorNome(x["forma de pagamento"]), observacao: x.observacao || null })) },
          historico: { create: hs.map((h) => ({ descricao: h.observacao || "Situação alterada", situacao: h.situacao || null, usuarioNome: h.funcionario || null, createdAt: dataHoraBr(h.data) ?? data })) },
        },
      });
      for (const it of itens) {
        const item = await tx.vendaItem.create({ data: { ...it, vendaId: venda.id } });
        if (sit.estoque === "RESERVAR" && it.quantidade > 0) await reservarItem(tx, { produtoId: it.produtoId, quantidade: it.quantidade, origemTipo: "VENDA", origemId: venda.id, origemItemId: item.id });
      }
      await tx.vendaHistorico.create({ data: { vendaId: venda.id, descricao: `${sit.estoque === "LANCAR" ? "Migrada do Gestão Click (estoque e financeiro já lançados lá)" : "Migrada do Gestão Click"}${num.trocado || destino ? ` · ${notaTroca(numero)}` : ""}`, situacao: nomeSit } });
    }, { timeout: 30000 });
    r.criados++;
  }
  if (!simular && maior > 0)
    await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('VENDA', ${maior}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${maior})`;
  r.avisos.push(`A numeração continua do Gestão Click: próxima venda nº ${maior + 1}.`);
  r.avisos.push(`As vendas concretizadas entram sem mexer no estoque nem no financeiro (o backup já traz o saldo e as contas em aberto). ${reservadas} venda(s) em aberto ou em andamento ${simular ? "vão reservar" : "reservaram"} as peças.`);
  if (semProduto.size) r.avisos.push(`${semProduto.size} produtos citados em vendas não existem mais no cadastro e ${simular ? "serão criados" : "foram criados"} como inativos (código GC-…), sem estoque: ${[...semProduto].slice(0, 20).join("; ")}${semProduto.size > 20 ? "…" : ""}`);
  if (semCliente.size) r.avisos.push(`${semCliente.size} clientes de vendas não estão no cadastro e ${simular ? "serão criados" : "foram criados"} só com o nome: ${[...semCliente].slice(0, 20).join("; ")}${semCliente.size > 20 ? "…" : ""}`);
  if (semSituacao.size) r.avisos.push(`Situações sem correspondente no ERP (entraram na situação padrão): ${[...semSituacao].join(", ")}`);
  if (renumeradas.length) r.avisos.push(`${renumeradas.length} vendas tinham o mesmo número de uma venda da outra empresa e ganharam número novo (o do Gestão Click fica no histórico): ${renumeradas.slice(0, 20).join(", ")}${renumeradas.length > 20 ? "…" : ""}`);
  if (fechadas) r.avisos.push(`${fechadas} vendas já concluídas ou canceladas no Gestão Click ficaram de fora (histórico desmarcado).`);
  return r;
}

// ---------- orçamentos (todos: são o histórico comercial e continuam a numeração)

async function importarOrcamentos(t: Tabelas, simular: boolean): Promise<Resultado> {
  const todos = t.orcamentos ?? [];
  const r: Resultado = { tipo: "orcamentos", simulado: simular, lidas: todos.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  const N = "n do orcamento";
  const agrupa = (ls: Linha[] | undefined) => {
    const m = new Map<string, Linha[]>();
    for (const l of ls ?? []) m.set(l[N], [...(m.get(l[N]) ?? []), l]);
    return m;
  };
  const prods = agrupa(t.orcamentos_produtos), servs = agrupa(t.orcamentos_servicos), parcs = agrupa(t.orcamentos_pagamentos), hist = agrupa(t.orcamentos_historicos);

  const situacoes = await prisma.situacaoOrcamento.findMany({ orderBy: { ordem: "asc" } });
  const sitPorNome = new Map(situacoes.map((s) => [chaveNome(s.nome), s.id]));
  const ctx = await contextoComercial(t);
  const { codProduto, codCliente, formaPorNome, usuarioPorNome } = ctx;

  const semProduto = new Set<string>(), semCliente = new Set<string>(), semSituacao = new Set<string>(), totalDiferente: number[] = [];
  let maior = 0;
  for (const o of todos) {
    const numero = Number(o[N]);
    if (!numero) { r.ignorados.push({ linha: 0, motivo: "Orçamento sem número" }); continue; }
    maior = Math.max(maior, numero);
    const ps = prods.get(o[N]) ?? [], ss = servs.get(o[N]) ?? [], hs = hist.get(o[N]) ?? [];
    for (const p of ps) if (!codProduto.has(chaveNome(p.produto))) semProduto.add(p.produto);
    if (!codCliente.has(chaveNome(o.cliente))) semCliente.add(o.cliente);
    const nomeSit = hs.length ? hs[hs.length - 1].situacao : "Em aberto";
    const situacaoId = sitPorNome.get(chaveNome(nomeSit)) ?? situacoes[0]?.id;
    if (!sitPorNome.has(chaveNome(nomeSit))) semSituacao.add(nomeSit);
    const itensGc = [...ps, ...ss].reduce((a, x) => a + numeroBr(x["valor total"] ?? ""), 0) + numeroBr(o["valor frete"] ?? "") - numeroBr(o["desconto valor"] ?? "");
    if (o["total do pedido"] && Math.abs(itensGc - numeroBr(o["total do pedido"])) > 0.01) totalDiferente.push(numero);
    const existe = await prisma.orcamento.findFirst({ where: destino ? { idLegado: leg(`orcamento:${numero}`) } : { OR: [{ idLegado: `orcamento:${numero}` }, { numero }] }, select: { id: true } });
    if (existe && !simular) await moverParaLoja("orcamento", existe.id, lojaDe(o.loja), null);
    if (existe) { r.ignorados.push({ linha: numero, motivo: `Orçamento ${numero} já existe no ERP` }); continue; }
    if (simular) { r.criados++; continue; }
    const num = await numeroLivre("orcamento", "ORCAMENTO", numero);
    if (!situacaoId) throw new Error("Cadastre ao menos uma situação de orçamento antes de importar");

    await prisma.$transaction(async (tx) => {
      const cliente = await ctx.cliente(tx, o.cliente, "um orçamento");
      const itens = [];
      for (const [i, p] of ps.entries()) {
        const q = numeroBr(p.quantidade) || 1, v = numeroBr(p["valor unitario"]), d = numeroBr(p.desconto ?? "");
        const produto = await ctx.produto(tx, p.produto, v);
        if (!produto) continue;
        itens.push({ ordem: i + 1, produtoId: produto.id, quantidade: q, valorUnit: v.toFixed(2), desconto: d.toFixed(2), subtotal: (numeroBr(p["valor total"] ?? "") || v * q - d).toFixed(2) });
      }
      const servicos = [];
      for (const [i, s] of ss.entries()) {
        const q = numeroBr(s.quantidade) || 1, v = numeroBr(s["valor unitario"]), d = numeroBr(s.desconto ?? "");
        const servico = await ctx.servico(tx, s.servico, v);
        servicos.push({ ordem: i + 1, servicoId: servico.id, quantidade: q, valorUnit: v.toFixed(2), desconto: d.toFixed(2), subtotal: (numeroBr(s["valor total"] ?? "") || v * q - d).toFixed(2) });
      }
      const pg = parcs.get(o[N]) ?? [];
      const totalProdutos = itens.reduce((a, x) => a + Number(x.subtotal), 0);
      const totalServicos = servicos.reduce((a, x) => a + Number(x.subtotal), 0);
      const data = dataBr(o.data) ?? new Date();
      const orc = await tx.orcamento.create({
        data: {
          numero: num.numero, idLegado: leg(`orcamento:${numero}`), empresaId: lojaDe(o.loja), tipo: itens.length === 0 && servicos.length > 0 ? "SERVICO" : "PRODUTO",
          clienteId: cliente.id, vendedorId: usuarioPorNome(o.vendedor), data, prazoEntrega: dataBr(o["prazo de entrega"]),
          validade: o["validade da proposta"] || null, aosCuidados: o["aos cuidados de"] || null, canal: o["canal de venda"] || "Presencial",
          centroCusto: o["centro de custo"] || null, introducao: o.introducao || null, observacoes: o.observacoes || null, observacaoInterna: o["observacoes interna"] || null,
          situacaoId, frete: numeroBr(o["valor frete"] ?? "").toFixed(2), desconto: numeroBr(o["desconto valor"] ?? "").toFixed(2),
          totalProdutos: totalProdutos.toFixed(2), totalServicos: totalServicos.toFixed(2), total: (numeroBr(o["total do pedido"] ?? "") || totalProdutos + totalServicos).toFixed(2),
          gerarCondicoes: pg.length > 0, condicao: pg.length > 1 ? "PARCELADO" : "AVISTA", formaPagamentoId: formaPorNome(pg[0]?.["forma de pagamento"]),
          criadoPorId: usuarioPorNome(o["cadastrado por"]),
          createdAt: dataHoraBr(o["cadastrado em"]) ?? data, updatedAt: dataHoraBr(o["modificado em"]) ?? dataHoraBr(o["cadastrado em"]) ?? data,
          produtos: { create: itens }, servicos: { create: servicos },
          parcelas: { create: pg.map((x, i) => ({ numero: i + 1, vencimento: dataBr(x.vencimento) ?? data, valor: numeroBr(x["valor da parcela"]).toFixed(2), formaPagamentoId: formaPorNome(x["forma de pagamento"]), observacao: x.observacao || null })) },
          historico: { create: hs.map((h) => ({ descricao: h.observacao || "Situação alterada", situacao: h.situacao || null, usuarioNome: h.funcionario || null, createdAt: dataHoraBr(h.data) ?? data })) },
        },
      });
      await tx.orcamentoHistorico.create({ data: { orcamentoId: orc.id, descricao: `Migrado do Gestão Click${num.trocado || destino ? ` · ${notaTroca(numero)}` : ""}`, situacao: nomeSit } });
    }, { timeout: 30000 });
    r.criados++;
  }
  if (!simular && maior > 0)
    await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('ORCAMENTO', ${maior}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${maior})`;
  r.avisos.push(`A numeração continua do Gestão Click: próximo orçamento nº ${maior + 1}.`);
  if (semProduto.size) r.avisos.push(`${semProduto.size} produtos citados em orçamentos não existem mais no cadastro e ${simular ? "serão criados" : "foram criados"} como inativos (código GC-…), sem estoque: ${[...semProduto].slice(0, 20).join("; ")}${semProduto.size > 20 ? "…" : ""}`);
  if (semCliente.size) r.avisos.push(`${semCliente.size} clientes de orçamentos não estão no cadastro e ${simular ? "serão criados" : "foram criados"} só com o nome: ${[...semCliente].slice(0, 20).join("; ")}${semCliente.size > 20 ? "…" : ""}`);
  if (totalDiferente.length) r.avisos.push(`${totalDiferente.length} orçamentos têm no backup um total diferente da soma dos itens (o backup não trouxe algum item). Mantivemos o total do Gestão Click: ${totalDiferente.slice(0, 30).join(", ")}${totalDiferente.length > 30 ? "…" : ""}`);
  if (semSituacao.size) r.avisos.push(`Situações sem correspondente no ERP (entraram na primeira situação): ${[...semSituacao].join(", ")}`);
  return r;
}

// ---------- contas a receber / a pagar em aberto

function categoriaPara(plano: string, tipo: "RECEBER" | "PAGAR") {
  const p = chaveNome(plano);
  if (tipo === "RECEBER") return /servic/.test(p) ? "Prestação de serviços" : /venda/.test(p) ? "Venda de produtos" : "Outras receitas";
  return /compra/.test(p) ? "Compra de mercadorias (estoque)" : "Outras despesas";
}
function formaPara(f: string) {
  const p = chaveNome(f);
  return /pix/.test(p) ? "PIX" : /boleto/.test(p) ? "Boleto" : /debito/.test(p) ? "Cartão de débito" : /credito/.test(p) ? "Cartão de crédito"
    : /dinheiro/.test(p) ? "Dinheiro" : null;
}

async function importarContas(linhas: Linha[] | undefined, tipo: "RECEBER" | "PAGAR", simular: boolean, soAVencer = false, incluirPagas = false): Promise<Resultado> {
  const todas = linhas ?? [];
  const hoje = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  let abertas = todas.filter((l) => !/confirmad/i.test(l.situacao));
  const deFora = soAVencer ? abertas.filter((l) => (dataBr(l["data do vencimento"])?.getTime() ?? 0) < hoje.getTime()) : [];
  if (soAVencer) abertas = abertas.filter((l) => !deFora.includes(l));
  const r: Resultado = { tipo: tipo === "RECEBER" ? "receber" : "pagar", simulado: simular, lidas: todas.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  const vencidas = abertas.filter((l) => (dataBr(l["data do vencimento"])?.getTime() ?? 0) < Date.now() - 86400000);
  const soma = (ls: Linha[]) => ls.reduce((s, l) => s + numeroBr(l.valor), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  r.avisos.push(`${abertas.length} contas em aberto (${soma(abertas)}), das quais ${vencidas.length} já vencidas (${soma(vencidas)}).${incluirPagas ? "" : " As já pagas/recebidas não entram."}`);
  if (deFora.length) r.avisos.push(`${deFora.length} contas vencidas (${soma(deFora)}) ficaram de fora por já terem sido pagas fora do sistema.`);

  if (!simular) {
    await prisma.$transaction((tx) => garantirPadroes(tx));
    // contas bancárias do Gestão Click (Inter, PagSeguro, Mercado Pago…) para a conciliação do extrato
    for (const nome of new Set(todas.map((l) => (l["conta bancaria"] ?? "").trim()).filter(Boolean)))
      await prisma.contaBancaria.upsert({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: nome } }, create: { nome }, update: {} });
  }
  const ocorr = new Map<string, number>();
  for (const [i, l] of abertas.entries()) {
    const venc = dataBr(l["data do vencimento"]);
    const valor = numeroBr(l.valor);
    if (!venc || !(valor > 0)) { r.ignorados.push({ linha: i + 2, motivo: !venc ? "sem vencimento" : "valor zerado" }); continue; }
    const base = [tipo, l["descricao do recebimento"], l["entidade nome"], l["data do vencimento"], l.valor, l["cadastrado em"]].join("|");
    const n = (ocorr.get(base) ?? 0) + 1;
    ocorr.set(base, n);
    const idLegado = leg(`${tipo.toLowerCase()}:${createHash("sha1").update(`${base}|${n}`).digest("hex").slice(0, 20)}`);
    const existe = await prisma.lancamento.findUnique({ where: { idLegado } });
    if (existe) { r.ignorados.push({ linha: i + 2, motivo: "já importada" }); continue; }
    if (simular) { r.criados++; continue; }
    const nomeEnt = l["entidade nome"];
    const pessoa = nomeEnt
      ? await prisma.pessoa.findFirst({ where: { OR: [{ nome: { equals: nomeEnt, mode: "insensitive" } }, { fantasia: { equals: nomeEnt, mode: "insensitive" } }] } })
      : null;
    const cat = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome: categoriaPara(l["plano de contas"], tipo), tipo } } });
    const formaNome = formaPara(l["forma de pagamento"] ?? "");
    const forma = formaNome ? await prisma.formaPagamento.findUnique({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: formaNome } } }) : null;
    await prisma.lancamento.create({
      data: {
        tipo, descricao: [l["descricao do recebimento"], !pessoa && nomeEnt ? `(${nomeEnt})` : ""].filter(Boolean).join(" ").slice(0, 300),
        pessoaId: pessoa?.id, categoriaId: cat.id, formaPagamentoId: forma?.id,
        valor: valor.toFixed(2), vencimento: venc, competencia: dataBr(l["data de competencia"]) ?? venc,
        origemTipo: "IMPLANTACAO", idLegado, empresaId: lojaDe(l.loja),
      },
    });
    r.criados++;
  }

  // contas trazidas por uma importação anterior e pagas/recebidas depois no Gestão Click: baixa aqui também
  // (as já baixadas ou conciliadas no MXERP ficam como estão). Com `incluirPagas`, as que nunca vieram entram
  // já baixadas (histórico para o fluxo de caixa e a DRE).
  const ocorrPagas = new Map<string, number>();
  let baixadas = 0, totalBaixado = 0, historicas = 0, totalHistorico = 0, jaNoExtrato = 0;
  const historicoPaga = async (l: Linha, idLegado: string, juros: number, desconto: number) => {
    const valor = numeroBr(l.valor), venc = dataBr(l["data do vencimento"]);
    if (!venc || !(valor > 0)) return;
    const pagoEm = dataBr(l["data de confirmacao"]) ?? venc;
    const valorPago = numeroBr(l["valor total"] ?? "") || valor + juros - desconto;
    // pagamento que já entrou no MXERP pelo extrato do banco (lançado direto na conciliação): não lança de novo
    const doExtrato = await prisma.lancamento.findFirst({
      where: { tipo, idLegado: { startsWith: "extrato:" }, valorPago: valorPago.toFixed(2), pagoEm: { gte: new Date(pagoEm.getTime() - 3 * 86400000), lte: new Date(pagoEm.getTime() + 3 * 86400000) } },
      select: { id: true },
    });
    if (doExtrato) { jaNoExtrato++; return; }
    historicas++;
    totalHistorico += valorPago;
    if (simular) return;
    const nomeEnt = l["entidade nome"];
    const pessoa = nomeEnt ? await prisma.pessoa.findFirst({ where: { OR: [{ nome: { equals: nomeEnt, mode: "insensitive" } }, { fantasia: { equals: nomeEnt, mode: "insensitive" } }] } }) : null;
    const cat = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { empresaId_nome_tipo: { empresaId: LOJA_ATUAL, nome: categoriaPara(l["plano de contas"], tipo), tipo } } });
    const formaNome = formaPara(l["forma de pagamento"] ?? "");
    const forma = formaNome ? await prisma.formaPagamento.findUnique({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: formaNome } } }) : null;
    const nomeConta = (l["conta bancaria"] ?? "").trim() || "Gestão Click";
    const conta = await prisma.contaBancaria.upsert({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: nomeConta } }, create: { nome: nomeConta }, update: {} });
    await prisma.lancamento.create({
      data: {
        tipo, descricao: [l["descricao do recebimento"], !pessoa && nomeEnt ? `(${nomeEnt})` : ""].filter(Boolean).join(" ").slice(0, 300),
        pessoaId: pessoa?.id, categoriaId: cat.id, formaPagamentoId: forma?.id, contaBancariaId: conta.id,
        valor: valor.toFixed(2), vencimento: venc, competencia: dataBr(l["data de competencia"]) ?? venc,
        pagoEm, valorPago: valorPago.toFixed(2), juros: juros.toFixed(2), desconto: desconto.toFixed(2),
        origemTipo: "IMPLANTACAO", idLegado, empresaId: lojaDe(l.loja), observacao: "Baixada no Gestão Click (histórico importado)",
      },
    });
  };
  for (const l of todas.filter((x) => /confirmad/i.test(x.situacao))) {
    const base = [tipo, l["descricao do recebimento"], l["entidade nome"], l["data do vencimento"], l.valor, l["cadastrado em"]].join("|");
    const n = (ocorrPagas.get(base) ?? 0) + 1;
    ocorrPagas.set(base, n);
    const idLegado = leg(`${tipo.toLowerCase()}:${createHash("sha1").update(`${base}|${n}`).digest("hex").slice(0, 20)}`);
    const ja = await prisma.lancamento.findUnique({ where: { idLegado }, select: { id: true, valor: true, pagoEm: true, transacaoId: true } });
    const juros = numeroBr(l.juros ?? ""), desconto = numeroBr(l.desconto ?? "");
    if (!ja) {
      if (incluirPagas) await historicoPaga(l, idLegado, juros, desconto);
      continue;
    }
    if (ja.pagoEm || ja.transacaoId) continue;
    const aberta = ja;
    const valorPago = numeroBr(l["valor total"] ?? "") || Number(aberta.valor) + juros - desconto;
    baixadas++;
    totalBaixado += valorPago;
    if (simular) continue;
    const nomeConta = (l["conta bancaria"] ?? "").trim() || "Gestão Click";
    const conta = await prisma.contaBancaria.upsert({ where: { empresaId_nome: { empresaId: LOJA_ATUAL, nome: nomeConta } }, create: { nome: nomeConta }, update: {} });
    await prisma.$transaction(async (tx) => {
      await baixarLancamento(tx, aberta.id, { data: dataBr(l["data de confirmacao"]) ?? hoje, contaBancariaId: conta.id, juros, desconto, valorPago });
      await tx.lancamento.update({ where: { id: aberta.id }, data: { observacao: "Baixada no Gestão Click (importação do backup)" } });
    });
  }
  if (historicas) {
    r.criados += historicas;
    r.avisos.push(`${historicas} contas já ${tipo === "RECEBER" ? "recebidas" : "pagas"} no Gestão Click (${totalHistorico.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) ${simular ? "vão entrar" : "entraram"} baixadas, como histórico.`);
  }
  if (jaNoExtrato) r.avisos.push(`${jaNoExtrato} contas já ${tipo === "RECEBER" ? "recebidas" : "pagas"} no Gestão Click ficaram de fora porque o mesmo valor, na mesma data, já foi lançado pela conciliação do extrato.`);
  if (baixadas) {
    r.atualizados += baixadas;
    r.avisos.push(`${baixadas} contas trazidas antes ${tipo === "RECEBER" ? "foram recebidas" : "foram pagas"} depois no Gestão Click (${totalBaixado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) e ${simular ? "vão ser baixadas" : "foram baixadas"} aqui com a data de confirmação de lá.`);
  }
  return r;
}

// ---------- compras e ajustes de estoque

/**
 * Compras de produtos com itens, parcelas e histórico, na situação atual do Gestão Click.
 * O estoque e as contas já estão no backup, então as compras em situação que lança entram marcadas como
 * recebidas e com o financeiro "já lançado lá", sem movimento nem conta nova. As que estão em aberto
 * entram sem nada e, ao serem confirmadas no MXERP, dão entrada e geram as contas a pagar normalmente.
 */
async function importarCompras(t: Tabelas, simular: boolean): Promise<Resultado> {
  const todas = t.compras ?? [];
  const r: Resultado = { tipo: "compras", simulado: simular, lidas: todas.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  const N = "n da compra";
  const agrupa = agruparPor("codigo");
  const prods = agrupa(t.compras_produtos), parcs = agrupa(t.compras_pagamentos), hist = agrupa(t.compras_historicos);
  const situacoes = await prisma.situacaoCompraConfig.findMany({ orderBy: { ordem: "asc" } });
  const sitPorNome = new Map(situacoes.map((s) => [chaveNome(s.nome), s]));
  const padrao = situacoes.find((s) => s.padrao) ?? situacoes[0];
  const ctx = await contextoComercial(t);
  const transportadoras = new Map<string, string | null>();
  const situacaoDe = (hs: Linha[]) => {
    let ult: Linha | undefined, q = -Infinity;
    for (const [i, h] of hs.entries()) { const v = (dataHoraBr(h.data)?.getTime() ?? 0) + i / 1000; if (v >= q) { q = v; ult = h; } }
    return ult?.situacao ?? padrao?.nome ?? "";
  };
  // o CNPJ do emitente está dentro da chave da NF-e (posições 7 a 20): acha o fornecedor mesmo com outro nome
  const cnpjDaChave = (chave: string | undefined) => { const d = (chave ?? "").replace(/\D/g, ""); return d.length === 44 ? d.slice(6, 20) : null; };
  const buscarFornecedor = (db: Tx | typeof prisma, nome: string, cnpj: string | null) =>
    db.pessoa.findFirst({ where: { OR: [...(cnpj ? [{ documento: cnpj }] : []), { nome: { equals: nome, mode: "insensitive" } }, { fantasia: { equals: nome, mode: "insensitive" } }] }, orderBy: { fornecedor: "desc" }, select: { id: true, fornecedor: true, documento: true } });
  const fornecedor = async (tx: Tx, nome: string, cnpj: string | null) => {
    const f = (cnpj ? await tx.pessoa.findUnique({ where: { documento: cnpj }, select: { id: true, fornecedor: true } }) : null) ?? (await buscarFornecedor(tx, nome, null));
    if (f) { if (!f.fornecedor) await tx.pessoa.update({ where: { id: f.id }, data: { fornecedor: true } }); return f.id; }
    const legado = `fornecedor-compra:${cnpj ?? chaveNome(nome)}`;
    return (await tx.pessoa.findUnique({ where: { idLegado: legado }, select: { id: true } }))?.id ?? (await tx.pessoa.create({ data: { nome: nome || "Fornecedor não informado", fornecedor: true, documento: cnpj, idLegado: legado, observacoes: "Criado na migração a partir de uma compra", codigoFornecedor: await proximoNumero(tx, "FORNECEDOR") } })).id;
  };
  const semSituacao = new Set<string>(), semFornecedor = new Set<string>();
  const porSituacao = new Map<string, number>();
  let maior = 0;
  for (const c of todas) {
    const numero = Number(c[N]);
    if (!numero) { r.ignorados.push({ linha: 0, motivo: "Compra sem número" }); continue; }
    maior = Math.max(maior, numero);
    const ps = prods.get(c[N]) ?? [], pg = parcs.get(c[N]) ?? [], hs = hist.get(c[N]) ?? [];
    const nomeSit = situacaoDe(hs);
    const sit = sitPorNome.get(chaveNome(nomeSit)) ?? padrao;
    if (!sitPorNome.has(chaveNome(nomeSit))) semSituacao.add(nomeSit);
    if (await prisma.compra.findFirst({ where: destino ? { idLegado: leg(`compra:${numero}`) } : { OR: [{ idLegado: `compra:${numero}` }, { numero }] }, select: { id: true } })) { r.ignorados.push({ linha: numero, motivo: `Compra ${numero} já existe no ERP` }); continue; }
    if (!(await buscarFornecedor(prisma, c.fornecedor, cnpjDaChave(c["chave nf e"])))) semFornecedor.add(c.fornecedor);
    porSituacao.set(sit?.nome ?? nomeSit, (porSituacao.get(sit?.nome ?? nomeSit) ?? 0) + 1);
    if (simular) { r.criados++; continue; }
    const num = await numeroLivre("compra", "COMPRA", numero);
    if (!sit) throw new Error("Cadastre ao menos uma situação de compra antes de importar");
    const data = dataBr(c["data de emissao"]) ?? dataBr(c["cadastrado em"]) ?? new Date();
    const cadastro = dataHoraBr(c["cadastrado em"]) ?? data;
    const lanca = lancaEstoque(sit.lancamento), financeiro = lancaFinanceiro(sit.lancamento);
    await prisma.$transaction(async (tx) => {
      const fornecedorId = await fornecedor(tx, c.fornecedor, cnpjDaChave(c["chave nf e"]));
      const tnome = c.transportadora?.trim();
      if (tnome && !transportadoras.has(tnome)) transportadoras.set(tnome, (await tx.pessoa.findFirst({ where: { transportadora: true, OR: [{ nome: { equals: tnome, mode: "insensitive" } }, { fantasia: { equals: tnome, mode: "insensitive" } }] }, select: { id: true } }))?.id ?? null);
      const itens = [];
      for (const [i, p] of ps.entries()) {
        const q = numeroBr(p.quantidade) || 1, cu = numeroBr(p["custo unitario"]);
        const produto = await ctx.produto(tx, p.produto, cu);
        if (!produto) continue;
        // no GC a compra vem na unidade de entrada (CX): se o produto tem conversão e o preço é de caixa (> preço de venda), a linha leva o fator
        const pc = await tx.produto.findUnique({ where: { id: produto.id }, select: { unidadeCompra: true, fatorConversao: true, precoVenda: true } });
        const conv = pc?.unidadeCompra && Number(pc.fatorConversao) > 1 && cu > Number(pc.precoVenda) ? { unidadeCompra: pc.unidadeCompra, fator: Number(pc.fatorConversao).toFixed(4) } : {};
        itens.push({ ordem: i, produtoId: produto.id, quantidade: q, custoUnit: cu.toFixed(4), desconto: "0", subtotal: (numeroBr(p["custo total"] ?? "") || cu * q).toFixed(2), ...conv });
      }
      const totalProdutos = numeroBr(c["total dos produtos"] ?? "") || itens.reduce((a, x) => a + Number(x.subtotal), 0);
      const frete = numeroBr(c["valor frete"] ?? ""), desconto = numeroBr(c["desconto valor"] ?? "");
      await tx.compra.create({
        data: {
          numero: num.numero, idLegado: leg(`compra:${numero}`), empresaId: lojaDe(c.loja), tipo: "PRODUTO", fornecedorId, data, situacaoId: sit.id,
          numeroNfe: (c["numero da nf e"] ?? "").replace(/\D/g, "") || null, chaveNfe: (c["chave nf e"] ?? "").replace(/^NFe/, "") || null,
          transportadoraId: tnome ? transportadoras.get(tnome) ?? null : null,
          frete: frete.toFixed(2), freteNoTotal: !/^n[aã]o$/i.test(c["pagar frete"] ?? ""), desconto: desconto.toFixed(2),
          totalProdutos: totalProdutos.toFixed(2), total: (numeroBr(c["total da compra"] ?? "") || totalProdutos + frete - desconto).toFixed(2),
          condicao: pg.length > 1 ? "PARCELADO" : "AVISTA", formaPagamentoId: ctx.formaPorNome(pg[0]?.["forma de pagamento"]),
          observacoes: c.observacoes || null, criadoPorId: ctx.usuarioPorNome(c["cadastrado por"]),
          recebida: lanca, financeiroNoLegado: financeiro,
          createdAt: cadastro, updatedAt: dataHoraBr(c["modificado em"]) ?? cadastro,
          itens: { create: itens },
          parcelas: { create: pg.map((x, i) => ({ numero: i + 1, vencimento: dataBr(x.vencimento) ?? data, valor: numeroBr(x["valor da parcela"]).toFixed(2), formaPagamentoId: ctx.formaPorNome(x["forma de pagamento"]), observacao: x.observacao || null })) },
          historico: { create: [...hs.map((h) => ({ descricao: h.observacao || "Situação alterada", situacao: h.situacao || null, usuarioNome: h.funcionario || null, createdAt: dataHoraBr(h.data) ?? cadastro })), { descricao: `${lanca ? "Migrada do Gestão Click (estoque e contas já lançados lá)" : "Migrada do Gestão Click"}${num.trocado || destino ? ` · ${notaTroca(numero)}` : ""}`, situacao: sit.nome }] },
        },
      });
    }, { timeout: 30000 });
    r.criados++;
  }
  if (!simular && maior > 0) await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('COMPRA', ${maior}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${maior})`;
  r.avisos.push(`A numeração continua do Gestão Click: próxima compra nº ${maior + 1}.`);
  if (porSituacao.size) r.avisos.push(`Compras novas por situação: ${[...porSituacao].map(([k, v]) => `${k} ${v}`).join(", ")}. As confirmadas entram sem mexer no estoque nem no financeiro (o backup já traz o saldo e as contas); as em aberto lançam quando forem confirmadas no MXERP.`);
  if (semFornecedor.size) r.avisos.push(`${semFornecedor.size} fornecedores de compras não estão no cadastro e ${simular ? "serão criados" : "foram criados"} com o nome e o CNPJ da NF-e: ${[...semFornecedor].slice(0, 20).join("; ")}${semFornecedor.size > 20 ? "…" : ""}`);
  if (semSituacao.size) r.avisos.push(`Situações de compra sem correspondente no ERP (entraram na situação padrão): ${[...semSituacao].join(", ")}`);
  return r;
}

/** Ajustes de estoque como histórico: o saldo atual já vem do backup, então entram sem movimento. */
async function importarAjustes(t: Tabelas, simular: boolean): Promise<Resultado> {
  const todos = t.ajustes_estoques ?? [];
  const r: Resultado = { tipo: "ajustes", simulado: simular, lidas: todos.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  const prods = agruparPor("codigo")(t.ajustes_estoques_produtos);
  const ctx = await contextoComercial(t);
  let maior = 0;
  for (const a of todos) {
    const numero = Number(a.codigo);
    if (!numero) { r.ignorados.push({ linha: 0, motivo: "Ajuste sem código" }); continue; }
    maior = Math.max(maior, numero);
    if (await prisma.ajusteEstoque.findFirst({ where: destino ? { idLegado: leg(`ajuste:${numero}`) } : { OR: [{ idLegado: `ajuste:${numero}` }, { numero }] }, select: { id: true } })) { r.ignorados.push({ linha: numero, motivo: `Ajuste ${numero} já existe no ERP` }); continue; }
    if (simular) { r.criados++; continue; }
    const num = await numeroLivre("ajusteEstoque", "AJUSTE", numero);
    const ps = prods.get(a.codigo) ?? [];
    await prisma.$transaction(async (tx) => {
      const itens = [];
      for (const [i, p] of ps.entries()) {
        const produto = await ctx.produto(tx, p.produto, 0);
        if (!produto) continue;
        const q = numeroBr(p.quantidade), cu = Number(produto.custo);
        itens.push({ ordem: i, produtoId: produto.id, quantidade: q, custoUnit: cu.toFixed(4), total: (q * cu).toFixed(2) });
      }
      const frete = numeroBr(a["valor frete"] ?? "");
      await tx.ajusteEstoque.create({
        data: {
          numero: num.numero, idLegado: leg(`ajuste:${numero}`), empresaId: destino?.empresaId, tipo: /sa[ií]da/i.test(a.movimentacao) ? "SAIDA" : "ENTRADA", frete: frete.toFixed(2),
          total: (itens.reduce((s, x) => s + Number(x.total), 0) + frete).toFixed(2), observacoes: [a.observacoes, num.trocado || destino ? notaTroca(numero) : ""].filter(Boolean).join(" · ") || null,
          criadoPorId: ctx.usuarioPorNome(a["cadastrado por"]), criadoPorNome: a["cadastrado por"] || null, createdAt: dataHoraBr(a["cadastrado em"]) ?? new Date(),
          itens: { create: itens },
        },
      });
    });
    r.criados++;
  }
  if (!simular && maior > 0) await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('AJUSTE', ${maior}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${maior})`;
  r.avisos.push(`Os ajustes entram como histórico, sem mexer no saldo (o estoque atual já vem do backup). Próximo ajuste nº ${maior + 1}.`);
  return r;
}

// ---------- lojas: a coluna "Loja" do backup vira a empresa (pelo nome fantasia ou razão social)

let lojasPorNome = new Map<string, string>();
/** Importação de outra empresa (outro Gestão Click) para uma loja: prefixo nos ids legados e loja fixa. */
let destino: { empresaId: string; cnpj: string; nome: string } | null = null;
const leg = (s: string) => (destino ? `${destino.cnpj}:${s}` : s);
type ModeloNumerado = "ordemServico" | "venda" | "orcamento" | "compra" | "ajusteEstoque";
/**
 * Número do documento no MXERP: o do Gestão Click; na importação de outra empresa, se o número já for de um
 * documento da primeira, ganha o próximo livre (o original fica no histórico).
 */
async function numeroLivre(modelo: ModeloNumerado, seq: string, numero: number) {
  const m = prisma[modelo] as unknown as { findUnique: (a: object) => Promise<unknown> };
  if (!destino || !(await m.findUnique({ where: { numero }, select: { id: true } }))) return { numero, trocado: false };
  let n: number;
  do n = await prisma.$transaction((tx) => proximoNumero(tx, seq)); while (await m.findUnique({ where: { numero: n }, select: { id: true } }));
  return { numero: n, trocado: true };
}
const notaTroca = (numero: number) => `Nº ${numero} no Gestão Click${destino ? ` de ${destino.nome}` : ""}`;

/** Ainda em aberto: reserva as peças, ou já lançou o estoque mas falta faturar (ex.: "CONCLUIDA - FATURAR"). */
function emAberto(sit: { estoque: string; financeiro: boolean } | undefined) {
  return !sit || sit.estoque === "RESERVAR" || (sit.estoque === "LANCAR" && !sit.financeiro);
}
const chaveLoja = chaveNome;
/** Documento já importado antes do cadastro das lojas: passa para a loja certa (com o financeiro dele). */
async function moverParaLoja(modelo: "ordemServico" | "venda" | "orcamento", id: string, empresaId: string | undefined, origem: "OS" | "VENDA" | null) {
  if (!empresaId) return;
  await (prisma[modelo] as unknown as { updateMany: (a: object) => Promise<unknown> }).updateMany({ where: { id, OR: [{ empresaId: null }, { empresaId: { not: empresaId } }] }, data: { empresaId } });
  if (origem) await prisma.lancamento.updateMany({ where: { origemTipo: origem, origemId: id, OR: [{ empresaId: null }, { empresaId: { not: empresaId } }] }, data: { empresaId } });
}
/** Empresa da loja do Gestão Click; undefined se não houver empresa com esse nome (fica a loja atual, ou nenhuma). */
const lojaDe = (nome: string | undefined) => destino?.empresaId ?? (nome ? lojasPorNome.get(chaveLoja(nome)) : undefined);

// ---------- notas fiscais emitidas no Gestão Click (só consulta) e a numeração que continua delas

const STATUS_GC: Record<string, "AUTORIZADA" | "CANCELADA" | "REJEITADA" | "DENEGADA" | "INUTILIZADA"> = {
  aprovada: "AUTORIZADA", autorizada: "AUTORIZADA", cancelada: "CANCELADA", reprovada: "REJEITADA", rejeitada: "REJEITADA", denegada: "DENEGADA", inutilizada: "INUTILIZADA",
};

async function importarNotas(t: Tabelas, simular: boolean): Promise<Resultado> {
  const tabelas: [ModeloGc, Linha[]][] = [["NFE", t.notas_fiscais ?? []], ["NFCE", t.notas_fiscais_consumidor ?? []], ["NFSE", t.notas_fiscais_servicos ?? []]];
  const r: Resultado = { tipo: "notas", simulado: simular, lidas: tabelas.reduce((s, [, ls]) => s + ls.length, 0), criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  const empresas = await prisma.empresa.findMany({ select: { id: true, cnpj: true } });
  const cnpjDe = (id: string | undefined) => empresas.find((e) => e.id === id)?.cnpj;
  const maiores = new Map<string, number>();
  const porModelo = new Map<string, number>();
  for (const [modelo, linhas] of tabelas) {
    for (const [i, l] of linhas.entries()) {
      // NFS-e: o número que o MXERP controla é o da DPS (o RPS no Gestão Click); a NFS-e tem o número dado pelo governo
      const numero = Number(modelo === "NFSE" ? l.rps || l.numero : l.numero), serie = Number(l.serie) || 1;
      if (!numero) { r.ignorados.push({ linha: i + 2, motivo: "nota sem número" }); continue; }
      const ambiente = /homolog/i.test(l.ambiente ?? "") ? "HOMOLOGACAO" : "PRODUCAO";
      const chave = digitosGc(l.chave ?? "");
      const empresaId = destino?.empresaId || (chave.length === 44 && empresas.find((e) => e.cnpj === chave.slice(6, 20))?.id) || lojaDe(l.loja) || (empresas.length === 1 ? empresas[0].id : undefined);
      const cnpj = cnpjDe(empresaId);
      if (cnpj && ambiente === "PRODUCAO") {
        const k = modelo === "NFSE" ? `DPS-${cnpj}-${serie}-P` : `NF-${cnpj}-${modelo === "NFE" ? 55 : 65}-${serie}-P`;
        maiores.set(k, Math.max(maiores.get(k) ?? 0, numero));
      }
      const idLegado = leg(`nota:${modelo}:${serie}:${numero}:${ambiente}`);
      const ja = await prisma.notaFiscal.findFirst({ where: { OR: [{ idLegado }, { empresaId: empresaId ?? null, modelo, serie, numero, ambiente }, ...(chave.length === 44 ? [{ chave }] : [])] }, select: { id: true } });
      if (ja) { r.ignorados.push({ linha: i + 2, motivo: `${modelo} ${numero} já existe no ERP` }); continue; }
      porModelo.set(modelo, (porModelo.get(modelo) ?? 0) + 1);
      r.criados++;
      if (simular) continue;
      const status = modelo === "NFSE" ? "AUTORIZADA" : STATUS_GC[chaveNome(l.situacao ?? "")] ?? "AUTORIZADA";
      const emitidaEm = dataHoraBr(`${l["data de emissao"]} ${l["hora de emissao"] || "12:00:00"}`) ?? dataBr(l["data de emissao"]);
      const destinatario = modelo === "NFSE" ? l["razao social"] : l["nome do destinatario"];
      await prisma.notaFiscal.create({
        data: {
          modelo, serie, numero, ambiente, status, empresaId: empresaId ?? null, idLegado,
          chave: chave.length === 44 ? chave : null, protocolo: l.protocolo || null, emitidaEm,
          valorTotal: numeroBr(modelo === "NFSE" ? l["valor do servico"] : l["valor total"]).toFixed(2),
          destinatarioNome: destinatario ? destinatario.slice(0, 200) : null,
          motivo: modelo === "NFSE" ? `Emitida no Gestão Click (NFS-e nº ${l.numero})` : `Emitida no Gestão Click${l["natureza de operacao"] ? ` · ${l["natureza de operacao"]}` : ""}`,
          ...(emitidaEm ? { createdAt: emitidaEm } : {}),
        },
      });
    }
  }
  // a numeração do MXERP continua depois da última nota do Gestão Click (nunca volta para trás)
  if (!simular)
    for (const [chave, valor] of maiores)
      await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES (${chave}, ${valor}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${valor})`;
  if (porModelo.size) r.avisos.push(`Notas do Gestão Click para consulta (sem XML): ${[...porModelo].map(([m, n]) => `${m === "NFE" ? "NF-e" : m === "NFCE" ? "NFC-e" : "NFS-e"} ${n}`).join(", ")}.`);
  if (maiores.size) r.avisos.push(`A numeração das notas continua do Gestão Click: ${[...maiores].map(([k, v]) => `${k.startsWith("DPS") ? "DPS" : k.includes("-65-") ? "NFC-e" : "NF-e"} série ${k.split("-").at(-2)} a partir do nº ${v + 1}`).join("; ")}.`);
  else if (r.lidas) r.avisos.push("Cadastre a empresa (CNPJ) antes: sem ela a numeração das notas não pode continuar a do Gestão Click.");
  return r;
}
type ModeloGc = "NFE" | "NFCE" | "NFSE";
const digitosGc = (s: string) => s.replace(/\D/g, "");

// ---------- serviços recorrentes (contratos)

/**
 * Serviços recorrentes do Gestão Click viram contratos EM ABERTO: ficam cadastrados com o próximo vencimento, mas só
 * começam a gerar venda e boleto quando forem ativados no MXERP (para não cobrar em dobro enquanto o GC ainda cobra).
 */
async function importarContratos(t: Tabelas, simular: boolean): Promise<Resultado> {
  const todos = t.servicos_recorrentes ?? [];
  const r: Resultado = { tipo: "contratos", simulado: simular, lidas: todos.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  if (!todos.length) return r;
  const servs = agruparPor("codigo")(t.servicos_recorrentes_servicos);
  const ctx = await contextoComercial(t);
  let total = 0, ativos = 0, primeira: Date | null = null;
  const conferir: string[] = [];
  const renumerados: string[] = [];
  for (const c of todos) {
    const numero = Number(c["n do contrato"]);
    if (!numero) { r.ignorados.push({ linha: 0, motivo: "contrato sem número" }); continue; }
    const idLegado = leg(`contrato:${numero}`);
    if (await prisma.contrato.findUnique({ where: { idLegado }, select: { id: true } })) { r.ignorados.push({ linha: numero, motivo: `contrato ${numero} já trazido` }); continue; }
    const proximo = /^\d{4}-\d{2}-\d{2}/.test(c["proximo vencimento"] ?? "") ? new Date(`${c["proximo vencimento"].slice(0, 10)}T00:00:00Z`) : dataBr(c["proximo vencimento"]);
    if (!proximo) { r.ignorados.push({ linha: numero, motivo: `contrato ${numero} sem próximo vencimento` }); continue; }
    const valor = numeroBr(c["valor total"]);
    total += valor;
    r.criados++;
    if (simular) continue;
    const rep = (c["repetir esta venda"] ?? "").toLowerCase();
    const meses = Number(/(\d+)/.exec(rep)?.[1] ?? 1) * (/ano/.test(rep) ? 12 : 1);
    const periodicidade = meses >= 12 ? "ANUAL" : meses >= 6 ? "SEMESTRAL" : meses >= 3 ? "TRIMESTRAL" : "MENSAL";
    const vezes = Number(/(\d+)/.exec(c["quantidade de vezes"] ?? "")?.[1] ?? 0);
    const envio = (c["enviar por e mail"] ?? "").toLowerCase();
    const ocupado = await prisma.contrato.findUnique({ where: { numero }, select: { id: true } });
    const num = ocupado ? Math.max((await prisma.contrato.aggregate({ _max: { numero: true } }))._max.numero ?? 0, (await prisma.sequencia.findUnique({ where: { chave: "CONTRATO" } }))?.valor ?? 0) + 1 : numero;
    if (ocupado) renumerados.push(`${numero} → ${num}`);
    const inicio = dataHoraBr(c["cadastrado em"]) ?? new Date();
    const antecedencia = Number(/(\d+)/.exec(c["gerar fatura"] ?? "")?.[1] ?? 10);
    const geraEm = new Date(proximo.getTime() - antecedencia * 86400000);
    // vencimento que já devia ter sido faturado: fica em aberto para conferir se o Gestão Click já cobrou
    const atrasado = geraEm.getTime() < Date.now() - 86400000;
    const ativo = !/n[aã]o/i.test(c["gerar servico"] ?? "") && !atrasado;
    if (atrasado) conferir.push(`${num} (${proximo.toISOString().slice(0, 10).split("-").reverse().join("/")})`);
    if (ativo) { ativos++; if (!primeira || geraEm < primeira) primeira = geraEm; }
    await prisma.$transaction(async (tx) => {
      const cliente = await ctx.cliente(tx, c.cliente, "um contrato");
      const itens = [];
      for (const [i, s] of (servs.get(c["n do contrato"]) ?? []).entries()) {
        const q = numeroBr(s.quantidade) || 1, vu = numeroBr(s["valor unit"]);
        const servico = await ctx.servico(tx, s.servico, vu);
        itens.push({ ordem: i, servicoId: servico.id, quantidade: q, valorUnit: vu.toFixed(2), subtotal: (numeroBr(s["valor total"]) || q * vu).toFixed(2) });
      }
      await tx.contrato.create({
        data: {
          numero: num, idLegado, empresaId: lojaDe(c.loja) ?? null, clienteId: cliente.id, vendedorId: ctx.usuarioPorNome(c.vendedor),
          situacao: ativo ? "ATIVO" : "EM_ABERTO", canal: c["canal de venda"] || "Presencial",
          dataInicio: new Date(inicio.toISOString().slice(0, 10) + "T00:00:00Z"), periodicidade, diaVencimento: proximo.getUTCDate(), proximoVencimento: proximo,
          termino: vezes > 0 ? "VEZES" : "SEM", totalCobrancas: vezes > 0 ? vezes : null,
          totalServicos: itens.reduce((a, x) => a + Number(x.subtotal), 0).toFixed(2), total: valor.toFixed(2),
          formaPagamentoId: ctx.formaPorNome(c["forma de pagamento"]),
          diasAntecedencia: antecedencia,
          enviarBoleto: /boleto/.test(envio), diasLembrete: /lembrete/.test(envio) ? 0 : null, canalEmail: !/n[aã]o enviar/.test(envio),
          observacoes: c.observacoes || null, criadoPorId: ctx.usuarioPorNome(c["cadastrado por"]),
          createdAt: inicio,
          servicos: { create: itens },
          historico: { create: [{ descricao: `Migrado do Gestão Click (serviço recorrente nº ${numero}${destino ? ` de ${destino.nome}` : ""}): ${ativo ? "ativo, cobra a partir do próximo vencimento que o Gestão Click ainda não gerou" : "parado no Gestão Click, entra em aberto"}` }] },
        },
      });
    });
  }
  if (!simular) {
    const max = (await prisma.contrato.aggregate({ _max: { numero: true } }))._max.numero ?? 0;
    await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES ('CONTRATO', ${max}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${max})`;
  }
  r.avisos.push(`${r.criados} contratos (serviços recorrentes), somando ${total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} por cobrança${simular ? "" : `: ${ativos} ativos e ${r.criados - ativos} em aberto`}. Os ativos cobram a partir do próximo vencimento do Gestão Click${primeira ? ` (a primeira fatura sai em ${primeira.toLocaleDateString("pt-BR", { timeZone: "UTC" })})` : ""}: pare a cobrança no Gestão Click antes disso, para não cobrar em dobro.`);
  if (conferir.length) r.avisos.push(`${conferir.length} contratos ficaram em aberto porque o próximo vencimento já devia ter sido faturado. Confira no Gestão Click se já cobrou e ative em Contratos: ${conferir.join(", ")}`);
  if (renumerados.length) r.avisos.push(`${renumerados.length} contratos ganharam número novo porque o número já existia: ${renumerados.join(", ")}`);
  return r;
}

/** Unidades usadas nos produtos (venda e compra) que ainda não estão no cadastro de unidades. */
async function cadastrarUnidades() {
  const usadas = await prisma.$queryRaw<{ sigla: string }[]>`
    SELECT DISTINCT u AS sigla FROM (SELECT unidade AS u FROM "Produto" UNION SELECT "unidadeCompra" FROM "Produto") x WHERE u IS NOT NULL AND u <> ''`;
  let n = 0;
  for (const { sigla } of usadas) {
    if (await prisma.unidade.findUnique({ where: { sigla } })) continue;
    await prisma.unidade.create({ data: { sigla, nome: NOME_UNIDADE[sigla] ?? sigla } });
    n++;
  }
  return n;
}
const NOME_UNIDADE: Record<string, string> = {
  UN: "Unidade", PC: "Peça", MT: "Metro", M: "Metro", CX: "Caixa", CX1: "Caixa", KG: "Quilograma", LT: "Litro", L: "Litro", PCT: "Pacote", RL: "Rolo", KIT: "Kit", PAR: "Par", M2: "Metro quadrado", HR: "Hora",
};

// ---------- orquestração

/**
 * Importa o backup. Roda "dentro" da empresa de destino (ou da principal): o plano de contas, as formas de
 * pagamento, as contas bancárias e as situações usados são os dela.
 */
export async function importarBackupGestaoClick(t: Tabelas, opts: { simular?: boolean; etapas?: Etapas; destino?: Destino } = {}) {
  const loja = opts.destino?.empresaId ?? (await prisma.empresa.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
  return naLoja(loja, () => importarNaEmpresa(t, opts));
}

async function importarNaEmpresa(t: Tabelas, opts: { simular?: boolean; etapas?: Etapas; destino?: Destino }) {
  const simular = opts.simular ?? true;
  destino = null;
  if (opts.destino?.empresaId) {
    const emp = await prisma.empresa.findUniqueOrThrow({ where: { id: opts.destino.empresaId } });
    destino = { empresaId: emp.id, cnpj: emp.cnpj, nome: emp.nomeFantasia || emp.razaoSocial };
  }
  lojasPorNome = new Map();
  for (const emp of await prisma.empresa.findMany()) {
    lojasPorNome.set(chaveLoja(emp.razaoSocial), emp.id);
    if (emp.nomeFantasia) lojasPorNome.set(chaveLoja(emp.nomeFantasia), emp.id);
  }
  const e: Etapas = opts.etapas ?? { cadastros: true, estoque: true, os: true, orcamentos: true, vendas: true, compras: true, receber: true, pagar: true };
  const res: Resultado[] = [];
  if (e.cadastros) {
    const pre = leg("");
    res.push(await importarPessoas(linhasPessoas(t.clientes, t.clientes_enderecos, "tipo de pessoa"), "cliente", simular, pre));
    res.push(await importarPessoas(linhasPessoas(t.fornecedores, t.fornecedores_enderecos, "tipo de fornecedor"), "fornecedor", simular, pre));
    if (t.transportadoras) res.push(await importarPessoas(linhasPessoas(t.transportadoras, t.transportadoras_enderecos, "tipo de transportadora"), "transportadora", simular, pre));
    res.push(await importarServicos(linhasServicos(t.servicos), simular));
  }
  if (e.cadastros || e.estoque) {
    const r = await importarProdutos(linhasProdutos(t.produtos), { simular, importarEstoque: !!e.estoque, loja: destino ? { empresaId: destino.empresaId, nome: destino.nome, sufixo: destino.cnpj } : undefined });
    if (destino) r.avisos.push(`Produtos que já existiam ficaram com o nome, o preço e o custo de antes; o estoque de ${destino.nome} entrou num depósito só dela.`);
    r.avisos.push(...avisosUnidades(t.produtos, simular));
    if (!simular) {
      const n = await cadastrarUnidades();
      if (n) r.avisos.push(`${n} unidade(s) de medida usadas nos produtos entraram no cadastro de unidades.`);
    }
    res.push(r);
  }
  if (e.cadastros && !simular) {
    // tipos de endereço do Gestão Click (Comercial, Entrega, Cobrança…) no cadastro de tipos
    const tipos = new Set<string>();
    for (const l of [...(t.clientes_enderecos ?? []), ...(t.fornecedores_enderecos ?? []), ...(t.transportadoras_enderecos ?? [])]) {
      const x = (l.tipo ?? "").trim();
      if (x) tipos.add(x.charAt(0).toUpperCase() + x.slice(1).toLowerCase());
    }
    for (const nome of tipos) await prisma.tipoEndereco.upsert({ where: { nome }, create: { nome }, update: {} });
  }
  const historico = e.historico ?? true;
  if (e.os) res.push(await importarOs(t, simular, historico));
  if (e.orcamentos && t.orcamentos) res.push(await importarOrcamentos(t, simular));
  if (e.vendas && t.vendas) res.push(await importarVendas(t, simular, historico));
  if (e.compras && t.compras) res.push(await importarCompras(t, simular));
  if (e.compras && t.ajustes_estoques) res.push(await importarAjustes(t, simular));
  if (e.notas) res.push(await importarNotas(t, simular));
  if (e.contratos) res.push(await importarContratos(t, simular));
  if (e.receber) res.push(await importarContas(t.contas_receber, "RECEBER", simular, false, !!e.pagas));
  if (e.pagar) res.push(await importarContas(t.contas_pagar, "PAGAR", simular, !e.pagarVencidas, !!e.pagas));
  return res;
}
