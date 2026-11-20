import { notFound } from "next/navigation";
import { Pagina } from "@/components/ui/Pagina";
import { exigirArea } from "@/lib/auth/atual";
import { prisma } from "@/lib/db";
import { temCertificadoServidor } from "@/lib/fiscal/certificado";
import { ultimoNumero } from "@/lib/empresa/empresas";
import FormEmpresa from "./FormEmpresa";

export const dynamic = "force-dynamic";
export const metadata = { title: "Empresa (loja)" };

export default async function Empresa({ params }: { params: Promise<{ id: string }> }) {
  await exigirArea("/empresas");
  const { id } = await params;
  const e = id === "nova" ? null : await prisma.empresa.findUnique({ where: { id } });
  if (id !== "nova" && !e) notFound();
  const ultimos = e
    ? { nfe: await ultimoNumero(e, "NFE"), nfce: await ultimoNumero(e, "NFCE"), dps: await ultimoNumero(e, "DPS") }
    : { nfe: 0, nfce: 0, dps: 0 };
  const nome = e ? e.nomeFantasia || e.razaoSocial : "Nova empresa";
  return (
    <Pagina titulo={nome} icone="lojas" trilha={[{ rotulo: "Empresas", href: "/empresas" }, { rotulo: e ? "Editar" : "Adicionar" }]}>
      <FormEmpresa
        e={e && {
          id: e.id, razaoSocial: e.razaoSocial, nomeFantasia: e.nomeFantasia, cnpj: e.cnpj, ie: e.inscricaoEstadual, im: e.inscricaoMunicipal,
          cnae: e.cnae, regime: e.regimeTributario, logradouro: e.logradouro, complemento: e.complemento, numero: e.numero, bairro: e.bairro, cidade: e.cidade,
          codigoMunicipio: e.codigoMunicipio, uf: e.uf, cep: e.cep, telefone: e.telefone, email: e.email, ativa: e.ativa,
          ambiente: e.ambienteFiscal, ambienteNfse: e.ambienteNfse, serieNfe: e.serieNfe, serieNfce: e.serieNfce, serieDps: e.serieDps,
          regimeEspecialNfse: e.regimeEspecialNfse, cscId: e.cscId, temCsc: !!e.cscToken, infCplNfe: e.infCplNfe, infCplNfse: e.infCplNfse,
          certificado: e.certificadoValidade ? { titular: e.certificadoTitular, validade: e.certificadoValidade.toISOString() } : null,
        }}
        ultimos={ultimos}
        certificadoServidor={temCertificadoServidor()}
      />
    </Pagina>
  );
}
