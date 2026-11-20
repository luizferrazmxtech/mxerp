/**
 * Histórico de navegação da aba (sessionStorage), usado pelo botão "Voltar" para voltar ao registro
 * de onde a pessoa veio (a conta a receber, a venda, o kardex…) em vez da lista geral.
 */
const CHAVE = "mxerp:historico";
const MAX = 40;

export function lerHistorico(): string[] {
  try { const v = JSON.parse(sessionStorage.getItem(CHAVE) ?? "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}
function gravar(h: string[]) {
  try { sessionStorage.setItem(CHAVE, JSON.stringify(h.slice(-MAX))); } catch {}
}
const caminhoDe = (url: string) => url.split(/[?#]/)[0];

/** Registra a página atual. Trocar só a aba ou o filtro da mesma tela substitui a última entrada. */
export function registrarPagina(url: string) {
  const h = lerHistorico();
  const ult = h[h.length - 1];
  if (ult === url) return;
  if (ult && caminhoDe(ult) === caminhoDe(url)) h[h.length - 1] = url;
  else h.push(url);
  gravar(h);
}

/** Páginas que não fazem sentido como destino do "Voltar" (formulários e impressões). */
const PASSAGEM = /\/(editar|adicionar|novo|nova|imprimir|importar)(\/|$)/;

/**
 * Para onde o "Voltar" leva: a última página visitada antes desta que não seja ela mesma,
 * uma sub-página dela (editar, imprimir) ou um formulário. Devolve também o índice para cortar o histórico.
 */
export function destinoVoltar(atual: string): { url: string; indice: number } | null {
  const h = lerHistorico();
  const aqui = caminhoDe(atual);
  for (let i = h.length - 1; i >= 0; i--) {
    const c = caminhoDe(h[i]);
    if (c === aqui || c.startsWith(aqui + "/") || PASSAGEM.test(c) || c === "/login") continue;
    return { url: h[i], indice: i };
  }
  return null;
}

/** Corta o histórico até antes do destino (ele volta a ser registrado ao abrir). */
export function voltarAte(indice: number) {
  gravar(lerHistorico().slice(0, indice));
}
