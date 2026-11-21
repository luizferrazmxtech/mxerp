"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Gerência escolhe de qual técnico ver as OS na tela do técnico. */
export default function SeletorTecnico({ atual, tecnicos }: { atual: string; tecnicos: { id: string; nome: string }[] }) {
  const router = useRouter();
  const caminho = usePathname();
  const sp = useSearchParams();
  return (
    <select className="campo h-10 min-w-48 flex-1 text-[14px]" value={atual} onChange={(e) => {
      const p = new URLSearchParams(sp.toString());
      if (e.target.value) p.set("tec", e.target.value); else p.delete("tec");
      router.push(`${caminho}${p.size ? `?${p}` : ""}`);
    }}>
      <option value="">Todos os técnicos</option>
      {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
    </select>
  );
}
