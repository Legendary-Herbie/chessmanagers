// Offline checks for deployment structure and backup failure recovery. No Docker/network required.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const root = path.resolve(import.meta.dirname, '..');
const bash = process.env.BASH_BINARY || (process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash');
const config = yaml.load(readFileSync(path.join(root, 'compose.yaml'), 'utf8'));
assert.equal(config.services.db.ports, undefined);
assert.equal(config.services.app.ports, undefined);
assert.equal(config.services.app.depends_on.db.condition, 'service_healthy');
assert.equal(config.services.proxy.depends_on.app.condition, 'service_healthy');
assert.ok(config.services.app.volumes.includes('uploads:/app/server/uploads'));
assert.ok(config.services.db.volumes.includes('postgres_data:/var/lib/postgresql/data'));
assert.ok(config.services.app.environment.DATABASE_URL.endsWith('?sslmode=disable'));
for (const name of ['compose.sh', 'preflight.sh', 'backup.sh', 'restore-drill.sh']) {
    const result = spawnSync(bash, ['-n', path.join(root, 'deploy', name)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
}

const temporary = mkdtempSync(path.join(tmpdir(), 'onechessclub-deploy-'));
try {
    for (const scenario of ['success', 'capture-fails', 'remote-fails', 'upload-fails']) {
        const dir = path.join(temporary, scenario);
        mkdirSync(path.join(dir, 'bin'), { recursive: true });
        mkdirSync(path.join(dir, 'fixtures'));
        cpSync(path.join(root, 'deploy'), path.join(dir, 'deploy'), { recursive: true });
        writeFileSync(path.join(dir, 'fixtures', 'image.txt'), 'test upload');
        writeFileSync(path.join(dir, '.env.backup'), "RESTIC_REPOSITORY='s3:https://storage.invalid/test'\nRESTIC_PASSWORD='test-only-encryption-password'\n");
        const command = (name, script) => writeFileSync(path.join(dir, 'bin', name), `#!/usr/bin/env bash\nset -eu\necho '${name}' \"$*\" >> \"$TEST_ROOT/calls\"\n${script}\n`, { mode: 0o755 });
        command('docker', `case "$*" in
            *'ps --status running'*) echo app-id ;;
            *'ps -a'*) echo app-id ;;
            'inspect '*) echo sha256:test-image ;;
            *'pg_dump '*) [[ "$TEST_SCENARIO" != capture-fails ]]; echo test-dump ;;
            *'pg_restore --list'*) cat >/dev/null ;;
            *'--entrypoint tar app'*) tar -C "$TEST_ROOT/fixtures" -czf - . ;;
            esac`);
        command('restic', `case "$1" in
            snapshots) [[ "$TEST_SCENARIO" != remote-fails ]] ;;
            backup) [[ "$TEST_SCENARIO" != upload-fails ]] ;;
            esac`);
        command('flock', 'exit 0');
        command('curl', 'exit 0');
        const result = spawnSync(bash, ['-c', 'export PATH="$TEST_ROOT/bin:$PATH"; bash "$TEST_ROOT/deploy/backup.sh"'], {
            env: { ...process.env, TEST_ROOT: dir.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`), TEST_SCENARIO: scenario }, encoding: 'utf8',
        });
        assert.ok(existsSync(path.join(dir, 'calls')), result.stderr || result.error?.message);
        const calls = readFileSync(path.join(dir, 'calls'), 'utf8');
        assert.equal(result.status === 0, scenario === 'success', `${scenario}: ${result.stderr}`);
        if (scenario === 'remote-fails') assert.ok(!calls.includes('stop app'));
        else assert.ok(calls.includes('start app'), `${scenario}: app was not restarted`);
        if (scenario === 'success') {
            assert.ok(calls.indexOf('start app') < calls.indexOf('restic backup'));
            assert.ok(calls.includes('--keep-daily 30 --keep-monthly 12'));
            assert.equal(readdirSync(path.join(dir, 'backups')).filter(name => name.startsWith('capture.')).length, 0);
        }
        if (scenario === 'capture-fails') assert.ok(!calls.includes('restic backup'));
        if (scenario === 'upload-fails') assert.ok(!calls.includes('restic forget'));
        assert.ok(existsSync(path.join(dir, 'deploy', 'restore-drill.sh')));
        const refusal = spawnSync(bash, [path.join(dir, 'deploy', 'restore-drill.sh'), dir, 'onechessclub'], { encoding: 'utf8' });
        assert.notEqual(refusal.status, 0);
        assert.match(refusal.stderr, /Use onechessclub-restore/);
        writeFileSync(path.join(dir, 'fixtures', 'database.dump'), 'trusted test dump');
        writeFileSync(path.join(dir, 'fixtures', 'uploads.tar.gz'), 'not extracted because target exists');
        const existing = spawnSync(bash, ['-c', 'export PATH="$TEST_ROOT/bin:$PATH"; bash "$TEST_ROOT/deploy/restore-drill.sh" "$TEST_ROOT/fixtures"'], {
            env: { ...process.env, TEST_ROOT: dir.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) }, encoding: 'utf8',
        });
        assert.notEqual(existing.status, 0);
        assert.match(existing.stderr, /Refusing to overwrite existing restore volume/);
        console.log(`PASS: ${scenario}`);
    }
    console.log('PASS: Compose structure, shell syntax, isolated restore guard');
} finally {
    rmSync(temporary, { recursive: true, force: true });
}
