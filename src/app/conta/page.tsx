import { Pagina } from "@/components/ui/Pagina";
import TrocarSenha from "./TrocarSenha";

export const metadata = { title: "Minha senha" };

export default function Conta() {
  return (
    <Pagina titulo="Minha senha" icone="senha" trilha={[{ rotulo: "Minha senha" }]}>
    <div className="max-w-md space-y-4">
      <TrocarSenha />
    </div>
    </Pagina>
  );
}
