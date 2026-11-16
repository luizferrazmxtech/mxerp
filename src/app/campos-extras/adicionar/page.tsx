import { entidadeCampo, baseCampos } from "@/lib/cadastros/tipos";
import { Pagina } from "@/components/ui/Pagina";
import { FormCampoExtra } from "@/components/cadastros/Auxiliares";

export const metadata = { title: "Adicionar campo extra" };

export default async function Adicionar({ searchParams }: { searchParams: Promise<{ entidade?: string }> }) {
  const ent = entidadeCampo((await searchParams).entidade);
  const base = baseCampos(ent);
  return <Pagina titulo="Adicionar campo extra" trilha={[{ rotulo: "Campos extras", href: base }, { rotulo: "Adicionar" }]}><FormCampoExtra entidade={ent} /></Pagina>;
}
