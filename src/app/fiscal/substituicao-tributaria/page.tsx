import { Pagina, Bloco } from "@/components/ui/Pagina";
import { exigirArea } from "@/lib/auth/atual";
import { lojaAtual, nomeLoja } from "@/lib/empresa/atual";
import { analisarSt } from "@/lib/fiscal/st";
import TabelaSt from "./TabelaSt";

export const dynamic = "force-dynamic";
export const metadata = { title: "Substituição tributária" };

/** Produtos com ST pelas notas de compra (XML) e ajuste em lote para CFOP 5405 / CSOSN 500. */
export default async function SubstituicaoTributaria() {
  await exigirArea("/fiscal/substituicao-tributaria");
  const e = await lojaAtual();
  const trilha = [{ rotulo: "Fiscal", href: "/fiscal" }, { rotulo: "Substituição tributária" }];
  if (!e) return <Pagina titulo="Substituição tributária" icone="notas" trilha={trilha}><p>Cadastre a empresa em Configurações › Empresas.</p></Pagina>;
  const a = await analisarSt(e.id);
  const pendentes = a.produtos.filter((p) => !p.ajustado);
  const conta = (f: string) => pendentes.filter((p) => p.fonte === f).length;
  return (
    <Pagina titulo="Substituição tributária (ST)" icone="notas" trilha={trilha}>
      <p className="mb-3 text-[13px] text-slate-600">
        Loja <b className="uppercase">{nomeLoja(e)}</b>. O sistema lê os XMLs das notas de compra e aponta os produtos que chegaram com ST
        (CST 10/30/60/70, CSOSN 201/202/203/500, ICMS-ST no item ou CFOP 5401–5405/6401–6404). Na revenda deles a nota sai com
        <b> CFOP 5405</b> (fora do estado <b>6404</b>) e <b>CSOSN 500</b>. Confira a lista final com o contador.
      </p>
      <div className="mb-3 grid gap-3 md:grid-cols-4">
        <Cartao rotulo="Notas de compra lidas" valor={String(a.notasLidas)} sub={`${a.itensLidos} itens, ${a.itensComSt} com ST`} />
        <Cartao rotulo="Vieram com ST na nota" valor={String(conta("NOTA"))} sub="a ajustar (marcados)" destaque />
        <Cartao rotulo="Prováveis (NCM ou CEST)" valor={String(conta("NCM") + conta("CEST"))} sub="sem nota com ST: confira antes" />
        <Cartao rotulo="Já ajustados" valor={String(a.produtos.length - pendentes.length)} sub="CFOP 5405 e CSOSN 500" />
      </div>
      <Bloco icone="notas" titulo={<>Produtos com <b>ST</b></>} subtitulo="Marque os produtos e aplique a regra. Os que vieram com ST na nota já vêm marcados. NCM e CEST em branco no cadastro são completados com os da nota." corpo="p-0">
        <TabelaSt produtos={a.produtos} />
      </Bloco>
      {a.itensSemVinculo.length > 0 && (
        <Bloco icone="alerta" titulo={<>Itens com ST <b>sem produto ligado</b></>} subtitulo="Vieram com ST, mas não se ligaram a nenhum produto (código do fornecedor, código de barras, compra lançada ou nome igual). Ligue o código do fornecedor na aba Fornecedores do produto para entrarem aqui." corpo="p-0">
          <table className="tabela">
            <thead><tr><th>NF-e</th><th>Fornecedor</th><th>Item da nota</th><th>Motivo</th></tr></thead>
            <tbody>
              {a.itensSemVinculo.slice(0, 300).map((i, k) => <tr key={k}><td>{i.nota}</td><td>{i.fornecedor}</td><td>{i.item}</td><td>{i.motivo}</td></tr>)}
            </tbody>
          </table>
        </Bloco>
      )}
    </Pagina>
  );
}

function Cartao({ rotulo, valor, sub, destaque }: { rotulo: string; valor: string; sub?: string; destaque?: boolean }) {
  return (
    <div className={`cartao p-3 ${destaque ? "border-marca" : ""}`}>
      <div className="text-[12px] text-slate-500">{rotulo}</div>
      <div className={`text-[20px] font-semibold ${destaque ? "text-marca" : ""}`}>{valor}</div>
      {sub && <div className="text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}
