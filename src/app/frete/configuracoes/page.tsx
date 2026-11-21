import Link from "next/link";
import { exigirArea } from "@/lib/auth/atual";
import { configFreteTela } from "@/lib/frete/melhorEnvio";
import { Pagina } from "@/components/ui/Pagina";
import FormMelhorEnvio from "@/components/frete/FormMelhorEnvio";

export const dynamic = "force-dynamic";
export const metadata = { title: "Melhor Envio" };

export default async function ConfigFretePagina() {
  const u = await exigirArea("/frete/configuracoes");
  const c = await configFreteTela();
  return (
    <Pagina titulo="Frete (Melhor Envio)" icone="frete" trilha={[{ rotulo: "Configurações" }, { rotulo: "Integrações" }, { rotulo: "Melhor Envio" }]}>
      {!c.ativo && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">O frete pelo Melhor Envio está desligado. Cole o token, informe o e-mail de contato, marque &quot;Ligar&quot; e salve.</p>}
      <div className="mb-3 rounded border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] text-sky-900">
        <b>Como funciona:</b> no pedido de venda (e no orçamento), o botão <b>Cotar frete</b> mostra os serviços dos Correios, Jadlog e outras transportadoras e põe o valor escolhido no frete.
        Depois, na venda, a aba <b>Entrega</b> compra a etiqueta (com o saldo da carteira do Melhor Envio), imprime e acompanha o rastreio, que é atualizado sozinho de hora em hora.
        Todas as etiquetas ficam em <Link href="/frete" className="underline">Vendas › Envios (Melhor Envio)</Link>.
      </div>
      <FormMelhorEnvio c={c} admin={u.papel === "ADMIN"} />
    </Pagina>
  );
}
