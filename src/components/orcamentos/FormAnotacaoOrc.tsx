"use client";

import { useFormAcao } from "@/components/ui/useFormAcao";
import { anotarOrcamentoAcao, type Resultado } from "@/lib/orcamentos/acoes";

export default function FormAnotacaoOrc({ id, caminho, acao: acaoServidor, sobre = "o orçamento" }: { id: string; caminho: string; acao?: (r: Resultado, f: FormData) => Promise<Resultado>; sobre?: string }) {
  const [r, , pendente, formAcao] = useFormAcao<Resultado>(acaoServidor ?? anotarOrcamentoAcao, null);
  return (
    <form {...formAcao} className="mb-4">
      <input type="hidden" name="entidadeId" value={id} /><input type="hidden" name="caminho" value={caminho} />
      <textarea name="texto" rows={3} className="campo" placeholder={`Escreva uma anotação sobre ${sobre}`} key={r?.ok ? Date.now() : "t"} />
      <div className="mt-2 flex items-center gap-2"><button className="btn" disabled={pendente}>{pendente ? "Salvando…" : "Adicionar anotação"}</button>
        {r && <span className={`text-[13px] ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.mensagem}</span>}</div>
    </form>
  );
}
