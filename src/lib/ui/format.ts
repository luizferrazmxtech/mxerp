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
