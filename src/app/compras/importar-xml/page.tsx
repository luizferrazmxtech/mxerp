import PaginaFormCompra from "@/components/compras/PaginaFormCompra";

export const dynamic = "force-dynamic";
export const metadata = { title: "Importar XML da compra" };

export default function ImportarXml() {
  return <PaginaFormCompra xml />;
}
