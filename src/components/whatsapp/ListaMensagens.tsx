import type { MensagemWhatsapp } from "@prisma/client";
import { foneBonitoTela } from "@/lib/whatsapp/tipos";

const resumo = (t: string) => { const l = t.split("\n").find((x) => x.trim()) ?? ""; return l.length > 90 ? `${l.slice(0, 90)}…` : l; };
const quando = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Histórico de mensagens de WhatsApp (aba Envios da OS, contrato e tela do MXChat). */
export default function ListaMensagens({ mensagens, links }: { mensagens: MensagemWhatsapp[]; links?: Map<string, { href: string; rotulo: string }> }) {
  if (!mensagens.length) return <p className="px-4 py-6 text-center text-[13px] text-slate-500">Nenhuma mensagem enviada.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="tabela">
        <thead><tr><th className="w-36">Data</th><th className="w-36">Para</th>{links && <th className="w-40">Documento</th>}<th>Mensagem</th><th className="w-28">Situação</th><th className="w-32">Por</th></tr></thead>
        <tbody>
          {mensagens.map((m) => {
            const doc = links?.get(m.id);
            return (
              <tr key={m.id} className="align-top">
                <td className="whitespace-nowrap">{quando(m.createdAt)}</td>
                <td className="whitespace-nowrap">{foneBonitoTela(m.numero)}</td>
                {links && <td>{doc ? <a href={doc.href} className="text-marca hover:underline">{doc.rotulo}</a> : m.entidade === "TESTE" ? "Teste" : "—"}</td>}
                <td>
                  <details>
                    <summary className="cursor-pointer text-slate-700">{resumo(m.texto)}</summary>
                    <p className="mt-1 whitespace-pre-wrap rounded bg-[#e7fbe6] p-2 text-[12px] text-slate-700">{m.texto}</p>
                  </details>
                  {m.arquivoNome && <span className="text-[11px] text-slate-500">Anexo: {m.arquivoNome}</span>}
                </td>
                <td>
                  {m.situacao === "ENVIADA" ? <span className="pilula border-emerald-300 bg-emerald-50 text-emerald-700">Enviada</span>
                    : <span className="pilula border-red-300 bg-red-50 text-red-700">Erro</span>}
                  {m.erro && <span className="mt-1 block text-[11px] text-red-700">{m.erro}</span>}
                </td>
                <td className="text-[12px]">{m.automatica ? "Automático" : m.usuarioNome ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
