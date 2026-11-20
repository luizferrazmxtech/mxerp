// Testa a conexão segura com a SEFAZ-SP e a NFS-e Nacional usando o certificado de cada empresa (só consultas).
//   docker exec mxerp-app-1 npx tsx scripts/teste-conexao-sefaz.ts
import { prisma } from "@/lib/db";
import { certificadoDaEmpresa } from "@/lib/fiscal/certificado";
import { ClienteSefaz } from "@/lib/fiscal/sefaz";
import { consultarCadastroSefaz } from "@/lib/fiscal/consultaCadastro";
import { transporteRest } from "@/lib/fiscal/nfse";

(async () => {
  for (const e of await prisma.empresa.findMany()) {
    console.log(`== ${e.nomeFantasia || e.razaoSocial}`);
    let cert;
    try { cert = certificadoDaEmpresa(e); } catch (x) { console.log("  certificado:", (x as Error).message); continue; }
    const amb = e.ambienteFiscal === "PRODUCAO" ? 1 : 2;
    for (const m of [55, 65] as const) {
      try { const r = await new ClienteSefaz(cert, e.uf ?? "SP", amb, undefined).status(m); console.log(`  status ${m}: ${r.cStat} - ${r.xMotivo}`); }
      catch (x) { console.log(`  status ${m}: ERRO ${(x as Error).message}`); }
    }
    try { const r = await consultarCadastroSefaz(e.uf ?? "SP", e.cnpj, cert); console.log(`  cadastro: ${r.cStat} - ${r.xMotivo}`); }
    catch (x) { console.log(`  cadastro: ERRO ${(x as Error).message}`); }
    try {
      const r = await transporteRest("GET", `https://sefin.${amb === 1 ? "" : "producaorestrita."}nfse.gov.br/SefinNacional/parametros_municipais/3548906/convenio`, null, cert);
      console.log(`  NFS-e Nacional: HTTP ${r.status} ${r.corpo.slice(0, 120)}`);
    } catch (x) { console.log(`  NFS-e Nacional: ERRO ${(x as Error).message}`); }
  }
  await prisma.$disconnect();
})();
