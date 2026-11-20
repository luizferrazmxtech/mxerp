"use client";

import Link from "next/link";
import Suspenso from "@/components/ui/Suspenso";
import Icone from "@/components/Icone";

const item = "flex w-full items-center gap-2 px-3 py-[7px] text-left hover:bg-slate-100";

/** Menu ⋮ de cada nota na lista (como no Gestão Click). */
export default function AcoesNota({ n, origem, danfse }: {
  n: { id: string; modelo: string; status: string; temXml: boolean; temChave: boolean };
  origem: { rotulo: string; href: string } | null;
  danfse: string | null;
}) {
  const nfse = n.modelo === "NFSE";
  const autorizada = n.status === "AUTORIZADA";
  return (
    <Suspenso botao={<Icone nome="opcoes" size={16} />} classe="btn-icone" direita titulo="Ações">
      <Link href={`/fiscal/${n.id}`} className={item}><Icone nome="ver" size={14} /> Visualizar</Link>
      {!nfse && n.temXml && <>
        <Link href={`/fiscal/${n.id}/imprimir${n.modelo === "NFE" ? "?formato=a4" : ""}`} className={item}><Icone nome="imprimir" size={14} /> {n.modelo === "NFE" ? "Imprimir DANFE (A4)" : "Imprimir DANFCE"}</Link>
        {n.modelo === "NFE" && <Link href={`/fiscal/${n.id}/imprimir?formato=simplificado`} className={item}><Icone nome="imprimir" size={14} /> DANFE simplificado</Link>}
      </>}
      {nfse && danfse && <a href={danfse} target="_blank" rel="noreferrer" className={item}><Icone nome="imprimir" size={14} /> DANFSe (PDF oficial)</a>}
      {n.temXml && <a href={`/api/notas/${n.id}/xml`} className={item}><Icone nome="exportar" size={14} /> Baixar XML</a>}
      {!nfse && n.temChave && <Link href={`/fiscal/${n.id}#consultar`} className={item}><Icone nome="atualizar" size={14} /> Consultar na SEFAZ</Link>}
      {n.modelo === "NFE" && autorizada && <Link href={`/fiscal/${n.id}#cce`} className={item}><Icone nome="editar" size={14} /> Carta de correção</Link>}
      {origem && <Link href={origem.href} className={item}><Icone nome="vendas" size={14} /> Abrir {origem.rotulo}</Link>}
      {autorizada && <Link href={`/fiscal/${n.id}#cancelar`} className={`${item} text-red-600`}><Icone nome="excluir" size={14} /> Cancelar</Link>}
    </Suspenso>
  );
}
