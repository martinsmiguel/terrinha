# Referências fixadas da toolchain

Inventário produzido para o card #96 em 2026-10-07. Versões são lidas dos arquivos versionados; os comentários mantêm a tag humana e o valor usado no workflow é o SHA imutável.

| Referência | Versão/tag | SHA ou origem |
| --- | --- | --- |
| Node no CI | 22 | `actions/setup-node` v4.4.0, SHA `49933ea5288caeca8642d1e84afbd3f7d6820020` |
| Python no CI | 3.12 | `actions/setup-python` v5.6.0, SHA `a26af69be951a213d495a4c3e4e4022e16d87065` |
| checkout | v4.2.2 | `11bd71901bbe5b1630ceea73d27597364c9af683` |
| github-script | v7.0.1 | `60a0d83039c74a4aee543508d2ffcb1c3799cdea` |
| upload-artifact | v4.6.2 | `ea165f8d65b6e75b540449e92b4886f43607fa02` |
| imagem de produção | `node:22-alpine` | referência mutável do registry; digest deve ser registrado no build de release |
| npm | lockfile v3 | `npm ci` é obrigatório; mudanças entram em lote revisável |

Política: Actions ficam fixadas por SHA e recebem atualização deliberada com tag, SHA de origem e checks. Dependências npm são resolvidas pelo lockfile; overrides de segurança precisam apontar o advisory e manter `npm audit` verde. A imagem Docker ainda exige digest por release, pois o Dockerfile usa a tag oficial para manter o desenvolvimento local atualizável; esse limite fica explícito e não é apresentado como reprodutibilidade completa.
