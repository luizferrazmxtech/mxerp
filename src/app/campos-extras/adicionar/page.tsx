import { Pagina } from "@/components/ui/Pagina";
import { FormCampoExtra } from "@/components/cadastros/Auxiliares";

export const metadata = { title: "Adicionar campo extra" };

export default async function Adicionar({ searchParams }: { searchParams: Promise<{ entidade?: string }> }) {
  const ent = (await searchParams).entidade === "PRODUTO" ? "PRODUTO" : "CLIENTE";
  const base = ent === "PRODUTO" ? "/campos-extras?entidade=PRODUTO" : "/campos-extras";
  return <Pagina titulo="Adicionar campo extra" trilha={[{ rotulo: "Campos extras", href: base }, { rotulo: "Adicionar" }]}><FormCampoExtra entidade={ent} /></Pagina>;
}
