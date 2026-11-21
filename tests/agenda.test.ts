import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { createVerify, generateKeyPairSync } from "node:crypto";

const URL = "postgresql://mxerp:mxerp@localhost:5432/mxerp_test?schema=public";
process.env.DATABASE_URL = URL;
process.env.CHAVE_SEGREDOS ??= "chave-de-teste-da-agenda-12345";

const { prisma } = await import("@/lib/db");
const ag = await import("@/lib/agenda/google");

beforeAll(() => execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: URL }, stdio: "ignore" }));

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const JSON_CONTA = JSON.stringify({ type: "service_account", client_email: "mxerp@projeto.iam.gserviceaccount.com", private_key: privateKey });

type Chamada = { metodo: string; url: string; corpo: Record<string, unknown> | null };
function google(opcoes: { falharPost?: boolean } = {}) {
  const chamadas: Chamada[] = [];
  let n = 0;
  const f = (async (url: string, init: RequestInit = {}) => {
    const metodo = init.method ?? "GET";
    if (url === ag.URL_TOKEN) {
      const jwt = new URLSearchParams(String(init.body)).get("assertion")!;
      const [h, p, s] = jwt.split(".");
      expect(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url"))).toBe(true);
      expect(JSON.parse(Buffer.from(p, "base64url").toString())).toMatchObject({ iss: "mxerp@projeto.iam.gserviceaccount.com", aud: ag.URL_TOKEN });
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
    }
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
    const corpo = init.body ? JSON.parse(String(init.body)) : null;
    chamadas.push({ metodo, url: decodeURIComponent(url.replace(ag.URL_AGENDA, "")), corpo });
    if (metodo === "POST" && opcoes.falharPost) return new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 503 });
    if (metodo === "POST") return new Response(JSON.stringify({ id: `ev${++n}` }));
    if (metodo === "PUT") return new Response(JSON.stringify({ id: url.split("/").pop() }));
    if (metodo === "DELETE") return new Response(null, { status: 204 });
    if (url.includes("/calendarList/")) return new Response(JSON.stringify({ summary: "Equipe A", accessRole: "writer" }));
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

let os = "", eqA = "", eqB = "";
beforeEach(async () => {
  await prisma.$executeRawUnsafe(`TRUNCATE "OrdemServico","Equipe","Pessoa" CASCADE`);
  await prisma.configuracao.deleteMany({ where: { chave: "googleagenda" } });
  const cli = await prisma.pessoa.create({ data: { nome: "Padaria Pão Quente", cliente: true, logradouro: "Rua das Flores", numero: "10", bairro: "Centro", cidade: "São Carlos", uf: "SP", celular: "16999990000" } });
  eqA = (await prisma.equipe.create({ data: { nome: "Equipe A" } })).id;
  eqB = (await prisma.equipe.create({ data: { nome: "Equipe B" } })).id;
  os = (await prisma.ordemServico.create({ data: { numero: 501, clienteId: cli.id, equipeId: eqA, agendaInicio: new Date("2026-11-23T13:00:00Z"), agendaDuracaoMin: 90, equipamentos: { create: [{ ordem: 1, equipamento: "Câmera IP", marca: "Intelbras", defeitos: "sem imagem" }] } } })).id;
});

const ligar = () => ag.salvarConfigAgenda({ ativo: true, json: JSON_CONTA, agendaPadrao: "", duracaoPadraoMin: 120, equipes: { [eqA]: "https://calendar.google.com/calendar/embed?src=equipea%40group.calendar.google.com&ctz=America%2FSao_Paulo", [eqB]: "equipeb@group.calendar.google.com" } });

describe("google agenda", () => {
  it("lê o .json da conta de serviço, guarda a chave cifrada e aceita o link da agenda", async () => {
    expect(() => ag.lerContaServico("{}")).toThrow(/conta de serviço/);
    await expect(ag.salvarConfigAgenda({ ativo: true, agendaPadrao: "", duracaoPadraoMin: 60 })).rejects.toThrow(/\.json/);
    await ligar();
    const bruto = JSON.stringify((await prisma.configuracao.findUniqueOrThrow({ where: { chave: "googleagenda" } })).valor);
    expect(bruto).not.toContain("PRIVATE KEY");
    expect(await ag.configAgendaTela()).toMatchObject({ ativo: true, contaServico: "mxerp@projeto.iam.gserviceaccount.com", temChave: true });
    expect((await prisma.equipe.findUniqueOrThrow({ where: { id: eqA } })).googleAgendaId).toBe("equipea@group.calendar.google.com");
    const g = google();
    expect(await ag.testarAgendas({ fetch: g.f })).toMatchObject({ ok: true });
  });

  it("cria o evento na agenda da equipe, atualiza, muda de agenda ao trocar a equipe e apaga ao cancelar", async () => {
    expect(await ag.sincronizarOsNaAgenda(os)).toBe("desligado");
    await ligar();
    const g = google();
    expect(await ag.sincronizarOsNaAgenda(os, { fetch: g.f })).toBe("criado");
    const c0 = g.chamadas[0];
    expect(c0).toMatchObject({ metodo: "POST", url: "/calendars/equipea@group.calendar.google.com/events" });
    expect(c0.corpo).toMatchObject({ summary: "OS 501 · Padaria Pão Quente", location: "Rua das Flores, 10 - Centro - São Carlos/SP", start: { dateTime: "2026-11-23T13:00:00.000Z", timeZone: "America/Sao_Paulo" }, end: { dateTime: "2026-11-23T14:30:00.000Z" } });
    expect(String(c0.corpo!.description)).toContain("Câmera IP Intelbras: sem imagem");
    expect(await prisma.ordemServico.findUniqueOrThrow({ where: { id: os } })).toMatchObject({ googleEventoId: "ev1", googleAgendaId: "equipea@group.calendar.google.com", googlePendente: false });

    await prisma.ordemServico.update({ where: { id: os }, data: { agendaInicio: new Date("2026-11-24T12:00:00Z") } });
    expect(await ag.sincronizarOsNaAgenda(os, { fetch: g.f })).toBe("atualizado");
    expect(g.chamadas[1]).toMatchObject({ metodo: "PUT", url: "/calendars/equipea@group.calendar.google.com/events/ev1" });

    await prisma.ordemServico.update({ where: { id: os }, data: { equipeId: eqB } });
    expect(await ag.sincronizarOsNaAgenda(os, { fetch: g.f })).toBe("criado");
    expect(g.chamadas.slice(2).map((c) => `${c.metodo} ${c.url}`)).toEqual(["DELETE /calendars/equipea@group.calendar.google.com/events/ev1", "POST /calendars/equipeb@group.calendar.google.com/events"]);

    await prisma.ordemServico.update({ where: { id: os }, data: { situacao: "CANCELADA" } });
    expect(await ag.sincronizarOsNaAgenda(os, { fetch: g.f })).toBe("removido");
    expect(g.chamadas.at(-1)).toMatchObject({ metodo: "DELETE", url: "/calendars/equipeb@group.calendar.google.com/events/ev2" });
    expect(await prisma.ordemServico.findUniqueOrThrow({ where: { id: os } })).toMatchObject({ googleEventoId: null, googleAgendaId: null });
  });

  it("erro do Google não impede salvar: fica pendente e o agendador tenta de novo", async () => {
    await ligar();
    const ruim = google({ falharPost: true });
    expect(await ag.sincronizarOsNaAgenda(os, { fetch: ruim.f })).toMatch(/^erro: Google respondeu 503/);
    expect(await prisma.ordemServico.findUniqueOrThrow({ where: { id: os } })).toMatchObject({ googlePendente: true, googleEventoId: null });
    const bom = google();
    expect(await ag.sincronizarAgenda({ fetch: bom.f })).toMatchObject({ total: 1, criados: 1, erros: [] });
    expect(await prisma.ordemServico.findUniqueOrThrow({ where: { id: os } })).toMatchObject({ googlePendente: false, googleErro: null, googleEventoId: "ev1" });
    // sem equipe e sem agenda padrão: não manda
    await prisma.ordemServico.update({ where: { id: os }, data: { equipeId: null } });
    expect(await ag.sincronizarOsNaAgenda(os, { fetch: bom.f })).toBe("removido");
  });
});
