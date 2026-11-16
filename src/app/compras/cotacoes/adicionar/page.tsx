import { Pagina } from "@/components/ui/Pagina";
import FormCotacao from "@/components/compras/FormCotacao";

export const dynamic = "force-dynamic";
export const metadata = { title: "Adicionar cotação" };

export default function AdicionarCotacao() {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return (
    <Pagina titulo="Adicionar cotação" trilha={[{ rotulo: "Cotações", href: "/compras/cotacoes" }, { rotulo: "Adicionar" }]}>
      <FormCotacao inicial={{ data: hoje, prazo: "", observacoes: "", observacaoInterna: "", fornecedores: [{ fornecedorId: "", nome: "", email: "", celular: "" }], itens: [] }} />
    </Pagina>
  );
}
