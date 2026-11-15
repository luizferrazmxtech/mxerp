import ExcelJS from "exceljs";
import Papa from "papaparse";

/** Lê .xlsx ou .csv e devolve linhas como objetos { cabeçalho normalizado: valor }. */
export type Linha = Record<string, string>;

export const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function celula(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    if ("text" in v && v.text != null) return String(v.text);
    if ("result" in v && v.result != null) return celula(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("hyperlink" in v) return String((v as { text?: string }).text ?? v.hyperlink);
  }
  return String(v).trim();
}

export async function lerPlanilha(nome: string, conteudo: Buffer): Promise<{ cabecalhos: string[]; linhas: Linha[] }> {
  if (/\.csv$/i.test(nome) || /\.txt$/i.test(nome)) {
    let texto = conteudo.toString("utf8");
    if (texto.includes("�")) texto = conteudo.toString("latin1"); // exportações em Windows-1252
    const r = Papa.parse<string[]>(texto.replace(/^﻿/, ""), { skipEmptyLines: true, delimiter: "" });
    // cabeçalho = primeira linha com 3+ células preenchidas (extratos de banco trazem linhas de título antes)
    const iCab = Math.max(0, r.data.slice(0, 15).findIndex((l) => l.filter((c) => c.trim()).length >= 3));
    const [cab, ...resto] = r.data.slice(iCab);
    const cabecalhos = cab.map((c) => normalizar(c));
    return { cabecalhos, linhas: resto.map((l) => Object.fromEntries(cabecalhos.map((c, i) => [c, (l[i] ?? "").trim()]))) };
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(conteudo as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Planilha vazia");
  // cabeçalho = primeira linha com 2+ células preenchidas
  let linhaCab = 1;
  for (let i = 1; i <= Math.min(10, ws.rowCount); i++) {
    const vals = (ws.getRow(i).values as ExcelJS.CellValue[]).filter((v) => celula(v));
    if (vals.length >= 2) { linhaCab = i; break; }
  }
  const cabRow = ws.getRow(linhaCab);
  const cabecalhos: string[] = [];
  cabRow.eachCell({ includeEmpty: true }, (c, col) => (cabecalhos[col - 1] = normalizar(celula(c.value))));
  const linhas: Linha[] = [];
  for (let i = linhaCab + 1; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    const o: Linha = {};
    let algum = false;
    cabecalhos.forEach((c, idx) => {
      if (!c) return;
      const v = celula(r.getCell(idx + 1).value);
      if (v) algum = true;
      o[c] = v;
    });
    if (algum) linhas.push(o);
  }
  return { cabecalhos: cabecalhos.filter(Boolean), linhas };
}

/** Procura o valor da primeira coluna que bater com algum apelido. */
export function campo(l: Linha, apelidos: string[]): string {
  for (const a of apelidos) {
    const k = normalizar(a);
    if (l[k] !== undefined && l[k] !== "") return l[k];
  }
  return "";
}

export function achouColuna(cabecalhos: string[], apelidos: string[]): string | null {
  for (const a of apelidos) if (cabecalhos.includes(normalizar(a))) return normalizar(a);
  return null;
}

/** "1.234,56" / "1234.56" / "R$ 10,00" → número. */
export function numeroBr(v: string): number {
  const s = v.replace(/[^\d,.-]/g, "");
  if (!s) return 0;
  if (s.includes(",")) return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(s) || 0;
}
