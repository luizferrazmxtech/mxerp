import { matrizPermissoes, PAPEIS_CONFIGURAVEIS } from "@/lib/auth/permissoesAcao";
import { ROTULO_PAPEL } from "@/lib/auth/permissoes";
import { Pagina } from "@/components/ui/Pagina";
import FormAcao from "@/components/financeiro/FormAcao";
import { salvarPermissoesAcao } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Permissões por ação" };

export default async function Permissoes() {
  const matriz = await matrizPermissoes();
  const grupos = [...new Set(matriz.map((m) => m.grupo))];
  return (
    <Pagina titulo="Permissões por ação" icone="funcionarios" trilha={[{ rotulo: "Usuários", href: "/usuarios" }, { rotulo: "Permissões por ação" }]}>
      <p className="max-w-3xl text-[13px] text-slate-600">
        Além de quais telas cada perfil abre, aqui você escolhe o que cada um pode <b>fazer</b>: excluir, cancelar, estornar, dar
        desconto… O administrador sempre pode tudo. Caixas marcados em <span className="rounded bg-amber-100 px-1">amarelo</span> estão
        diferentes do padrão do sistema.
      </p>
      <FormAcao acao={salvarPermissoesAcao} limpar={false} className="cartao overflow-x-auto" botao={null}>
        <table className="tabela">
          <thead>
            <tr>
              <th>Ação</th>
              <th className="w-24 text-center" title={ROTULO_PAPEL.ADMIN}>Admin</th>
              {PAPEIS_CONFIGURAVEIS.map((p) => <th key={p} className="w-24 text-center" title={ROTULO_PAPEL[p]}>{ROTULO_PAPEL[p].split(" (")[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => [
              <tr key={g} className="bg-slate-50"><td colSpan={2 + PAPEIS_CONFIGURAVEIS.length} className="text-[12px] font-semibold uppercase text-slate-500">{g}</td></tr>,
              ...matriz.filter((m) => m.grupo === g).map((m) => (
                <tr key={m.acao}>
                  <td>{m.rotulo}</td>
                  <td className="text-center"><input type="checkbox" checked disabled aria-label={`Admin: ${m.rotulo}`} /></td>
                  {PAPEIS_CONFIGURAVEIS.map((p) => (
                    <td key={p} className={`text-center ${m.papeis[p].pode !== m.papeis[p].padrao ? "bg-amber-100" : ""}`}>
                      <input type="checkbox" name="p" value={`${p}:${m.acao}`} defaultChecked={m.papeis[p].pode} aria-label={`${p}: ${m.rotulo}`} />
                    </td>
                  ))}
                </tr>
              )),
            ])}
          </tbody>
        </table>
        <div className="flex flex-wrap gap-2 border-t p-3">
          <button className="btn">Salvar permissões</button>
          <button className="btn-sec" name="padrao" value="1">Voltar tudo ao padrão</button>
        </div>
      </FormAcao>
    </Pagina>
  );
}
