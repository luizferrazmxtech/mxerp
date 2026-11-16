"use client";

import { useActionState, useState } from "react";
import { Bloco } from "@/components/ui/Pagina";
import { Rodape } from "@/components/orcamentos/FormsAuxOrc";
import { salvarConfigOsAcao, type Resultado } from "@/lib/os/acoes";

/** Configurações › módulo OS: regras de estoque, numeração, textos padrão e documentos. */
export default function FormConfigOs({ ultimo, c, grupos }: {
  ultimo: number;
  c: { observacoes: string; garantia: string; estoqueNegativo: boolean; semCondicao: boolean; documentos: Record<string, boolean> };
  grupos: { grupo: string; itens: [string, string][] }[];
}) {
  const [r, acao, pendente] = useActionState<Resultado, FormData>(salvarConfigOsAcao, null);
  const [num, setNum] = useState(String(ultimo));
  return (
    <form action={acao}>
      <Bloco icone="estoque" titulo={<>Regras de <b>venda e estoque</b></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="rotulo">Vender produto sem estoque</span>
            <select name="estoqueNegativo" defaultValue={c.estoqueNegativo ? "1" : "0"} className="campo"><option value="1">Sim (a peça fica em falta e o estoque pode ficar negativo)</option><option value="0">Não (bloqueia a baixa sem saldo)</option></select></label>
          <label><span className="rotulo">Vender sem condição de pagamento</span>
            <select name="semCondicao" defaultValue={c.semCondicao ? "1" : "0"} className="campo"><option value="1">Sim</option><option value="0">Não</option></select></label>
        </div>
      </Bloco>
      <Bloco icone="lista" titulo={<>Defina o <b>último número</b> de OS</>} subtitulo="O número vale só para a loja atual." corpo="p-0">
        <table className="tabela">
          <thead><tr><th>Registro</th><th className="w-48">Último número usado</th><th className="w-48">Próximo sai como</th></tr></thead>
          <tbody><tr><td>Ordens de serviços</td><td><input name="ultimoNumero" value={num} onChange={(e) => setNum(e.target.value.replace(/\D/g, ""))} className="campo h-8 w-32" inputMode="numeric" /></td>
            <td><span className="pilula border-slate-300 bg-slate-50 text-slate-700">Próximo · {Number(num || 0) + 1}</span></td></tr></tbody>
        </table>
      </Bloco>
      <Bloco icone="editar" titulo={<>Escreva os <b>textos padrão</b></>} subtitulo="Impressos em toda OS nova.">
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="block"><span className="rotulo">Observações externas</span><textarea name="observacoes" defaultValue={c.observacoes} rows={4} className="campo h-auto" /></label>
          <label className="block"><span className="rotulo">Termos de garantia</span><textarea name="garantia" defaultValue={c.garantia} rows={4} className="campo h-auto" placeholder="Ex.: Garantia de 90 dias para o serviço executado." /></label>
        </div>
      </Bloco>
      <Bloco icone="olho" titulo={<>Escolha o que aparece nos <b>documentos</b></>}>
        <div className="grid gap-4 md:grid-cols-4">{grupos.map((g) => (
          <div key={g.grupo}><div className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">{g.grupo}</div>
            {g.itens.map(([k, rot]) => <label key={k} className="flex items-center gap-2 py-1"><input type="checkbox" name={k} value="1" defaultChecked={c.documentos[k]} /> {rot}</label>)}</div>
        ))}</div>
      </Bloco>
      <Rodape r={r} pendente={pendente} voltar="/os" editando rotulo="Salvar configurações" />
    </form>
  );
}
