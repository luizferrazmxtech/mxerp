import { describe, expect, it } from "vitest";
import { cnpjValido, cpfValido, erroDocumento } from "@/lib/cadastros/documentos";
import { buscarDadosCnpj } from "@/lib/cadastros/consultaCnpj";
import { lerCertificado } from "@/lib/fiscal/certificado";
import { endpointCadastro, lerRetornoCadastro, montarConsCad } from "@/lib/fiscal/consultaCadastro";
import type { Transporte } from "@/lib/fiscal/sefaz";
import { pfxDeTeste } from "./helpers/certificado-teste";

const { pfx, senha } = pfxDeTeste();
const cert = lerCertificado(pfx, senha);
const CNPJ = "07105759000188";

const brasilApi = {
  cnpj: CNPJ, razao_social: "ACAB-BEM ARAMADOS LTDA", nome_fantasia: "ACAB", descricao_situacao_cadastral: "ATIVA",
  cep: "13560000", descricao_tipo_de_logradouro: "RUA", logradouro: "EPISCOPAL", numero: "100", complemento: "SALA 2",
  bairro: "CENTRO", municipio: "SAO CARLOS", uf: "SP", codigo_municipio_ibge: 3548906, ddd_telefone_1: "1633614848", email: "CONTATO@ACAB.COM.BR",
  cnae_fiscal: 2599399, opcao_pelo_simples: true, opcao_pelo_mei: false,
};
const cnpjWs = {
  razao_social: "ACAB-BEM ARAMADOS LTDA", simples: { simples: "Não", mei: "Não" },
  estabelecimento: {
    nome_fantasia: "ACAB", situacao_cadastral: "Ativa", tipo_logradouro: "Rua", logradouro: "Episcopal", numero: "100", complemento: null, bairro: "Centro",
    cep: "13560000", ddd1: "16", telefone1: "33614848", email: "contato@acab.com.br", cidade: { nome: "São Carlos", ibge_id: 3548906 }, estado: { sigla: "SP" },
    inscricoes_estaduais: [{ inscricao_estadual: "637271680113", ativo: true, estado: { sigla: "SP" } }, { inscricao_estadual: "999", ativo: true, estado: { sigla: "MG" } }],
  },
};

/** fetch simulado: url → resposta (status, corpo); registra as chamadas */
function fetchFalso(rotas: Record<string, [number, unknown] | Error>) {
  const chamadas: string[] = [];
  const f = (async (url: string) => {
    chamadas.push(url);
    const k = Object.keys(rotas).find((r) => url.includes(r));
    const v = k ? rotas[k] : [500, {}];
    if (v instanceof Error) throw v;
    return new Response(JSON.stringify(v[1]), { status: v[0] as number });
  }) as unknown as typeof fetch;
  return { f, chamadas };
}

const retCad = (cStat: string, infCad = "") =>
  `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4">` +
  `<retConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><verAplic>SP</verAplic><cStat>${cStat}</cStat><xMotivo>Motivo ${cStat}</xMotivo><UF>SP</UF><CNPJ>${CNPJ}</CNPJ><dhCons>2026-11-20T10:00:00-03:00</dhCons><cUF>35</cUF>${infCad}</infCons></retConsCad></nfeResultMsg></soap:Body></soap:Envelope>`;
const infCad = (ie: string, cSit = "1") =>
  `<infCad><IE>${ie}</IE><CNPJ>${CNPJ}</CNPJ><UF>SP</UF><cSit>${cSit}</cSit><indCredNFe>1</indCredNFe><indCredCTe>4</indCredCTe><xNome>ACAB-BEM ARAMADOS LTDA</xNome><xFant>ACAB</xFant><xRegApur>NORMAL - REGIME PERIÓDICO DE APURAÇÃO</xRegApur><CNAE>2599399</CNAE>` +
  `<ender><xLgr>RUA EPISCOPAL</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><cMun>3548906</cMun><xMun>SAO CARLOS</xMun><CEP>13560000</CEP></ender></infCad>`;

function transporteFalso(resposta: string | Error) {
  const chamadas: { url: string; acao: string; corpo: string }[] = [];
  const t: Transporte = async (url, acao, corpo) => {
    chamadas.push({ url, acao, corpo });
    if (resposta instanceof Error) throw resposta;
    return resposta;
  };
  return { t, chamadas };
}

