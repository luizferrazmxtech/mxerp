import CaixaAcesso from "@/components/portal/CaixaAcesso";
import FormEsqueci from "./FormEsqueci";

export const dynamic = "force-dynamic";
export const metadata = { title: "Esqueci minha senha" };

export default function Esqueci() {
  return (
    <CaixaAcesso titulo="Esqueci minha senha" subtitulo="Mandamos um link para o e-mail do seu cadastro para você criar uma senha nova.">
      <FormEsqueci />
    </CaixaAcesso>
  );
}
