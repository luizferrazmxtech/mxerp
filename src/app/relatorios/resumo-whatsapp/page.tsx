import Link from "next/link";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormAcao from "@/components/financeiro/FormAcao";
import { exigirUsuario } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configResumo, DIAS_SEMANA, montarResumo } from "@/lib/relatorios/resumoSemanal";
import { foneBonito, whatsappAtivo } from "@/lib/whatsapp/mxchat";
import { salvarResumoAcao, testarResumoAcao } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resumo semanal no WhatsApp" };

export default async function ResumoWhatsapp() {
  await exigirUsuario(["ADMIN", "GERENTE"]);
  const [cfg, zap, envios, previa] = await Promise.all([
    configResumo(), whatsappAtivo(),
    prisma.mensagemWhatsapp.findMany({ where: { entidade: "RELATORIO" }, orderBy: { createdAt: "desc" }, take: 5 }),
    montarResumo(),
  ]);
  return (
    <Pagina titulo="Resumo semanal no WhatsApp" icone="whatsapp" trilha={[{ rotulo: "Relatórios", href: "/relatorios" }, { rotulo: "Resumo no WhatsApp" }]}>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <FormAcao acao={salvarResumoAcao} limpar={false}>
            <Bloco icone="whatsapp" titulo={<>Resumo <b>semanal</b></>} subtitulo="Uma vez por semana, no dia e a partir da hora escolhidos: faturamento e lucro da semana passada comparados com a anterior, maior cliente e produto, saldo de hoje, contas a receber vencidas e aviso se o saldo previsto fica negativo nos próximos 30 dias.">
              {!zap && <p className="mb-2 rounded bg-amber-50 px-3 py-2 text-[13px] text-amber-900">O WhatsApp (MXChat) ainda não está ligado. <Link href="/whatsapp" className="underline">Configure aqui</Link>.</p>}
              <div className="grid gap-3 md:grid-cols-[140px_1fr_140px_120px]">
                <label><span className="rotulo">Situação</span><select name="ativo" defaultValue={cfg.ativo ? "1" : "0"} className="campo"><option value="1">Ligado</option><option value="0">Desligado</option></select></label>
                <label><span className="rotulo">Números (um por linha)</span><textarea name="numeros" rows={2} className="campo" defaultValue={cfg.numeros.map((n) => foneBonito(n)).join("\n")} placeholder="(11) 98765-4321" /></label>
                <label><span className="rotulo">Dia</span><select name="dia" defaultValue={String(cfg.diaSemana)} className="campo">{DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
                <label><span className="rotulo">A partir das</span><select name="hora" defaultValue={String(cfg.hora)} className="campo">{Array.from({ length: 15 }, (_, i) => i + 6).map((h) => <option key={h} value={h}>{h}h</option>)}</select></label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="btn">Salvar</button>
                {cfg.ultimoEnvio && <span className="text-[12px] text-slate-500">Último resumo automático: {cfg.ultimoEnvio.split("-").reverse().join("/")}</span>}
              </div>
            </Bloco>
          </FormAcao>
          <div className="flex flex-wrap items-start gap-3">
            <FormAcao acao={testarResumoAcao} limpar={false} botao="Mandar o resumo agora (teste)" classeBotao="btn-sec" pendenteRotulo="Enviando…" className="flex flex-col gap-2"><input type="hidden" name="teste" value="1" /></FormAcao>
            {envios.length > 0 && (
              <div className="text-[12px] text-slate-600">
                {envios.map((e) => <div key={e.id}>{e.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })} · {foneBonito(e.numero)} · {e.situacao === "ENVIADA" ? "enviada" : `erro: ${e.erro}`}</div>)}
              </div>
            )}
          </div>
        </div>
        <div className="cartao p-4">
          <h3 className="mb-2 text-[14px] font-semibold text-slate-700">Prévia com os números de agora</h3>
          <pre className="whitespace-pre-wrap rounded bg-[#e7ffdb] p-3 font-sans text-[13px] leading-relaxed text-slate-800">{previa}</pre>
        </div>
      </div>
    </Pagina>
  );
}