describe("CPF e CNPJ", () => {
  it("valida os dígitos verificadores", () => {
    expect(cpfValido("123.456.789-09")).toBe(true);
    expect(cpfValido("123.456.789-08")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("07.105.759/0001-88")).toBe(true);
    expect(cnpjValido("07.105.759/0001-89")).toBe(false);
    expect(cnpjValido("00000000000000")).toBe(false);
    expect(erroDocumento("123.456.789-08", "FISICA")).toMatch(/CPF inválido/);
    expect(erroDocumento("123", "FISICA")).toMatch(/11 dígitos/);
    expect(erroDocumento("", "JURIDICA")).toBeNull();
    expect(erroDocumento("ABC123", "ESTRANGEIRO")).toBeNull();
  });
});

describe("consulta de cadastro na SEFAZ", () => {
  it("monta o consCad e lê uma ou várias inscrições", () => {
    expect(montarConsCad("sp", "07.105.759/0001-88")).toBe(
      `<ConsCad xmlns="http://www.portalfiscal.inf.br/nfe" versao="2.00"><infCons><xServ>CONS-CAD</xServ><UF>SP</UF><CNPJ>${CNPJ}</CNPJ></infCons></ConsCad>`,
    );
    const um = lerRetornoCadastro(retCad("111", infCad("637271680113")));
    expect(um).toMatchObject({ ok: true, cadastros: [{ ie: "637271680113", habilitada: true, razaoSocial: "ACAB-BEM ARAMADOS LTDA", endereco: { codigoMunicipio: "3548906", cep: "13560000" } }] });
    const varios = lerRetornoCadastro(retCad("112", infCad("111") + infCad("222", "0")));
    expect(varios.ok && varios.cadastros.map((c) => [c.ie, c.habilitada])).toEqual([["111", true], ["222", false]]);
    expect(lerRetornoCadastro(retCad("259"))).toMatchObject({ ok: false, naoContribuinte: true });
  });

  it("UFs sem o serviço não têm endereço; variável de ambiente sobrescreve", () => {
    expect(endpointCadastro("SP")).toMatch(/fazenda\.sp\.gov\.br/);
    expect(endpointCadastro("SC")).toMatch(/svrs/);
    expect(endpointCadastro("RJ")).toBeNull();
    process.env.SEFAZ_CADASTRO_RJ = "https://exemplo/rj";
    expect(endpointCadastro("rj")).toBe("https://exemplo/rj");
    delete process.env.SEFAZ_CADASTRO_RJ;
  });
});

