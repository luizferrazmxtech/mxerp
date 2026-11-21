import { ListaNotas, Titulo, Vazio } from "@/components/portal/ui";
import { exigirCliente } from "@/lib/portal/atual";
import { notasDe } from "@/lib/portal/dados";

export const metadata = { title: "Notas fiscais" };

export default async function NotasPortal() {
  const c = await exigirCliente();
  const ns = await notasDe(c.id);
  return (
    <>
      <Titulo titulo="Notas fiscais" subtitulo="Baixe o PDF (DANFE) e o XML das notas emitidas para você." />
      {!ns.length ? <Vazio icone="notas" texto="Nenhuma nota fiscal emitida para você ainda." /> : <div className="cartao"><ListaNotas notas={ns} /></div>}
    </>
  );
}
