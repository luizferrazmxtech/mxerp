import Link from "next/link";
import { prisma } from "@/lib/db";
import { criarCliente } from "../../acoes";
import FormCliente from "@/components/FormCliente";
import { Pagina, Bloco, Campo, Aviso } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NovoCliente({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const planos = await prisma.plano.findMany({ where: { ativo: true }, orderBy: { valorMensal: "asc" } });
  return (
    <Pagina titulo="Novo cliente" sub="Ao salvar, a VPS cria o banco, o sistema e o HTTPS do cliente">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {planos.length === 0 ? <Aviso tipo="info">Cadastre um plano antes, em <Link className="sublinhado" href="/planos">Planos</Link>.</Aviso> : (
        <form action={criarCliente}>
          <Bloco titulo="Sistema do cliente">
            <div className="grid gap-3 md:grid-cols-2">
              <Campo rotulo="Nome interno (banco e sistema; não muda depois)" obrig><input name="slug" className="campo" placeholder="jtecobio" pattern="[a-z][a-z0-9]{1,29}" required /></Campo>
              <Campo rotulo="Endereço de acesso" obrig><input name="dominio" className="campo" placeholder="jtecobio.mxerp.com.br" required /></Campo>
            </div>
            <p className="mt-2 text-[12px] text-slate-500">O endereço precisa apontar para o IP da VPS no DNS. Com um registro curinga (*.mxerp.com.br), qualquer subdomínio já funciona.</p>
          </Bloco>
          <Bloco titulo="Cadastro e cobrança"><FormCliente planos={planos} /></Bloco>
          <div className="flex gap-2"><button className="btn-marca">Criar cliente</button><Link className="btn-sec" href="/clientes">Cancelar</Link></div>
        </form>
      )}
    </Pagina>
  );
}
