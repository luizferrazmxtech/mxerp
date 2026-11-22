import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { configInterServidor, idInterAtual, infoCertificado } from "@/lib/financeiro/inter";
import { lojaAtualId } from "@/lib/empresa/loja";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import { FormInter, TestarRemover } from "./Formulario";

export const dynamic = "force-dynamic";
export const metadata = { title: "Banco Inter (API)" };

const dataHora = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function ConfigInterPagina() {
  const u = await exigirArea("/financeiro/conciliacao/inter");
  const [id, loja, nEmpresas] = await Promise.all([idInterAtual(), lojaAtualId(), prisma.empresa.count()]);
  const [linha, empresa, contas, formas] = await Promise.all([
    id ? prisma.integracaoInter.findUnique({ where: { id } }) : null,
    loja ? prisma.empresa.findUnique({ where: { id: loja }, select: { razaoSocial: true, nomeFantasia: true, cnpj: true } }) : null,
    prisma.contaBancaria.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    prisma.formaPagamento.findMany({ where: { ativa: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, boletoInter: true } }),
  ]);
  // a tela mostra só o Inter desta empresa (o sem dona, de antes de ter um por empresa, vale para todas até ganhar dona)
  const r = linha && (!linha.empresaId || linha.empresaId === loja) ? linha : null;
  const cert = r ? infoCertificado(r.certificado) : null;
  const venceEm = cert ? Math.floor((cert.validoAte.getTime() - Date.now()) / 86400000) : null;
  const doEnv = !linha && !!configInterServidor();
  const nomeEmpresa = empresa ? `${empresa.nomeFantasia || empresa.razaoSocial} (CNPJ ${empresa.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")})` : null;
  const admin = u.papel === "ADMIN";

  return (
    <Pagina titulo="Banco Inter (API)" icone="conciliacao" trilha={[{ rotulo: "Financeiro", href: "/financeiro" }, { rotulo: "Conciliação", href: "/financeiro/conciliacao" }, { rotulo: "Banco Inter" }]}
      acoes={<Link href="/financeiro/conciliacao" className="btn-sec">Voltar à conciliação</Link>}>
      {nEmpresas > 1 && nomeEmpresa && (
        <p className="cartao mb-3 p-3 text-sm text-slate-700">
          Banco Inter de <b>{nomeEmpresa}</b>. Cada empresa tem a sua conta do Inter, com extrato, conciliação e boletos separados. Para configurar a de outra empresa, troque a empresa no topo do menu.
        </p>
      )}
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
        <div>
          <Bloco titulo={<b>Situação</b>} icone="conciliacao">
            {r ? (
              <div className="space-y-1 text-sm">
                <p>
                  Último teste:{" "}
                  {r.ultimoTesteEm
                    ? <span className={r.ultimoTesteOk ? "text-emerald-700" : "text-red-700"}>{dataHora(r.ultimoTesteEm)} · {r.ultimoTesteMsg}</span>
                    : "ainda não testada"}
                </p>
                <p>Última busca do extrato: {r.ultimaSincEm ? `${dataHora(r.ultimaSincEm)} · ${r.ultimaSincMsg}` : "nenhuma ainda"}</p>
                {r.escopos.includes("boleto-cobranca") && (
                  <>
                    <p>Última consulta dos boletos: {r.ultimaSincBoletosEm ? `${dataHora(r.ultimaSincBoletosEm)} · ${r.ultimaSincBoletosMsg}` : "nenhuma ainda"}</p>
                    <p>Boletos automáticos: {r.emitirBoletos ? `ligados${r.boletosDesde ? ` (parcelas lançadas desde ${dataHora(r.boletosDesde)})` : ""}` : "desligados (só pelo botão Emitir boleto)"}</p>
                    {r.webhookMsg && <p className={r.webhookMsg.startsWith("Erro") ? "text-red-700" : "text-slate-600"}>{r.webhookMsg}</p>}
                  </>
                )}
                {cert && (
                  <p className={venceEm! < 30 ? "text-red-700" : "text-slate-600"}>
                    Certificado: {cert.titular} · vale até {cert.validoAte.toLocaleDateString("pt-BR")}
                    {venceEm! < 0 ? " (VENCIDO: baixe um novo no Inter Empresas)" : venceEm! < 30 ? ` (vence em ${venceEm} dias)` : ""}
                  </p>
                )}
                <TestarRemover admin={admin} />
              </div>
            ) : doEnv ? (
              <p className="text-sm text-slate-600">Hoje a integração está configurada pelo arquivo .env do servidor. Ao salvar aqui, a configuração da tela passa a valer no lugar dela.</p>
            ) : (
              <p className="text-sm text-slate-600">Ainda não configurada. Preencha os dados ao lado e salve: o sistema testa a conexão na hora.</p>
            )}
          </Bloco>
          {admin ? (
            <FormInter
              contas={contas}
              formas={formas}
              atual={r && {
                clientId: r.clientId, contaCorrente: r.contaCorrente, ambiente: r.ambiente, escopos: r.escopos, contaBancariaId: r.contaBancariaId, sincronizarAuto: r.sincronizarAuto,
                emitirBoletos: r.emitirBoletos, multaPct: Number(r.multaPct), jurosMesPct: Number(r.jurosMesPct), diasBaixa: r.diasBaixa, mensagemBoleto: r.mensagemBoleto, urlPublica: r.urlPublica,
              }}
            />
          ) : (
            <p className="cartao p-4 text-sm text-slate-600">Só o administrador altera as credenciais da integração.</p>
          )}
        </div>
        <Bloco titulo={<b>Onde pegar cada dado</b>}>
          <ol className="list-decimal space-y-2 pl-4 text-sm text-slate-700">
            <li>No <b>Inter Empresas</b> (internet banking, como administrador), abra <i>Soluções para sua empresa → Nova integração</i> ou a integração que você já criou.</li>
            <li>Marque na integração as permissões <b>Consultar extrato e saldo</b> (<code>extrato.read</code>) e, para os boletos, <b>Emitir e cancelar boletos/cobranças</b> e <b>Consultar boletos/cobranças</b> (<code>boleto-cobranca.write</code> e <code>boleto-cobranca.read</code>). Se a integração já existe só com o extrato, edite-a no Inter Empresas e acrescente as de boleto.</li>
            <li>Copie o <b>Client ID</b> e o <b>Client Secret</b> da integração.</li>
            <li>Baixe a <b>chave e o certificado</b> (um .zip com o <code>.crt</code> e o <code>.key</code>). Pode enviar o .zip direto ou os dois arquivos juntos.</li>
            <li><b>Conta corrente</b>: só precisa se a empresa tiver mais de uma conta no Inter; são os números da conta, sem traço.</li>
            <li>O certificado vence (em geral em 1 ano). Quando vencer, baixe um novo no Inter e envie aqui de novo, sem precisar redigitar o resto.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-500">O Client Secret e a chave .key ficam guardados cifrados no banco de dados, com uma chave que fica só no servidor (.env). Eles nunca voltam para a tela.</p>
        </Bloco>
      </div>
    </Pagina>
  );
}
