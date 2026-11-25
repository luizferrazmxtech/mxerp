import { BarraCarregando, FaixaTopo } from "@/components/ui/BarraCarregando";

/** Aparece na hora ao abrir a conciliação, enquanto o servidor analisa o extrato. */
export default function Carregando() {
  return (
    <div className="space-y-4 p-3 md:p-4">
      <FaixaTopo />
      <h1 className="text-[20px] text-slate-800">Conciliação bancária</h1>
      <BarraCarregando
        titulo="Analisando o extrato"
        etapas={[
          { ate: 20, texto: "Amarrando boletos e Pix já recebidos…" },
          { ate: 45, texto: "Lendo as linhas pendentes do extrato…" },
          { ate: 70, texto: "Procurando as contas em aberto de cada linha…" },
          { ate: 101, texto: "Calculando as sugestões e a confiança…" },
        ]}
      />
    </div>
  );
}
