import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { saldoDoCarro } from "@/lib/estoque/carro";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estoque do carro" };

const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

/** O que está no carro da equipe: físico, separado para OS e livre. O técnico vê o das equipes dele; o escritório, qualquer um com ?equipe=. */
export default async function EstoqueDoCarro({ searchParams }: { searchParams: Promise<{ equipe?: string }> }) {
  const sp = await searchParams;
  const u = await exigirUsuario();
  const escritorio = u.papel !== "TECNICO";
  const carros = await prisma.deposito.findMany({
    where: { ativo: true, equipeId: sp.equipe && escritorio ? sp.equipe : { not: null }, ...(sp.equipe && escritorio ? {} : { equipe: { membros: { has: u.id } } }) },
    select: { id: true, nome: true, equipeId: true }, orderBy: { nome: "asc" },
  });
  const listas = await Promise.all(carros.map(async (c) => ({ ...c, linhas: await saldoDoCarro(c.equipeId!) })));
  return (
    <div className="mx-auto max-w-3xl px-3 pb-24 pt-3">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/tecnico" className="btn-sec h-10 px-3" aria-label="Voltar"><Icone nome="direita" size={18} className="rotate-180" /></Link>
        <h1 className="text-[20px] font-semibold">Estoque do carro</h1>
      </div>
      {!listas.length && (
        <div className="rounded-lg border border-dashed bg-white p-6 text-center text-[14px] text-slate-500">
          {escritorio && sp.equipe ? "Esta equipe não tem carro com estoque." : "Sua equipe ainda não tem carro com estoque. O escritório cria em Estoque › Locais."}
        </div>
      )}
      {listas.map((c) => {
        const valor = c.linhas.reduce((s, l) => s + Math.max(0, l.fisico) * l.custo, 0);
        return (
          <section key={c.id} className="mb-4">
            <div className="mb-2 flex items-center gap-2"><h2 className="text-[16px] font-semibold">{c.nome}</h2><span className="ml-auto text-[13px] text-slate-500">{c.linhas.length} produto(s)</span></div>
            <p className="mb-2 text-[13px] text-slate-600"><b>Livre</b> é o que dá para usar em novas OS; <b>separado</b> já está marcado para uma OS. Para repor ou devolver, o escritório faz uma transferência{escritorio ? "; em De onde veio aparecem os documentos que geraram cada saldo" : ""}.</p>
            {escritorio && (
              <div className="mb-2 flex gap-2">
                <Link href={`/estoque/transferencias/adicionar?destino=${c.id}`} className="btn-sec">Abastecer</Link>
                <Link href={`/estoque/transferencias/adicionar?origem=${c.id}`} className="btn-sec">Devolver à loja</Link>
                <Link href={`/estoque/carros/${c.id}`} className="btn-sec">De onde veio</Link>
                {valor > 0 && <span className="ml-auto self-center text-[13px] text-slate-600">Custo: <b>{valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></span>}
              </div>
            )}
            <ul className="space-y-2">
              {c.linhas.map((l) => (
                <li key={l.produtoId} className="rounded-lg border bg-white p-3">
                  <div className="text-[15px] font-medium leading-tight">{l.nome}</div>
                  <div className="flex text-[12px] text-slate-500">{l.codigo}
                    {escritorio && <Link href={`/estoque/carros/${c.id}?produto=${l.produtoId}#movimentos`} className="ml-auto text-marca hover:underline">Ver origem</Link>}
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-2 text-[13px]">
                    <div><span className="text-slate-500">No carro</span><br /><b>{q(l.fisico)} {l.unidade}</b></div>
                    <div><span className="text-slate-500">Separado</span><br /><b className="text-amber-700">{q(l.reservado)}</b></div>
                    <div><span className="text-slate-500">Livre</span><br /><b className={l.livre > 0 ? "text-emerald-700" : "text-red-600"}>{q(l.livre)}</b></div>
                  </div>
                </li>
              ))}
              {!c.linhas.length && <li className="rounded-lg border border-dashed bg-white p-6 text-center text-[14px] text-slate-500">Nada no carro agora.</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
