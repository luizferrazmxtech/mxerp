import Link from "next/link";

/** Aviso no lugar do formulário quando o perfil do usuário não pode fazer aquela ação. */
export default function SemPermissao({ texto }: { texto: string }) {
  return (
    <div className="cartao p-6 text-center text-[14px] text-slate-600">
      <p>{texto}</p>
      <Link href="/" className="btn-sec mt-3 inline-block">Voltar ao início</Link>
    </div>
  );
}
