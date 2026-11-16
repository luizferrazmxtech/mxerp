import { PAPEIS, type PapelPessoa } from "@/lib/cadastros/pessoas";
import { Bloco, Pagina } from "@/components/ui/Pagina";
import FormImportar from "./FormImportar";

export default function ImportarPessoas({ papel, nfe }: { papel: PapelPessoa; nfe: boolean }) {
  const cfg = PAPEIS[papel];
  return (
    <Pagina titulo={nfe ? `Importar ${cfg.plural.toLowerCase()} de notas fiscais` : `Importar ${cfg.plural.toLowerCase()}`} icone="importar"
      trilha={[{ rotulo: cfg.plural, href: cfg.base }, { rotulo: "Importar" }]}>
      <Bloco icone="importar" titulo={nfe ? <>Envie os <b>XMLs</b> das notas</> : <>Envie a <b>planilha</b></>}
        subtitulo={nfe
          ? `Cada XML de NF-e vira um ${cfg.rotulo.toLowerCase()} (${papel === "cliente" ? "destinatário da nota" : "emitente da nota"}). Quem já existe pelo CPF/CNPJ é atualizado.`
          : "Arquivo .xlsx ou .csv com cabeçalho na primeira linha. Colunas reconhecidas: código, nome, nome fantasia, tipo de pessoa, CPF/CNPJ, RG, data de nascimento, inscrição estadual, inscrição municipal, e-mail, telefone, celular, CEP, logradouro, número, complemento, bairro, cidade, UF, situação e observações."}>
        <FormImportar papel={papel} nfe={nfe} voltar={cfg.base} />
      </Bloco>
    </Pagina>
  );
}
