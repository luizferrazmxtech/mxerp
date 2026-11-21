import type { Prisma } from "@prisma/client";
import { prisma } from "./db";

/** Tipos que o operador da VPS entende (vps/scripts/operador.sh). */
export const TIPOS = {
  CRIAR: "Criar sistema do cliente",
  BACKUP: "Backup agora",
  RESTAURAR: "Restaurar cópia",
  ATUALIZAR_TODOS: "Atualizar todos para a versão nova",
  SUSPENDER: "Suspender",
  REATIVAR: "Reativar",
  HORARIOS: "Mudar horários de backup",
  DOMINIO: "Mudar endereço",
} as const;
export type TipoTarefa = keyof typeof TIPOS;

export async function pedir(tipo: TipoTarefa, clienteId: string | null, parametros: Record<string, string> = {}, pedidoPor?: string) {
  // não empilha a mesma tarefa duas vezes enquanto a primeira não terminou
  const igual = await prisma.tarefa.findFirst({ where: { tipo, clienteId, situacao: { in: ["PENDENTE", "EXECUTANDO"] } } });
  if (igual && tipo !== "HORARIOS" && tipo !== "DOMINIO") return igual;
  return prisma.tarefa.create({ data: { tipo, clienteId, parametros: parametros as Prisma.InputJsonValue, pedidoPor } });
}
