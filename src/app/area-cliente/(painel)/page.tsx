import Link from "next/link";
import Resumo from "@/components/ui/Resumo";
import { ListaContas, ListaNotas, Secao, Situacao, Titulo } from "@/components/portal/ui";
import { exigirCliente } from "@/lib/portal/atual";
import { resumoCliente } from "@/lib/portal/dados";
import { brl, dataSP } from "@/lib/ui/format";

export const metadata = { title: "Área do Cliente" };

export default async function InicioPortal() {
  const c = await exigirCliente();
  const r = await resumoCliente(c.id);
  // pessoa física: o primeiro nome; empresa: o nome fantasia como está no cadastro
  const pf = c.nome.split(/\s+/)[0];
  const nome = c.tipoPessoa === "FISICA" ? pf.charAt(0) + pf.slice(1).toLowerCase() : c.fantasia || c.nome;
  const h = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return (
    <>
      <Titulo titulo={`${saudacao}, ${nome}!`} subtitulo="Acompanhe aqui seus serviços, compras, notas e pagamentos." />
      <Resumo compacto cartoes={[
        { rotulo: "OS em andamento", valor: String(r.os.andamento.length), legenda: `${r.os.total} no total`, icone: "os", cor: "azul", href: "/area-cliente/os" },
        { rotulo: "Compras em aberto", valor: String(r.vendas.abertas), legenda: `${r.vendas.total} no total`, icone: "vendas", cor: "tinta", href: "/area-cliente/compras" },
        { rotulo: "Notas fiscais", valor: String(r.notas.total), legenda: "PDF e XML para baixar", icone: "notas", cor: "verde", href: "/area-cliente/notas" },
        { rotulo: r.financeiro.qtdVencido ? "Pagamentos vencidos" : "A pagar", valor: brl(r.financeiro.qtdVencido ? r.financeiro.vencido : r.financeiro.emAberto),
          legenda: r.financeiro.qtdAberto ? `${r.financeiro.qtdAberto} parcela${r.financeiro.qtdAberto === 1 ? "" : "s"} em aberto` : "nada em aberto",
          icone: r.financeiro.qtdVencido ? "atrasado" : "boleto", cor: r.financeiro.qtdVencido ? "vermelho" : "amarelo", href: "/area-cliente/financeiro" },
      ]} />

      <div className="grid gap-3 lg:grid-cols-2">
        <Secao titulo="Ordens de serviço em andamento" icone="os" corpo="p-0">
          {r.os.andamento.length ? (
            <ul className="divide-y divide-slate-100">
              {r.os.andamento.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link href={`/area-cliente/os/${o.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">OS nº {o.numero}</div>
                      <div className="truncate text-[12px] text-slate-500">{o.equipamentos.join(", ") || `Aberta em ${dataSP(o.entrada)}`}</div>
                    </div>
                    <Situacao {...o.situacao} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-6 text-center text-[13px] text-slate-500">Nenhuma OS em andamento. <Link href="/area-cliente/os" className="text-marca hover:underline">Ver todas</Link></p>}
        </Secao>
        <Secao titulo="Próximos pagamentos" icone="boleto" corpo="p-0">
          <ListaContas contas={r.financeiro.proximas} vazio="Nenhum pagamento em aberto." />
        </Secao>
      </div>
      <Secao titulo="Últimas notas fiscais" icone="notas" corpo="p-0">
        <ListaNotas notas={r.notas.recentes} />
      </Secao>
    </>
  );
}
