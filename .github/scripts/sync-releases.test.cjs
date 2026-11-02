'use strict';

const assert = require('node:assert/strict');
const {test} = require('node:test');
const syncReleases = require('./sync-releases.cjs');

const apk = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
const context = {
    repo: {owner: 'test', repo: 'qwish'},
    payload: {repository: {default_branch: 'main'}},
};
const update = code => ({
    versionCode: code,
    versionName: `3.0.${code - 300}`,
    updateLog: `版本 ${code}\n- 修复问题\n\`code\` $() {{ untouched }}`,
    fileName: `QWish_${code}.apk`,
});
const release = (code, extra = {}) => ({
    id: code,
    tag_name: `${code}-${update(code).versionName}`,
    draft: false,
    ...extra,
});

function fixture({releases = [], records = [update(303)], latest = 303} = {}) {
    const state = {
        releases: structuredClone(releases),
        assets: [],
        calls: [],
        requests: [],
        published: [],
        warnings: [],
        failUpload: false,
        failPublish: false,
        download: () => new Response(apk, {
            headers: {'content-type': 'application/octet-stream', 'content-length': String(apk.length)},
        }),
    };
    const repos = {
        listReleases() {
        },
        listReleaseAssets() {
        },
        async createRelease(args) {
            state.calls.push(['create', args]);
            const draft = {...args, id: state.releases.length + 1000};
            state.releases.push(draft);
            return {data: draft};
        },
        async deleteReleaseAsset(args) {
            state.calls.push(['delete', args]);
            state.assets = state.assets.filter(item => item.id !== args.asset_id);
        },
        async uploadReleaseAsset(args) {
            state.calls.push(['upload', args]);
            const asset = {
                id: state.calls.length,
                release_id: args.release_id,
                name: args.name,
                label: args.label,
                state: 'uploaded',
                size: args.data.length,
            };
            // Simulate a successful server write followed by a lost response.
            state.assets.push(asset);
            if (state.failUpload) throw new Error('Upload response lost');
            return {data: asset};
        },
        async updateRelease(args) {
            state.calls.push(['publish', args]);
            if (state.failPublish) throw new Error('Publish failed');
            const draft = state.releases.find(item => item.id === args.release_id);
            Object.assign(draft, args);
            state.published.push(draft.tag_name);
            return {data: draft};
        },
    };
    const github = {
        rest: {repos},
        async paginate(method, args) {
            assert.equal(args.per_page, 100);
            assert.equal(args.owner, context.repo.owner);
            assert.equal(args.repo, context.repo.repo);
            if (method === repos.listReleases) return state.releases;
            assert.equal(method, repos.listReleaseAssets);
            return state.assets.filter(item => item.release_id === args.release_id);
        },
    };
    const run = () => syncReleases({
        github,
        context,
        core: {
            info() {
            }, warning(message) {
                state.warnings.push(message);
            }
        },
        async fetchImpl(url, options) {
            assert.ok(options.signal instanceof AbortSignal);
            const path = url.pathname.split('/').pop();
            const version = Number(url.searchParams.get('version'));
            state.requests.push([path, version]);
            if (path === 'download') return state.download(version);
            return new Response(JSON.stringify({
                code: 200,
                data: path === 'hasUpdate' ? {version: latest, hasUpdate: latest > version} : records,
            }), {headers: {'content-type': 'application/json'}});
        },
    });
    return {state, run};
}

test('uses maximum published versionCode and publishes all newer versions in order', async () => {
    const {state, run} = fixture({
        releases: [release(301), release(302), release(999, {draft: true})],
        records: [update(305), update(303), update(304), update(301)],
        latest: 305,
    });
    await run();
    assert.deepEqual(state.published, ['303-3.0.3', '304-3.0.4', '305-3.0.5']);
    assert.deepEqual(state.requests, [
        ['hasUpdate', 302], ['getUpdateLog', 302],
        ['download', 303], ['download', 304], ['download', 305],
    ]);
    assert.deepEqual(state.calls.map(([name]) => name), [
        'create', 'upload', 'publish', 'create', 'upload', 'publish', 'create', 'upload', 'publish',
    ]);
    const draft = state.calls[0][1];
    assert.equal(draft.draft, true);
    assert.equal(draft.name, 'v3.0.3');
    assert.equal(draft.body, update(303).updateLog);
    assert.equal(draft.target_commitish, 'main');
    const upload = state.calls[1][1];
    assert.equal(upload.name, update(303).fileName);
    assert.deepEqual(upload.data, apk);
    assert.equal(state.calls[2][1].make_latest, 'true');
});

test('empty repository publishes only latest, ignoring draft baseline', async () => {
    const {state, run} = fixture({
        releases: [release(302, {draft: true})],
        records: [update(303), update(302), update(301)],
    });
    await run();
    assert.deepEqual(state.published, ['303-3.0.3']);
    assert.deepEqual(state.requests.slice(0, 2), [['hasUpdate', 0], ['getUpdateLog', 302]]);
});

