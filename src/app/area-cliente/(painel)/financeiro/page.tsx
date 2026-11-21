import Resumo from "@/components/ui/Resumo";
import { ListaContas, Secao, Titulo } from "@/components/portal/ui";
import { exigirCliente } from "@/lib/portal/atual";
import { contasDe } from "@/lib/portal/dados";
import { brl } from "@/lib/ui/format";

export const metadata = { title: "Boletos e pagamentos" };

export default async function FinanceiroPortal() {
  const c = await exigirCliente();
  const cs = await contasDe(c.id);
  const abertas = cs.filter((x) => !x.pagoEm);
  const vencidas = abertas.filter((x) => x.vencida);
  const pagas = cs.filter((x) => x.pagoEm).sort((a, b) => +b.pagoEm! - +a.pagoEm!).slice(0, 30);
  const soma = (l: typeof cs) => l.reduce((s, x) => s + x.valor, 0);
  return (
    <>
      <Titulo titulo="Boletos e pagamentos" subtitulo="Pague pelo boleto ou pelo PIX copia e cola." />
      <Resumo compacto cartoes={[
        { rotulo: "Em aberto", valor: brl(soma(abertas)), legenda: `${abertas.length} parcela${abertas.length === 1 ? "" : "s"}`, icone: "boleto", cor: "amarelo" },
        { rotulo: "Vencido", valor: brl(soma(vencidas)), legenda: vencidas.length ? `${vencidas.length} parcela${vencidas.length === 1 ? "" : "s"} vencida${vencidas.length === 1 ? "" : "s"}` : "nada vencido", icone: "atrasado", cor: "vermelho" },
        { rotulo: "Pagos (últimos)", valor: brl(pagas.reduce((s, x) => s + (x.valorPago ?? x.valor), 0)), legenda: `${pagas.length} pagamento${pagas.length === 1 ? "" : "s"}`, icone: "confirmado", cor: "verde" },
      ]} />
      <Secao titulo="A pagar" icone="boleto" corpo="p-0"><ListaContas contas={abertas} vazio="Nada em aberto. Obrigado!" /></Secao>
      <Secao titulo="Pagos" icone="confirmado" corpo="p-0"><ListaContas contas={pagas} vazio="Nenhum pagamento registrado." /></Secao>
    </>
  );
}
