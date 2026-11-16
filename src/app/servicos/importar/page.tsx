import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormImportarItens from "@/components/itens/FormImportarItens";

export const metadata = { title: "Importar serviços" };

export default function Importar() {
  return (
    <Pagina titulo="Importar serviços" icone="importar" trilha={[{ rotulo: "Serviços", href: "/servicos" }, { rotulo: "Importar" }]}>
      <Bloco icone="importar" titulo={<>Envie a <b>planilha</b></>}
        subtitulo="Arquivo .xlsx ou .csv com cabeçalho na primeira linha. Colunas reconhecidas: código, nome, valor de venda, valor de custo, código de tributação nacional (LC 116) e situação.">
        <FormImportarItens tipo="servicos" nfe={false} />
      </Bloco>
    </Pagina>
  );
}
