# Proteção da `main`

Registro verificável da configuração usada pelo Terrinha em 2026-10-07.

## Configuração observada

- Pull request obrigatória para integrar na `main`.
- Check obrigatório: `lint`.
- Enforcement ativo, inclusive para administradores.
- Aprovações obrigatórias: `0`, porque o repositório está sendo mantido por uma única pessoa neste período.
- Aprovações obsoletas são invalidadas quando a branch recebe novos commits.

A configuração foi consultada na API de proteção da branch, não inferida pelos arquivos locais. O fluxo continua exigindo PR e check verde; a revisão independente volta a ser necessária quando houver outro mantenedor disponível.

## Fluxo reversível

1. Abrir uma PR contra `main` e manter o card em `In Review`.
2. Aguardar `lint` verde e resolver conflitos com a `main` atual.
3. Conferir o SHA final e os critérios no comentário da PR.
4. Fazer o merge pelo GitHub.
5. Para alterar a política, registrar a mudança na proteção da branch e atualizar este documento; não usar force-push nem bypass administrativo.

## Limitações

Não foi executado um teste destrutivo de PR inválida. A verificação feita foi read-only na configuração remota e nos workflows versionados; a evidência do bloqueio por aprovação independente deixou de ser aplicável depois que o requisito foi reduzido a zero.
