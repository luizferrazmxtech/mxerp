import Link from "next/link";
import type { OrigemDocumento } from "@prisma/client";
import { prisma } from "@/lib/db";
import BotaoAcao from "@/components/BotaoAcao";
import { docFmt } from "@/lib/ui/format";
import { emitirNfse, emitirOs, emitirVenda } from "@/app/fiscal/actions";

/** Cartão de notas fiscais de uma venda ou OS, com botões de emissão. */
export default async function NotasDoDocumento({ origemTipo, origemId, podeEmitir, temProdutos = true, temServicos = false, empresaServicos }: {
  origemTipo: OrigemDocumento; origemId: string; podeEmitir: boolean; temProdutos?: boolean; temServicos?: boolean;
  /** OS com os serviços faturados por outra empresa: o nome dela no botão da NFS-e */
  empresaServicos?: string | null;
}) {
  const notas = await prisma.notaFiscal.findMany({ where: { origemTipo, origemId }, orderBy: { createdAt: "desc" } });
  // a empresa que emitiu cada nota (na OS com serviços pela VFX, a NFS-e sai pela VFX e a NF-e pela MXTECH)
  const emissoras = new Map((await prisma.empresa.findMany({ where: { id: { in: [...new Set(notas.map((n) => n.empresaId).filter((x): x is string => !!x))] } }, select: { id: true, razaoSocial: true, cnpj: true } })).map((e) => [e.id, e]));
  const autorizada = (m: string[]) => notas.some((n) => n.status === "AUTORIZADA" && m.includes(n.modelo));
  return (
    <section className="cartao p-4">
      <h2 className="mb-2 font-semibold">Notas fiscais</h2>
      <ul className="mb-3 space-y-1 text-sm">
        {notas.map((n) => (
          <li key={n.id}>
            <Link href={`/fiscal/${n.id}`} className="text-marca hover:underline">
              {n.modelo === "NFCE" ? "NFC-e" : n.modelo === "NFE" ? "NF-e" : "NFS-e"} {n.serie}/{n.numero}
            </Link>{" "}
            · {n.status.toLowerCase()}
            {n.empresaId && emissoras.get(n.empresaId) && <span className="text-slate-500"> · emitida por <b className="font-medium text-slate-700">{emissoras.get(n.empresaId)!.razaoSocial}</b> (CNPJ {docFmt(emissoras.get(n.empresaId)!.cnpj)})</span>}
            {" "}{n.status !== "AUTORIZADA" && n.motivo && <span className="text-xs text-red-700">({n.motivo})</span>}
          </li>
        ))}
        {!notas.length && <li className="text-slate-500">Nenhuma nota emitida.</li>}
      </ul>
      {podeEmitir && (
        <div className="flex flex-wrap gap-3">
          {origemTipo === "VENDA" && temServicos && !autorizada(["NFSE"]) && (
            <BotaoAcao acao={emitirNfse} campos={{ vendaId: origemId }} rotulo="Emitir NFS-e dos serviços" secundario={temProdutos} />
          )}
          {origemTipo === "VENDA" && temProdutos && !autorizada(["NFE", "NFCE"]) && (
            <>
              <BotaoAcao acao={emitirVenda} campos={{ vendaId: origemId, modelo: "65" }} rotulo="Emitir NFC-e" />
              <BotaoAcao acao={emitirVenda} campos={{ vendaId: origemId, modelo: "55" }} rotulo="Emitir NF-e" secundario />
            </>
          )}
          {origemTipo === "OS" && temProdutos && !autorizada(["NFE"]) && (
            <BotaoAcao acao={emitirOs} campos={{ osId: origemId }} rotulo="Emitir NF-e das peças" />
          )}
          {origemTipo === "OS" && temServicos && !autorizada(["NFSE"]) && (
            <BotaoAcao acao={emitirNfse} campos={{ osId: origemId }} rotulo={`Emitir NFS-e dos serviços${empresaServicos ? ` (${empresaServicos})` : ""}`} secundario={temProdutos} />
          )}
        </div>
      )}
      {!podeEmitir && <p className="text-xs text-slate-500">{origemTipo === "VENDA" ? "Conclua a venda para emitir." : "Conclua ou fature a OS para emitir."}</p>}
    </section>
  );
}
