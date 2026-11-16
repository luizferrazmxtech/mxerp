import { redirect } from "next/navigation";

/** Venda é uma só (produtos e serviços juntos): o endereço antigo abre a lista única. */
export default function Page() {
  redirect("/vendas");
}
