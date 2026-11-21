import { Dados } from "@/components/portal/Detalhe";
import { documentoFmt } from "@/components/portal/formato";
import { Secao, Titulo } from "@/components/portal/ui";
import { prisma } from "@/lib/db";
import { exigirCliente } from "@/lib/portal/atual";
import FormTrocarSenha from "./FormTrocarSenha";

export const metadata = { title: "Minha conta" };

export default async function ContaPortal() {
  const c = await exigirCliente();
  const p = await prisma.pessoa.findUniqueOrThrow({ where: { id: c.id }, select: { nome: true, fantasia: true, documento: true, email: true, telefone: true, celular: true, logradouro: true, numero: true, bairro: true, cidade: true, uf: true, cep: true } });
  const endereco = [p.logradouro && `${p.logradouro}${p.numero ? `, ${p.numero}` : ""}`, p.bairro, p.cidade && `${p.cidade}${p.uf ? `/${p.uf}` : ""}`, p.cep].filter(Boolean).join(" · ");
  return (
    <>
      <Titulo titulo="Minha conta" subtitulo="Algum dado errado? Fale com a empresa para corrigir o cadastro." />
      <Secao titulo="Meus dados" icone="pessoa">
        <Dados itens={[["Nome / razão social", p.nome], ["Nome fantasia", p.fantasia], ["CPF/CNPJ", p.documento ? documentoFmt(p.documento) : null], ["E-mail", p.email], ["Telefone", p.telefone], ["Celular", p.celular]]} />
        {endereco && <div className="mt-3 border-t border-slate-100 pt-3 text-[14px]"><div className="text-[12px] text-slate-500">Endereço</div>{endereco}</div>}
      </Secao>
      <Secao titulo="Trocar senha" icone="senha"><FormTrocarSenha /></Secao>
    </>
  );
}
