"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icone";

/**
 * "Foto" na tela do técnico: escolher entre tirar com a câmera ou pegar da galeria/arquivo.
 * A câmera abre aqui mesmo (getUserMedia) quando o navegador deixa (https ou localhost), o que vale também
 * para notebook com webcam; senão cai no seletor do celular já pedindo a câmera (capture).
 */
export default function EscolherFoto({ titulo, fechar, escolher }: { titulo: string; fechar: () => void; escolher: (f: File) => void }) {
  const [camera, setCamera] = useState(false);
  const comCaptura = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const pegar = (f?: File | null) => { if (f) { escolher(f); fechar(); } };

  const abrirCamera = () => {
    if (typeof navigator !== "undefined" && "mediaDevices" in navigator && window.isSecureContext) setCamera(true);
    else comCaptura.current?.click();
  };

  if (camera) return <CameraAoVivo fechar={() => setCamera(false)} usarSeletor={() => { setCamera(false); comCaptura.current?.click(); }} tirada={pegar} />;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/40" onClick={fechar}>
      <div className="mt-auto rounded-t-2xl bg-white p-3" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mb-2 flex items-center">
          <h2 className="text-[16px] font-semibold">{titulo}</h2>
          <button className="ml-auto rounded p-2 text-slate-500" onClick={fechar} aria-label="Fechar"><Icone nome="fechar" size={20} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="flex h-20 flex-col items-center justify-center gap-1 rounded-lg bg-topo text-[15px] font-semibold text-white" onClick={abrirCamera}>
            <Icone nome="foto" size={24} /> Câmera
          </button>
          <button className="flex h-20 flex-col items-center justify-center gap-1 rounded-lg border border-slate-300 text-[15px] font-semibold text-slate-700" onClick={() => galeria.current?.click()}>
            <Icone nome="anexos" size={24} /> Galeria ou arquivo
          </button>
        </div>
        <input ref={comCaptura} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pegar(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={galeria} type="file" accept="image/*" className="hidden" onChange={(e) => { pegar(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function CameraAoVivo({ fechar, tirada, usarSeletor }: { fechar: () => void; tirada: (f: File) => void; usarSeletor: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [traseira, setTraseira] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let vivo = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: traseira ? "environment" : "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}); }
      })
      .catch((e: unknown) => setErro(e instanceof Error && e.name === "NotAllowedError" ? "O navegador não deu acesso à câmera." : "Não foi possível abrir a câmera."));
    return () => { vivo = false; stream?.getTracks().forEach((t) => t.stop()); };
  }, [traseira]);

  const capturar = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    c.toBlob((b) => { if (b) tirada(new File([b], `foto-${Date.now()}.jpg`, { type: "image/jpeg" })); }, "image/jpeg", 0.9);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative min-h-0 flex-1">
        <video ref={video} playsInline muted className="h-full w-full object-contain" />
        {erro && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <p className="text-[15px]">{erro}</p>
            <button className="btn-sec bg-white" onClick={usarSeletor}>Usar a câmera do aparelho</button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-4" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <button className="h-12 rounded-md px-4 text-[15px] text-white" onClick={fechar}>Cancelar</button>
        <button className="h-16 w-16 rounded-full border-4 border-white bg-white/30 disabled:opacity-40" aria-label="Tirar foto" disabled={!!erro} onClick={capturar} />
        <button className="h-12 rounded-md px-4 text-[15px] text-white" onClick={() => setTraseira((x) => !x)} aria-label="Trocar câmera">Trocar</button>
      </div>
    </div>
  );
}
