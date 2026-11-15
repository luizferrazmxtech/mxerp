import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { brl } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".")) || 0;
const s = (v: FormDataEntryValue | null) => String(v ?? "").trim() || null;

async function salvar(form: FormData) {
  "use server";
  const id = s(form.get("id"));
  const dados = {
    codigo: String(form.get("codigo")).trim(), nome: String(form.get("nome")).trim(), preco: num(form.get("preco")),
    codigoTributacaoNacional: s(form.get("cTribNac"))?.replace(/\D/g, "") ?? null,
    codigoNbs: s(form.get("nbs"))?.replace(/\D/g, "") ?? null,
    aliquotaIss: form.get("aliquota") ? num(form.get("aliquota")) : null,
  };
  if (id) await prisma.servico.update({ where: { id }, data: dados });
  else await prisma.servico.create({ data: dados });
  revalidatePath("/servicos");
}

export default async function Servicos() {
  const lista = await prisma.servico.findMany({ orderBy: { nome: "asc" } });
  const campos = (v?: (typeof lista)[number]) => (
    <>
      <input type="hidden" name="id" value={v?.id ?? ""} />
      <input name="codigo" required defaultValue={v?.codigo} className="campo" placeholder="Código" aria-label="Código" />
      <input name="nome" required defaultValue={v?.nome} className="campo md:col-span-2" placeholder="Nome" aria-label="Nome" />
      <input name="preco" defaultValue={v ? Number(v.preco) : ""} className="campo" placeholder="Preço" aria-label="Preço" />
      <input name="cTribNac" defaultValue={v?.codigoTributacaoNacional ?? ""} className="campo" placeholder="Cód. trib. nacional (6 díg.)" aria-label="Código de tributação nacional" />
      <input name="nbs" defaultValue={v?.codigoNbs ?? ""} className="campo" placeholder="NBS (opcional)" aria-label="NBS" />
      <input name="aliquota" defaultValue={v?.aliquotaIss == null ? "" : Number(v.aliquotaIss)} className="campo" placeholder="Alíq. ISS %" aria-label="Alíquota ISS" />
    </>
  );
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Serviços</h1>
      <p className="text-sm text-slate-600">
        O <b>código de tributação nacional</b> (6 dígitos: item da LC 116 + subitem + desdobramento, ex.: 14.01.01 → 140101) é obrigatório para emitir NFS-e.
      </p>
      <form action={salvar} className="cartao grid gap-2 p-4 md:grid-cols-9">
        {campos()}
        <button className="btn">Adicionar</button>
      </form>
      <div className="cartao divide-y">
        {lista.map((v) => (
          <form key={v.id} action={salvar} className="grid items-center gap-2 p-3 md:grid-cols-9">
            {campos(v)}
            <button className="btn-sec">Salvar</button>
          </form>
        ))}
        {!lista.length && <p className="p-4 text-sm text-slate-500">Nenhum serviço cadastrado.</p>}
      </div>
      <p className="text-xs text-slate-400">{lista.length} serviços · preço médio {brl(lista.reduce((a, b) => a + Number(b.preco), 0) / (lista.length || 1))}</p>
    </div>
  );
}
