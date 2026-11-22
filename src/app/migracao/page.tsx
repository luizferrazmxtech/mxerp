import { Pagina } from "@/components/ui/Pagina";
import Importador from "./Importador";
import ImportadorBackup from "./ImportadorBackup";
import { prisma } from "@/lib/db";

export const metadata = { title: "Migração de dados" };

export const dynamic = "force-dynamic";

export default async function Migracao() {
  const empresas = await prisma.empresa.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, razaoSocial: true, nomeFantasia: true, cnpj: true } });
  return (
    <Pagina titulo="Migração de dados" icone="migracao" trilha={[{ rotulo: "Migração de dados" }]}>
    <div className="space-y-6">

      <section className="space-y-3">
        <h2 className="font-semibold">Backup completo do Gestão Click</h2>
        <p className="max-w-3xl text-sm text-slate-600">
          Envie o .zip do backup como veio do Gestão Click. Sempre rode <b>Simular</b> primeiro. Importar de novo atualiza
          os cadastros sem duplicar e não repete OS nem contas já trazidas. As OS em aberto, em andamento e
          &ldquo;concluída - faturar&rdquo; entram com o mesmo número e com os produtos reservados; a numeração de OS e de
          vendas continua de onde parou. O estoque entra no local <b>IMPLANTACAO</b> até cada produto ser guardado numa prateleira.
        </p>
        <ImportadorBackup empresas={empresas.map((e) => ({ id: e.id, nome: e.nomeFantasia || e.razaoSocial, cnpj: e.cnpj }))} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Planilha avulsa</h2>
        <p className="max-w-3xl text-sm text-slate-600">
          Para uma lista exportada de outro sistema em Excel ou CSV. As colunas são reconhecidas pelo nome (Código, Nome,
          CPF/CNPJ, Valor de venda, Estoque, NCM, Localização…).
        </p>
        <Importador />
      </section>
    </div>
    </Pagina>
  );
}
