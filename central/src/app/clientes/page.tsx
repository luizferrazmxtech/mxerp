import Link from "next/link";
import { prisma } from "@/lib/db";
import { ler } from "@/lib/config";
import { diaSP, moeda } from "@/lib/datas";
import { situacaoLicenca, ROTULO_LICENCA } from "@/lib/regua";
import { valorDoCliente } from "@/lib/faturas";
import { noAr } from "@/lib/saude";
import { urlSistema } from "@/lib/clienteZero";
import { Pagina, Pilula, Aviso, Resumo, Lista, NoAr } from "@/components/ui";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";

export default async function Clientes({ searchParams }: { searchParams: Promise<{ filtro?: string; ok?: string }> }) {
  const sp = await searchParams;
  const hoje = diaSP();
  const [clientes, regua] = await Promise.all([
    prisma.cliente.findMany({ include: { plano: true, faturas: { where: { situacao: "ABERTA" } } }, orderBy: [{ interno: "desc" }, { nome: "asc" }] }),
    ler("regua"),
  ]);
  const linhas = await Promise.all(clientes.map(async (c) => ({
    c, l: situacaoLicenca(c, c.faturas.filter((f) => f.vencimento <= hoje), hoje, regua), ar: c.situacao === "ATIVO" ? await noAr(c) : null,
  })));
  const revenda = linhas.filter((x) => !x.c.interno);
  const visiveis = sp.filtro === "atraso" ? revenda.filter((x) => x.l.situacao !== "EM_DIA")
    : sp.filtro === "fora" ? linhas.filter((x) => x.ar === false)
    : sp.filtro === "suspensos" ? revenda.filter((x) => x.c.situacao === "SUSPENSO" || x.c.situacao === "CANCELADO") : linhas;
  const ativos = revenda.filter((x) => x.c.situacao === "ATIVO");
  const atraso = revenda.filter((x) => x.l.situacao !== "EM_DIA").length;
  const filtro = (f: string) => (sp.filtro === f ? "/clientes" : `/clientes?filtro=${f}`);
  return (
    <Pagina titulo="Clientes" icone="clientes" trilha={[{ rotulo: "Clientes" }]}
      acoes={<Link className="btn" href="/clientes/novo"><Icone nome="mais" size={15} /> Adicionar</Link>}>
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      <Resumo cartoes={[
        { rotulo: "Clientes ativos", valor: ativos.length, icone: "clientes", cor: "tinta", legenda: moeda(ativos.reduce((s, x) => s + valorDoCliente(x.c), 0)) + " por mês" },
        { rotulo: "Com atraso", valor: atraso, icone: "atrasado", cor: "vermelho", pct: ativos.length ? (atraso / ativos.length) * 100 : 0, href: filtro("atraso"), ativo: sp.filtro === "atraso" },
        { rotulo: "Fora do ar", valor: linhas.filter((x) => x.ar === false).length, icone: "tarefas", cor: "amarelo", href: filtro("fora"), ativo: sp.filtro === "fora" },
        { rotulo: "Suspensos e cancelados", valor: revenda.length - ativos.length - revenda.filter((x) => x.c.situacao === "CRIANDO").length, icone: "sair", cor: "cinza", href: filtro("suspensos"), ativo: sp.filtro === "suspensos" },
      ]} />
      <Lista total={visiveis.length}>
        <table className="tabela">
          <thead><tr><th>Cliente</th><th>Endereço</th><th>Plano</th><th className="text-right">Mensalidade</th><th>Cadastro</th><th>Licença</th><th>Sistema</th></tr></thead>
          <tbody>
            {visiveis.length === 0 && <tr><td colSpan={7} className="text-slate-500">Nenhum cliente.</td></tr>}
            {visiveis.map(({ c, l, ar }) => (
              <tr key={c.id}>
                <td><Link className="sublinhado" href={`/clientes/${c.id}`}>{c.nome}</Link><div className="text-[12px] text-slate-500">{c.slug}</div></td>
                <td><a className="inline-flex items-center gap-1 text-marca hover:underline" href={urlSistema(c.dominio)} target="_blank" rel="noreferrer">{c.dominio} <Icone nome="abrir" size={12} /></a></td>
                {c.interno ? (
                  <><td colSpan={2}><span className="etiqueta text-marca">sistema da casa · sem cobrança</span></td><td><Pilula valor="CASA" rotulo="MXTECH" /></td><td className="text-slate-400">—</td></>
                ) : (
                  <>
                    <td>{c.plano?.nome ?? "—"}</td>
                    <td className="text-right">{moeda(valorDoCliente(c))}</td>
                    <td><Pilula valor={c.situacao} /></td>
                    <td><Pilula valor={l.situacao} rotulo={`${ROTULO_LICENCA[l.situacao]}${l.diasAtraso ? ` · ${l.diasAtraso}d` : ""}`} /></td>
                  </>
                )}
                <td><NoAr ar={ar} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Lista>
    </Pagina>
  );
}