test('same version, newer local version, or empty remote are no-ops', async () => {
    for (const [local, latest] of [[303, 303], [304, 303], [0, 0]]) {
        const {state, run} = fixture({releases: local ? [release(local)] : [], latest});
        await run();
        assert.deepEqual(state.requests, [['hasUpdate', local]]);
        assert.deepEqual(state.calls, []);
    }
});

test('compares versionCode numerically, not tag or publication order', async () => {
    const {state, run} = fixture({
        releases: [release(100), release(99)],
        records: [update(101)], latest: 101,
    });
    await run();
    assert.equal(state.requests[0][1], 100);
    assert.equal(state.published.length, 1);
});

test('upload failure stops the batch; next run resumes draft without duplicates', async () => {
    const {state, run} = fixture({
        releases: [release(302)],
        records: [update(304), update(303)], latest: 304,
    });
    state.failUpload = true;
    await assert.rejects(run, /Upload response lost/);
    assert.deepEqual(state.published, []);
    assert.deepEqual(state.requests.filter(([path]) => path === 'download'), [['download', 303]]);
    assert.equal(state.releases.at(-1).draft, true);
    state.failUpload = false;
    await run();
    assert.deepEqual(state.published, ['303-3.0.3', '304-3.0.4']);
    assert.equal(state.calls.filter(([name]) => name === 'create').length, 2);
    assert.equal(state.calls.filter(([name]) => name === 'delete').length, 1);
    assert.equal(state.assets.length, 2);
    const callCount = state.calls.length;
    await run();
    assert.equal(state.calls.length, callCount);
});

test('failure to publish reuses the draft and preserves unrelated attachments', async () => {
    const {state, run} = fixture({releases: [release(302)]});
    state.failPublish = true;
    await assert.rejects(run, /Publish failed/);
    const draft = state.releases.at(-1);
    // GitHub may normalize the uploaded filename. The original label still matches.
    state.assets[0].name = 'normalized.apk';
    state.assets.push({id: 999, release_id: draft.id, name: 'other.txt'});
    state.failPublish = false;
    await run();
    assert.deepEqual(state.published, ['303-3.0.3']);
    assert.equal(state.calls.filter(([name]) => name === 'create').length, 1);
    assert.ok(state.assets.some(asset => asset.id === 999));
    assert.equal(state.assets.length, 2);
});

test('does not use the maximum log entry in place of the server latest ID', async () => {
    const {state, run} = fixture({
        releases: [release(302)], records: [update(304), update(303)], latest: 303,
    });
    await run();
    assert.deepEqual(state.published, ['303-3.0.3']);
});

test('missing latest metadata, duplicate versions, or bad metadata fail before publishing', async () => {
    for (const records of [
        [update(302)],
        [update(303), update(303)],
        [{...update(303), fileName: '../file.apk'}],
        [{...update(303), updateLog: null}],
        [{...update(303), versionCode: '303'}],
    ]) {
        const {state, run} = fixture({releases: [release(302)], records});
        await assert.rejects(run);
        assert.deepEqual(state.calls, []);
    }
});

test('HTTP 200 plain-text download errors and invalid or partial APKs never create releases', async () => {
    for (const response of [
        new Response('There is no such version', {headers: {'content-type': 'text/plain'}}),
        new Response('<html>error</html>', {headers: {'content-type': 'application/octet-stream'}}),
        new Response(apk, {headers: {'content-type': 'application/octet-stream', 'content-length': '99'}}),
        new Response(null, {status: 503}),
    ]) {
        const {state, run} = fixture({releases: [release(302)]});
        state.download = () => response;
        await assert.rejects(run);
        assert.deepEqual(state.calls, []);
    }
});

test('business errors, HTTP errors and malformed JSON fail instead of looking up to date', async () => {
    for (const response of [
        new Response(JSON.stringify({code: 500, msg: 'backend error', data: {}})),
        new Response(null, {status: 503}),
        new Response('<html>unavailable</html>'),
    ]) {
        await assert.rejects(() => syncReleases({
            github: {
                rest: {
                    repos: {
                        listReleases() {
                        }
                    }
                }, paginate: async () => []
            },
            context,
            core: {
                info() {
                }
            },
            fetchImpl: async () => response,
        }));
    }
});

test('unrecognized release tags are warned about; matching published prereleases count', async () => {
    const {state, run} = fixture({
        releases: [release(301), release(302, {prerelease: true}), {tag_name: 'v9', draft: false}],
    });
    await run();
    assert.equal(state.warnings.length, 1);
    assert.equal(state.requests[0][1], 302);
    assert.deepEqual(state.published, ['303-3.0.3']);
});
