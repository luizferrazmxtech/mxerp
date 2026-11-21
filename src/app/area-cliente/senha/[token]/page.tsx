import Link from "next/link";
import CaixaAcesso from "@/components/portal/CaixaAcesso";
import { clienteDoConvite } from "@/lib/portal/sessao";
import { documentoFmt } from "@/components/portal/formato";
import FormSenha from "./FormSenha";

export const dynamic = "force-dynamic";
export const metadata = { title: "Criar senha" };

/** Link do convite (mandado pela empresa) ou do "esqueci minha senha". */
export default async function CriarSenha({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await clienteDoConvite(token);
  if (!p) return (
    <CaixaAcesso titulo="Link expirado" subtitulo="Este link já foi usado ou passou do prazo.">
      <div className="space-y-3 text-[13px]">
        <p>Se você já criou a sua senha, é só entrar. Se esqueceu, peça um link novo.</p>
        <Link href="/area-cliente/entrar" className="btn-marca h-11 w-full justify-center">Entrar</Link>
        <Link href="/area-cliente/esqueci" className="btn-sec h-11 w-full justify-center">Esqueci minha senha</Link>
      </div>
    </CaixaAcesso>
  );
  return (
    <CaixaAcesso titulo={p.temSenha ? "Criar uma nova senha" : "Bem-vindo à Área do Cliente"} subtitulo={`${p.nome}: crie a senha que você vai usar para entrar.`}>
      <FormSenha token={token} login={p.documento ? documentoFmt(p.documento) : p.nome} />
    </CaixaAcesso>
  );
}
