import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ler } from "@/lib/config";
import { dataBR, dataHoraBR, diaSP, moeda } from "@/lib/datas";
import { situacaoLicenca, ROTULO_LICENCA } from "@/lib/regua";
import { valorDoCliente } from "@/lib/faturas";
import { listarBackups, tamanhoLegivel } from "@/lib/backups";
import { noAr } from "@/lib/saude";
import { TIPOS, type TipoTarefa } from "@/lib/tarefas";
import FormCliente from "@/components/FormCliente";
import TabelaFaturas from "@/components/TabelaFaturas";
import { Pagina, Bloco, Pilula, Aviso, Campo } from "@/components/ui";
import { acaoCliente, salvarCliente, backupAgora, salvarHorarios, restaurar } from "../../acoes";

export const dynamic = "force-dynamic";

const ABAS = [["resumo", "Resumo"], ["dados", "Cadastro"], ["faturas", "Mensalidades"], ["backups", "Backups"], ["tarefas", "Tarefas"]] as const;

export default async function ClienteVer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string; ok?: string; erro?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const aba = sp.aba ?? "resumo";
  const c = await prisma.cliente.findUnique({ where: { id }, include: { plano: true, faturas: { orderBy: { vencimento: "desc" } }, tarefas: { orderBy: { createdAt: "desc" }, take: 30 } } });
  if (!c) notFound();
  const hoje = diaSP();
  const regua = await ler("regua");
  const l = situacaoLicenca(c, c.faturas.filter((f) => f.situacao === "ABERTA" && f.vencimento <= hoje), hoje, regua);
  const ar = c.situacao === "ATIVO" ? await noAr(c.slug) : null;
  const acao = (nome: string, rotulo: string, cls = "btn-sec", extra?: React.ReactNode) => (
    <form action={acaoCliente} className="inline-flex items-center gap-1">
      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="acao" value={nome} />{extra}
      <button className={cls}>{rotulo}</button>
    </form>
  );

  return (
    <Pagina titulo={c.nome} sub={<><a className="text-marca hover:underline" href={`https://${c.dominio}`} target="_blank" rel="noreferrer">{c.dominio}</a> · {c.slug}</>}
      acoes={<Link className="btn-sec" href="/clientes">Voltar</Link>}>
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      {sp.erro && <Aviso tipo="erro">{sp.erro}</Aviso>}
      <div className="mb-4 flex flex-wrap gap-1">
        {ABAS.map(([k, r]) => <Link key={k} href={`/clientes/${c.id}?aba=${k}`} className={`aba ${aba === k ? "aba-ativa" : ""}`}>{r}</Link>)}
      </div>

      {aba === "resumo" && (
        <>
          <div className="mb-4 grid gap-3 md:grid-cols-4">
            <div className="cartao p-4"><div className="rotulo">Cadastro</div><Pilula valor={c.situacao} /></div>
            <div className="cartao p-4"><div className="rotulo">Licença (o que o cliente vê)</div><Pilula valor={l.situacao} rotulo={ROTULO_LICENCA[l.situacao]} />{l.diasAtraso > 0 && <span className="ml-2 text-[13px]">{l.diasAtraso} dia(s) de atraso</span>}</div>
            <div className="cartao p-4"><div className="rotulo">Plano</div>{c.plano.nome} · {moeda(valorDoCliente(c))}<div className="text-[12px] text-slate-500">{c.maxEmpresas ?? c.plano.maxEmpresas} CNPJ(s) · {c.maxUsuarios ?? c.plano.maxUsuarios} usuário(s) · vence dia {c.diaVencimento}</div></div>
            <div className="cartao p-4"><div className="rotulo">Sistema</div>{ar === null ? "—" : ar ? <span className="text-emerald-700">no ar</span> : <span className="font-semibold text-red-700">fora do ar</span>}</div>
          </div>
          {c.liberadoAte && c.liberadoAte >= hoje && <Aviso tipo="info">Liberado manualmente até {dataBR(c.liberadoAte)}: não passa de “aviso” mesmo com atraso.</Aviso>}
          <Bloco titulo="Ações">
            <div className="flex flex-wrap items-center gap-2">
              {acao("liberar", "Liberar mesmo com atraso", "btn-sec", <input name="dias" type="number" min={1} max={60} defaultValue={5} className="campo w-20" title="dias" />)}
              {c.liberadoAte && acao("retirar-liberacao", "Retirar liberação")}
              {c.situacao === "ATIVO" && acao("suspender", "Suspender (tira do ar)", "btn-laranja")}
              {(c.situacao === "SUSPENSO" || c.situacao === "CANCELADO") && acao("reativar", "Reativar", "btn-verde")}
              {c.situacao === "CRIANDO" && acao("recriar", "Pedir a criação de novo")}
              {c.situacao !== "CANCELADO" && acao("cancelar", "Cancelar cliente", "btn-sec text-red-700")}
            </div>
            <p className="mt-3 text-[12px] text-slate-500">Suspender e cancelar nunca apagam dados. Cancelar faz um backup final, para a cobrança e tira o sistema do ar.</p>
          </Bloco>
          <Bloco titulo="Endereço de acesso">
            <form action={acaoCliente} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={c.id} /><input type="hidden" name="acao" value="dominio" />
              <Campo rotulo="Endereço (subdomínio ou domínio próprio do cliente)"><input name="dominio" defaultValue={c.dominio} className="campo w-80" /></Campo>
              <button className="btn-sec">Trocar endereço</button>
            </form>
          </Bloco>
        </>
      )}

      {aba === "dados" && (
        <form action={salvarCliente}>
          <input type="hidden" name="id" value={c.id} />
          <Bloco titulo="Cadastro e cobrança"><FormCliente c={c} planos={await prisma.plano.findMany({ where: { OR: [{ ativo: true }, { id: c.planoId }] }, orderBy: { valorMensal: "asc" } })} /></Bloco>
          <button className="btn-marca">Salvar</button>
        </form>
      )}

      {aba === "faturas" && <Bloco titulo="Mensalidades"><TabelaFaturas faturas={c.faturas.map((f) => ({ ...f, cliente: c }))} volta={`/clientes/${c.id}?aba=faturas`} semCliente /></Bloco>}

      {aba === "backups" && <Backups c={c} />}

      {aba === "tarefas" && (
        <Bloco titulo="Tarefas da VPS deste cliente">
          <table className="tabela"><thead><tr><th>Quando</th><th>Tarefa</th><th>Situação</th><th>Resultado</th></tr></thead><tbody>
            {c.tarefas.map((t) => <tr key={t.id}><td className="whitespace-nowrap">{dataHoraBR(t.createdAt)}</td><td>{TIPOS[t.tipo as TipoTarefa] ?? t.tipo}</td><td><Pilula valor={t.situacao} /></td><td><pre className="max-h-40 overflow-auto whitespace-pre-wrap text-[12px]">{t.saida?.slice(-1500)}</pre></td></tr>)}
          </tbody></table>
        </Bloco>
      )}
    </Pagina>
  );
}

