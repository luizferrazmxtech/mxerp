import {
  Barcode, CircleCheck, Clock, Database, Download, ExternalLink, Gauge, House, LogOut, Menu, Plus, ReceiptText,
  RefreshCw, RotateCcw, Server, Settings, Sigma, Tag, TriangleAlert, Users, Wallet, ChevronDown, Building2, Mail, Landmark, Pencil,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

/** Ícones por nome (os mesmos desenhos do MXERP). */
const ICONES = {
  painel: Gauge, clientes: Users, mensalidades: ReceiptText, planos: Tag, tarefas: Server, configuracoes: Settings,
  menu: Menu, sair: LogOut, mais: Plus, backup: Database, baixar: Download, restaurar: RotateCcw, atualizar: RefreshCw,
  abrir: ExternalLink, inicio: House, boleto: Barcode, ok: CircleCheck, hoje: Clock, total: Sigma, atrasado: TriangleAlert,
  dinheiro: Wallet, abaixo: ChevronDown, relogio: Clock, empresa: Building2, email: Mail, banco: Landmark, editar: Pencil,
} as const;

export type NomeIcone = keyof typeof ICONES;

export default function Icone({ nome, size = 16, ...p }: { nome: NomeIcone } & LucideProps) {
  const C = ICONES[nome];
  return <C size={size} strokeWidth={1.8} aria-hidden {...p} />;
}
