import JSZip from "jszip";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { entrada, reservarItem } from "@/lib/estoque/estoque";
import { alterarSituacaoTx, recalcularTotais } from "@/lib/os/os";
import { garantirPadroes } from "@/lib/financeiro/padroes";
import { lerPlanilha, normalizar, numeroBr, type Linha } from "./planilha";
import { importarPessoas, importarProdutos, importarServicos, type Resultado } from "./importar";
import type { SituacaoOs } from "@prisma/client";

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

export type Etapas = { cadastros?: boolean; estoque?: boolean; os?: boolean; receber?: boolean; pagar?: boolean; pagarVencidas?: boolean };

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
  // endereço: prefere o que não é só de entrega
  const end = new Map<string, Linha>();
  for (const e of ends ?? []) {
    const atual = end.get(e.codigo);
    if (!atual || (/entrega/i.test(atual.tipo) && !/entrega/i.test(e.tipo))) end.set(e.codigo, e);
  }
  return (cad ?? []).map((c) => {
    const e = end.get(c.codigo) ?? {};
    const pj = c[tipoCol] === "PJ";
    const razao = c["razao social"];
    return {
      codigo: c.codigo,
      nome: pj && razao ? razao : c.nome || razao || "",
      "nome fantasia": pj && razao && c.nome && chaveNome(c.nome) !== chaveNome(razao) ? c.nome : "",
      documento: pj ? c.cnpj || c.cpf : c.cpf || c.cnpj,
      "tipo de pessoa": c[tipoCol] === "PF" ? "física" : "jurídica",
      ie: c["inscricao estadual"] ?? "",
      email: c["e mail"] ?? "",
      telefone: c.telefone ?? "",
      celular: c.celular ?? "",
      cep: e.cep ?? "", logradouro: e.logradouro ?? "", numero: e.numero ?? "", complemento: e.complemento ?? "",
      bairro: e.bairro ?? "", cidade: e.cidade ?? "", uf: e.uf ?? "",
      ativo: sim(c.ativo ?? ""),
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
export function custoPorSaida(x: Linha): { custo: number; ajuste?: string; semCusto?: boolean } {
  const custo = numeroBr(x["valor de custo"] ?? "");
  const venda = numeroBr(x["valor varejo"] ?? "");
  const ent = siglaUnidade(x["unidade de entrada"]);
  const sai = siglaUnidade(x["unidade de saida"]);
  if (!x["unidade de entrada"] || ent === sai || custo <= 0 || venda <= 0 || custo <= venda) return { custo };
  const metros = sai === "MT" || sai === "M" ? /(\d{2,4})\s*(M|MT|METROS?)\b/i.exec(x.produto ?? "") : null;
  if (metros) {
    const fator = Number(metros[1]);
    return { custo: Math.round((custo / fator) * 10000) / 10000, ajuste: `${x.codigo}: ${custo.toFixed(2)} por ${ent} ÷ ${fator} = ${(custo / fator).toFixed(4)} por ${sai}` };
  }
  return { custo: 0, semCusto: true };
}

function linhasProdutos(p: Linha[] | undefined) {
  return (p ?? []).map((x) => {
    const un = siglaUnidade(x["unidade de saida"] || x["unidade de entrada"]);
    return {
      codigo: x.codigo, "codigo de barras": x["codigo de barra"] ?? "", nome: x.produto, grupo: x.grupo ?? "",
      unidade: un, "valor de venda": x["valor varejo"] ?? "", "valor de custo": custoPorSaida(x).custo.toFixed(4).replace(".", ","),
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

// ---------- OS em aberto (com reserva de estoque)

const SITUACAO_GC: Record<string, SituacaoOs> = {
  "em aberto": "ABERTA",
  "em andamento": "EM_ANDAMENTO",
  "concluida faturar": "CONCLUIDA",
};

function situacoesAtuais(sit: Linha[] | undefined) {
  const ult = new Map<string, { quando: number; situacao: string }>();
  for (const [i, s] of (sit ?? []).entries()) {
    const quando = (dataHoraBr(s.data)?.getTime() ?? 0) + i / 1000; // empate: ordem do arquivo
    const os = s["n da os"];
    const a = ult.get(os);
    if (!a || quando >= a.quando) ult.set(os, { quando, situacao: s.situacao });
  }
  return new Map([...ult].map(([k, v]) => [k, v.situacao]));
}

async function importarOs(t: Tabelas, simular: boolean): Promise<Resultado> {
  const atuais = situacoesAtuais(t.ordens_servicos_situacoes);
  const todas = t.ordens_servicos ?? [];
  const abertas = todas.filter((o) => SITUACAO_GC[chaveNome(atuais.get(o["n da os"]))]);
  const r: Resultado = { tipo: "os", simulado: simular, lidas: todas.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  r.avisos.push(`${abertas.length} de ${todas.length} OS estão em andamento no Gestão Click e serão trazidas com os produtos reservados; as finalizadas ficam só no histórico do backup.`);

  const agrupa = (ls: Linha[] | undefined) => {
    const m = new Map<string, Linha[]>();
    for (const l of ls ?? []) m.set(l["n da os"], [...(m.get(l["n da os"]) ?? []), l]);
    return m;
  };
  const prods = agrupa(t.ordens_servicos_produtos);
  const servs = agrupa(t.ordens_servicos_servicos);
  const equips = agrupa(t.ordens_servicos_equipamentos);

  // nome do produto/serviço no Gestão Click → código (as OS guardam o nome, não o código)
  const codProduto = new Map<string, string>();
  for (const p of t.produtos ?? []) if (!codProduto.has(chaveNome(p.produto))) codProduto.set(chaveNome(p.produto), p.codigo);
  const codServico = new Map<string, string>();
  for (const s of t.servicos ?? []) codServico.set(chaveNome(s.servico), s["codigo interno"] || s.servico.slice(0, 20).toUpperCase());
  // cliente da OS vem pelo nome (Nome ou Razão social)
  const codCliente = new Map<string, string>();
  for (const c of t.clientes ?? []) for (const n of [c.nome, c["razao social"]]) if (n && !codCliente.has(chaveNome(n))) codCliente.set(chaveNome(n), c.codigo);

  const semProduto = new Set<string>();
  const semCliente = new Set<string>();
  let maior = 0;
  for (const o of abertas) {
    const numero = Number(o["n da os"]);
    maior = Math.max(maior, numero);
    for (const p of prods.get(o["n da os"]) ?? []) if (!codProduto.has(chaveNome(p.produto))) semProduto.add(p.produto);
    if (!codCliente.has(chaveNome(o.cliente))) semCliente.add(o.cliente);
    const existe = await prisma.ordemServico.findFirst({ where: { OR: [{ idLegado: `os:${numero}` }, { numero }] } });
    if (existe) { r.ignorados.push({ linha: numero, motivo: `OS ${numero} já existe no ERP` }); continue; }
    if (simular) { r.criados++; continue; }

    await prisma.$transaction(async (tx) => {
      const codCli = codCliente.get(chaveNome(o.cliente));
      const cliente =
        (codCli && (await tx.pessoa.findUnique({ where: { idLegado: `cliente:${codCli}` } }))) ||
        (await tx.pessoa.findFirst({ where: { OR: [{ nome: { equals: o.cliente, mode: "insensitive" } }, { fantasia: { equals: o.cliente, mode: "insensitive" } }] } })) ||
        (await tx.pessoa.create({ data: { nome: o.cliente || "Cliente não informado", idLegado: `cliente-os:${o.cliente}`, observacoes: "Criado na migração a partir de uma OS" } }));
      const eq = equips.get(o["n da os"]) ?? [];
      const os = await tx.ordemServico.create({
        data: {
          numero, idLegado: `os:${numero}`, clienteId: cliente.id,
          entrada: dataHoraBr(o["cadastrado em"]) ?? dataBr(o.data) ?? new Date(),
          previsao: dataBr(o["prazo de entrega"]),
          canal: o["canal de venda"] || "Presencial",
          observacoes: o.observacoes || null,
          observacaoInterna: o["observacoes interna"] || null,
          desconto: numeroBr(o["desconto valor"] ?? ""),
          frete: numeroBr(o["valor frete"] ?? ""),
          equipamentos: {
            create: eq.filter((x) => x.equipamento || x.defeitos || x.marca || x.modelo).map((x, i) => ({
              ordem: i + 1, equipamento: x.equipamento || "Equipamento", marca: x.marca || null, modelo: x.modelo || null, serie: x.serie || null,
              condicoes: x.condicoes || null, defeitos: x.defeitos || null, acessorios: x.acessorios || null,
              solucao: x.solucao || null, laudo: x["laudo tecnico"] || null, garantia: x["termos de garantia"] || null,
            })),
          },
        },
      });
      await tx.osHistorico.create({ data: { osId: os.id, descricao: `Migrada do Gestão Click (situação lá: ${atuais.get(o["n da os"])})` } });
      for (const p of prods.get(o["n da os"]) ?? []) {
        const cod = codProduto.get(chaveNome(p.produto));
        const produto = cod ? await tx.produto.findUnique({ where: { codigo: cod } }) : null;
        if (!produto) continue;
        const q = numeroBr(p.quantidade) || 1;
        const v = numeroBr(p["valor unitario"]);
        const d = numeroBr(p.desconto ?? "");
        const item = await tx.osItemProduto.create({
          data: { osId: os.id, produtoId: produto.id, quantidade: q, valorUnit: v.toFixed(2), custoUnit: produto.custo, desconto: d.toFixed(2), subtotal: (v * q - d).toFixed(2) },
        });
        await reservarItem(tx, { produtoId: produto.id, quantidade: q, origemTipo: "OS", origemId: os.id, origemItemId: item.id });
      }
      for (const s of servs.get(o["n da os"]) ?? []) {
        const codigo = codServico.get(chaveNome(s.servico)) ?? s.servico.slice(0, 20).toUpperCase();
        const servico = await tx.servico.upsert({ where: { codigo }, create: { codigo, nome: s.servico, preco: numeroBr(s["valor unitario"]), idLegado: `servico:${codigo}` }, update: {} });
        const q = numeroBr(s.quantidade) || 1;
        const v = numeroBr(s["valor unitario"]);
        await tx.osItemServico.create({ data: { osId: os.id, servicoId: servico.id, quantidade: q, valorUnit: v.toFixed(2), subtotal: (v * q - numeroBr(s.desconto ?? "")).toFixed(2) } });
      }
      await recalcularTotais(tx, os.id);
      const sit = SITUACAO_GC[chaveNome(atuais.get(o["n da os"]))];
      if (sit !== "ABERTA") await alterarSituacaoTx(tx, os.id, sit, { permitirNegativo: true });
      if (sit === "CONCLUIDA") {
        // No Gestão Click, "CONCLUIDA - FATURAR" já tirou as peças do estoque, e o "Estoque atual" do backup
        // já vem descontado. A baixa da OS fica registrada aqui (para estornar certo se a OS for reaberta),
        // e uma entrada de implantação no mesmo local devolve a quantidade, para o saldo bater com o backup.
        const saidas = await tx.movimentoEstoque.findMany({ where: { origemTipo: "OS", origemId: os.id, tipo: "SAIDA" } });
        for (const m of saidas)
          await entrada(tx, { produtoId: m.produtoId, localId: m.localId, quantidade: Number(m.quantidade), origemTipo: "IMPLANTACAO", observacao: `OS ${numero}: peça já baixada no Gestão Click` });
      }
    }, { timeout: 30000 });
    r.criados++;
  }
  // numeração continua de onde o Gestão Click parou
  const maxOs = Math.max(maior, ...todas.map((o) => Number(o["n da os"]) || 0));
  const maxVenda = Math.max(0, ...(t.vendas ?? []).map((v) => Number(v["n do pedido"]) || 0));
  if (!simular) {
    for (const [chave, valor] of [["OS", maxOs], ["VENDA", maxVenda]] as const)
      if (valor > 0) await prisma.$executeRaw`INSERT INTO "Sequencia" (chave, valor) VALUES (${chave}, ${valor}) ON CONFLICT (chave) DO UPDATE SET valor = GREATEST("Sequencia".valor, ${valor})`;
  }
  r.avisos.push(`A numeração continua do Gestão Click: próxima OS nº ${maxOs + 1}${maxVenda ? `, próxima venda nº ${maxVenda + 1}` : ""}.`);
  if (semProduto.size) r.avisos.push(`${semProduto.size} produtos citados em OS abertas não existem mais no cadastro e ficaram de fora: ${[...semProduto].slice(0, 20).join("; ")}${semProduto.size > 20 ? "…" : ""}`);
  if (semCliente.size) r.avisos.push(`${semCliente.size} clientes de OS abertas não estão no cadastro de clientes e ${simular ? "serão criados" : "foram criados"} só com o nome: ${[...semCliente].slice(0, 20).join("; ")}${semCliente.size > 20 ? "…" : ""}`);
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

async function importarContas(linhas: Linha[] | undefined, tipo: "RECEBER" | "PAGAR", simular: boolean, soAVencer = false): Promise<Resultado> {
  const todas = linhas ?? [];
  const hoje = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  let abertas = todas.filter((l) => !/confirmad/i.test(l.situacao));
  const deFora = soAVencer ? abertas.filter((l) => (dataBr(l["data do vencimento"])?.getTime() ?? 0) < hoje.getTime()) : [];
  if (soAVencer) abertas = abertas.filter((l) => !deFora.includes(l));
  const r: Resultado = { tipo: tipo === "RECEBER" ? "receber" : "pagar", simulado: simular, lidas: todas.length, criados: 0, atualizados: 0, ignorados: [], avisos: [] };
  const vencidas = abertas.filter((l) => (dataBr(l["data do vencimento"])?.getTime() ?? 0) < Date.now() - 86400000);
  const soma = (ls: Linha[]) => ls.reduce((s, l) => s + numeroBr(l.valor), 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  r.avisos.push(`${abertas.length} contas em aberto (${soma(abertas)}), das quais ${vencidas.length} já vencidas (${soma(vencidas)}). As já pagas/recebidas não entram.`);
  if (deFora.length) r.avisos.push(`${deFora.length} contas vencidas (${soma(deFora)}) ficaram de fora por já terem sido pagas fora do sistema.`);

  if (!simular) {
    await prisma.$transaction((tx) => garantirPadroes(tx));
    // contas bancárias do Gestão Click (Inter, PagSeguro, Mercado Pago…) para a conciliação do extrato
    for (const nome of new Set(todas.map((l) => (l["conta bancaria"] ?? "").trim()).filter(Boolean)))
      await prisma.contaBancaria.upsert({ where: { nome }, create: { nome }, update: {} });
  }
  const ocorr = new Map<string, number>();
  for (const [i, l] of abertas.entries()) {
    const venc = dataBr(l["data do vencimento"]);
    const valor = numeroBr(l.valor);
    if (!venc || !(valor > 0)) { r.ignorados.push({ linha: i + 2, motivo: !venc ? "sem vencimento" : "valor zerado" }); continue; }
    const base = [tipo, l["descricao do recebimento"], l["entidade nome"], l["data do vencimento"], l.valor, l["cadastrado em"]].join("|");
    const n = (ocorr.get(base) ?? 0) + 1;
    ocorr.set(base, n);
    const idLegado = `${tipo.toLowerCase()}:${createHash("sha1").update(`${base}|${n}`).digest("hex").slice(0, 20)}`;
    const existe = await prisma.lancamento.findUnique({ where: { idLegado } });
    if (existe) { r.ignorados.push({ linha: i + 2, motivo: "já importada" }); continue; }
    if (simular) { r.criados++; continue; }
    const nomeEnt = l["entidade nome"];
    const pessoa = nomeEnt
      ? await prisma.pessoa.findFirst({ where: { OR: [{ nome: { equals: nomeEnt, mode: "insensitive" } }, { fantasia: { equals: nomeEnt, mode: "insensitive" } }] } })
      : null;
    const cat = await prisma.categoriaFinanceira.findUniqueOrThrow({ where: { nome_tipo: { nome: categoriaPara(l["plano de contas"], tipo), tipo } } });
    const formaNome = formaPara(l["forma de pagamento"] ?? "");
    const forma = formaNome ? await prisma.formaPagamento.findUnique({ where: { nome: formaNome } }) : null;
    await prisma.lancamento.create({
      data: {
        tipo, descricao: [l["descricao do recebimento"], !pessoa && nomeEnt ? `(${nomeEnt})` : ""].filter(Boolean).join(" ").slice(0, 300),
        pessoaId: pessoa?.id, categoriaId: cat.id, formaPagamentoId: forma?.id,
        valor: valor.toFixed(2), vencimento: venc, competencia: dataBr(l["data de competencia"]) ?? venc,
        origemTipo: "IMPLANTACAO", idLegado,
      },
    });
    r.criados++;
  }
  return r;
}

// ---------- orquestração

export async function importarBackupGestaoClick(t: Tabelas, opts: { simular?: boolean; etapas?: Etapas } = {}) {
  const simular = opts.simular ?? true;
  const e: Etapas = opts.etapas ?? { cadastros: true, estoque: true, os: true, receber: true, pagar: true };
  const res: Resultado[] = [];
  if (e.cadastros) {
    res.push(await importarPessoas(linhasPessoas(t.clientes, t.clientes_enderecos, "tipo de pessoa"), "cliente", simular));
    res.push(await importarPessoas(linhasPessoas(t.fornecedores, t.fornecedores_enderecos, "tipo de fornecedor"), "fornecedor", simular));
    res.push(await importarServicos(linhasServicos(t.servicos), simular));
  }
  if (e.cadastros || e.estoque) {
    const r = await importarProdutos(linhasProdutos(t.produtos), { simular, importarEstoque: !!e.estoque });
    r.avisos.push(...avisosUnidades(t.produtos, simular));
    res.push(r);
  }
  if (e.os) res.push(await importarOs(t, simular));
  if (e.receber) res.push(await importarContas(t.contas_receber, "RECEBER", simular));
  if (e.pagar) res.push(await importarContas(t.contas_pagar, "PAGAR", simular, !e.pagarVencidas));
  return res;
}
