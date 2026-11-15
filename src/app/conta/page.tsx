import TrocarSenha from "./TrocarSenha";

export const metadata = { title: "Minha senha" };

export default function Conta() {
  return (
    <div className="max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Minha senha</h1>
      <TrocarSenha />
    </div>
  );
}
