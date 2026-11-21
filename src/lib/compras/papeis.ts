import type { PapelUsuario } from "@prisma/client";

/** Quem lança compras, inventários e transferências de estoque (o técnico e o caixa só consultam). */
export const PODE_LANCAR_ESTOQUE: readonly PapelUsuario[] = ["ADMIN", "GERENTE", "OPERADOR"];
