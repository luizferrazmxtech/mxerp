import Link from "next/link";
import { prisma } from "@/lib/db";
import { exigirUsuario } from "@/lib/auth/atual";
import { saldoDoTecnico } from "@/lib/estoque/tecnico";
import Icone from "@/components/Icone";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu estoque" };

const q = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });

/** O que está no carro do técnico: físico, separado para OS e livre. O escritório vê o de qualquer técnico com ?tec=. */
export default async function MeuEstoque({ searchParams }: { searchParams: Promise<{ tec?: string }> }) {
  const sp = await searchParams;
  const u = await exigirUsuario();
  const alvo = sp.tec && u.papel !== "TECNICO" ? sp.tec : u.id;
  const dep = await prisma.deposito.findUnique({ where: { tecnicoId: alvo }, select: { id: true, nome: true, tecnico: { select: { nome: true } } } });
  const linhas = dep ? await saldoDoTecnico(alvo) : [];
  const valor = linhas.reduce((s, l) => s + Math.max(0, l.fisico) * l.custo, 0);
  return (
    <div className="mx-auto max-w-3xl px-3 pb-24 pt-3">
      <div className="mb-3 flex items-center gap-2">
        <Link href="/tecnico" className="btn-sec h-10 px-3" aria-label="Voltar"><Icone nome="direita" size={18} className="rotate-180" /></Link>
        <h1 className="text-[20px] font-semibold">{alvo === u.id ? "Meu estoque" : `Estoque de ${dep?.tecnico?.nome ?? "técnico"}`}</h1>
        {dep && <span className="ml-auto text-[13px] text-slate-500">{linhas.length} produto(s)</span>}
      </div>
      {!dep ? (
        <div className="rounded-lg border border-dashed bg-white p-6 text-center text-[14px] text-slate-500">
          {alvo === u.id ? "Você ainda não tem estoque próprio. O escritório cria em Estoque › Locais." : "Este técnico não tem estoque próprio."}
        </div>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-slate-600">{dep.nome}. <b>Livre</b> é o que você pode usar em novas OS; <b>separado</b> já está marcado para uma OS. Para repor ou devolver, o escritório faz uma transferência.</p>
          {u.papel !== "TECNICO" && (
            <div className="mb-3 flex gap-2">
              <Link href={`/estoque/transferencias/adicionar?destino=${dep.id}`} className="btn-sec">Abastecer</Link>
              <Link href={`/estoque/transferencias/adicionar?origem=${dep.id}`} className="btn-sec">Devolver à loja</Link>
              {valor > 0 && <span className="ml-auto self-center text-[13px] text-slate-600">Custo do estoque: <b>{valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</b></span>}
            </div>
          )}
          <ul className="space-y-2">
            {linhas.map((l) => (
              <li key={l.produtoId} className="rounded-lg border bg-white p-3">
                <div className="text-[15px] font-medium leading-tight">{l.nome}</div>
                <div className="text-[12px] text-slate-500">{l.codigo}</div>
                <div className="mt-1 grid grid-cols-3 gap-2 text-[13px]">
                  <div><span className="text-slate-500">No carro</span><br /><b>{q(l.fisico)} {l.unidade}</b></div>
                  <div><span className="text-slate-500">Separado</span><br /><b className="text-amber-700">{q(l.reservado)}</b></div>
                  <div><span className="text-slate-500">Livre</span><br /><b className={l.livre > 0 ? "text-emerald-700" : "text-red-600"}>{q(l.livre)}</b></div>
                </div>
              </li>
            ))}
            {!linhas.length && <li className="rounded-lg border border-dashed bg-white p-6 text-center text-[14px] text-slate-500">Nada no estoque agora.</li>}
          </ul>
        </>
      )}
    </div>
  );
}
