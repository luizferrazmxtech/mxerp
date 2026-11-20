import Link from "next/link";
import { Pagina, Pilula } from "@/components/ui/Pagina";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { temCertificadoServidor } from "@/lib/fiscal/certificado";
import { lojaAtual } from "@/lib/empresa/atual";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empresas (lojas)" };

const VERDE = "bg-emerald-50 text-emerald-700", AMARELA = "bg-amber-50 text-amber-800";
const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/** Lojas = empresas (CNPJs). Cada uma tem seus dados fiscais, certificado, numeração, estoque e financeiro. */
export default async function Empresas() {
  await exigirArea("/empresas");
  const [lista, atual] = await Promise.all([prisma.empresa.findMany({ orderBy: { createdAt: "asc" } }), lojaAtual()]);
  const hoje = new Date();
  return (
    <Pagina titulo="Empresas (lojas)" icone="lojas" trilha={[{ rotulo: "Configurações" }, { rotulo: "Empresas" }]}
      acoes={<Link href="/empresas/nova" className="btn-verde">+ Adicionar</Link>}>
      <p className="mb-3 text-[13px] text-slate-600">
        Cada loja é um CNPJ. Clientes, fornecedores, produtos e serviços são compartilhados; vendas, OS, orçamentos, compras,
        financeiro, estoque e notas fiscais ficam separados por loja. Troque de loja no cartão da empresa, no topo do menu.
      </p>
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead><tr><th>Nome</th><th>CNPJ</th><th>Cidade</th><th>Certificado A1</th><th>NF-e / NFC-e</th><th>NFS-e</th><th>Situação</th></tr></thead>
          <tbody>
            {lista.map((e) => {
              const vence = e.certificadoValidade;
              const dias = vence ? Math.floor((vence.getTime() - hoje.getTime()) / 86400000) : null;
              return (
                <tr key={e.id}>
                  <td><Link href={`/empresas/${e.id}`} className="font-semibold uppercase text-marca hover:underline">{e.nomeFantasia || e.razaoSocial}</Link>
                    {atual?.id === e.id && <span className="ml-2 text-[11px] text-emerald-700">loja atual</span>}
                    <div className="text-[12px] text-slate-500">{e.razaoSocial}</div></td>
                  <td>{cnpjFmt(e.cnpj)}</td>
                  <td>{[e.cidade, e.uf].filter(Boolean).join("/")}</td>
                  <td>{!vence ? <span className="text-slate-500">{temCertificadoServidor() ? "o do servidor" : "não enviado"}</span>
                    : dias! < 0 ? <span className="text-red-700">vencido</span>
                    : <span className={dias! < 30 ? "text-amber-700" : "text-emerald-700"}>até {vence.toLocaleDateString("pt-BR")}</span>}</td>
                  <td>{e.inscricaoEstadual && /^\d+$/.test(e.inscricaoEstadual)
                    ? <Pilula rotulo={e.ambienteFiscal === "PRODUCAO" ? "Produção" : "Homologação"} cor={e.ambienteFiscal === "PRODUCAO" ? VERDE : AMARELA} />
                    : <span className="text-[12px] text-slate-400">sem IE</span>}</td>
                  <td>{e.inscricaoMunicipal
                    ? <Pilula rotulo={e.ambienteNfse === "PRODUCAO" ? "Produção" : "Homologação"} cor={e.ambienteNfse === "PRODUCAO" ? VERDE : AMARELA} />
                    : <span className="text-[12px] text-slate-400">sem IM</span>}</td>
                  <td>{e.ativa ? "Ativa" : <span className="text-slate-400">Inativa</span>}</td>
                </tr>
              );
            })}
            {!lista.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nenhuma empresa cadastrada. Clique em Adicionar: a primeira fica com tudo o que já existe no sistema.</td></tr>}
          </tbody>
        </table>
      </div>
    </Pagina>
  );
}