async function Backups({ c }: { c: { id: string; slug: string; backupHorarios: string } }) {
  const lista = await listarBackups(c.slug);
  const horarios = c.backupHorarios.split(",").filter(Boolean).map((h) => `${h.slice(0, 2)}:${h.slice(2)}`);
  return (
    <>
      <Bloco titulo="Agendamento" acoes={<form action={backupAgora}><input type="hidden" name="id" value={c.id} /><button className="btn-marca">Fazer backup agora</button></form>}>
        <form action={salvarHorarios} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="id" value={c.id} />
          {[0, 1, 2, 3].map((i) => <Campo key={i} rotulo={`Horário ${i + 1}`}><input name="horario" type="time" defaultValue={horarios[i] ?? ""} className="campo w-32" /></Campo>)}
          <button className="btn-sec">Salvar horários</button>
        </form>
        <p className="mt-2 text-[12px] text-slate-500">As cópias ficam na VPS pelo prazo configurado (padrão 30 dias) e, com a cópia externa ligada, também fora dela.</p>
      </Bloco>
      <Bloco titulo={`Cópias (${lista.length})`}>
        {lista.length === 0 ? <p className="text-slate-500">Nenhuma cópia ainda.</p> : (
          <table className="tabela"><thead><tr><th>Quando</th><th>Tipo</th><th className="text-right">Tamanho</th><th></th></tr></thead><tbody>
            {lista.map((b) => (
              <tr key={b.nome}>
                <td>{dataHoraBR(b.quando)}</td><td>{b.motivo.replaceAll("-", " ")}</td><td className="text-right">{tamanhoLegivel(b.tamanho)}</td>
                <td className="whitespace-nowrap">
                  <a className="btn-sec mr-2" href={`/api/backups/${c.slug}/${b.nome}`}>Baixar</a>
                  <details className="inline-block align-top">
                    <summary className="btn-sec cursor-pointer list-none">Restaurar…</summary>
                    <form action={restaurar} className="mt-2 w-72 rounded border border-red-200 bg-red-50 p-3 text-[13px]">
                      <input type="hidden" name="id" value={c.id} /><input type="hidden" name="arquivo" value={b.nome} />
                      <p className="mb-2">Isto troca <b>todos</b> os dados atuais do cliente pelos desta cópia. Antes, a VPS guarda uma cópia do estado atual. Digite <b>{c.slug}</b> para confirmar:</p>
                      <input name="confirmacao" className="campo mb-2" autoComplete="off" />
                      <button className="btn w-full bg-red-700 hover:bg-red-800">Restaurar esta cópia</button>
                    </form>
                  </details>
                </td>
              </tr>
            ))}
          </tbody></table>
        )}
      </Bloco>
    </>
  );
}
