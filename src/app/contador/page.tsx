import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { competenciaAnterior, configContador, limitesMes, nomeCompetencia } from "@/lib/contador/contador";
import { configEmail } from "@/lib/email/email";
import { dataHora } from "@/lib/ui/format";
import { Bloco, Pagina, Pilula } from "@/components/ui/Pagina";
import Resumo from "@/components/ui/Resumo";
import FormContador, { EnviarAgora } from "@/components/contador/FormContador";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contador" };

const kb = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Configurações → Integrações → Contador: envio mensal dos XMLs e manifestação automática das notas de entrada. */
export default async function ContadorPagina({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await exigirArea("/contador");
  const sp = await searchParams;
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes! : competenciaAnterior();
  const { de, ate } = limitesMes(mes);
  const [c, smtp, empresas, envios, semXml, semManifesto] = await Promise.all([
    configContador(), configEmail(),
    prisma.empresa.findMany({ where: { ativa: true }, orderBy: { createdAt: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } }),
    prisma.envioContador.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.notaRecebida.count({ where: { xml: null, situacao: "AUTORIZADA", emissao: { gte: de, lt: ate } } }),
    prisma.notaRecebida.count({ where: { situacao: "AUTORIZADA", OR: [{ manifestacao: null }, { manifestacao: "CIENCIA" }] } }),
  ]);
  const notasMes = await prisma.notaFiscal.groupBy({ by: ["empresaId"], where: { ambiente: "PRODUCAO", status: { in: ["AUTORIZADA", "CANCELADA"] }, emitidaEm: { gte: de, lt: ate } }, _count: true });
  const nome = new Map(empresas.map((e) => [e.id, e.nomeFantasia || e.razaoSocial]));
  const ultimo = envios.find((e) => e.situacao === "ENVIADO");
  const hoje = new Date();
  const proximo = (() => { const [a, m] = hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).split("-").map(Number); const d = Number(hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(8)); const jaPassou = d >= c.diaEnvio && envios.some((e) => e.competencia === competenciaAnterior() && e.situacao === "ENVIADO"); const mm = jaPassou ? (m === 12 ? 1 : m + 1) : m; const aa = jaPassou && m === 12 ? a + 1 : a; return `${String(c.diaEnvio).padStart(2, "0")}/${String(mm).padStart(2, "0")}/${aa}`; })();
  const meses = Array.from({ length: 6 }, (_, i) => { const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i - 1, 15)); return d.toISOString().slice(0, 7); });
  const primeira = empresas[0]?.id;
  const qtd = (id: string) => notasMes.filter((n) => n.empresaId === id || (id === primeira && n.empresaId === null)).reduce((s, n) => s + n._count, 0);

  return (
    <Pagina titulo="Contador" icone="email" trilha={[{ rotulo: "Configurações" }, { rotulo: "Integrações" }, { rotulo: "Contador" }]}>
      {!smtp && <p className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">O e-mail de envio (SMTP) ainda não foi configurado. Configure em <Link href="/contratos/configuracoes" className="underline">Contratos › Configurações, e-mail e WhatsApp</Link>; é o mesmo e-mail usado aqui.</p>}
      <Resumo cartoes={[
        { rotulo: "Envio automático", valor: c.ativo ? "Ligado" : "Desligado", legenda: c.ativo ? `próximo em ${proximo}` : "marque abaixo para ligar", icone: c.ativo ? "confirmado" : "fechar", cor: c.ativo ? "verde" : "cinza" },
        { rotulo: "Último envio", valor: ultimo ? nomeCompetencia(ultimo.competencia) : "—", legenda: ultimo ? `${dataHora(ultimo.createdAt)} · ${ultimo.arquivos} arquivos` : "nenhum envio ainda", icone: "email", cor: "tinta" },
        { rotulo: "Recebidas sem XML", valor: String(semXml), legenda: semXml ? `em ${nomeCompetencia(mes)}: falta a ciência` : "todas com XML completo", icone: "atrasado", cor: semXml ? "vermelho" : "verde", href: "/compras/notas-recebidas?f=pendentes" },
        { rotulo: "Sem manifestação conclusiva", valor: String(semManifesto), legenda: "notas de entrada (prazo de 180 dias)", icone: "hoje", cor: semManifesto ? "amarelo" : "verde", href: "/compras/notas-recebidas?f=pendentes" },
      ]} />

      <Bloco icone="importar" titulo={<>Arquivos de <b>{nomeCompetencia(mes)}</b></>} subtitulo="Baixe para conferir ou mande agora (o envio automático só manda o mês anterior, uma vez)." corpo="p-0"
        acoes={<form className="flex items-center gap-2"><select name="mes" defaultValue={mes} className="campo h-8 text-[12px]">{meses.map((m) => <option key={m} value={m}>{nomeCompetencia(m)}</option>)}</select><button className="btn-sec h-8 text-[12px]">Ver</button></form>}>
        <table className="tabela">
          <thead><tr><th>Empresa</th><th>CNPJ</th><th className="text-right">Notas emitidas</th><th>Último envio deste mês</th><th className="w-72"></th></tr></thead>
          <tbody>
            {empresas.map((e) => {
              const env = envios.find((x) => x.empresaId === e.id && x.competencia === mes);
              return (
                <tr key={e.id}>
                  <td className="font-semibold">{e.nomeFantasia || e.razaoSocial}</td><td className="font-mono text-[12px]">{e.cnpj}</td><td className="text-right">{qtd(e.id)}</td>
                  <td>{env ? <><Pilula rotulo={env.situacao === "ENVIADO" ? "Enviado" : "Erro"} cor={env.situacao === "ENVIADO" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"} /> <span className="text-[11px] text-slate-500">{dataHora(env.createdAt)}</span></> : <span className="text-slate-400">não enviado</span>}</td>
                  <td className="text-right"><a href={`/api/contador/baixar?empresa=${e.id}&mes=${mes}`} className="btn-sec mr-2 py-1 text-[12px]">Baixar .zip</a><EnviarAgora empresaId={e.id} mes={mes} /></td>
                </tr>
              );
            })}
            {!empresas.length && <tr><td colSpan={5} className="py-6 text-center text-slate-500">Cadastre a empresa em Configurações › Empresas.</td></tr>}
          </tbody>
        </table>
      </Bloco>

      <FormContador c={c} />

      <Bloco icone="relogio" titulo={<>Histórico de <b>envios</b></>} corpo="p-0">
        <table className="tabela">
          <thead><tr><th>Competência</th><th>Empresa</th><th>Enviado em</th><th>Para</th><th className="text-right">Arquivos</th><th className="text-right">Tamanho</th><th>Situação</th></tr></thead>
          <tbody>
            {envios.map((x) => (
              <tr key={x.id}>
                <td>{nomeCompetencia(x.competencia)}</td><td>{nome.get(x.empresaId) ?? "—"}</td>
                <td>{dataHora(x.createdAt)}<div className="text-[11px] text-slate-500">{x.automatico ? "automático" : x.usuarioNome ?? ""}</div></td>
                <td className="text-[12px]">{x.destinatarios}</td><td className="text-right">{x.arquivos}</td><td className="text-right">{x.tamanho ? kb(x.tamanho) : "—"}</td>
                <td><Pilula rotulo={x.situacao === "ENVIADO" ? "Enviado" : "Erro"} cor={x.situacao === "ENVIADO" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-red-300 bg-red-50 text-red-700"} />
                  {x.erro && <div className="max-w-72 text-[11px] text-red-700">{x.erro}</div>}</td>
              </tr>
            ))}
            {!envios.length && <tr><td colSpan={7} className="py-6 text-center text-slate-500">Nenhum envio ainda.</td></tr>}
          </tbody>
        </table>
      </Bloco>
    </Pagina>
  );
}
