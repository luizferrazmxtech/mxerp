/**
 * Importa o backup completo do Gestão Click pela linha de comando.
 *   npx tsx scripts/importar-backup.ts backup.zip            (simula)
 *   npx tsx scripts/importar-backup.ts backup.zip --gravar   (grava)
 *   --sem-pagar / --com-pagar, --sem-os, --sem-receber
 */
import fs from "node:fs";
import { importarBackupGestaoClick, lerBackupGestaoClick } from "../src/lib/migracao/gestaoclick";

const [arquivo, ...flags] = process.argv.slice(2);
if (!arquivo) { console.error("uso: npx tsx scripts/importar-backup.ts backup.zip [--gravar]"); process.exit(1); }
async function main() {
const t0 = Date.now();
const tabelas = await lerBackupGestaoClick(fs.readFileSync(arquivo));
console.log("Tabelas:", Object.entries(tabelas).map(([k, v]) => `${k}(${v.length})`).join(", "));
const res = await importarBackupGestaoClick(tabelas, {
  simular: !flags.includes("--gravar"),
  etapas: { cadastros: true, estoque: true, os: !flags.includes("--sem-os"), receber: !flags.includes("--sem-receber"), pagar: flags.includes("--com-pagar") },
});
for (const r of res) {
  console.log(`\n## ${r.tipo}${r.simulado ? " (simulação)" : ""}: ${r.lidas} lidas, ${r.criados} novos, ${r.atualizados} atualizados, ${r.ignorados.length} ignorados`);
  r.avisos.forEach((a) => console.log("  - " + a));
  r.ignorados.slice(0, 10).forEach((i) => console.log(`  · linha ${i.linha}: ${i.motivo}`));
}
console.log(`\n${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
