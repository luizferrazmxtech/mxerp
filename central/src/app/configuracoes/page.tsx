import { ler } from "@/lib/config";
import { dataHoraBR } from "@/lib/datas";
import { Pagina, Bloco, Aviso, Campo } from "@/components/ui";
import { salvarGeral, salvarInterTela, salvarSmtpTela } from "../acoes";

export const dynamic = "force-dynamic";

export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const sp = await searchParams;
  const [geral, regua, inter, smtp] = await Promise.all([ler("geral"), ler("regua"), ler("inter"), ler("smtp")]);
  const n = (v: number) => String(v).replace(".", ",");
  return (
    <Pagina titulo="Configurações">
      {sp.ok && <Aviso>{sp.ok}</Aviso>}
      {sp.erro && <Aviso tipo="erro">{sp.erro}</Aviso>}

      <form action={salvarGeral}>
        <Bloco titulo="Geral e régua de cobrança" acoes={<button className="btn-marca">Salvar</button>}>
          <div className="grid gap-3 md:grid-cols-4">
            <Campo rotulo="Endereço público da Central" className="md:col-span-2"><input name="urlPublica" defaultValue={geral.urlPublica} placeholder="https://central.mxtech.inf.br" className="campo" /></Campo>
            <Campo rotulo="Nome nos e-mails"><input name="nomeEmpresa" defaultValue={geral.nomeEmpresa} className="campo" /></Campo>
            <div />
            <Campo rotulo="Multa (%)"><input name="multaPct" defaultValue={n(geral.multaPct)} className="campo" /></Campo>
            <Campo rotulo="Juros ao mês (%)"><input name="jurosMesPct" defaultValue={n(geral.jurosMesPct)} className="campo" /></Campo>
            <Campo rotulo="Gerar a mensalidade quantos dias antes"><input name="diasAntecedencia" type="number" min={1} max={30} defaultValue={regua.diasAntecedencia} className="campo" /></Campo>
            <div />
            <Campo rotulo="Aviso no sistema após (dias de atraso)"><input name="diasAviso" type="number" min={1} defaultValue={regua.diasAviso} className="campo" /></Campo>
            <Campo rotulo="Só leitura após (dias)"><input name="diasLeitura" type="number" min={1} defaultValue={regua.diasLeitura} className="campo" /></Campo>
            <Campo rotulo="Bloqueio total após (dias)"><input name="diasBloqueio" type="number" min={1} defaultValue={regua.diasBloqueio} className="campo" /></Campo>
          </div>
          <p className="mt-2 text-[12px] text-slate-500">O endereço público vai no link do boleto e no webhook do Inter (baixa na hora).</p>
        </Bloco>
      </form>

      <form action={salvarInterTela}>
        <Bloco titulo="Banco Inter (recebe as mensalidades)" acoes={<button className="btn-marca">Salvar e testar</button>}>
          {inter && <Aviso tipo="info">Conectado · conta {inter.contaCorrente || "—"} · {inter.ambiente}{inter.webhookMsg ? ` · ${inter.webhookMsg}` : " · webhook não cadastrado (preencha o endereço público)"}{inter.ultimaSinc ? ` · última consulta ${dataHoraBR(new Date(inter.ultimaSinc))}: ${inter.ultimaSincMsg}` : ""}</Aviso>}
          <div className="grid gap-3 md:grid-cols-4">
            <Campo rotulo="Client ID" className="md:col-span-2"><input name="clientId" defaultValue={inter?.clientId} className="campo" required /></Campo>
            <Campo rotulo={inter ? "Client Secret (vazio = mantém)" : "Client Secret"} className="md:col-span-2"><input name="clientSecret" type="password" className="campo" autoComplete="off" /></Campo>
            <Campo rotulo="Conta corrente"><input name="contaCorrente" defaultValue={inter?.contaCorrente} className="campo" /></Campo>
            <Campo rotulo="Ambiente"><select name="ambiente" defaultValue={inter?.ambiente ?? "producao"} className="campo"><option value="producao">Produção</option><option value="sandbox">Sandbox (teste)</option></select></Campo>
            <Campo rotulo={inter ? ".zip do Inter (vazio = mantém)" : ".zip baixado do Inter Empresas (.crt + .key)"} className="md:col-span-2"><input name="arquivos" type="file" multiple accept=".zip,.crt,.key,.pem" className="campo" /></Campo>
          </div>
          <p className="mt-2 text-[12px] text-slate-500">Crie no Inter Empresas uma integração <b>só para a Central</b>, com permissão de boletos (leitura e escrita). Não use a mesma integração do MXERP: o Inter guarda um webhook por integração e um apagaria o do outro.</p>
        </Bloco>
      </form>

      <form action={salvarSmtpTela}>
        <Bloco titulo="E-mail de envio das mensalidades" acoes={<button className="btn-marca">Salvar</button>}>
          <div className="grid gap-3 md:grid-cols-4">
            <Campo rotulo="Servidor SMTP" className="md:col-span-2"><input name="host" defaultValue={smtp?.host} placeholder="smtp.gmail.com" className="campo" /></Campo>
            <Campo rotulo="Porta"><input name="porta" type="number" defaultValue={smtp?.porta ?? 587} className="campo" /></Campo>
            <label className="flex items-center gap-1 pt-5 text-[13px]"><input type="checkbox" name="seguro" defaultChecked={smtp?.seguro} /> SSL direto (porta 465)</label>
            <Campo rotulo="Usuário"><input name="usuario" defaultValue={smtp?.usuario} className="campo" /></Campo>
            <Campo rotulo={smtp ? "Senha (vazio = mantém)" : "Senha"}><input name="senha" type="password" className="campo" autoComplete="off" /></Campo>
            <Campo rotulo="Remetente"><input name="remetente" defaultValue={smtp?.remetente} placeholder="financeiro@mxtech.inf.br" className="campo" /></Campo>
            <Campo rotulo="Mandar um teste para"><input name="testar" type="email" placeholder="opcional" className="campo" /></Campo>
          </div>
        </Bloco>
      </form>
    </Pagina>
  );
}
