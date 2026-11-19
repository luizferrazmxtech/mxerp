import { Pagina } from "@/components/ui/Pagina";
import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { numerosPendentes } from "@/lib/fiscal/inutilizacao";
import { dataHora } from "@/lib/ui/format";
import BotaoAcao from "@/components/BotaoAcao";
import { inutilizarAcao } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inutilizar numeração" };

export default async function Inutilizacao() {
  await exigirArea("/fiscal");
  const e = await prisma.empresa.findFirst();
  const ambiente = e?.ambienteFiscal ?? "HOMOLOGACAO";
  const series = e ? [{ modelo: "NFE" as const, serie: e.serieNfe, rotulo: "NF-e" }, { modelo: "NFCE" as const, serie: e.serieNfce, rotulo: "NFC-e" }] : [];
  const pendentes = await Promise.all(series.map(async (x) => ({ ...x, faixas: await numerosPendentes(x.modelo, x.serie, ambiente) })));
  const historico = await prisma.inutilizacaoNumeracao.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <Pagina titulo="Inutilizar numeração" icone="notas" trilha={[{ rotulo: "Notas fiscais", href: "/fiscal" }, { rotulo: "Inutilizar numeração" }]}>
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500">
          Número de NF-e/NFC-e que foi rejeitado ou pulado precisa ser inutilizado na SEFAZ até o dia 10 do mês seguinte.
          Ambiente atual: <b>{ambiente === "PRODUCAO" ? "produção" : "homologação"}</b>.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {pendentes.map((p) => (
          <div key={p.modelo} className="cartao p-4 text-sm">
            <h2 className="mb-2 font-semibold">{p.rotulo} série {p.serie}: números pendentes</h2>
            {!p.faixas.length && <p className="text-emerald-700">Nenhum número pendente.</p>}
            {p.faixas.map((f) => (
              <div key={f.inicio} className="mb-3 rounded border p-2">
                <div className="font-medium">{f.inicio === f.fim ? `Nº ${f.inicio}` : `Nº ${f.inicio} a ${f.fim}`}</div>
                {f.notas.map((n) => (
                  <div key={n.id} className="text-[12px] text-slate-600"><Link href={`/fiscal/${n.id}`} className="text-marca hover:underline">nº {n.numero}</Link> {n.status.toLowerCase()}: {n.motivo}</div>
                ))}
                {f.notas.length < f.fim - f.inicio + 1 && <div className="text-[12px] text-slate-500">número(s) reservado(s) sem nota</div>}
                <div className="mt-2">
                  <BotaoAcao acao={inutilizarAcao} campos={{ modelo: p.modelo, serie: String(p.serie), inicio: String(f.inicio), fim: String(f.fim) }} rotulo="Inutilizar na SEFAZ" secundario>
                    <input name="justificativa" required minLength={15} className="campo" defaultValue="Numero nao utilizado por rejeicao na emissao" />
                  </BotaoAcao>
                </div>
              </div>
            ))}
          </div>
        ))}
        {!series.length && <p className="text-sm text-red-700">Cadastre os dados da empresa em Notas fiscais.</p>}
      </div>

      <div className="cartao p-4">
        <h2 className="mb-2 font-semibold">Inutilizar outra faixa</h2>
        <BotaoAcao acao={inutilizarAcao} campos={{}} rotulo="Inutilizar na SEFAZ">
          <div className="grid gap-2 md:grid-cols-5">
            <select name="modelo" className="campo"><option value="NFE">NF-e (55)</option><option value="NFCE">NFC-e (65)</option></select>
            <input name="serie" required type="number" min={0} defaultValue={e?.serieNfe ?? 1} className="campo" placeholder="Série" />
            <input name="inicio" required type="number" min={1} className="campo" placeholder="Nº inicial" />
            <input name="fim" type="number" min={1} className="campo" placeholder="Nº final" />
            <input name="justificativa" required minLength={15} className="campo" placeholder="Justificativa (15+ caracteres)" />
          </div>
        </BotaoAcao>
      </div>

      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Data</th><th>Modelo</th><th>Série</th><th>Números</th><th>Situação</th><th>Protocolo</th><th>Justificativa / retorno</th></tr></thead>
          <tbody>
            {historico.map((h) => (
              <tr key={h.id}>
                <td>{dataHora(h.createdAt)}</td><td>{h.modelo === "NFE" ? "NF-e" : "NFC-e"}{h.ambiente === "HOMOLOGACAO" && <span className="ml-1 text-xs text-amber-700">homolog.</span>}</td>
                <td>{h.serie}</td><td>{h.numeroInicial === h.numeroFinal ? h.numeroInicial : `${h.numeroInicial} a ${h.numeroFinal}`}</td>
                <td className={h.status === "HOMOLOGADA" ? "text-emerald-700" : "text-red-700"}>{h.status.toLowerCase()}</td>
                <td>{h.protocolo}</td>
                <td className="text-xs text-slate-600">{h.justificativa}<div>{h.motivo}</div></td>
              </tr>
            ))}
            {!historico.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhuma inutilização feita.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
    </Pagina>
  );
}
