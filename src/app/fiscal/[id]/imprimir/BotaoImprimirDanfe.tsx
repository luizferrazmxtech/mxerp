"use client";

/** Abre a impressão do navegador: escolha a impressora ou "Salvar como PDF". */
export default function BotaoImprimirDanfe() {
  return <button className="btn" onClick={() => window.print()}>Imprimir / salvar em PDF</button>;
}
