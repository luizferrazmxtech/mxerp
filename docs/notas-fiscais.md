# Notas fiscais direto na SEFAZ-SP e na NFS-e Nacional

O MXERP fala direto com os web services da SEFAZ-SP (NF-e/NFC-e) e com a API da NFS-e Nacional (Sefin/ADN), sem provedor intermediário.

## O que já funciona

- Montagem do XML NF-e (modelo 55) e NFC-e (modelo 65), layout 4.00, **validado nos testes contra o schema oficial** (pacote PL_010 v1.30, em `fiscal-schemas/nfe`).
- Assinatura digital (RSA-SHA1, C14N) com certificado A1.
- Envio síncrono, leitura do protocolo, XML de distribuição (`nfeProc`) guardado no banco e disponível para download.
- QR Code da NFC-e (versão 2, com CSC) e DANFCE para impressão em bobina 80 mm.
- Cancelamento (evento 110111) e consulta de status do serviço.
- Simples Nacional (CSOSN 102/103/300/400/500) e regime normal básico (ICMS 00/40/41/50/60, PIS/COFINS cumulativo).

## NFS-e (padrão nacional)

- DPS 1.00 montada e **validada contra o schema oficial** (`fiscal-schemas/nfse`), assinada, compactada (gzip+base64) e enviada para a Sefin Nacional com o certificado A1 (mTLS).
- Emissão pelos serviços da OS concluída/faturada; cancelamento (evento 101101) e link para o DANFSe oficial.
- Cada serviço precisa do **código de tributação nacional** (6 dígitos) em **Serviços**. Uma nota por código.
- Simples Nacional ME/EPP: o ISS vai no DAS, a alíquota não é informada (exceto retenção).
- Assinatura em RSA-SHA1 por padrão; defina `NFSE_ASSINATURA_SHA256=1` se a Sefin exigir SHA-256.
- **Antes de produção, confirmar que São Carlos emite pelo padrão nacional.** Se a prefeitura ainda usar sistema próprio, a API devolve erro de município não conveniado.

## Configuração no servidor

| Variável | Para quê |
|---|---|
| `CERTIFICADO_A1_PATH` | caminho do arquivo `.pfx` da empresa |
| `CERTIFICADO_A1_SENHA` | senha do certificado (só no servidor, nunca no banco) |
| `SEFAZ_CA_FILE` | `.pem` com a cadeia de ACs da ICP-Brasil, para validar o HTTPS da SEFAZ |

Os endereços da SEFAZ-SP estão em `src/lib/fiscal/sefaz.ts` e podem ser trocados por variável `SEFAZ_SP_<55|65>_<PROD|HOMOLOG>_<SERVICO>` se a SEFAZ mudar.

## Passo a passo para começar

1. Em **Notas fiscais › Configuração**, preencher os dados da empresa (com código IBGE do município) e deixar em **Homologação**.
2. Gerar o **CSC** da NFC-e no portal da SEFAZ-SP e cadastrar ID + código.
3. Em cada produto, preencher **NCM** (e CEST quando houver). CFOP padrão 5102/6102 e CSOSN 102.
4. Concluir uma venda e clicar **Emitir NFC-e**. Conferir o DANFCE e o XML.
5. Depois de emitir e cancelar algumas notas de teste, trocar o ambiente para **Produção**.

## Ainda falta

- Inutilização de numeração, carta de correção, contingência offline da NFC-e.
- DANFE A4 completo da NF-e (hoje há um DANFE simplificado).
- Grupo IBS/CBS da reforma tributária: os campos já existem no cadastro (`cClassTrib`, `ibsCbsAtivo`), a geração do grupo depende de validar as regras de 2027 com o contador.
