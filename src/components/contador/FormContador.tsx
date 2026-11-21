"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { enviarContadorAcao, salvarContadorAcao, type Resultado } from "@/lib/contador/acoes";
import type { ConfigContador } from "@/lib/contador/contador";
import { Bloco, Campo } from "@/components/ui/Pagina";

/** Configurações → Integrações → Contador. */
export default function FormContador({ c }: { c: ConfigContador }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(salvarContadorAcao, null);
  return (
    <form {...formAcao}>
      <Bloco icone="email" titulo={<>Envio mensal ao <b>contador</b></>} subtitulo="Todo mês, a partir do dia escolhido, o sistema manda ao contador um .zip com os XMLs do mês anterior de cada CNPJ e um resumo em planilha.">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-[13px] md:col-span-4"><input type="checkbox" name="ativo" defaultChecked={c.ativo} /> <b>Mandar sozinho todo mês</b></label>
          <Campo rotulo="Escritório de contabilidade"><input name="escritorio" defaultValue={c.escritorio} className="campo" /></Campo>
          <Campo rotulo="E-mails do contador (separe com vírgula)" obrigatorio className="md:col-span-2"><input name="emails" defaultValue={c.emails} className="campo" placeholder="fiscal@contabilidade.com.br" /></Campo>
          <Campo rotulo="Dia do envio (1 a 28)"><input name="diaEnvio" defaultValue={c.diaEnvio} className="campo text-right" inputMode="numeric" /></Campo>
          <label className="flex items-center gap-2 text-[13px] md:col-span-4"><input type="checkbox" name="incluirRecebidas" defaultChecked={c.incluirRecebidas} /> Incluir as NF-e recebidas dos fornecedores (entradas)</label>
          <Campo rotulo="Texto do e-mail ([empresa] [cnpj] [competencia] [resumo] [link])" className="md:col-span-4"><textarea name="mensagem" defaultValue={c.mensagem} rows={6} className="campo" /></Campo>
        </div>
      </Bloco>
      <Bloco icone="notas" titulo={<>Manifestação das <b>notas de entrada</b></>} subtitulo="Feita junto com a busca de notas na SEFAZ (de hora em hora), com o certificado de cada CNPJ.">
        <div className="space-y-2 text-[13px]">
          <label className="flex items-start gap-2"><input type="checkbox" name="cienciaAutomatica" defaultChecked={c.cienciaAutomatica} className="mt-0.5" /><span><b>Dar ciência da operação sozinho</b> em toda nota nova: libera o XML completo para o contador e para lançar a compra.</span></label>
          <label className="flex items-start gap-2"><input type="checkbox" name="confirmarCompra" defaultChecked={c.confirmarCompra} className="mt-0.5" /><span><b>Confirmar a operação</b> quando a compra da nota for lançada no sistema (manifestação conclusiva, não pode ser desfeita).</span></label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-verde" disabled={pendente}>{pendente ? "Salvando…" : "Salvar"}</button>
          {r && <p className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</p>}
        </div>
      </Bloco>
    </form>
  );
}

/** Botão "Enviar agora" de uma empresa e mês. */
export function EnviarAgora({ empresaId, mes }: { empresaId: string; mes: string }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(enviarContadorAcao, null);
  return (
    <form {...formAcao} className="inline-flex items-center gap-2">
      <input type="hidden" name="empresaId" value={empresaId} /><input type="hidden" name="mes" value={mes} />
      <button className="btn-sec py-1 text-[12px]" disabled={pendente}>{pendente ? "Enviando…" : "Enviar agora"}</button>
      {r && <span className={`text-[12px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</span>}
    </form>
  );
}
