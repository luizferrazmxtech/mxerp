import type { Prisma } from "@prisma/client";

type Num = number | Prisma.Decimal | string | null | undefined;

export const brl = (v: Num) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const qtd = (v: Num) =>
  Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 4 });

export const data = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR") : "—";

export const dataHora = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const SP = "America/Sao_Paulo";

/** Data de um instante (timestamp) no fuso de São Paulo. Para colunas @db.Date use `data`. */
export const dataSP = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { timeZone: SP }) : "—";

export const horaSP = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleTimeString("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" }) : "";

/** Número no formato brasileiro sem o "R$" (como nas listas: 2.125,80). */
export const num2 = (v: Num) => Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** CNPJ/CPF com pontuação. */
export const docFmt = (d: string | null | undefined) =>
  !d ? "" : d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
