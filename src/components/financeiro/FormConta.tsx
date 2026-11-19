import Link from "next/link";
import FormAcao, { type Resultado } from "@/components/financeiro/FormAcao";
import BuscaPessoa from "@/components/orcamentos/BuscaPessoa";
import { Bloco, Campo } from "@/components/ui/Pagina";

type Opcao = { id: string; nome: string };
type Categoria = { id: string; nome: string; codigo: string | null; nivel: number };
export type ValoresConta = {
  id?: string; descricao?: string; valor?: string; vencimento?: string; competencia?: string; categoriaId?: string;
  pessoa?: { id: string; nome: string } | null; formaPagamentoId?: string | null; contaBancariaId?: string | null;
  centroCustoId?: string | null; observacao?: string | null;
};

/** Formulário de conta a pagar/receber (adicionar, duplicar e editar), no padrão dos formulários do sistema. */
export default function FormConta({ acao, tipo, valores, categorias, formas, contas, centros, novo, travado, voltar }: {
  acao: (r: Resultado, f: FormData) => Promise<Resultado>;
  tipo: "PAGAR" | "RECEBER"; valores: ValoresConta; categorias: Categoria[]; formas: Opcao[]; contas: Opcao[]; centros: Opcao[];
  novo: boolean; travado?: boolean; voltar: string;
}) {
  const pagar = tipo === "PAGAR";
  const rotuloCat = (c: Categoria) => (c.codigo ? `${c.codigo} ${c.nome}` : c.nome);
  return (
    <FormAcao acao={acao} limpar={false} className="space-y-3">
      <input type="hidden" name="tipo" value={tipo} />
      {valores.id && <input type="hidden" name="id" value={valores.id} />}
      <Bloco icone={pagar ? "pagar" : "receber"} titulo={<>Informe os <b>dados</b> {pagar ? "do pagamento" : "do recebimento"}</>}
        subtitulo={travado ? "Esta conta veio de uma venda, OS ou compra: descrição, valor e plano de contas mudam no documento." : "Os campos com * são obrigatórios."}>
        <div className="grid gap-3 md:grid-cols-4">
          <Campo rotulo="Descrição" obrigatorio className="md:col-span-2"><input name="descricao" required defaultValue={valores.descricao} className="campo" readOnly={travado} /></Campo>
          <Campo rotulo={pagar ? "Fornecedor" : "Cliente"} className="md:col-span-2">
            {travado ? <input className="campo" readOnly value={valores.pessoa?.nome ?? ""} /> : <BuscaPessoa nome="pessoaId" papel={pagar ? "fornecedor" : "cliente"} inicial={valores.pessoa} placeholder="Digite para buscar" />}
          </Campo>
          <Campo rotulo="Plano de contas" obrigatorio className="md:col-span-2">
            <select name="categoriaId" required defaultValue={valores.categoriaId ?? ""} className="campo" disabled={travado}>
              <option value="">Escolha</option>
              {categorias.map((c) => <option key={c.id} value={c.id}>{"  ".repeat(c.nivel)}{rotuloCat(c)}</option>)}
            </select>
          </Campo>
          <Campo rotulo={novo ? "Valor total" : "Valor"} obrigatorio><input name="valor" required inputMode="decimal" defaultValue={valores.valor} className="campo" placeholder="0,00" readOnly={travado} /></Campo>
          {novo && (
            <Campo rotulo="Parcelas">
              <select name="parcelas" defaultValue="1" className="campo">
                {Array.from({ length: 36 }, (_, i) => <option key={i} value={i + 1}>{i === 0 ? "À vista (1x)" : `${i + 1}x mensal`}</option>)}
              </select>
            </Campo>
          )}
          <Campo rotulo={novo ? "Vencimento (1ª parcela)" : "Vencimento"} obrigatorio><input type="date" name="vencimento" required defaultValue={valores.vencimento} className="campo" /></Campo>
          <Campo rotulo="Competência (DRE)"><input type="date" name="competencia" defaultValue={valores.competencia} className="campo" title="Em branco = data do vencimento" readOnly={travado} /></Campo>
          <Campo rotulo="Forma de pagamento">
            <select name="formaPagamentoId" defaultValue={valores.formaPagamentoId ?? ""} className="campo"><option value="">Selecione</option>{formas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
          </Campo>
          <Campo rotulo="Conta bancária">
            <select name="contaBancariaId" defaultValue={valores.contaBancariaId ?? ""} className="campo"><option value="">Selecione</option>{contas.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
          </Campo>
          {centros.length > 0 && (
            <Campo rotulo="Centro de custo">
              <select name="centroCustoId" defaultValue={valores.centroCustoId ?? ""} className="campo"><option value="">Nenhum</option>{centros.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
            </Campo>
          )}
          <Campo rotulo="Observações" className="md:col-span-4"><textarea name="observacao" rows={2} defaultValue={valores.observacao ?? ""} className="campo" /></Campo>
          {novo && (
            <label className="flex items-center gap-2 text-[13px] md:col-span-4">
              <input type="checkbox" name="pago" value="1" /> Já {pagar ? "foi pago" : "foi recebido"} (baixa a 1ª parcela no vencimento, na conta bancária escolhida)
            </label>
          )}
        </div>
      </Bloco>
      <div className="flex gap-2">
        <button className="btn-verde">{novo ? "Cadastrar" : "Salvar"}</button>
        <Link href={voltar} className="btn-sec">Cancelar</Link>
      </div>
    </FormAcao>
  );
}
