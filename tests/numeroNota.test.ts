import { describe, expect, it } from "vitest";
import { numeroDaNota, numeroNfseDoXml } from "@/lib/fiscal/numeroNota";

describe("número da nota que aparece para o usuário", () => {
  it("NFS-e mostra o número da nota, não o da DPS/RPS", () => {
    expect(numeroDaNota({ modelo: "NFSE", numero: 15, numeroNfse: 16 })).toBe(16);
    expect(numeroDaNota({ modelo: "NFSE", numero: 15, numeroNfse: null })).toBe(15); // ainda sem número da prefeitura
    expect(numeroDaNota({ modelo: "NFE", numero: 6756, numeroNfse: 3 })).toBe(6756);
  });
  it("lê o nNFSe do XML autorizado", () => {
    expect(numeroNfseDoXml("<NFSe><infNFSe Id=\"NFS1\"><nNFSe> 140 </nNFSe></infNFSe></NFSe>")).toBe(140);
    expect(numeroNfseDoXml("<DPS/>")).toBeNull();
    expect(numeroNfseDoXml(null)).toBeNull();
  });
});
