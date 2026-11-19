import Link from "next/link";
import { Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";

export const metadata = { title: "Relatórios" };

const RELATORIOS = [
  { href: "/relatorios/lucro", icone: "dinheiro", titulo: "Lucro das vendas e OS", texto: "Receita, custo das peças, lucro e margem por documento, cliente, vendedor, produto ou serviço." },
  { href: "/relatorios/curva-abc", icone: "grafico", titulo: "Curva ABC", texto: "Produtos, serviços ou clientes que fazem 80% (A), 15% (B) e 5% (C) do faturamento, da quantidade ou do lucro." },
  { href: "/relatorios/comissoes", icone: "percentual", titulo: "Comissões", texto: "Comissão de vendedores e técnicos pelo % do cadastro, com o valor já liberado conforme o recebimento." },
  { href: "/relatorios/tempo-os", icone: "relogio", titulo: "Situação × tempo das OS", texto: "Quanto tempo as OS ficam em cada situação, tempo total por técnico e OS entregues fora da previsão." },
  { href: "/financeiro/dre", icone: "dre", titulo: "DRE gerencial", texto: "Resultado mês a mês por competência ou caixa, com filtro por centro de custo." },
  { href: "/financeiro/fluxo", icone: "financeiro", titulo: "Fluxo de caixa", texto: "Saldo, entradas e saídas realizadas e previstas por dia e por mês." },
  { href: "/estoque/custos", icone: "estoque", titulo: "Custos e margens", texto: "Custo, preço e margem de cada produto em estoque." },
];

export default function Relatorios() {
  return (
    <Pagina titulo="Relatórios" icone="grafico" trilha={[{ rotulo: "Relatórios" }]}>
      <div className="grid gap-3 md:grid-cols-3">
        {RELATORIOS.map((r) => (
          <Link key={r.href} href={r.href} className="cartao flex gap-3 p-4 hover:border-marca">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-marca"><Icone nome={r.icone} size={18} /></span>
            <span><b className="block">{r.titulo}</b><span className="text-[12px] text-slate-500">{r.texto}</span><span className="mt-1 block text-[12px] text-marca">Abrir relatório ›</span></span>
          </Link>
        ))}
      </div>
    </Pagina>
  );
}
