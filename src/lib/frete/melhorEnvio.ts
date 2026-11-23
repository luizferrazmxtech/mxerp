import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cifrar, decifrar } from "@/lib/seguranca/segredos";
import { empresaDoDocumento } from "@/lib/empresa/atual";
import { ENVIO_EM_ANDAMENTO, type CotacaoFrete, type ItemCotacao, type VolumeFrete } from "./tipos";

/**
 * Frete pelo Melhor Envio (API v2): cotação na venda/orçamento, compra da etiqueta com o saldo da carteira do
 * Melhor Envio, impressão e rastreio. O token pessoal (Painel do Melhor Envio → Gerenciar → Tokens) fica cifrado em
 * Configuracao "melhorenvio", como o token do MXChat e as credenciais do Inter.
 *
 * Toda chamada passa por `chamar`, que aceita um fetch falso: os testes nunca falam com o Melhor Envio de verdade.
 */
export const URL_ME = { PRODUCAO: "https://melhorenvio.com.br", SANDBOX: "https://sandbox.melhorenvio.com.br" } as const;

export type ConfigFrete = {
  ativo: boolean;
  ambiente: keyof typeof URL_ME;
  tokenCifrado: string;
  email: string; // contato técnico exigido pelo Melhor Envio no User-Agent
  cepOrigem: string; // vazio = CEP da loja
  acrescimoPct: number; // somado ao custo para o valor cobrado do cliente
  acrescimoValor: number;
  diasExtras: number; // dias de manuseio somados ao prazo da transportadora
  servicos: string; // ids dos serviços aceitos, separados por vírgula (vazio = todos)
  seguro: boolean; // declarar o valor dos produtos (seguro)
  maoPropria: boolean;
  avisoRecebimento: boolean;
  pacote: VolumeFrete; // caixa usada para os produtos sem medidas no cadastro (cm e kg)
};
export type ConfigFreteTela = Omit<ConfigFrete, "tokenCifrado"> & { temToken: boolean };

export class FreteError extends Error {}

const PADRAO: ConfigFrete = {
  ativo: false, ambiente: "PRODUCAO", tokenCifrado: "", email: "", cepOrigem: "", acrescimoPct: 0, acrescimoValor: 0, diasExtras: 0,
  servicos: "", seguro: true, maoPropria: false, avisoRecebimento: false, pacote: { altura: 4, largura: 12, comprimento: 17, peso: 0.3 },
};

export async function configFrete(): Promise<ConfigFrete> {
  const c = await prisma.configuracao.findUnique({ where: { chave: "melhorenvio" } });
  const v = (c?.valor ?? {}) as Partial<ConfigFrete>;
  return { ...PADRAO, ...v, pacote: { ...PADRAO.pacote, ...(v.pacote ?? {}) } };
}

export async function configFreteTela(): Promise<ConfigFreteTela> {
  const { tokenCifrado, ...resto } = await configFrete();
  return { ...resto, temToken: !!tokenCifrado };
}

export async function freteAtivo() {
  const c = await configFrete();
  return c.ativo && !!c.tokenCifrado;
}

const soDigitos = (x: string | null | undefined) => (x ?? "").replace(/\D/g, "");

export async function salvarConfigFrete(d: Omit<ConfigFrete, "tokenCifrado"> & { token?: string; apagarToken?: boolean }) {
  const atual = await configFrete();
  const tokenCifrado = d.apagarToken ? "" : d.token?.trim() ? cifrar(d.token.trim()) : atual.tokenCifrado;
  if (d.ativo && !tokenCifrado) throw new FreteError("Cole o token do Melhor Envio para ligar o frete");
  const email = d.email.trim();
  if (d.ativo && !/^\S+@\S+\.\S+$/.test(email)) throw new FreteError("Informe o e-mail de contato técnico (o Melhor Envio exige)");
  const cep = soDigitos(d.cepOrigem);
  if (cep && cep.length !== 8) throw new FreteError("CEP de origem inválido");
  const servicos = d.servicos.split(/[,\s;]+/).map((x) => x.trim()).filter((x) => /^\d+$/.test(x)).join(",");
  const pos = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const valor: ConfigFrete = {
    ativo: d.ativo, ambiente: d.ambiente === "SANDBOX" ? "SANDBOX" : "PRODUCAO", tokenCifrado, email, cepOrigem: cep,
    acrescimoPct: pos(d.acrescimoPct), acrescimoValor: pos(d.acrescimoValor), diasExtras: Math.trunc(pos(d.diasExtras)), servicos,
    seguro: d.seguro, maoPropria: d.maoPropria, avisoRecebimento: d.avisoRecebimento,
    pacote: { altura: pos(d.pacote.altura) || PADRAO.pacote.altura, largura: pos(d.pacote.largura) || PADRAO.pacote.largura, comprimento: pos(d.pacote.comprimento) || PADRAO.pacote.comprimento, peso: pos(d.pacote.peso) || PADRAO.pacote.peso },
  };
  await prisma.configuracao.upsert({ where: { chave: "melhorenvio" }, create: { chave: "melhorenvio", valor }, update: { valor } });
}

