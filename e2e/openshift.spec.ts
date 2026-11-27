import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createRoom } from './helpers.js';

/**
 * Checks of the demo deployment on OpenShift (spec 016). They run only
 * against a release that is already deployed, with `oc` and `helm` logged in:
 *
 *   KRITZEL_OPENSHIFT_NAMESPACE=<ns> pnpm exec playwright test e2e/openshift.spec.ts
 *
 * They restart the game once and stop the collector for a moment, so games
 * in progress on that demo end. Everything is put back at the end.
 */
const namespace = process.env.KRITZEL_OPENSHIFT_NAMESPACE ?? '';
const root = fileURLToPath(new URL('..', import.meta.url));

function oc(...args: string[]): string {
  return execFileSync('oc', [...args, '--namespace', namespace], {
    cwd: root,
    encoding: 'utf8',
    timeout: 300_000,
  }).trim();
}

const gamePod = () =>
  JSON.parse(
    oc('get', 'pods', '--selector', 'app.kubernetes.io/component=game', '--output', 'json'),
  ).items[0] as {
    metadata: { uid: string; name: string };
    status: { containerStatuses: { restartCount: number }[] };
  };
const gameUrl = () =>
  `https://${oc('get', 'route', 'kritzel', '--output', 'jsonpath={.spec.host}')}`;

/** Plays one game through the Route with the traffic generator. */
function playThroughRoute(): { status: number | null; output: string } {
  const game = spawnSync(
    'pnpm',
    [
      '--filter',
      '@kritzel/server',
      'exec',
      'tsx',
      'src/traffic/main.ts',
      '--url',
      gameUrl(),
      '--rooms',
      '1',
      '--players',
      '3',
      '--games',
      '1',
      '--pace',
      '150',
      '--seed',
      String(Date.now() % 100000),
    ],
    { cwd: root, encoding: 'utf8', timeout: 180_000 },
  );
  return { status: game.status, output: `${game.stdout}${game.stderr}` };
}

test.describe('OpenShift demo deployment', () => {
  test.skip(!namespace, 'needs KRITZEL_OPENSHIFT_NAMESPACE and a deployed release');
  test.describe.configure({ mode: 'serial', timeout: 600_000 });

  test('AC-016-21, AC-016-22, AC-016-23: pods, Routes, a game over wss and Grafana pass the deployment checks', () => {
    const verify = spawnSync('node', ['deploy/scripts/verify.mjs', '--namespace', namespace], {
      cwd: root,
      encoding: 'utf8',
      timeout: 540_000,
    });
    const output = `${verify.stdout}${verify.stderr}`;
    expect(output).not.toContain('FAIL');
    expect(verify.status, output).toBe(0);
    for (const check of [
      'every pod of the release is running and ready',
      'every pod runs under the restricted-v2 security context constraint',
      "every container runs with a user id from the namespace's range",
      'only the game and Grafana have a Route',
      'plain HTTP is redirected to HTTPS',
      'a complete game is played over wss:// through the Route',
      'a dropped connection resumes its seat during that game',
      'Grafana refuses anonymous access',
      'the five dashboards and the two Sloth dashboards are provisioned',
    ]) {
      expect(output, check).toContain(`ok    ${check}`);
    }
  });

  test('AC-016-25: deploying the same inputs again leaves the game running', () => {
    const before = gamePod();
    const image = oc(
      'get',
      'deployment',
      'kritzel',
      '--output',
      'jsonpath={.spec.template.spec.containers[0].image}',
    );
    const [repository, digest] = image.split('@') as [string, string];
    const revision = () =>
      Number(
        /REVISION: (\d+)/.exec(
          execFileSync('helm', ['status', 'kritzel', '--namespace', namespace], {
            encoding: 'utf8',
          }),
        )![1],
      );
    const revisionBefore = revision();

    const deploy = spawnSync('deploy/scripts/deploy.sh', [], {
      cwd: root,
      encoding: 'utf8',
      timeout: 540_000,
      env: {
        ...process.env,
        NAMESPACE: namespace,
        IMAGE_REPOSITORY: repository,
        IMAGE_DIGEST: digest,
        GRAFANA_ADMIN_PASSWORD: '',
      },
    });
    expect(deploy.status, `${deploy.stdout}${deploy.stderr}`).toBe(0);
    expect(revision()).toBe(revisionBefore + 1);

    const after = gamePod();
    expect(after.metadata.uid).toBe(before.metadata.uid);
    expect(after.status.containerStatuses[0]!.restartCount).toBe(
      before.status.containerStatuses[0]!.restartCount,
    );
  });

  test('AC-016-27: with the collector stopped a complete game is still played', () => {
    oc('scale', 'deployment/kritzel-collector', '--replicas=0');
    try {
      oc(
        'wait',
        '--for=delete',
        'pod',
        '--selector',
        'app.kubernetes.io/component=collector',
        '--timeout=120s',
      );
      const game = playThroughRoute();
      expect(game.output).toContain('"completed":true');
      expect(game.status, game.output).toBe(0);
    } finally {
      oc('scale', 'deployment/kritzel-collector', '--replicas=1');
      oc('rollout', 'status', 'deployment/kritzel-collector', '--timeout=180s');
    }
  });

  test('AC-016-26: a restart of the game tells a connected player that the server is restarting', async ({
    browser,
  }) => {
    // The helpers navigate relative to the base URL: it has to be the Route, not the local test server.
    const context = await browser.newContext({ baseURL: gameUrl(), locale: 'en-US' });
    const page = await context.newPage();
    const sockets: string[] = [];
    page.on('websocket', (socket) => sockets.push(socket.url()));
    await createRoom(page, 'Mara');
    await expect(page.getByTestId('lobby')).toBeVisible();
    expect(sockets).toEqual([`${gameUrl().replace('https://', 'wss://')}/ws`]);

    oc('rollout', 'restart', 'deployment/kritzel');
    // The player is told by the `server.shutdown` message, which arrives
    // before the connection closes; a connection that merely dropped would
    // show the reconnecting banner instead.
    const notice = page.getByTestId('room-failure');
    await expect(notice).toBeVisible({ timeout: 120_000 });
    await expect(notice).toContainText('The server is restarting');

    oc('rollout', 'status', 'deployment/kritzel', '--timeout=240s');
    await expect
      .poll(async () => (await page.request.get(`${gameUrl()}/healthz`)).status(), {
        timeout: 120_000,
      })
      .toBe(200);
    await context.close();
  });
});
