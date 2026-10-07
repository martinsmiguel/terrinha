import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';

// Executa o JavaScript realmente embarcado no workflow com API simulada.
const workflow = readFileSync('.github/workflows/pr-board-sync.yml', 'utf8');
const scripts = workflow.split('script: |\n').slice(1).map((part) => {
  const lines = part.split('\n');
  const end = lines.findIndex((line) => line.trim() && !line.startsWith('            '));
  return lines.slice(0, end < 0 ? lines.length : end).map((line) => line.slice(12)).join('\n');
});
const RECORD = 0;
const MOVE = 1;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function run(index: number, overrides: Record<string, unknown> = {}) {
  const pr = { body: 'Refs: #90', number: 100, draft: false, base: { ref: 'main' }, merged: false, merge_commit_sha: 'abc123', html_url: 'https://github.com/owner/repo/pull/100', head: { ref: 'fix/task', sha: 'candidate123' }, ...overrides };
  const comments = vi.fn();
  const graphql = vi.fn(async (query: string) => {
    if (query.includes('user(login:')) return { user: { projectV2: { id: 'p', fields: { nodes: [{ id: 'f', name: 'Status', options: [{ id: 'r', name: 'In Review' }] }] } } } };
    if (query.includes('repository(owner:')) return { repository: { issue: { id: 'i', projectItems: { nodes: [{ id: 'c', project: { id: 'p' } }] } } } };
    return {};
  });
  await new AsyncFunction('context', 'github', 'core', scripts[index])(
    { repo: { owner: 'owner', repo: 'repo' }, payload: { action: pr.merged ? 'closed' : 'opened', pull_request: pr, repository: { default_branch: 'main' } } },
    { graphql, rest: { issues: { createComment: comments } } }, { info: vi.fn(), warning: vi.fn() },
  );
  return { comments, graphql };
}
describe('automação de quadro e aceite', () => {
  it('move referências explícitas para revisão, sem conclusão', async () => {
    const { graphql } = await run(MOVE);
    expect(graphql.mock.calls.some(([q]) => q.includes('updateProjectV2ItemFieldValue'))).toBe(true);
    expect(workflow).not.toContain('option.name === "Done"');
  });
  it.each([{ draft: true }, { base: { ref: 'feature' } }, { merged: true }])('não promove PR fora da revisão elegível: %j', async (overrides) => {
    expect((await run(MOVE, overrides)).graphql).not.toHaveBeenCalled();
  });
  it('ignora referências de exemplos, comentários e menções em prosa', async () => {
    const { graphql } = await run(MOVE, { body: '<!-- Refs: #1 -->\n```md\nCloses #2\n```\nExemplo #3\n~~~\nRefs #4\n~~~' });
    expect(graphql).not.toHaveBeenCalled();
  });
  it('deduplica referências e registra integração sem declarar aceite', async () => {
    const { comments, graphql } = await run(2, { merged: true, body: 'Refs: #90 #90\nCloses #91' });
    expect(graphql).not.toHaveBeenCalled();
    expect(comments.mock.calls.map(([arg]) => arg.issue_number)).toEqual([90, 91]);
    expect(comments.mock.calls[0][0].body).toContain('abc123');
    expect(comments.mock.calls[0][0].body).toContain('aceite dos critérios ainda');
  });
  it.each([{ merged: false }, { merged: true, base: { ref: 'feature' } }])('não registra integração na main inexistente: %j', async (overrides) => {
    expect((await run(2, overrides)).comments).not.toHaveBeenCalled();
  });
});


describe('vínculo e limites da automação #90', () => {
  it('registra link clicável, branch e SHA antes da mudança de status', async () => {
    const { comments } = await run(RECORD);
    expect(comments.mock.calls[0][0].body).toContain('[#100](https://github.com/owner/repo/pull/100)');
    expect(comments.mock.calls[0][0].body).toContain('candidate123');
    expect(comments.mock.calls[0][0].body).not.toContain('card movido');
  });
  it('ignora referências dentro de crases', async () => {
    expect((await run(MOVE, { body: 'Refs: `#90`' })).graphql).not.toHaveBeenCalled();
  });
});


describe('release explícita #90', () => {
  const release = readFileSync('.github/workflows/version-bump.yml', 'utf8');
  it('não dispara no merge nem publica commits, tags ou releases', () => {
    expect(release).toContain('workflow_dispatch:');
    expect(release).not.toMatch(/^\s+push:/m);
    expect(release).not.toContain('git push');
    expect(release).not.toContain('git tag');
    expect(release).not.toContain('contents: write');
  });
  it('valida versão preparada no pacote e lock no SHA explícito', () => {
    expect(release).toContain('candidate_sha:');
    expect(release).toContain('git merge-base --is-ancestor HEAD origin/main');
    expect(release).toContain('l.packages[""].version!==p.version');
  });
});

describe('referências externas não afetam cards locais', () => {
  it('ignora owner/repo#N nas três ações do workflow', async () => {
    for (const index of [RECORD, MOVE, 2]) {
      const result = await run(index, {merged: index === 2, body: 'Refs: other/project#90'});
      expect(result.comments).not.toHaveBeenCalled();
      expect(result.graphql).not.toHaveBeenCalled();
    }
  });
  it('mantém apenas IDs locais numa linha com referências mistas', async () => {
    const result = await run(2, {merged: true, body: 'Refs: #90 other/project#91'});
    expect(result.comments.mock.calls.map(([arg]) => arg.issue_number)).toEqual([90]);
  });
});