export type OpcoesFrete = { fetch?: typeof fetch };

/** Chamada autenticada à API do Melhor Envio. Lança FreteError com a mensagem do Melhor Envio quando ele recusa. */
export async function chamar<T = unknown>(caminho: string, corpo?: unknown, opts: OpcoesFrete & { metodo?: "GET" | "POST" | "DELETE"; config?: ConfigFrete } = {}): Promise<T> {
  const c = opts.config ?? (await configFrete());
  if (!c.tokenCifrado) throw new FreteError("O frete pelo Melhor Envio não está configurado (Configurações → Integrações → Melhor Envio)");
  if (process.env.NODE_ENV === "test" && !opts.fetch) throw new FreteError("Nos testes o Melhor Envio só é chamado com um fetch falso");
  const f = opts.fetch ?? fetch;
  let r: Response;
  try {
    r = await f(`${URL_ME[c.ambiente]}/api/v2${caminho}`, {
      method: opts.metodo ?? (corpo === undefined ? "GET" : "POST"),
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${decifrar(c.tokenCifrado)}`, "User-Agent": `MXERP (${c.email || "suporte@mxtech.inf.br"})` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new FreteError(`Não foi possível falar com o Melhor Envio: ${e instanceof Error ? e.message : String(e)}`);
  }
  const texto = await r.text();
  let j: unknown = null;
  try { j = texto ? JSON.parse(texto) : null; } catch { /* resposta sem JSON */ }
  if (!r.ok) {
    if (r.status === 401) throw new FreteError("O Melhor Envio recusou o token (401). Gere um token novo no painel do Melhor Envio e salve de novo.");
    throw new FreteError(`O Melhor Envio respondeu ${r.status}: ${mensagemErro(j) || texto.slice(0, 300)}`);
  }
  return j as T;
}

/** Junta as mensagens de erro do Melhor Envio ({message, errors: {campo: [..]}}) numa frase. */
function mensagemErro(j: unknown): string {
  if (!j || typeof j !== "object") return "";
  const o = j as { message?: string; error?: string; errors?: Record<string, string[] | string> };
  const det = o.errors ? Object.values(o.errors).flat().join(" ") : "";
  return [o.message ?? o.error, det].filter(Boolean).join(" — ");
}

/** Conta e saldo da carteira do Melhor Envio (botão Testar conexão). */
export async function testarConexao(opts: OpcoesFrete = {}) {
  const me = await chamar<{ firstname?: string; lastname?: string; email?: string }>("/me", undefined, opts);
  const saldo = await chamar<{ balance?: number | string }>("/me/balance", undefined, opts).catch(() => null);
  return { nome: [me?.firstname, me?.lastname].filter(Boolean).join(" ") || me?.email || "conta do Melhor Envio", saldo: saldo ? Number(saldo.balance ?? 0) : null };
}

// ---------- medidas

/** Medida do cadastro (o formulário pede metros) em centímetros; valores acima de 3 já são tratados como cm. */
export const cm = (v: Prisma.Decimal | number | null | undefined) => {
  const x = Number(v ?? 0);
  if (!(x > 0)) return 0;
  return Math.round((x <= 3 ? x * 100 : x) * 10) / 10;
};

type ProdutoMedidas = { id: string; nome: string; peso: Prisma.Decimal | null; pesoBruto: Prisma.Decimal | null; largura: Prisma.Decimal | null; altura: Prisma.Decimal | null; comprimento: Prisma.Decimal | null };

/** Produtos no formato da cotação do Melhor Envio (cm, kg). Sem medida no cadastro, vale a caixa padrão. */
export function produtosCotacao(itens: ItemCotacao[], produtos: ProdutoMedidas[], c: ConfigFrete) {
  const mapa = new Map(produtos.map((p) => [p.id, p]));
  return itens.filter((i) => i.quantidade > 0 && mapa.has(i.produtoId)).map((i) => {
    const p = mapa.get(i.produtoId)!;
    const [a, l, co] = [cm(p.altura), cm(p.largura), cm(p.comprimento)];
    const temMedida = a > 0 && l > 0 && co > 0;
    const peso = Number(p.pesoBruto ?? 0) || Number(p.peso ?? 0) || c.pacote.peso;
    return {
      id: p.id, height: temMedida ? a : c.pacote.altura, width: temMedida ? l : c.pacote.largura, length: temMedida ? co : c.pacote.comprimento,
      weight: Math.round(peso * 1000) / 1000, insurance_value: c.seguro ? Math.round(i.valor * 100) / 100 : 0, quantity: i.quantidade,
    };
  });
}

type RespostaCotacao = {
  id: number; name: string; price?: string | number; custom_price?: string | number; delivery_time?: number; custom_delivery_time?: number; error?: string;
  company?: { name?: string; picture?: string };
  packages?: { dimensions?: { height?: number; width?: number; length?: number }; weight?: number | string }[];
};

const arred = (x: number) => Math.round(x * 100) / 100;

/**
 * Cota o frete de uma lista de produtos para um CEP. Volta todos os serviços (os indisponíveis com `erro`), os
 * disponíveis primeiro, do mais barato ao mais caro. `valor` já tem os acréscimos da configuração.
 */
export async function cotarFrete(a: { cepDestino: string; itens: ItemCotacao[]; empresaId?: string | null }, opts: OpcoesFrete = {}): Promise<CotacaoFrete[]> {
  const c = await configFrete();
  if (!c.ativo || !c.tokenCifrado) throw new FreteError("Ligue o frete pelo Melhor Envio em Configurações → Integrações → Melhor Envio");
  const destino = soDigitos(a.cepDestino);
  if (destino.length !== 8) throw new FreteError("O endereço de entrega não tem um CEP válido");
  const origem = c.cepOrigem || soDigitos((await empresaDoDocumento(a.empresaId ?? null))?.cep);
  if (origem.length !== 8) throw new FreteError("Informe o CEP de origem na configuração do Melhor Envio (ou o CEP da loja)");
  const produtos = await prisma.produto.findMany({ where: { id: { in: a.itens.map((i) => i.produtoId) } }, select: { id: true, nome: true, peso: true, pesoBruto: true, largura: true, altura: true, comprimento: true } });
  const lista = produtosCotacao(a.itens, produtos, c);
  if (!lista.length) throw new FreteError("Adicione produtos para cotar o frete");
  const r = await chamar<RespostaCotacao[]>("/me/shipment/calculate", {
    from: { postal_code: origem }, to: { postal_code: destino }, products: lista,
    options: { receipt: c.avisoRecebimento, own_hand: c.maoPropria },
    ...(c.servicos ? { services: c.servicos } : {}),
  }, { ...opts, config: c });
  const cot = (Array.isArray(r) ? r : []).map((s): CotacaoFrete => {
    const custo = Number(s.custom_price ?? s.price ?? 0);
    const prazo = s.custom_delivery_time ?? s.delivery_time;
    return {
      servicoId: s.id, servico: s.name, transportadora: s.company?.name ?? "", logo: s.company?.picture ?? null,
      custo: arred(custo), valor: s.error ? 0 : arred(custo * (1 + c.acrescimoPct / 100) + c.acrescimoValor),
      prazoDias: prazo != null ? prazo + c.diasExtras : null, erro: s.error ?? (custo > 0 ? null : "Sem preço para este envio"),
      pacotes: (s.packages ?? []).map((p) => ({ altura: Number(p.dimensions?.height ?? 0), largura: Number(p.dimensions?.width ?? 0), comprimento: Number(p.dimensions?.length ?? 0), peso: Number(p.weight ?? 0) })),
    };
  });
  return cot.sort((x, y) => (x.erro ? 1 : 0) - (y.erro ? 1 : 0) || x.valor - y.valor);
}

// ---------- venda

const vendaParaFrete = (id: string) => prisma.venda.findUniqueOrThrow({
  where: { id },
  include: {
    cliente: { include: { enderecos: { orderBy: { ordem: "asc" } } } },
    itens: { orderBy: { ordem: "asc" }, include: { produto: { select: { id: true, nome: true } } } },
  },
});
type VendaFrete = Awaited<ReturnType<typeof vendaParaFrete>>;

/** Endereço de entrega da venda: o escolhido no pedido, senão o principal do cliente. */
export function enderecoEntrega(v: VendaFrete) {
  const c = v.cliente;
  if (!c) return null;
  const e = (v.enderecoEntregaId && c.enderecos.find((x) => x.id === v.enderecoEntregaId)) || null;
  const base = e ?? (c.cep ? c : c.enderecos[0] ?? null);
  if (!base) return null;
  return { cep: soDigitos(base.cep), logradouro: base.logradouro ?? "", numero: base.numero ?? "", complemento: base.complemento ?? "", bairro: base.bairro ?? "", cidade: base.cidade ?? "", uf: base.uf ?? "" };
}

const itensDaVenda = (v: VendaFrete): ItemCotacao[] => v.itens.map((i) => ({ produtoId: i.produtoId, quantidade: Number(i.quantidade), valor: Number(i.subtotal) }));

export async function cotarVenda(vendaId: string, opts: OpcoesFrete = {}) {
  const v = await vendaParaFrete(vendaId);
  const end = enderecoEntrega(v);
  if (!end?.cep) throw new FreteError("O cliente da venda não tem endereço com CEP");
  return cotarFrete({ cepDestino: end.cep, itens: itensDaVenda(v), empresaId: v.empresaId }, opts);
}

type Ordem = { id: string; protocol?: string; status?: string; tracking?: string | null; melhorenvio_tracking?: string | null;
  paid_at?: string | null; generated_at?: string | null; posted_at?: string | null; delivered_at?: string | null; canceled_at?: string | null };

const SITUACAO_ME: Record<string, string> = { pending: "CARRINHO", released: "PAGA", generated: "GERADA", posted: "POSTADA", delivered: "ENTREGUE", undelivered: "NAO_ENTREGUE", canceled: "CANCELADA" };

/**
 * Compra a etiqueta da venda no serviço escolhido: põe no carrinho do Melhor Envio, paga com o saldo da carteira
 * e gera a etiqueta. Se um passo falhar (sem saldo, por exemplo), o envio fica com o erro e "Tentar de novo" continua
 * de onde parou, sem comprar duas vezes.
 */
export async function comprarEtiqueta(vendaId: string, servicoId: number, usuarioNome: string | null, opts: OpcoesFrete = {}) {
  const c = await configFrete();
  if (!c.ativo || !c.tokenCifrado) throw new FreteError("Ligue o frete pelo Melhor Envio em Configurações → Integrações → Melhor Envio");
  const aberta = await prisma.envioFrete.findFirst({ where: { vendaId, situacao: { in: ["CARRINHO", "PAGA", "GERADA", "POSTADA", "ERRO"] } } });
  if (aberta) throw new FreteError(aberta.situacao === "CARRINHO" || aberta.situacao === "ERRO" ? "Esta venda já tem uma etiqueta começada: use Tentar de novo ou cancele antes de comprar outra" : "Esta venda já tem uma etiqueta ativa. Cancele antes de comprar outra.");
  const v = await vendaParaFrete(vendaId);
  if (!v.itens.length) throw new FreteError("A venda não tem produtos para enviar");
  const cot = (await cotarVenda(vendaId, opts)).find((x) => x.servicoId === servicoId);
  if (!cot || cot.erro) throw new FreteError(cot?.erro ? `${cot.servico}: ${cot.erro}` : "Este serviço não atende o endereço da venda");
  const envio = await prisma.envioFrete.create({
    data: {
      vendaId, empresaId: v.empresaId, servicoId, servicoNome: cot.servico, transportadora: cot.transportadora, valor: cot.custo, prazoDias: cot.prazoDias,
      volumes: cot.pacotes as unknown as Prisma.InputJsonValue, usuarioNome,
    },
  });
  return avancarEnvio(envio.id, opts);
}

/** Leva o envio até a etiqueta gerada (carrinho → pagamento → geração), começando do passo em que parou. */
export async function avancarEnvio(envioId: string, opts: OpcoesFrete = {}) {
  const c = await configFrete();
  let e = await prisma.envioFrete.findUniqueOrThrow({ where: { id: envioId } });
  const o = { ...opts, config: c };
  try {
    if (!e.meId) {
      const v = await vendaParaFrete(e.vendaId);
      const r = await chamar<{ id: string; protocol?: string }>("/me/cart", await corpoCarrinho(v, e, c), o);
      e = await prisma.envioFrete.update({ where: { id: e.id }, data: { meId: r.id, protocolo: r.protocol ?? null, situacao: "CARRINHO", erro: null } });
    }
    if (!e.pagaEm) {
      await chamar("/me/shipment/checkout", { orders: [e.meId] }, o);
      e = await prisma.envioFrete.update({ where: { id: e.id }, data: { pagaEm: new Date(), situacao: "PAGA", erro: null } });
    }
    if (!e.geradaEm) {
      await chamar("/me/shipment/generate", { orders: [e.meId] }, o);
      e = await prisma.envioFrete.update({ where: { id: e.id }, data: { geradaEm: new Date(), situacao: "GERADA", erro: null } });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.envioFrete.update({ where: { id: e.id }, data: { erro: msg.slice(0, 500), situacao: e.meId ? (e.pagaEm ? "PAGA" : "CARRINHO") : "ERRO" } });
    throw new FreteError(/saldo|balance|insufficient/i.test(msg) ? `Sem saldo na carteira do Melhor Envio para pagar a etiqueta. Adicione saldo no painel do Melhor Envio e clique em Tentar de novo. (${msg})` : msg);
  }
  await atualizarRastreio([e.id], opts).catch(() => null);
  return prisma.envioFrete.findUniqueOrThrow({ where: { id: e.id } });
}

async function corpoCarrinho(v: VendaFrete, e: { servicoId: number; volumes: Prisma.JsonValue }, c: ConfigFrete) {
  const emp = await empresaDoDocumento(v.empresaId);
  if (!emp) throw new FreteError("Cadastre a empresa (remetente) antes de comprar etiquetas");
  const cli = v.cliente;
  if (!cli) throw new FreteError("A venda não tem cliente (destinatário)");
  const end = enderecoEntrega(v);
  if (!end?.cep || !end.logradouro || !end.cidade) throw new FreteError("O endereço de entrega do cliente está incompleto (CEP, rua e cidade)");
  const doc = soDigitos(cli.documento);
  const nota = await prisma.notaFiscal.findFirst({ where: { origemTipo: "VENDA", origemId: v.id, modelo: "NFE", status: "AUTORIZADA" }, orderBy: { createdAt: "desc" } });
  const total = v.itens.reduce((s, i) => s + Number(i.subtotal), 0);
  const vols = (Array.isArray(e.volumes) ? e.volumes : []) as unknown as VolumeFrete[];
  return {
    service: e.servicoId,
    from: {
      name: emp.nomeFantasia || emp.razaoSocial, phone: soDigitos(emp.telefone), email: emp.email ?? c.email, company_document: emp.cnpj, state_register: soDigitos(emp.inscricaoEstadual) || undefined,
      address: emp.logradouro ?? "", complement: emp.complemento ?? "", number: emp.numero || "S/N", district: emp.bairro ?? "", city: emp.cidade ?? "", country_id: "BR",
      postal_code: c.cepOrigem || soDigitos(emp.cep), state_abbr: emp.uf ?? "",
    },
    to: {
      name: cli.nome, phone: soDigitos(cli.celular || cli.telefone), email: cli.email ?? "",
      ...(doc.length === 14 ? { company_document: doc, state_register: soDigitos(cli.inscricaoEstadual) || undefined } : { document: doc }),
      address: end.logradouro, complement: end.complemento, number: end.numero || "S/N", district: end.bairro, city: end.cidade, country_id: "BR", postal_code: end.cep, state_abbr: end.uf,
    },
    products: v.itens.map((i) => ({ name: (i.descricao || i.produto.nome).slice(0, 120), quantity: Number(i.quantidade), unitary_value: Math.round((Number(i.subtotal) / Math.max(Number(i.quantidade), 1)) * 100) / 100 })),
    volumes: vols.map((x) => ({ height: x.altura, width: x.largura, length: x.comprimento, weight: x.peso })),
    options: {
      insurance_value: c.seguro ? Math.round(total * 100) / 100 : 0, receipt: c.avisoRecebimento, own_hand: c.maoPropria, reverse: false,
      non_commercial: !nota, ...(nota?.chave ? { invoice: { key: nota.chave } } : {}), platform: "MXERP", tags: [{ tag: `Venda ${v.numero}`, url: null }],
    },
  };
}

/** Link (PDF) da etiqueta para imprimir. */
export async function linkEtiqueta(envioId: string, opts: OpcoesFrete = {}) {
  const e = await prisma.envioFrete.findUniqueOrThrow({ where: { id: envioId } });
  if (!e.meId || !e.geradaEm) throw new FreteError("A etiqueta ainda não foi gerada");
  const r = await chamar<{ url?: string }>("/me/shipment/print", { mode: "public", orders: [e.meId] }, opts);
  if (!r?.url) throw new FreteError("O Melhor Envio não devolveu o link da etiqueta");
  return r.url;
}

/** Consulta o rastreio no Melhor Envio e grava situação, códigos e datas. */
export async function atualizarRastreio(ids: string[], opts: OpcoesFrete = {}) {
  const envios = await prisma.envioFrete.findMany({ where: { id: { in: ids }, meId: { not: null } } });
  if (!envios.length) return 0;
  const r = await chamar<Record<string, Ordem>>("/me/shipment/tracking", { orders: envios.map((e) => e.meId) }, opts);
  let n = 0;
  for (const e of envios) {
    const o = r?.[e.meId!];
    if (!o) continue;
    const d = (x?: string | null) => (x ? new Date(x.replace(" ", "T") + (/[zZ]|[+-]\d\d:?\d\d$/.test(x) ? "" : "-03:00")) : undefined);
    await prisma.envioFrete.update({
      where: { id: e.id },
      data: {
        situacao: SITUACAO_ME[o.status ?? ""] ?? e.situacao, rastreio: o.tracking ?? e.rastreio, rastreioMe: o.melhorenvio_tracking ?? e.rastreioMe, protocolo: o.protocol ?? e.protocolo,
        pagaEm: e.pagaEm ?? d(o.paid_at), geradaEm: e.geradaEm ?? d(o.generated_at), postadaEm: e.postadaEm ?? d(o.posted_at), entregueEm: e.entregueEm ?? d(o.delivered_at), canceladaEm: e.canceladaEm ?? d(o.canceled_at),
        consultadaEm: new Date(),
      },
    });
    n++;
  }
  return n;
}

/** Cancela a etiqueta no Melhor Envio (só antes de postar; o valor volta para a carteira). Sem id no Melhor Envio, só marca cancelada. */
export async function cancelarEnvio(envioId: string, motivo: string, opts: OpcoesFrete = {}) {
  const e = await prisma.envioFrete.findUniqueOrThrow({ where: { id: envioId } });
  if (["POSTADA", "ENTREGUE", "NAO_ENTREGUE"].includes(e.situacao)) throw new FreteError("A etiqueta já foi postada e não pode mais ser cancelada");
  if (e.situacao === "CANCELADA") return e;
  if (e.meId && e.pagaEm) await chamar("/me/shipment/cancel", { order: { id: e.meId, reason_id: "2", description: (motivo || "Cancelada pelo MXERP").slice(0, 255) } }, opts);
  else if (e.meId) await chamar(`/me/cart/${e.meId}`, undefined, { ...opts, metodo: "DELETE" }).catch(() => null); // só no carrinho: nada foi cobrado
  return prisma.envioFrete.update({ where: { id: e.id }, data: { situacao: "CANCELADA", canceladaEm: new Date(), erro: null } });
}

/** Agendador (de hora em hora): atualiza o rastreio das etiquetas em andamento. */
export async function sincronizarFrete(opts: OpcoesFrete = {}) {
  if (!(await freteAtivo())) return { ignorado: "frete desligado" };
  const ids = (await prisma.envioFrete.findMany({ where: { situacao: { in: ENVIO_EM_ANDAMENTO }, meId: { not: null } }, select: { id: true }, take: 100, orderBy: { consultadaEm: { sort: "asc", nulls: "first" } } })).map((x) => x.id);
  let atualizados = 0;
  for (let i = 0; i < ids.length; i += 20) atualizados += await atualizarRastreio(ids.slice(i, i + 20), opts);
  return { consultados: ids.length, atualizados };
}
