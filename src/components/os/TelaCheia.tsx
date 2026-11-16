"use client";

import Icone from "@/components/Icone";

/** Painel › Tela cheia (para deixar o painel aberto numa TV da bancada). */
export default function TelaCheia() {
  return (
    <button type="button" className="btn-sec" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
      <Icone nome="cards" size={14} /> Tela cheia
    </button>
  );
}