describe("busca de dados pelo CNPJ", () => {
  it("Receita pela BrasilAPI e IE pela SEFAZ da UF da empresa", async () => {
    const { f, chamadas } = fetchFalso({ brasilapi: [200, brasilApi] });
    const sefaz = transporteFalso(retCad("111", infCad("637271680113")));
    const r = await buscarDadosCnpj("07.105.759/0001-88", { fetch: f, cert, transporte: sefaz.t });
    expect(r).toMatchObject({
      razaoSocial: "ACAB-BEM ARAMADOS LTDA", nomeFantasia: "ACAB", email: "contato@acab.com.br", telefone: "(16) 3361-4848",
      endereco: { logradouro: "RUA EPISCOPAL", numero: "100", cep: "13560-000", uf: "SP", codigoMunicipio: "3548906", cidade: "SAO CARLOS" },
      inscricaoEstadual: "637271680113", contribuinteIcms: "CONTRIBUINTE", avisos: [], cnae: "2599399", regime: "SIMPLES_NACIONAL",
    });
    expect(r.fontes).toEqual(["Receita (BrasilAPI)", "IE pela SEFAZ-SP"]);
    expect(chamadas).toHaveLength(1);
    expect(sefaz.chamadas[0].url).toMatch(/cadconsultacadastro4/);
    expect(sefaz.chamadas[0].acao).toBe("http://www.portalfiscal.inf.br/nfe/wsdl/CadConsultaCadastro4/consultaCadastro");
    expect(sefaz.chamadas[0].corpo).toContain(`<CNPJ>${CNPJ}</CNPJ>`);
  });

  it("SEFAZ diz que não é contribuinte (259): IE vazia e não contribuinte", async () => {
    const { f } = fetchFalso({ brasilapi: [200, brasilApi] });
    const r = await buscarDadosCnpj(CNPJ, { fetch: f, cert, transporte: transporteFalso(retCad("259")).t });
    expect(r).toMatchObject({ inscricaoEstadual: "", contribuinteIcms: "NAO_CONTRIBUINTE" });
  });

  it("IE não habilitada vira aviso e não contribuinte", async () => {
    const { f } = fetchFalso({ brasilapi: [200, brasilApi] });
    const r = await buscarDadosCnpj(CNPJ, { fetch: f, cert, transporte: transporteFalso(retCad("111", infCad("637271680113", "0"))).t });
    expect(r).toMatchObject({ inscricaoEstadual: "", contribuinteIcms: "NAO_CONTRIBUINTE" });
    expect(r.avisos[0]).toMatch(/não habilitada/);
  });

  it("BrasilAPI fora do ar: usa o CNPJ.ws, que já traz a IE quando a SEFAZ falha", async () => {
    const { f, chamadas } = fetchFalso({ brasilapi: [503, {}], "cnpj.ws": [200, cnpjWs] });
    const r = await buscarDadosCnpj(CNPJ, { fetch: f, cert, transporte: transporteFalso(new Error("ECONNRESET")).t });
    expect(r).toMatchObject({ razaoSocial: "ACAB-BEM ARAMADOS LTDA", telefone: "(16) 3361-4848", inscricaoEstadual: "637271680113", contribuinteIcms: "CONTRIBUINTE", endereco: { logradouro: "Rua Episcopal", uf: "SP" }, regime: "REGIME_NORMAL" });
    expect(r.avisos[0]).toMatch(/SEFAZ-SP não respondeu/);
    expect(r.fontes).toEqual(["Receita (CNPJ.ws)", "IE pela base pública (CNPJ.ws)"]);
    expect(chamadas.filter((c) => c.includes("cnpj.ws"))).toHaveLength(1);
  });

  it("loja sem certificado: IE pela base pública, com aviso", async () => {
    const { f } = fetchFalso({ brasilapi: [200, brasilApi], "cnpj.ws": [200, cnpjWs] });
    const r = await buscarDadosCnpj(CNPJ, { fetch: f, cert: null });
    expect(r.inscricaoEstadual).toBe("637271680113");
    expect(r.avisos[0]).toMatch(/não tem certificado/);
  });

  it("UF sem consulta na SEFAZ (RJ) e sem IE na base pública: mantém o campo e avisa", async () => {
    const rj = { ...brasilApi, uf: "RJ" };
    const ws = { ...cnpjWs, estabelecimento: { ...cnpjWs.estabelecimento, inscricoes_estaduais: [] } };
    const sefaz = transporteFalso(retCad("111", infCad("1")));
    const r = await buscarDadosCnpj(CNPJ, { fetch: fetchFalso({ brasilapi: [200, rj], "cnpj.ws": [200, ws] }).f, cert, transporte: sefaz.t });
    expect(sefaz.chamadas).toHaveLength(0);
    expect(r.inscricaoEstadual).toBeNull();
    expect(r.contribuinteIcms).toBeNull();
    expect(r.avisos.join(" ")).toMatch(/SEFAZ-RJ não oferece.*Nenhuma inscrição estadual em RJ/);
  });

  it("base pública toda fora: nome e endereço vêm da SEFAZ da UF da loja", async () => {
    const { f } = fetchFalso({ brasilapi: new Error("fetch failed"), "cnpj.ws": [429, {}], receitaws: [500, {}] });
    const r = await buscarDadosCnpj(CNPJ, { fetch: f, cert, ufLoja: "SP", transporte: transporteFalso(retCad("111", infCad("637271680113"))).t });
    expect(r).toMatchObject({ razaoSocial: "ACAB-BEM ARAMADOS LTDA", inscricaoEstadual: "637271680113", endereco: { logradouro: "RUA EPISCOPAL", cep: "13560-000", uf: "SP" } });
    expect(r.avisos[0]).toMatch(/Base pública indisponível/);
  });

  it("CNPJ inexistente ou inválido dá erro claro", async () => {
    await expect(buscarDadosCnpj("07105759000189", {})).rejects.toThrow(/CNPJ inválido/);
    const { f, chamadas } = fetchFalso({ brasilapi: [404, { message: "not found" }] });
    await expect(buscarDadosCnpj(CNPJ, { fetch: f, cert: null })).rejects.toThrow(/CNPJ não encontrado/);
    expect(chamadas).toHaveLength(1); // não insiste nas outras bases
  });
});
