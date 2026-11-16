import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { PAPEIS, TIPOS_PESSOA, type PapelPessoa } from "@/lib/cadastros/pessoas";
import { formatarDoc, ordemPessoas, wherePessoas } from "@/lib/cadastros/filtros";

/** "Exportar clientes" / "Exportar e-mails" do Mais ações: respeita os filtros da lista. */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const papel = sp.papel as PapelPessoa;
  if (!PAPEIS[papel]) return new Response("cadastro inválido", { status: 400 });
  const cfg = PAPEIS[papel];
  const where = await wherePessoas(papel, sp);
  if (sp.so === "emails") {
    const l = await prisma.pessoa.findMany({ where: { AND: [where, { email: { not: null } }] }, select: { nome: true, email: true }, orderBy: { nome: "asc" } });
    const csv = "﻿Nome;E-mail\r\n" + l.map((p) => `"${p.nome.replace(/"/g, '""')}";${p.email}`).join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="emails-${cfg.base.slice(1)}.csv"` } });
  }
  const l = await prisma.pessoa.findMany({ where, orderBy: ordemPessoas(papel, sp.o), include: { vendedor: { select: { nome: true } } }, omit: { foto: true } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(cfg.plural);
  ws.columns = [
    { header: "Código", key: "codigo", width: 9 }, { header: "Tipo de pessoa", key: "tipo", width: 14 }, { header: "Nome", key: "nome", width: 40 },
    { header: "Nome fantasia", key: "fantasia", width: 30 }, { header: "CPF/CNPJ", key: "doc", width: 20 }, { header: "RG", key: "rg", width: 14 },
    { header: "Inscrição estadual", key: "ie", width: 16 }, { header: "Inscrição municipal", key: "im", width: 16 }, { header: "E-mail", key: "email", width: 30 },
    { header: "Telefone", key: "telefone", width: 16 }, { header: "Celular", key: "celular", width: 16 }, { header: "CEP", key: "cep", width: 10 },
    { header: "Logradouro", key: "logradouro", width: 30 }, { header: "Número", key: "numero", width: 8 }, { header: "Complemento", key: "complemento", width: 16 },
    { header: "Bairro", key: "bairro", width: 20 }, { header: "Cidade", key: "cidade", width: 20 }, { header: "UF", key: "uf", width: 5 },
    { header: "Ativo", key: "ativo", width: 7 }, ...(papel === "cliente" ? [{ header: "Vendedor", key: "vendedor", width: 22 }, { header: "Limite de crédito", key: "limite", width: 14 }] : []),
    { header: "Cadastrado em", key: "cadastrado", width: 18 },
  ];
  const sigla = new Map(TIPOS_PESSOA.map((t) => [t.valor, t.sigla]));
  for (const p of l) ws.addRow({
    codigo: p[cfg.codigo], tipo: sigla.get(p.tipoPessoa), nome: p.nome, fantasia: p.fantasia, doc: formatarDoc(p.documento), rg: p.rg, ie: p.inscricaoEstadual,
    im: p.inscricaoMunicipal, email: p.email, telefone: p.telefone, celular: p.celular, cep: p.cep, logradouro: p.logradouro, numero: p.numero,
    complemento: p.complemento, bairro: p.bairro, cidade: p.cidade, uf: p.uf, ativo: p.ativo ? "Sim" : "Não", vendedor: p.vendedor?.nome,
    limite: p.limiteCredito != null ? Number(p.limiteCredito) : null, cadastrado: p.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  });
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${cfg.base.slice(1)}.xlsx"` },
  });
}
