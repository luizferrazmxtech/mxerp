# Notas fiscais (NF-e e NFC-e) direto na SEFAZ-SP

O MXERP fala direto com os web services da SEFAZ-SP, sem provedor intermediário.

## O que já funciona

- Montagem do XML NF-e (modelo 55) e NFC-e (modelo 65), layout 4.00, **validado nos testes contra o schema oficial** (pacote PL_010 v1.30, em `fiscal-schemas/nfe`).
- Assinatura digital (RSA-SHA1, C14N) com certificado A1.
- Envio síncrono, leitura do protocolo, XML de distribuição (`nfeProc`) guardado no banco e disponível para download.
- QR Code da NFC-e (versão 2, com CSC) e DANFCE para impressão em bobina 80 mm.
- Cancelamento (evento 110111) e consulta de status do serviço.
- Simples Nacional (CSOSN 102/103/300/400/500) e regime normal básico (ICMS 00/40/41/50/60, PIS/COFINS cumulativo).

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

- NFS-e (padrão nacional) para os serviços da OS.
- Inutilização de numeração, carta de correção, contingência offline da NFC-e.
- DANFE A4 completo da NF-e (hoje há um DANFE simplificado).
- Grupo IBS/CBS da reforma tributária: os campos já existem no cadastro (`cClassTrib`, `ibsCbsAtivo`), a geração do grupo depende de validar as regras de 2027 com o contador.
