/** Dados de demonstração para desenvolvimento. */
import { PrismaClient } from "@prisma/client";
import { entrada } from "@/lib/estoque/estoque";

const prisma = new PrismaClient();

async function main() {
  if (await prisma.produto.count()) return console.log("Banco já tem dados; seed ignorado.");
  const loja = await prisma.deposito.create({ data: { nome: "Loja" } });
  const locais = await Promise.all(
    [["A", "01"], ["A", "02"], ["B", "01"], ["B", "02"], ["C", "01"]].map(([c, p]) =>
      prisma.local.create({ data: { depositoId: loja.id, corredor: c, prateleira: p, codigo: `LOJA-${c}-${p}` } }),
    ),
  );
  const produtos = [
    ["F0821GBL", "INF - SWITCH 8 PORTAS POE GIGABIT +2G RJ45 +SFP", 499, 126, 0, 4],
    ["4850017", "AUT - INTERRUPTOR SMART WI-FI EWS1003 BRANCO", 159, 70, 1, 6],
    ["107133", "INF - CABO DROP FLAT 1FO (metro)", 2.29, 0.5, 2, 500],
    ["4830065", "CEL - CABO USB-C X USB-C 1.2M", 39, 12, 3, 20],
    ["2055377402702", "ELE - MODULO MINI GBIC WDM SC 1.25G SM 20KM", 259, 150.28, 4, 2],
  ] as const;
  for (const [codigo, nome, preco, custo, li, q] of produtos) {
    const p = await prisma.produto.create({
      data: { codigo, nome, precoVenda: preco, custo, localPadraoId: locais[li].id },
    });
    await prisma.$transaction((tx) => entrada(tx, { produtoId: p.id, localId: locais[li].id, quantidade: q, origemTipo: "IMPLANTACAO" }));
  }
  await prisma.pessoa.createMany({
    data: [
      { nome: "CONDOMINIO MONTE DAS ARAUCARIAS", documento: "00000000000191" },
      { nome: "CLIENTE BALCÃO", tipoPessoa: "FISICA" },
    ],
  });
  await prisma.servico.createMany({
    data: [
      { codigo: "INST", nome: "Instalação de rede", preco: 300 },
      { codigo: "VISITA", nome: "Visita técnica", preco: 150 },
    ],
  });
  await prisma.usuario.create({ data: { nome: "Técnico Demo", email: "tecnico@exemplo.local", senhaHash: "-", tecnico: true } });
  console.log("Seed concluído.");
}

main().finally(() => prisma.$disconnect());
