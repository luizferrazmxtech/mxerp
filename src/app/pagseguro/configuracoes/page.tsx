import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { configPagSeguroTela } from "@/lib/pagseguro/pagseguro";
import { Pagina } from "@/components/ui/Pagina";
import FormPagSeguro from "@/components/pagseguro/FormPagSeguro";

export const dynamic = "force-dynamic";
export const metadata = { title: "PagSeguro" };

export default async function ConfigPagSeguroPagina() {
  const u = await exigirArea("/pagseguro/configuracoes");
  const c = await configPagSeguroTela();
  return (
    <Pagina titulo="PagSeguro" icone="cartao" trilha={[{ rotulo: "Configurações" }, { rotulo: "Integrações" }, { rotulo: "PagSeguro" }]}>
      {!c.ativo && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">O PagSeguro está desligado. Cole o token, marque &quot;Ligar&quot; e salve.</p>}
      <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
        <b>Como funciona:</b> no PDV, a forma <b>PIX (PagSeguro)</b> mostra o QR e fecha a venda quando o cliente paga; o valor cai na conta <b>PagSeguro</b>.
        Na maquininha, cobre normalmente e escolha <b>Cartão de crédito/débito (PagSeguro)</b> no PDV: a conciliação pelo EDI acha a venda, muda o vencimento da conta a receber para a data do repasse,
        dá baixa quando o dinheiro cai e lança a taxa como despesa. Acompanhe em <Link href="/pagseguro" className="underline">Financeiro › Conciliação PagSeguro</Link>.
      </div>
      <FormPagSeguro c={c} admin={u.papel === "ADMIN"} />
    </Pagina>
  );
}
