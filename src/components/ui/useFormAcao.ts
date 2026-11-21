"use client";

import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

/**
 * Igual ao useActionState, mas o formulário NÃO é apagado quando a ação devolve erro.
 *
 * Com `<form action={...}>` o React 19 limpa todos os campos depois de qualquer envio: um CNPJ com dígito errado
 * apagava a empresa inteira digitada. Aqui o envio vai pelo onSubmit e o formulário só volta aos valores salvos
 * quando a ação dá certo (resultado sem `ok: false`), como antes.
 *
 *   const [r, acao, pendente, form] = useFormAcao(salvarAcao, null);
 *   <form {...form}> ... </form>
 */
export function useFormAcao<S>(acao: (estado: Awaited<S>, dados: FormData) => S | Promise<S>, inicial: Awaited<S>) {
  const [estado, despachar, pendente] = useActionState<S, FormData>(acao, inicial);
  const ref = useRef<HTMLFormElement>(null);
  const enviado = useRef(false);
  useEffect(() => {
    if (!enviado.current) return;
    enviado.current = false;
    const falhou = !!estado && typeof estado === "object" && "ok" in estado && (estado as { ok: unknown }).ok === false;
    if (!falhou) ref.current?.reset();
  }, [estado]);
  const form = {
    ref,
    onSubmit(e: FormEvent<HTMLFormElement>) {
      e.preventDefault();
      const submitter = (e.nativeEvent as SubmitEvent).submitter;
      const dados = new FormData(e.currentTarget, submitter instanceof HTMLElement ? submitter : null);
      enviado.current = true;
      startTransition(() => despachar(dados));
    },
  };
  return [estado, despachar, pendente, form] as const;
}
