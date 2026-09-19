import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, readlinkSync, realpathSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { WorldStore } from '../src/store.js';

const script = resolve('deploy/a-view-release.sh');
const sqliteAvailable = spawnSync('sqlite3', ['--version']).status === 0;

// Exercise real archives, symlink changes and SQLite backups without touching the host.
// Only privileged service/ownership operations and the health outcome are simulated.
const harness = `
source "$RELEASE_SCRIPT"
APP_ROOT="$TEST_DIRECTORY/app"
DATA_DIR="$TEST_DIRECTORY/data"
BACKUP_DIR="$TEST_DIRECTORY/backups"
chown() { :; }
install() { shift 4; command install "$@"; }
runuser() { shift 3; "$@"; }
systemctl() { printf '%s\\n' "$*" >> "$TEST_DIRECTORY/services.log"; }
health() { [[ $(readlink "$APP_ROOT/current") != *bad* ]]; }
# BSD mv lacks -T; use the same atomic rename primitive for the macOS test host.
mv() {
    if [[ $1 == -Tf ]]; then
        "$TEST_NODE" --input-type=module -e 'import { renameSync } from "node:fs"; renameSync(process.argv[1], process.argv[2]);' "$2" "$3"
    else
        command mv "$@"
    fi
}
trap recover EXIT
`;

function fixture(t) {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'a-view-deploy-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  for (const path of ['app/releases', 'app/node/bin', 'data', 'backups', 'bundle/src', 'bundle/public']) {
    mkdirSync(join(directory, path), { recursive: true });
  }
  symlinkSync(process.execPath, join(directory, 'app/node/bin/node'));
  writeFileSync(join(directory, 'bundle/src/server.js'), 'console.log("release fixture");\n');
  writeFileSync(join(directory, 'bundle/public/index.html'), '<html>Release fixture</html>');
  writeFileSync(join(directory, 'bundle/package.json'), '{"type":"module"}');
  const archive = join(directory, 'release.tar.gz');
  const tar = spawnSync('tar', ['-czf', archive, '-C', join(directory, 'bundle'), '.']);
  assert.equal(tar.status, 0, tar.stderr?.toString());
  return {
    directory,
    run(command) {
      return spawnSync('bash', ['-c', harness + command], {
        encoding: 'utf8',
        env: { ...process.env, RELEASE_SCRIPT: script, TEST_DIRECTORY: directory, TEST_NODE: process.execPath, TEST_ARCHIVE: archive },
      });
    },
    current() { return readlinkSync(join(directory, 'app/current')); },
  };
}

test('release activation and rollback preserve the live world and back up committed WAL data', { skip: !sqliteAvailable && 'sqlite3 CLI is required' }, t => {
  const f = fixture(t);
  const store = new WorldStore(join(f.directory, 'data/world.sqlite'), 1_800_000_000_000);
  t.after(() => store.close());
  const state = store.snapshot(1_800_000_028_000).world;
  assert.ok(existsSync(join(f.directory, 'data/world.sqlite-wal')));
  for (const id of ['first', 'second']) {
    const result = f.run(`deploy "$TEST_ARCHIVE" ${id}`);
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.equal(f.current(), join(f.directory, 'app/releases', id));
  }
  const result = f.run('activate "$(readlink "$APP_ROOT/previous")"');
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.equal(f.current(), join(f.directory, 'app/releases/first'));
  assert.deepEqual(store.snapshot(1_800_000_028_000).world, state);
  const backups = readdirSync(join(f.directory, 'backups'));
  assert.equal(backups.length, 3);
  for (const filename of backups) {
    const db = new DatabaseSync(join(f.directory, 'backups', filename), { readOnly: true });
    assert.deepEqual(JSON.parse(db.prepare('SELECT state FROM world').get().state), state);
    assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok');
    db.close();
  }
});

test('failed health check restores and restarts the previous release', t => {
  const f = fixture(t);
  assert.equal(f.run('deploy "$TEST_ARCHIVE" first').status, 0);
  const result = f.run('deploy "$TEST_ARCHIVE" bad-release');
  assert.notEqual(result.status, 0);
  assert.equal(f.current(), join(f.directory, 'app/releases/first'));
  assert.match(result.stderr, /Previous release restored and healthy/);
  assert.equal(readFileSync(join(f.directory, 'services.log'), 'utf8').match(/restart a-view/g).length, 3);
});

test('failed first deployment stops the service and removes the failed active link', t => {
  const f = fixture(t);
  const result = f.run('deploy "$TEST_ARCHIVE" bad-release');
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(join(f.directory, 'app/current')), false);
  assert.match(readFileSync(join(f.directory, 'services.log'), 'utf8'), /stop a-view/);
});

test('backup failure prevents activation of a new release', t => {
  const f = fixture(t);
  assert.equal(f.run('deploy "$TEST_ARCHIVE" first').status, 0);
  const result = f.run('backup() { return 1; }; deploy "$TEST_ARCHIVE" second');
  assert.notEqual(result.status, 0);
  assert.equal(f.current(), join(f.directory, 'app/releases/first'));
});

test('deployment arguments reject shell syntax before making an SSH connection', () => {
  for (const [command, target] of [['deploy', 'user@host;touch /tmp/unwanted'], ['unknown', 'host']]) {
    const result = spawnSync('bash', ['scripts/deploy.sh', command, target], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
  }
});
