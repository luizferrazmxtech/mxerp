/** Dígito verificador módulo 11 (pesos 2..9 da direita para a esquerda). */
export function dvMod11(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

const pad = (v: string | number, n: number) => String(v).padStart(n, "0");

/** Monta a chave de acesso de 44 dígitos da NF-e/NFC-e. */
export function gerarChave(p: {
  cUF: string | number; // 35 = SP
  emissao: Date;
  cnpj: string;
  modelo: 55 | 65;
  serie: number;
  numero: number;
  tpEmis?: number;
  cNF: number; // código numérico aleatório de 8 dígitos
}): { chave: string; cDV: number; cNF: string } {
  const aamm = `${pad(p.emissao.getUTCFullYear() % 100, 2)}${pad(p.emissao.getUTCMonth() + 1, 2)}`;
  const cNF = pad(p.cNF, 8);
  const base =
    pad(p.cUF, 2) + aamm + pad(p.cnpj.replace(/\D/g, ""), 14) + pad(p.modelo, 2) +
    pad(p.serie, 3) + pad(p.numero, 9) + String(p.tpEmis ?? 1) + cNF;
  if (base.length !== 43) throw new Error("Chave com tamanho inválido");
  const cDV = dvMod11(base);
  return { chave: base + cDV, cDV, cNF };
}

/** cNF aleatório que não pode ser igual ao número da nota. */
export function codigoNumerico(numero: number): number {
  let c: number;
  do c = Math.floor(Math.random() * 1e8);
  while (c === numero % 1e8);
  return c;
}
