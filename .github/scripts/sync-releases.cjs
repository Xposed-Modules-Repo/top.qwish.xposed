'use strict';

function parseRepositoryUrl(value) {
    const error = () => new Error('Set RELEASE_REPOSITORY_URL to https://github.com/OWNER/REPO in the release environment variables');
    let url;
    try {
        url = new URL(typeof value === 'string' ? value.trim() : '');
    } catch {
        throw error();
    }
    const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/.exec(url.pathname);
    if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port ||
        url.username || url.password || url.search || url.hash || !match) {
        throw error();
    }
    const repo = match[2].replace(/\.git$/, '');
    if (!repo || repo === '.' || repo === '..') throw error();
    return {owner: match[1], repo};
}

function versionCode(value, label) {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} must be a non-negative safe integer`);
    }
    return value;
}

module.exports = async function syncReleases({
                                                 github,
                                                 core,
                                                 repositoryUrl,
                                                 baseUrl = 'https://service.qwish.top',
                                                 fetchImpl = fetch,
                                             }) {
    const repo = parseRepositoryUrl(repositoryUrl);
    const {data: targetRepository} = await github.rest.repos.get(repo);
    if (!targetRepository.default_branch) throw new Error('Target repository has no default branch');
    core.info(`Target repository: ${repo.owner}/${repo.repo}; default branch: ${targetRepository.default_branch}`);
    const releases = await github.paginate(github.rest.repos.listReleases, {
        ...repo,
        per_page: 100,
    });
    let current = 0;
    for (const release of releases) {
        if (release.draft) continue;
        const match = /^(\d+)-(.+)$/.exec(release.tag_name);
        if (!match) {
            core.warning(`Ignoring release with an unrecognized tag: ${release.tag_name}`);
            continue;
        }
        current = Math.max(current, versionCode(Number(match[1]), 'Release versionCode'));
    }

    async function remote(path, version, timeout = 30_000) {
        const url = new URL(`${baseUrl.replace(/\/$/, '')}/update/${path}`);
        url.searchParams.set('version', String(version));
        const response = await fetchImpl(url, {
            signal: AbortSignal.timeout(timeout),
            headers: {'User-Agent': 'qwish-release-sync'},
        });
        if (!response.ok) {
            throw new Error(`${path}: HTTP ${response.status}`);
        }
        return response;
    }

    async function remoteJson(path, version) {
        const response = await remote(path, version);
        const body = await response.json();
        if (body.code !== 200 || body.data == null) {
            throw new Error(`${path}: API error ${body.code}: ${body.msg}`);
        }
        return body.data;
    }

    const state = await remoteJson('hasUpdate', current);
    const latest = versionCode(state.version, 'Remote latest versionCode');
    core.info(`Published versionCode: ${current}; remote latest: ${latest}`);
    if (latest <= current) {
        core.info('No newer version to publish.');
        return;
    }
    const records = await remoteJson('getUpdateLog', current || latest - 1);
    if (!Array.isArray(records)) throw new Error('getUpdateLog must return an array');
    const pending = [];
    const seen = new Set();
    for (const record of records) {
        const code = versionCode(record.versionCode, 'Update versionCode');
        if (code <= current || code > latest || (!current && code !== latest)) continue;
        if (seen.has(code)) throw new Error(`Duplicate remote versionCode: ${code}`);
        seen.add(code);
        if (typeof record.versionName !== 'string' || !record.versionName.trim() ||
            typeof record.updateLog !== 'string' ||
            typeof record.fileName !== 'string' || !record.fileName.trim() ||
            /[/\\\x00-\x1f\x7f]/.test(record.fileName) ||
            !record.fileName.toLowerCase().endsWith('.apk')) {
            throw new Error(`Invalid update metadata for versionCode ${code}`);
        }
        pending.push(record);
    }
    if (!seen.has(latest)) throw new Error(`Missing metadata for latest versionCode ${latest}`);
    pending.sort((a, b) => a.versionCode - b.versionCode);

    for (const update of pending) {
        const tag = `${update.versionCode}-${update.versionName}`;
        core.info(`Syncing ${tag}`);
        const response = await remote('download', update.versionCode, 300_000);
        const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (type !== 'application/octet-stream') {
            throw new Error(`APK ${tag}: expected application/octet-stream, received ${type}`);
        }
        const apk = Buffer.from(await response.arrayBuffer());
        if (apk.length < 4 || !apk.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) {
            throw new Error(`APK ${tag}: empty or invalid ZIP/APK data`);
        }
        const length = response.headers.get('content-length');
        if (length !== null && Number(length) !== apk.length) {
            throw new Error(`APK ${tag}: incomplete download`);
        }

        let draft = releases.find(release => release.tag_name === tag && release.draft);
        if (!draft) {
            ({data: draft} = await github.rest.repos.createRelease({
                ...repo,
                tag_name: tag,
                target_commitish: targetRepository.default_branch,
                name: `v${update.versionName}`,
                body: update.updateLog,
                draft: true,
                prerelease: false,
            }));
        }
        const assets = await github.paginate(github.rest.repos.listReleaseAssets, {
            ...repo,
            release_id: draft.id,
            per_page: 100,
        });
        for (const asset of assets) {
            if (asset.name === update.fileName || asset.label === update.fileName) {
                await github.rest.repos.deleteReleaseAsset({...repo, asset_id: asset.id});
            }
        }
        const {data: asset} = await github.rest.repos.uploadReleaseAsset({
            ...repo,
            release_id: draft.id,
            name: update.fileName,
            label: update.fileName,
            data: apk,
            headers: {
                'content-type': 'application/vnd.android.package-archive',
                'content-length': apk.length,
            },
            request: {timeout: 300_000},
        });
        if (asset.state !== 'uploaded' || asset.size !== apk.length) {
            throw new Error(`APK ${tag}: GitHub upload is incomplete`);
        }
        await github.rest.repos.updateRelease({
            ...repo,
            release_id: draft.id,
            name: `v${update.versionName}`,
            body: update.updateLog,
            draft: false,
            prerelease: false,
            make_latest: 'true',
        });
        core.info(`Published ${tag}`);
    }
};

module.exports.parseRepositoryUrl = parseRepositoryUrl;
