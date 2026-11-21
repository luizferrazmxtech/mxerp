import PortalShell from "@/components/portal/PortalShell";
import { documentoFmt } from "@/components/portal/formato";
import { exigirCliente } from "@/lib/portal/atual";
import { nomeEmpresaPortal } from "@/lib/portal/empresa";
import { sairCliente } from "../acoes";

export const dynamic = "force-dynamic";

export default async function LayoutPortal({ children }: { children: React.ReactNode }) {
  const c = await exigirCliente();
  return (
    <PortalShell cliente={{ nome: c.fantasia || c.nome, documento: c.documento ? documentoFmt(c.documento) : null }} empresa={await nomeEmpresaPortal()} sair={sairCliente}>
      {children}
    </PortalShell>
  );
}
