import Importador from "./Importador";

export const metadata = { title: "Migração de dados" };

export default function Migracao() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Migração de dados</h1>
      <p className="max-w-3xl text-sm text-slate-600">
        Exporte do sistema antigo as listas de clientes, fornecedores, produtos e serviços em Excel ou CSV e envie aqui.
        As colunas são reconhecidas pelo nome (Código, Nome, CPF/CNPJ, Valor de venda, Estoque, NCM, Localização…).
        Sempre rode <b>Simular</b> primeiro. Importar de novo a mesma planilha atualiza os cadastros sem duplicar, e o estoque
        de cada produto é ajustado para a quantidade da planilha. Produtos sem coluna Localização ficam no local
        <b> IMPLANTACAO</b> até serem guardados numa prateleira.
      </p>
      <Importador />
    </div>
  );
}
