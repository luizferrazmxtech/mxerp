import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormImportarItens from "@/components/itens/FormImportarItens";

export const metadata = { title: "Importar produtos" };

export default async function Importar({ searchParams }: { searchParams: Promise<{ origem?: string }> }) {
  const nfe = (await searchParams).origem === "nfe";
  return (
    <Pagina titulo={nfe ? "Importar produtos de notas fiscais" : "Importar produtos"} icone="importar" trilha={[{ rotulo: "Produtos", href: "/produtos" }, { rotulo: "Importar" }]}>
      <Bloco icone="importar" titulo={nfe ? <>Envie os <b>XMLs</b> das notas</> : <>Envie a <b>planilha</b></>}
        subtitulo={nfe
          ? "Cada item das NF-e/NFC-e vira um produto (código, nome, código de barras, unidade, valor, NCM, CEST e origem). Quem já existe pelo código é atualizado; o estoque não muda."
          : "Arquivo .xlsx ou .csv com cabeçalho na primeira linha. Colunas reconhecidas: código, nome, código de barras, unidade, grupo, valor de venda, valor de custo, estoque, estoque mínimo, NCM, CEST, origem, localização e situação."}>
        <FormImportarItens tipo="produtos" nfe={nfe} />
      </Bloco>
    </Pagina>
  );
}
