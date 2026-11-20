import Link from "next/link";
import { prisma } from "@/lib/db";
import { ler } from "@/lib/config";
import { diaSP, moeda } from "@/lib/datas";
import { situacaoLicenca, ROTULO_LICENCA } from "@/lib/regua";
import { valorDoCliente } from "@/lib/faturas";
import { noAr } from "@/lib/saude";
import { Pagina, Pilula, Aviso } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Clientes({ searchParams }: { searchParams: Promise<{ filtro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const hoje = diaSP();
  const [clientes, regua] = await Promise.all([prisma.cliente.findMany({ include: { plano: true, faturas: { where: { situacao: "ABERTA" } } }, orderBy: { nome: "asc" } }), ler("regua")]);
  const linhas = await Promise.all(clientes.map(async (c) => ({ c, l: situacaoLicenca(c, c.faturas.filter((f) => f.vencimento <= hoje), hoje, regua), ar: c.situacao === "ATIVO" ? await noAr(c.slug) : null })));
  const visiveis = sp.filtro === "atraso" ? linhas.filter((x) => x.l.situacao !== "EM_DIA") : linhas;
  return (
    <Pagina titulo="Clientes" sub="Cada cliente tem sistema e banco de dados próprios na VPS" acoes={<Link className="btn-marca" href="/clientes/novo">+ Novo cliente</Link>}>
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Cliente</th><th>Endereço</th><th>Plano</th><th className="text-right">Mensalidade</th><th>Cadastro</th><th>Licença</th><th>Sistema</th></tr></thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={7} className="text-slate-500">Nenhum cliente.</td></tr>}
            {visiveis.map(({ c, l, ar }) => (
              <tr key={c.id}>
                <td><Link className="sublinhado" href={`/clientes/${c.id}`}>{c.nome}</Link><div className="text-[12px] text-slate-500">{c.slug}</div></td>
                <td><a className="text-marca hover:underline" href={`https://${c.dominio}`} target="_blank" rel="noreferrer">{c.dominio}</a></td>
                <td>{c.plano.nome}</td>
                <td className="text-right">{moeda(valorDoCliente(c))}</td>
                <td><Pilula valor={c.situacao} /></td>
                <td><Pilula valor={l.situacao} rotulo={`${ROTULO_LICENCA[l.situacao]}${l.diasAtraso ? ` · ${l.diasAtraso}d` : ""}`} /></td>
                <td>{ar === null ? "—" : ar ? <span className="text-emerald-700">no ar</span> : <span className="font-semibold text-red-700">fora do ar</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
