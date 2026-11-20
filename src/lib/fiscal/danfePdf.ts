import PDFDocument from "pdfkit";
import bwipjs from "bwip-js/node";
import { lerDanfe, type Danfe } from "./danfe";

/**
 * DANFE da NF-e em PDF A4 (retrato), no leiaute do Manual de Orientação do Contribuinte:
 * canhoto, emitente com logo, chave em código de barras CODE-128C, destinatário, fatura, cálculo do imposto,
 * transportador/volumes, produtos e dados adicionais.
 */

const M = 14; // margem
const W = 595.28 - 2 * M; // largura útil
const H = 841.89;
const F = "Times-Roman", FB = "Times-Bold", FI = "Times-Italic";

const brl = (v: number, c = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
const doc = (d: string) => d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : d;
const cep = (c: string) => c.replace(/^(\d{5})(\d{3})$/, "$1-$2");
const fone = (f: string) => f.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");
const tz = { timeZone: "America/Sao_Paulo" };
const data = (s: string) => (s ? new Date(s.length === 10 ? `${s}T12:00:00Z` : s).toLocaleDateString("pt-BR", tz) : "");
const hora = (s: string) => (s ? new Date(s).toLocaleTimeString("pt-BR", tz) : "");
const numNota = (n: string) => n.padStart(9, "0").replace(/^(\d{3})(\d{3})(\d{3})$/, "$1.$2.$3");
const FRETE: Record<string, string> = { "0": "0-Emitente", "1": "1-Destinatário", "2": "2-Terceiros", "3": "3-Próprio remetente", "4": "4-Próprio destinatário", "9": "9-Sem Transporte" };

type Doc = InstanceType<typeof PDFDocument>;

/** Caixa com rótulo pequeno em cima e valor embaixo. */
function caixa(pdf: Doc, x: number, y: number, w: number, h: number, rotulo: string, valor = "", o: { alinhar?: "left" | "right" | "center"; tam?: number; negrito?: boolean } = {}) {
  pdf.lineWidth(0.5).rect(x, y, w, h).stroke();
  pdf.font(F).fontSize(5.5).text(rotulo.toUpperCase(), x + 2, y + 1.5, { width: w - 4, lineBreak: false });
  if (valor) {
    const tam = o.tam ?? 8.5;
    pdf.font(o.negrito === false ? F : FB).fontSize(tam).text(valor, x + 2, y + h - tam - 2, { width: w - 4, align: o.alinhar ?? "left", lineBreak: false, ellipsis: true });
  }
}
const titulo = (pdf: Doc, y: number, t: string) => pdf.font(FB).fontSize(7).text(t, M, y, { lineBreak: false });

export async function gerarDanfePdf(xml: string, o: { logo?: Buffer | null; aviso?: string | null; sistema?: string } = {}): Promise<Buffer> {
  const d = lerDanfe(xml);
  const pdf = new PDFDocument({ size: "A4", margin: 0, info: { Title: `DANFE ${d.numero}`, Author: d.emitente.nome } });
  const partes: Buffer[] = [];
  pdf.on("data", (c: Buffer) => partes.push(c));
  const fim = new Promise<Buffer>((ok) => pdf.on("end", () => ok(Buffer.concat(partes))));

  const barras = await bwipjs.toBuffer({ bcid: "code128", text: d.chave, scale: 2, height: 12, includetext: false });
  const itens = d.itens;
  let pagina = 1;
  // altura disponível para os itens: a 1ª página tem o cabeçalho todo; as seguintes só o cabeçalho do emitente
  const LINHA = 10;
  const yAdic = H - M - 62; // dados adicionais no rodapé da 1ª página
  let i = 0;
  while (i < itens.length || pagina === 1) {
    if (pagina > 1) pdf.addPage({ size: "A4", margin: 0 });
    let y = M;
    if (pagina === 1) {
      y = canhoto(pdf, d, y);
      pdf.lineWidth(0.5).dash(3, { space: 2 }).moveTo(M, y + 3).lineTo(M + W, y + 3).stroke().undash();
      y += 7;
    }
    y = cabecalho(pdf, d, y, barras, o.logo ?? null, pagina);
    if (pagina === 1) y = corpo(pdf, d, y);
    // produtos
    titulo(pdf, y + 1, "DADOS DOS PRODUTOS / SERVIÇOS");
    y += 9;
    const limite = pagina === 1 ? yAdic - 4 : H - M - 14;
    i = tabela(pdf, itens, i, y, limite, LINHA);
    if (pagina === 1) adicionais(pdf, d, yAdic);
    pdf.font(FI).fontSize(6).text(`Impresso em ${new Date().toLocaleDateString("pt-BR", tz)} às ${new Date().toLocaleTimeString("pt-BR", tz)}  ·  NF-e emitida pelo ${o.sistema ?? "MXERP"}`, M, H - M - 6, { lineBreak: false });
    if (o.aviso) {
      pdf.save().rotate(-30, { origin: [W / 2 + M, H / 2] }).font(FB).fontSize(40).fillColor("#d00", 0.18)
        .text(o.aviso, M, H / 2 - 20, { width: W, align: "center", lineBreak: false }).restore().fillColor("black", 1);
    }
    pagina++;
    if (i >= itens.length) break;
  }
  pdf.end();
  return fim;
}

function canhoto(pdf: Doc, d: Danfe, y: number) {
  const wDir = 95, wEsq = W - wDir;
  pdf.lineWidth(0.5).rect(M, y, wEsq, 22).stroke();
  const dest = d.destinatario;
  pdf.font(F).fontSize(6.5).text(
    `RECEBEMOS DE ${d.emitente.nome} OS PRODUTOS E/OU SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA INDICADA AO LADO. EMISSÃO: ${data(d.emissao)} ` +
    `VALOR TOTAL: R$ ${brl(d.totais.vNF)} DESTINATÁRIO: ${dest?.nome ?? "CONSUMIDOR"}${dest ? ` - ${dest.endereco.logradouro}, ${dest.endereco.numero} ${dest.endereco.bairro} ${dest.endereco.municipio}-${dest.endereco.uf}` : ""}`,
    M + 2, y + 2, { width: wEsq - 4, height: 20 });
  caixa(pdf, M, y + 22, 110, 18, "Data de recebimento");
  caixa(pdf, M + 110, y + 22, wEsq - 110, 18, "Identificação e assinatura do recebedor");
  pdf.rect(M + wEsq, y, wDir, 40).stroke();
  pdf.font(FB).fontSize(13).text("NF-e", M + wEsq, y + 4, { width: wDir, align: "center" });
  pdf.font(FB).fontSize(9).text(`Nº. ${numNota(d.numero)}`, M + wEsq, y + 20, { width: wDir, align: "center" }).text(`Série ${d.serie.padStart(3, "0")}`, { width: wDir, align: "center" });
  return y + 40;
}

function cabecalho(pdf: Doc, d: Danfe, y: number, barras: Buffer, logo: Buffer | null, pagina: number) {
  const e = d.emitente, h = logo ? 104 : 92, wEmit = 232, wDanfe = 100, wChave = W - wEmit - wDanfe;
  // emitente
  pdf.lineWidth(0.5).rect(M, y, wEmit, h).stroke();
  pdf.font(FI).fontSize(6).text("IDENTIFICAÇÃO DO EMITENTE", M, y + 2, { width: wEmit, align: "center" });
  let yy = y + 10;
  if (logo) {
    try {
      pdf.image(logo, M + 4, yy - 2, { fit: [wEmit - 8, 48], align: "center", valign: "center" });
      yy += 46;
    } catch { /* imagem que o pdfkit não lê: segue sem logo */ }
  } else yy += 10;
  pdf.font(FB).fontSize(e.nome.length > 32 ? 9.5 : 11).text(e.nome, M + 4, yy, { width: wEmit - 8, align: "center" });
  const end = e.endereco;
  pdf.font(F).fontSize(7.5).text(`${end.logradouro}, ${end.numero}${end.complemento ? ` - ${end.complemento}` : ""}`, { width: wEmit - 8, align: "center" })
    .text(`${end.bairro} - ${cep(end.cep)}`, { width: wEmit - 8, align: "center" })
    .text(`${end.municipio} - ${end.uf}${end.fone ? `  Fone/Fax: ${fone(end.fone)}` : ""}`, { width: wEmit - 8, align: "center" });
  // DANFE
  const xd = M + wEmit;
  pdf.rect(xd, y, wDanfe, h).stroke();
  pdf.font(FB).fontSize(13).text("DANFE", xd, y + 4, { width: wDanfe, align: "center" });
  pdf.font(F).fontSize(7).text("Documento Auxiliar da Nota Fiscal Eletrônica", xd + 6, y + 19, { width: wDanfe - 12, align: "center" });
  pdf.fontSize(7).text("0 - ENTRADA", xd + 8, y + 40).text("1 - SAÍDA", xd + 8, y + 48);
  pdf.rect(xd + wDanfe - 24, y + 39, 14, 15).stroke();
  pdf.font(FB).fontSize(10).text(d.tpNF, xd + wDanfe - 24, y + 42, { width: 14, align: "center" });
  pdf.font(FB).fontSize(8.5).text(`Nº. ${numNota(d.numero)}`, xd, y + 60, { width: wDanfe, align: "center" }).text(`Série ${d.serie.padStart(3, "0")}`, { width: wDanfe, align: "center" });
  pdf.font(FI).fontSize(7).text(`Folha ${pagina}`, { width: wDanfe, align: "center" });
  // chave
  const xc = xd + wDanfe;
  pdf.rect(xc, y, wChave, h).stroke();
  pdf.image(barras, xc + 8, y + 4, { width: wChave - 16, height: 32 });
  caixa(pdf, xc, y + 40, wChave, 18, "Chave de acesso", d.chave.replace(/(\d{4})/g, "$1 ").trim(), { alinhar: "center", tam: 8 });
  pdf.font(F).fontSize(7.5).text("Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br/portal ou no site da Sefaz Autorizadora", xc + 4, y + 62, { width: wChave - 8, align: "center" });
  y += h;
  caixa(pdf, M, y, wEmit + wDanfe, 20, "Natureza da operação", d.natOp, { alinhar: "center" });
  caixa(pdf, M + wEmit + wDanfe, y, wChave, 20, "Protocolo de autorização de uso", d.protocolo ? `${d.protocolo} - ${data(d.dataProtocolo)} ${hora(d.dataProtocolo)}` : "", { alinhar: "center" });
  y += 20;
  const q = W / 4;
  caixa(pdf, M, y, q, 20, "Inscrição estadual", e.ie, { alinhar: "center" });
  caixa(pdf, M + q, y, q, 20, "Inscrição municipal", e.im, { alinhar: "center" });
  caixa(pdf, M + 2 * q, y, q, 20, "Inscrição estadual do subst. tribut.", "");
  caixa(pdf, M + 3 * q, y, q, 20, "CNPJ / CPF", doc(e.cnpj), { alinhar: "center" });
  return y + 22;
}

function corpo(pdf: Doc, d: Danfe, y: number) {
  const de = d.destinatario;
  titulo(pdf, y, "DESTINATÁRIO / REMETENTE");
  y += 8;
  const wData = 78, wDoc = 110;
  caixa(pdf, M, y, W - wDoc - wData, 18, "Nome / razão social", de?.nome ?? "CONSUMIDOR NÃO IDENTIFICADO");
  caixa(pdf, M + W - wDoc - wData, y, wDoc, 18, "CNPJ / CPF", de ? doc(de.documento) : "", { alinhar: "center" });
  caixa(pdf, M + W - wData, y, wData, 18, "Data da emissão", data(d.emissao), { alinhar: "center" });
  y += 18;
  const en = de?.endereco;
  caixa(pdf, M, y, W - 120 - 70 - wData, 18, "Endereço", en ? `${en.logradouro}, ${en.numero}${en.complemento ? ` ${en.complemento}` : ""}` : "");
  caixa(pdf, M + W - 190 - wData, y, 120, 18, "Bairro / distrito", en?.bairro, { alinhar: "center" });
  caixa(pdf, M + W - 70 - wData, y, 70, 18, "CEP", en ? cep(en.cep) : "", { alinhar: "center" });
  caixa(pdf, M + W - wData, y, wData, 18, "Data da saída/entrada", data(d.saida || d.emissao), { alinhar: "center" });
  y += 18;
  caixa(pdf, M, y, W - 30 - 90 - 110 - wData, 18, "Município", en?.municipio);
  caixa(pdf, M + W - 230 - wData, y, 30, 18, "UF", en?.uf, { alinhar: "center" });
  caixa(pdf, M + W - 200 - wData, y, 90, 18, "Fone / fax", en?.fone ? fone(en.fone) : "", { alinhar: "center" });
  caixa(pdf, M + W - 110 - wData, y, 110, 18, "Inscrição estadual", de?.ie, { alinhar: "center" });
  caixa(pdf, M + W - wData, y, wData, 18, "Hora da saída/entrada", hora(d.saida || d.emissao), { alinhar: "center" });
  y += 20;

  if (d.duplicatas.length) {
    titulo(pdf, y, "FATURA / DUPLICATA");
    y += 8;
    const wd = 66, porLinha = Math.floor(W / wd);
    d.duplicatas.forEach((x, k) => {
      const cx = M + (k % porLinha) * wd, cy = y + Math.floor(k / porLinha) * 26;
      pdf.lineWidth(0.5).rect(cx, cy, wd - 2, 24).stroke();
      pdf.font(F).fontSize(5.5).text("Num.", cx + 2, cy + 2).text("Venc.", cx + 2, cy + 9).text("Valor", cx + 2, cy + 16);
      pdf.font(FB).fontSize(6.5).text(x.numero, cx, cy + 1.5, { width: wd - 5, align: "right" }).text(data(x.vencimento), cx, cy + 8.5, { width: wd - 5, align: "right" })
        .text(`R$ ${brl(x.valor)}`, cx, cy + 15.5, { width: wd - 5, align: "right" });
    });
    y += Math.ceil(d.duplicatas.length / porLinha) * 26 + 2;
  }

  titulo(pdf, y, "CÁLCULO DO IMPOSTO");
  y += 8;
  const t = d.totais, s = W / 7;
  const l1: [string, number][] = [["Base de cálc. do ICMS", t.bcIcms], ["Valor do ICMS", t.vIcms], ["Base de cálc. ICMS S.T.", t.bcSt], ["Valor do ICMS subst.", t.vSt], ["V. imp. importação", t.vII], ["Valor do PIS", t.vPis], ["V. total produtos", t.vProd]];
  const l2: [string, number][] = [["Valor do frete", t.vFrete], ["Valor do seguro", t.vSeg], ["Desconto", t.vDesc], ["Outras despesas", t.vOutro], ["Valor total IPI", t.vIpi], ["Valor da COFINS", t.vCofins], ["V. total da nota", t.vNF]];
  l1.forEach(([r, v], k) => caixa(pdf, M + k * s, y, s, 18, r, brl(v), { alinhar: "right" }));
  l2.forEach(([r, v], k) => caixa(pdf, M + k * s, y + 18, s, 18, r, brl(v), { alinhar: "right" }));
  y += 38;

  titulo(pdf, y, "TRANSPORTADOR / VOLUMES TRANSPORTADOS");
  y += 8;
  const tr = d.transportadora, vol = d.volumes[0];
  caixa(pdf, M, y, 190, 18, "Nome / razão social", tr.nome);
  caixa(pdf, M + 190, y, 90, 18, "Frete", FRETE[d.modFrete] ?? d.modFrete);
  caixa(pdf, M + 280, y, 70, 18, "Código ANTT", tr.antt);
  caixa(pdf, M + 350, y, 70, 18, "Placa do veículo", tr.placa);
  caixa(pdf, M + 420, y, 25, 18, "UF", tr.ufPlaca);
  caixa(pdf, M + 445, y, W - 445, 18, "CNPJ / CPF", tr.documento ? doc(tr.documento) : "");
  y += 18;
  caixa(pdf, M, y, 280, 18, "Endereço", tr.endereco);
  caixa(pdf, M + 280, y, 140, 18, "Município", tr.municipio);
  caixa(pdf, M + 420, y, 25, 18, "UF", tr.uf);
  caixa(pdf, M + 445, y, W - 445, 18, "Inscrição estadual", tr.ie);
  y += 18;
  const v6 = W / 6;
  caixa(pdf, M, y, v6, 18, "Quantidade", vol?.quantidade);
  caixa(pdf, M + v6, y, v6, 18, "Espécie", vol?.especie);
  caixa(pdf, M + 2 * v6, y, v6, 18, "Marca", vol?.marca);
  caixa(pdf, M + 3 * v6, y, v6, 18, "Numeração", vol?.numeracao);
  caixa(pdf, M + 4 * v6, y, v6, 18, "Peso bruto", vol?.pesoBruto ? brl(vol.pesoBruto, 3) : "", { alinhar: "right" });
  caixa(pdf, M + 5 * v6, y, v6, 18, "Peso líquido", vol?.pesoLiquido ? brl(vol.pesoLiquido, 3) : "", { alinhar: "right" });
  return y + 20;
}

// colunas da tabela de produtos (somam W)
const COLS: [string, number, "left" | "right" | "center"][] = [
  ["CÓDIGO PRODUTO", 52, "left"], ["DESCRIÇÃO DO PRODUTO / SERVIÇO", 147.28, "left"], ["NCM/SH", 34, "center"], ["O/CSOSN", 28, "center"],
  ["CFOP", 22, "center"], ["UN", 18, "center"], ["QUANT", 34, "right"], ["VALOR UNIT", 38, "right"], ["VALOR TOTAL", 38, "right"],
  ["VALOR DESC", 30, "right"], ["B.CÁLC ICMS", 30, "right"], ["VALOR ICMS", 28, "right"], ["VALOR IPI", 24, "right"], ["ALÍQ. ICMS", 22, "right"], ["ALÍQ. IPI", 22, "right"],
];

function tabela(pdf: Doc, itens: Danfe["itens"], inicio: number, y: number, limite: number, linha: number) {
  const topo = y;
  pdf.lineWidth(0.5).rect(M, y, W, limite - y).stroke();
  let x = M;
  for (const [r, w] of COLS) {
    pdf.font(F).fontSize(5.5).text(r, x + 1, y + 2, { width: w - 2, align: "center", height: 14 });
    x += w;
  }
  y += 16;
  pdf.moveTo(M, y).lineTo(M + W, y).stroke();
  let i = inicio;
  for (; i < itens.length; i++) {
    const it = itens[i];
    const desc = it.descricao + (it.infAdProd ? ` - ${it.infAdProd}` : "");
    pdf.font(F).fontSize(6.5);
    const hDesc = pdf.heightOfString(desc, { width: COLS[1][1] - 3 });
    const h = Math.max(linha, hDesc + 3);
    if (y + h > limite - 2) break;
    const vals = [it.codigo, desc, it.ncm, it.cst.length > 1 ? `${it.cst[0]}/${it.cst.slice(1)}` : it.cst, it.cfop, it.unidade, brl(it.quantidade, 4), brl(it.valorUnit, 4),
      brl(it.valorTotal), brl(it.desconto), brl(it.bcIcms), brl(it.vIcms), it.vIpi ? brl(it.vIpi) : "", brl(it.aliqIcms), it.aliqIpi ? brl(it.aliqIpi) : ""];
    x = M;
    COLS.forEach(([, w, al], k) => {
      pdf.text(vals[k], x + 1.5, y + 2, { width: w - 3, align: al, ...(k === 1 ? {} : { lineBreak: false }) });
      x += w;
    });
    y += h;
  }
  // linhas verticais tracejadas entre as colunas
  x = M;
  pdf.dash(1, { space: 1.5 });
  for (const [, w] of COLS.slice(0, -1)) {
    x += w;
    pdf.moveTo(x, topo + 16).lineTo(x, limite).stroke();
  }
  pdf.undash();
  return i;
}

function adicionais(pdf: Doc, d: Danfe, y: number) {
  titulo(pdf, y, "DADOS ADICIONAIS");
  y += 8;
  const wInf = W * 0.66;
  pdf.lineWidth(0.5).rect(M, y, wInf, 46).stroke().rect(M + wInf, y, W - wInf, 46).stroke();
  pdf.font(FB).fontSize(5.5).text("INFORMAÇÕES COMPLEMENTARES", M + 2, y + 2).text("RESERVADO AO FISCO", M + wInf + 2, y + 2);
  const trib = d.totais.vTotTrib ? `Valor aproximado dos tributos: R$ ${brl(d.totais.vTotTrib)}. ` : "";
  pdf.font(F).fontSize(7).text(`${d.infCpl || trib}`, M + 2, y + 10, { width: wInf - 4, height: 34, ellipsis: true });
}

export { lerDanfe };
