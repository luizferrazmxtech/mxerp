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

## Várias empresas (lojas)

Cada CNPJ é uma loja, em **Configurações › Empresas (lojas)**. Cada uma tem:

- dados do emitente (IE, IM, CNAE, regime, endereço com código IBGE);
- **certificado A1 próprio**: envie o `.pfx` e a senha na tela. O sistema confere a senha, a validade e o CNPJ (aceita o da matriz para filial, mesma raiz) e guarda o arquivo e a senha cifrados com a `CHAVE_SEGREDOS` do `.env`;
- ambiente (homologação/produção) separado para NF-e/NFC-e e para NFS-e;
- séries e **"última nota emitida"**: informe o número da última NF-e, NFC-e e DPS do Gestão Click para continuar a numeração;
- CSC da NFC-e, regime especial da NFS-e e textos complementares.

A numeração é por CNPJ, modelo, série e ambiente. Empresa sem IE (ex.: só serviços) não emite NF-e/NFC-e, só NFS-e. A nota sai sempre pela loja dona da venda/OS. O botão **Testar certificado e SEFAZ** consulta o status do serviço com o certificado da loja.

O certificado do servidor (`CERTIFICADO_A1_PATH`/`CERTIFICADO_A1_SENHA`) continua valendo para a empresa que não enviou o seu, desde que seja do mesmo CNPJ.

## Passo a passo para produção

1. Em **Configurações › Empresas**, cadastre cada CNPJ (a primeira fica com tudo o que já existe no sistema).
2. Envie o certificado A1 de cada uma e clique em **Testar** (NF-e e NFC-e devem responder 107).
3. Preencha a última NF-e, NFC-e e DPS emitidas no Gestão Click e as séries usadas lá.
4. Gere o CSC da NFC-e no portal da SEFAZ-SP e cadastre ID e código.
5. Confira NCM dos produtos e o código de tributação nacional (e NBS) dos serviços.
6. Emita e cancele algumas notas em homologação; depois troque o ambiente para **Produção**.

## Ainda falta

- Contingência offline da NFC-e.
- DANFE A4 completo da NF-e (hoje há um DANFE simplificado).
- Grupo IBS/CBS da reforma tributária: os campos já existem no cadastro (`cClassTrib`, `ibsCbsAtivo`), a geração do grupo depende de validar as regras de 2027 com o contador.
