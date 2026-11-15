import Link from "next/link";
import type { OrigemDocumento } from "@prisma/client";
import { prisma } from "@/lib/db";
import BotaoAcao from "@/components/BotaoAcao";
import { emitirNfse, emitirOs, emitirVenda } from "@/app/fiscal/actions";

/** Cartão de notas fiscais de uma venda ou OS, com botões de emissão. */
export default async function NotasDoDocumento({ origemTipo, origemId, podeEmitir, temProdutos = true, temServicos = false }: {
  origemTipo: OrigemDocumento; origemId: string; podeEmitir: boolean; temProdutos?: boolean; temServicos?: boolean;
}) {
  const notas = await prisma.notaFiscal.findMany({ where: { origemTipo, origemId }, orderBy: { createdAt: "desc" } });
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
            · {n.status.toLowerCase()} {n.status !== "AUTORIZADA" && n.motivo && <span className="text-xs text-red-700">({n.motivo})</span>}
          </li>
        ))}
        {!notas.length && <li className="text-slate-500">Nenhuma nota emitida.</li>}
      </ul>
      {podeEmitir && (
        <div className="flex flex-wrap gap-3">
          {origemTipo === "VENDA" && !autorizada(["NFE", "NFCE"]) && (
            <>
              <BotaoAcao acao={emitirVenda} campos={{ vendaId: origemId, modelo: "65" }} rotulo="Emitir NFC-e" />
              <BotaoAcao acao={emitirVenda} campos={{ vendaId: origemId, modelo: "55" }} rotulo="Emitir NF-e" secundario />
            </>
          )}
          {origemTipo === "OS" && temProdutos && !autorizada(["NFE"]) && (
            <BotaoAcao acao={emitirOs} campos={{ osId: origemId }} rotulo="Emitir NF-e das peças" />
          )}
          {origemTipo === "OS" && temServicos && !autorizada(["NFSE"]) && (
            <BotaoAcao acao={emitirNfse} campos={{ osId: origemId }} rotulo="Emitir NFS-e dos serviços" secundario={temProdutos} />
          )}
        </div>
      )}
      {!podeEmitir && <p className="text-xs text-slate-500">{origemTipo === "VENDA" ? "Conclua a venda para emitir." : "Conclua ou fature a OS para emitir."}</p>}
    </section>
  );
}
