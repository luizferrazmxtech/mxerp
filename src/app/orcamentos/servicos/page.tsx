import { redirect } from "next/navigation";

/** Orçamento é um só (peças e serviços juntos): o endereço antigo abre a lista única. */
export default function Page() {
  redirect("/orcamentos");
}
