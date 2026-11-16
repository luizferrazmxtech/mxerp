import Link from "next/link";
import { configVenda } from "@/lib/vendas/config";
import { Pagina } from "@/components/ui/Pagina";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Balanças" };

export default async function Balancas() {
  const c = await configVenda();
  const ex = `${c.balanca.prefixo}${"1".padStart(c.balanca.digitosCodigo, "0")}…`;
  const cards: { icone: string; titulo: string; texto: React.ReactNode; acao?: { href: string; rotulo: string } }[] = [
    { icone: "configuracoes", titulo: "Padrão do código", texto: <>Etiquetas começam com <b>{c.balanca.prefixo}</b>, trazem {c.balanca.digitosCodigo} dígitos do código do produto e o {c.balanca.conteudo === "PESO" ? "peso" : "preço total"}. Exemplo: <code>{ex}</code></>, acao: { href: "/vendas/configuracoes", rotulo: "Alterar padrão" } },
    { icone: "produtos", titulo: "Produtos vinculados", texto: "Marque no cadastro do produto que ele é vendido por peso (unidade KG) e informe o código da balança no código interno.", acao: { href: "/produtos", rotulo: "Ver produtos" } },
    { icone: "atualizar", titulo: "Carga da balança", texto: "A exportação do arquivo de carga para balanças (Toledo, Filizola) entra junto com a integração do PDV." },
  ];
  return (
    <Pagina titulo="Balanças" icone="balcao" trilha={[{ rotulo: "Vendas", href: "/vendas" }, { rotulo: "Balanças" }]}>
      <div className="cartao p-8 text-center">
        <Icone nome="balcao" size={36} className="mx-auto text-slate-300" />
        <h2 className="mt-2 text-[15px] font-semibold text-slate-700">Nenhuma balança cadastrada</h2>
        <p className="mx-auto mt-1 max-w-lg text-[13px] text-slate-500">No balcão, o leitor reconhece a etiqueta da balança e lança o produto com o preço ou o peso que ela traz.</p>
        <div className="mt-6 grid gap-3 text-left md:grid-cols-3">{cards.map((k) => (
          <div key={k.titulo} className="rounded-md border p-4">
            <div className="flex items-center gap-2 font-semibold text-slate-700"><Icone nome={k.icone} size={16} className="text-marca" />{k.titulo}</div>
            <p className="mt-1 text-[13px] text-slate-600">{k.texto}</p>
            {k.acao && <Link href={k.acao.href} className="mt-2 inline-block text-[13px] text-marca hover:underline">{k.acao.rotulo}</Link>}
          </div>
        ))}</div>
      </div>
    </Pagina>
  );
}
