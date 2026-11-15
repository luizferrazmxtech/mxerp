import { prisma } from "@/lib/db";
import { novaOs } from "../actions";

export const dynamic = "force-dynamic";

export default async function NovaOs() {
  const [clientes, tecnicos] = await Promise.all([
    prisma.pessoa.findMany({ where: { cliente: true, ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true }, take: 5000 }),
    prisma.usuario.findMany({ where: { ativo: true, tecnico: true }, orderBy: { nome: "asc" } }),
  ]);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Nova ordem de serviço</h1>
      <form action={novaOs} className="cartao space-y-3 p-4">
        <select name="clienteId" required className="campo">
          <option value="">Selecione o cliente…</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select name="tecnicoId" className="campo">
          <option value="">Técnico (opcional)</option>
          {tecnicos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <input name="equipamento" className="campo" placeholder="Equipamento (ex.: DVR Intelbras 8 canais)" />
        <textarea name="defeito" className="campo" rows={3} placeholder="Defeito relatado / serviço solicitado" />
        <button className="btn">Criar OS</button>
      </form>
    </div>
  );
}
