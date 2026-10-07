'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/check.yml'), 'utf8');
const scripts = [...workflow.matchAll(/script: \|\n((?: {12}[^\n]*\n|\n)+)/g)].map(match => match[1].split('\n').map(line => line.slice(12)).join('\n'));
const repoName = 'TaktischerSpeck/EinsatzPost';
const context = { repo: { owner: 'TaktischerSpeck', repo: 'EinsatzPost' }, payload: { repository: { full_name: repoName } } };
const pull = { number: 7, state: 'open', draft: false, head: { sha: 'head', ref: 'feature/test', repo: { full_name: repoName } }, base: { sha: 'stale', ref: 'dev' }, merge_commit_sha: 'stale-merge' };
const env = { PR_NUMBER: '7', TESTED_HEAD: 'head', TESTED_BASE: 'current-base', TESTED_REF: 'head' };
function harness(pr = structuredClone(pull), base = 'current-base') {
  const calls = [], outputs = {};
  const github = { rest: {
    pulls: {
      get: async () => ({ data: pr }),
      merge: async args => { calls.push(['merge', args]); return { data: { merged: true, sha: 'squash' } }; }
    },
    repos: {
      getBranch: async () => ({ data: { commit: { sha: base } } }),
      merge: async args => { calls.push(['sync', args]); return { data: {} }; }
    },
    git: {
      getRef: async () => ({ data: { object: { sha: pr.head.sha } } }),
      deleteRef: async args => { calls.push(['delete', args]); }
    },
    actions: { createWorkflowDispatch: async args => { calls.push(['dispatch', args]); } }
  } };
  const core = { info() {}, setOutput(name, value) { outputs[name] = value; } };
  const run = (index, ctx = context, variables = env) => new AsyncFunction('github', 'context', 'core', 'process', scripts[index])(github, ctx, core, { env: variables });
  return { run, calls, outputs, github };
}
test('pipeline tests the current branch base rather than stale PR metadata', async () => {
  assert.equal(scripts.length, 2);
  const h = harness();
  await h.run(0, { ...context, payload: { ...context.payload, pull_request: { number: 7 } } });
  assert.equal(h.outputs.ref, 'head');
  assert.equal(h.outputs.base, 'current-base');
  assert.match(workflow, /git merge --no-edit "\$MAIN_SHA"/);
});
test('queued tests of a closed PR exit without starting another run', async () => {
  const h = harness({ ...pull, state: 'closed' });
  await h.run(0, { ...context, payload: { ...context.payload, inputs: { pull_request: '7' } } });
  assert.deepEqual(h.outputs, {}); assert.deepEqual(h.calls, []);
});
test('successful feature integration squash merges, deletes the branch and dispatches dev tests', async () => {
  const h = harness(); await h.run(1);
  assert.deepEqual(h.calls.map(call => call[0]), ['merge', 'delete', 'dispatch']);
  assert.equal(h.calls[0][1].merge_method, 'squash');
  assert.equal(h.calls[0][1].sha, 'head');
  assert.equal(h.calls[1][1].ref, 'heads/feature/test');
  assert.equal(h.calls[2][1].ref, 'dev');
});
test('a changed base or head triggers new tests without merging or deleting anything', async () => {
  for (const [pr, base] of [[pull, 'new-base'], [{ ...pull, head: { ...pull.head, sha: 'new-head' } }, 'current-base']]) {
    const h = harness(pr, base); await h.run(1);
    assert.deepEqual(h.calls.map(call => call[0]), ['dispatch']);
    assert.equal(h.calls[0][1].inputs.pull_request, '7');
  }
});
test('drafts, forks and unrelated branches are never automatically merged', async () => {
  for (const pr of [{ ...pull, draft: true }, { ...pull, head: { ...pull.head, repo: { full_name: 'other/repo' } } }, { ...pull, head: { ...pull.head, ref: 'other-branch' } }]) {
    const h = harness(pr); await h.run(1); assert.deepEqual(h.calls, []);
  }
});
test('dev promotion uses squash and syncs main back without deleting dev', async () => {
  const h = harness({ ...pull, head: { ...pull.head, ref: 'dev' }, base: { ref: 'main' } });
  await h.run(1);
  assert.deepEqual(h.calls.map(call => call[0]), ['merge', 'sync']);
  assert.equal(h.calls[1][1].base, 'dev');
  assert.equal(h.calls[1][1].head, 'squash');
});
function promotionHarness(tree = 'tested-tree') {
  const h = harness();
  h.github.rest.repos.getBranch = async ({ branch }) => ({ data: { commit: { sha: branch === 'dev' ? 'head' : 'current-base' } } });
  h.github.rest.repos.compareCommitsWithBasehead = async () => ({ data: { files: [{ filename: 'public/renderer.js' }] } });
  h.github.rest.repos.merge = async args => {
    h.calls.push(['integration', args]); return { data: { sha: 'integration-commit' } };
  };
  h.github.rest.git.createRef = async args => { h.calls.push(['temporary', args]); };
  h.github.rest.git.getCommit = async () => ({ data: { tree: { sha: tree } } });
  h.github.rest.git.createCommit = async args => { h.calls.push(['squash', args]); return { data: { sha: 'release' } }; };
  h.github.rest.git.updateRef = async args => { h.calls.push(['advance', args]); };
  return h;
}
const promotionEnv = { ...env, PR_NUMBER: '', PROMOTE: 'true', TESTED_TREE: 'tested-tree' };
test('direct promotion preserves the tested tree and creates exactly one squash parent on main', async () => {
  const h = promotionHarness(); await h.run(1, { ...context, runId: 42 }, promotionEnv);
  assert.deepEqual(h.calls.map(call => call[0]), ['temporary', 'integration', 'squash', 'advance', 'integration', 'delete']);
  assert.deepEqual(h.calls[2][1].parents, ['current-base']);
  assert.equal(h.calls[2][1].tree, 'tested-tree');
  assert.equal(h.calls[3][1].ref, 'heads/main');
  assert.equal(h.calls[3][1].force, false);
  assert.equal(h.calls[4][1].base, 'dev');
  assert.equal(h.calls[5][1].ref, 'heads/ci/integration-42');
});
test('a different integration tree blocks promotion and cleans up the temporary branch', async () => {
  const h = promotionHarness('untested-tree');
  await assert.rejects(h.run(1, { ...context, runId: 42 }, promotionEnv), /differs from the tested tree/);
  assert.deepEqual(h.calls.map(call => call[0]), ['temporary', 'integration', 'delete']);
});
test('concurrent main updates cannot be overwritten and still clean up the integration branch', async () => {
  const h = promotionHarness();
  h.github.rest.git.updateRef = async args => { assert.equal(args.force, false); throw new Error('Not a fast forward'); };
  await assert.rejects(h.run(1, { ...context, runId: 42 }, promotionEnv), /Not a fast forward/);
  assert.equal(h.calls.at(-1)[0], 'delete');
});
