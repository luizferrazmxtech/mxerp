import fs from "node:fs/promises";
import path from "node:path";

/** Pasta das cópias (na VPS: vps/backups montada só para leitura). */
export const PASTA_BACKUPS = process.env.PASTA_BACKUPS || "/backups";

const nomeValido = (s: string) => /^[a-z][a-z0-9]{1,29}$/.test(s);
// VPS: <banco>-AAAAMMDD-HHMM-<motivo>.dump ; PC: mxerp-AAAAMMDD-HHMM.dump (agendado) ou ...-manual.dump
const arquivoValido = (s: string) => /^[a-z0-9]+-\d{8}-\d{4}(-[a-z-]+)?\.dump$/.test(s);

export async function listarBackups(slug: string) {
  if (!nomeValido(slug)) return [];
  const pasta = path.join(PASTA_BACKUPS, slug);
  const nomes = await fs.readdir(pasta).catch(() => [] as string[]);
  const out = [];
  for (const nome of nomes.filter((n) => arquivoValido(n) && n.startsWith(`${slug}-`))) {
    const st = await fs.stat(path.join(pasta, nome)).catch(() => null);
    if (!st) continue;
    const m = nome.match(/-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(?:-([a-z-]+))?\.dump$/)!;
    out.push({ nome, tamanho: st.size, quando: new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00-03:00`), motivo: m[6] ?? "agendado" });
  }
  return out.sort((a, b) => b.quando.getTime() - a.quando.getTime());
}

/** Caminho seguro de um arquivo de backup (sem "../"). */
export function caminhoBackup(slug: string, nome: string) {
  if (!nomeValido(slug) || !arquivoValido(nome) || !nome.startsWith(`${slug}-`)) return null;
  return path.join(PASTA_BACKUPS, slug, nome);
}

export const tamanhoLegivel = (b: number) => (b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);
