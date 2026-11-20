/** Validação de CPF e CNPJ pelos dígitos verificadores (sem acesso ao banco: pode ir para o navegador). */

const digitos = (s: string) => (s ?? "").replace(/\D/g, "");

/** CPF com 11 dígitos e dígitos verificadores corretos (rejeita sequências repetidas como 111.111.111-11). */
export function cpfValido(valor: string) {
  const d = digitos(valor);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

/** CNPJ com 14 dígitos e dígitos verificadores corretos. */
export function cnpjValido(valor: string) {
  const d = digitos(valor);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  for (const n of [12, 13]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * ((n - 1 - i) % 8 + 2);
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    if (dv !== Number(d[n])) return false;
  }
  return true;
}

/** Mensagem de erro do documento, ou null se estiver certo (vazio é aceito: o documento não é obrigatório). */
export function erroDocumento(doc: string, tipo: "FISICA" | "JURIDICA" | "ESTRANGEIRO" | string | null | undefined) {
  if (!doc || tipo === "ESTRANGEIRO") return null;
  const d = digitos(doc);
  if (!d) return null;
  if (tipo === "FISICA") {
    if (d.length !== 11) return "CPF deve ter 11 dígitos";
    if (!cpfValido(d)) return "CPF inválido: os dígitos verificadores não conferem";
  }
  if (tipo === "JURIDICA") {
    if (d.length !== 14) return "CNPJ deve ter 14 dígitos";
    if (!cnpjValido(d)) return "CNPJ inválido: os dígitos verificadores não conferem";
  }
  return null;
}
