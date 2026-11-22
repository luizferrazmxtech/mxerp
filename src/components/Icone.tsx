import {
  AlarmClock, ArrowLeftRight, BadgeDollarSign, Banknote, BarChart3, Box, Boxes, Calculator, CalendarClock, CalendarDays,
  ChartNoAxesColumn, ChevronDown, ChevronRight, ChevronUp, GripVertical, CircleAlert, ClipboardList, Copy, CreditCard, Eye, FileText, Gauge,
  HandCoins, House, IdCard, KeyRound, Landmark, LayoutGrid, List, LogOut, MapPin, Menu, MonitorSmartphone, MoreVertical,
  Package, Pencil, Plus, Printer, ReceiptText, RefreshCw, Search, Settings, Settings2, Share2, ShoppingBasket, ShoppingCart,
  SlidersHorizontal, Store, Factory, Paperclip, StickyNote, MessageCircle, Send, ShieldCheck, Info, Camera, Contact, Percent, Download, Mail, Check, Megaphone, ListChecks, Phone, UserRound, Upload as Enviar, FileSpreadsheet, Tag, Trash2, Truck, Upload, User, Users, Wallet, Wrench, X, Zap, ScanBarcode, ClipboardCheck, Scale, Repeat, Headset,
  Barcode, Diamond, CircleCheck, Clock, TriangleAlert, Sigma, Smartphone, UsersRound, Star, GitCompareArrows,
} from "lucide-react";
import type { LucideProps } from "lucide-react";

/** Ícones do sistema por nome (o menu e as páginas usam nomes, não componentes). */
const ICONES = {
  cadastros: IdCard, clientes: Users, funcionarios: User, itens: Boxes, produtos: Package, servicos: Wrench,
  vendas: ShoppingBasket, balcao: Store, os: Wrench, gerenciar: ClipboardList, painel: Gauge, estoque: Box,
  locais: MapPin, financeiro: Landmark, receber: HandCoins, pagar: Wallet, conciliacao: ArrowLeftRight, dre: BarChart3,
  fiscal: FileText, notas: ReceiptText, configuracoes: Settings, migracao: Upload, senha: KeyRound, inicio: House,
  menu: Menu, sair: LogOut, mais: Plus, editar: Pencil, ver: Search, olho: Eye, opcoes: MoreVertical, compartilhar: Share2,
  imprimir: Printer, copiar: Copy, excluir: Trash2, buscar: Search, filtro: SlidersHorizontal, lista: List, cards: LayoutGrid,
  calendario: CalendarDays, prazo: CalendarClock, alerta: CircleAlert, urgente: Zap, relogio: AlarmClock, atualizar: RefreshCw,
  grafico: ChartNoAxesColumn, estrela: Star, comparar: GitCompareArrows, dinheiro: Banknote, cartao: CreditCard, caixa: Calculator, etiqueta: Tag, frete: Truck,
  carrinho: ShoppingCart, pdv: MonitorSmartphone, valor: BadgeDollarSign, fechar: X, abaixo: ChevronDown, direita: ChevronRight,
  ajustes: Settings2, fornecedores: Factory, anexos: Paperclip, anotacoes: StickyNote, whatsapp: MessageCircle, envios: Send,
  serasa: ShieldCheck, detalhes: Info, foto: Camera, contatos: Contact, percentual: Percent, exportar: Download, importar: Enviar,
  email: Mail, ok: Check, auxiliares: Megaphone, colunas: ListChecks, telefone: Phone, pessoa: UserRound, eventos: CalendarDays,
  cima: ChevronUp, arrastar: GripVertical, planilha: FileSpreadsheet, chave: KeyRound, endereco: MapPin, lojas: Store, transportadoras: Truck, leitor: ScanBarcode, inventario: ClipboardCheck, transferir: ArrowLeftRight, cotacao: Scale, contratos: Repeat, atendimento: Headset,
  boleto: Barcode, pix: Diamond, confirmado: CircleCheck, hoje: Clock, atrasado: TriangleAlert, total: Sigma, celular: Smartphone, equipe: UsersRound,
} as const;

export type NomeIcone = keyof typeof ICONES;

export default function Icone({ nome, ...p }: { nome: NomeIcone | string } & LucideProps) {
  const C = ICONES[nome as NomeIcone] ?? Box;
  return <C size={16} strokeWidth={1.8} {...p} />;
}
