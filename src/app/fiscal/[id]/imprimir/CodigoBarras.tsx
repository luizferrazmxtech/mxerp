"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/** Código de barras CODE-128C da chave de acesso (DANFE). */
export default function CodigoBarras({ valor }: { valor: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current) JsBarcode(ref.current, valor, { format: "CODE128C", displayValue: false, margin: 0, height: 38, width: 1.05 });
  }, [valor]);
  return <svg ref={ref} className="mx-auto block max-w-full" />;
}
