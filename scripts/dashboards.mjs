#!/usr/bin/env node
// Generates the five Grafana dashboards of spec 015 from one description, so
// they share variables, units, no-data behaviour and layout rules.
//
// Usage: node scripts/dashboards.mjs [--check]
//
// Writes deploy/helm/kritzel/files/grafana/dashboards/kritzel-*.json. With
// --check nothing is written and the exit code is 1 when a file is out of
// date. Every metric queried here is in the telemetry contract
// (apps/server/src/telemetry/contract.ts), produced by a provisioned rule, or
// one of the stack's own metrics kept by the collector; a test enforces it.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(
  new URL('../deploy/helm/kritzel/files/grafana/dashboards/', import.meta.url),
);
const check = process.argv.includes('--check');

const PROM = { type: 'prometheus', uid: 'prometheus' };
const LOKI = { type: 'loki', uid: 'loki' };
const TEMPO = { type: 'tempo', uid: 'tempo' };
/** Label selector shared by every application query. */
const S = 'service_name=~"$service", deployment_environment_name=~"$env"';
const RATE = '$__rate_interval';

// ── panel builders ───────────────────────────────────────────────────────

/** Lays panels out left to right on Grafana's 24-column grid. */
class Layout {
  constructor() {
    this.panels = [];
    this.x = 0;
    this.y = 0;
    this.rowHeight = 0;
    this.id = 1;
  }
  add(panel, w, h) {
    if (this.x + w > 24) this.newline();
    this.panels.push({ ...panel, id: this.id++, gridPos: { x: this.x, y: this.y, w, h } });
    this.x += w;
    this.rowHeight = Math.max(this.rowHeight, h);
    return this;
  }
  newline() {
    this.y += this.rowHeight;
    this.x = 0;
    this.rowHeight = 0;
  }
  row(title) {
    this.newline();
    this.panels.push({
      id: this.id++,
      type: 'row',
      title,
      collapsed: false,
      gridPos: { x: 0, y: this.y, w: 24, h: 1 },
      panels: [],
    });
    this.y += 1;
    return this;
  }
}

const target = (expr, legend, extra = {}) => ({
  datasource: PROM,
  expr,
  legendFormat: legend ?? '__auto',
  range: true,
  editorMode: 'code',
  ...extra,
});

const thresholds = (steps) => ({
  mode: 'absolute',
  steps: steps.map(([value, color]) => ({ value, color })),
});
const NEUTRAL = thresholds([[null, 'text']]);

/** A single number. Counts fall back to 0; gauges show "no data" when telemetry is missing. */
function stat(
  title,
  expr,
  { unit = 'short', description, steps, decimals, noValue = 'no data' } = {},
) {
  return {
    type: 'stat',
    title,
    description,
    datasource: PROM,
    targets: [target(expr, undefined, { instant: true, range: false })],
    fieldConfig: {
      defaults: {
        unit,
        decimals,
        noValue,
        color: { mode: 'thresholds' },
        thresholds: steps ? thresholds(steps) : NEUTRAL,
      },
      overrides: [],
    },
    options: {
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
      colorMode: steps ? 'value' : 'none',
      graphMode: 'none',
      justifyMode: 'auto',
      textMode: 'auto',
    },
  };
}

function timeseries(title, targets, { unit = 'short', description, stack = false, min, max } = {}) {
  return {
    type: 'timeseries',
    title,
    description,
    datasource: PROM,
    targets,
    fieldConfig: {
      defaults: {
        unit,
        min,
        max,
        noValue: 'no data',
        color: { mode: 'palette-classic' },
        custom: {
          drawStyle: 'line',
          lineWidth: 1,
          fillOpacity: stack ? 30 : 8,
          showPoints: 'never',
          spanNulls: false,
          stacking: { mode: stack ? 'normal' : 'none', group: 'A' },
        },
      },
      overrides: [],
    },
    options: {
      legend: { displayMode: 'list', placement: 'bottom', showLegend: true },
      tooltip: { mode: 'multi', sort: 'desc' },
    },
  };
}

function bars(title, expr, legend, { unit = 'short', description } = {}) {
  return {
    type: 'bargauge',
    title,
    description,
    datasource: PROM,
    targets: [target(expr, legend, { instant: true, range: false })],
    fieldConfig: {
      defaults: {
        unit,
        min: 0,
        noValue: 'no data',
        color: { mode: 'palette-classic' },
        thresholds: NEUTRAL,
      },
      overrides: [],
    },
    options: {
      orientation: 'horizontal',
      displayMode: 'basic',
      valueMode: 'color',
      showUnfilled: true,
      reduceOptions: { calcs: ['lastNotNull'], fields: '', values: false },
    },
  };
}

function logs(title, expr, description) {
  return {
    type: 'logs',
    title,
    description,
    datasource: LOKI,
    targets: [{ datasource: LOKI, expr, queryType: 'range', editorMode: 'code', maxLines: 200 }],
    options: {
      showTime: true,
      wrapLogMessage: true,
      enableLogDetails: true,
      sortOrder: 'Descending',
      dedupStrategy: 'none',
    },
  };
}

function traces(title, query, description) {
  return {
    type: 'table',
    title,
    description,
    datasource: TEMPO,
    targets: [{ datasource: TEMPO, queryType: 'traceql', query, limit: 20, tableType: 'traces' }],
    fieldConfig: { defaults: { noValue: 'no traces' }, overrides: [] },
    options: { showHeader: true, cellHeight: 'sm' },
  };
}

function text(content) {
  return {
    type: 'text',
    title: '',
    options: { mode: 'markdown', content },
    transparent: true,
  };
}

const quantile = (q, metric, by = '', selector = S, window = RATE) =>
  `histogram_quantile(${q}, sum by (le${by ? `, ${by}` : ''}) (rate(${metric}_bucket{${selector}}[${window}])))`;
const increase = (metric, selector = S, by = '') =>
  `sum${by ? ` by (${by})` : ''} (increase(${metric}{${selector}}[$__range]))`;
const rate = (metric, selector = S, by = '') =>
  `sum${by ? ` by (${by})` : ''} (rate(${metric}{${selector}}[${RATE}]))`;
const orZero = (expr) => `(${expr}) or vector(0)`;

// ── dashboard frame ──────────────────────────────────────────────────────

const variable = (name, label, labelName) => ({
  name,
  label,
  type: 'query',
  datasource: PROM,
  query: { query: `label_values(kritzel_rooms_active, ${labelName})`, refId: 'A' },
  definition: `label_values(kritzel_rooms_active, ${labelName})`,
  refresh: 2,
  sort: 1,
  multi: true,
  includeAll: true,
  allValue: '.*',
  current: { selected: true, text: 'All', value: '$__all' },
});

function dashboard(uid, title, description, layout) {
  return {
    uid,
    title,
    description,
    tags: ['kritzel'],
    editable: false,
    graphTooltip: 1,
    schemaVersion: 39,
    version: 1,
    refresh: '30s',
    time: { from: 'now-1h', to: 'now' },
    timezone: 'browser',
    annotations: { list: [] },
    links: [
      {
        type: 'dashboards',
        title: 'Kritzel dashboards',
        tags: ['kritzel'],
        asDropdown: true,
        includeVars: true,
        keepTime: true,
      },
      {
        type: 'dashboards',
        title: 'Service level objectives',
        tags: ['slo'],
        asDropdown: true,
        keepTime: true,
      },
    ],
    templating: {
      list: [
        variable('env', 'Environment', 'deployment_environment_name'),
        variable('service', 'Service', 'service_name'),
      ],
    },
    panels: layout.panels,
  };
}

// ── shared expressions ───────────────────────────────────────────────────

const VALID_JOINS = `${S}, kritzel_validity="valid"`;
const joinSuccess = `sum(increase(kritzel_join_attempts_total{${VALID_JOINS}, kritzel_outcome!="rejected"}[$__range])) / sum(increase(kritzel_join_attempts_total{${VALID_JOINS}}[$__range]))`;
const API = `${S}, http_route=~"/api/.*"`;
const apiAvailability = `1 - (${orZero(`sum(increase(http_server_request_duration_seconds_count{${API}, http_response_status_code=~"5.."}[$__range]))`)}) / sum(increase(http_server_request_duration_seconds_count{${API}}[$__range]))`;
const rejectedShare = `sum(rate(kritzel_ws_messages_total{${S}, kritzel_outcome="rejected"}[${RATE}])) / sum(rate(kritzel_ws_messages_total{${S}}[${RATE}]))`;
const burnRate =
  'slo:sli_error:ratio_rate1h{sloth_service="kritzel"} / on (sloth_id, sloth_service, sloth_slo) group_left slo:error_budget:ratio{sloth_service="kritzel"}';
const GOOD = [
  [null, 'red'],
  [0.99, 'yellow'],
  [0.999, 'green'],
];

// ── 1. Global Overview ───────────────────────────────────────────────────

function overview() {
  const l = new Layout();
  l.add(
    stat('Rooms', `sum(kritzel_rooms_active{${S}})`, {
      description: 'Live rooms in this instance.',
    }),
    3,
    4,
  )
    .add(
      stat('Players', `sum(kritzel_players_connected{${S}})`, {
        description: 'Players with an open connection.',
      }),
      3,
      4,
    )
    .add(stat('Spectators', `sum(kritzel_spectators_connected{${S}})`), 3, 4)
    .add(
      stat('Connections', `sum(kritzel_ws_connections_active{${S}})`, {
        description: 'Open WebSocket connections, joined or not.',
      }),
      3,
      4,
    )
    .add(
      stat('Games started', orZero(increase('kritzel_games_started_total')), {
        description: 'In the selected time range.',
        decimals: 0,
      }),
      4,
      4,
    )
    .add(
      stat('Valid joins succeeding', joinSuccess, {
        unit: 'percentunit',
        decimals: 2,
        steps: GOOD,
        noValue: 'no joins',
        description:
          "Joins that were not the player's or host's mistake and succeeded. Objective: 99.9 %.",
      }),
      4,
      4,
    )
    .add(
      stat('API availability', apiAvailability, {
        unit: 'percentunit',
        decimals: 2,
        steps: GOOD,
        noValue: 'no requests',
        description: 'Share of /api requests answered without a server error. Objective: 99.9 %.',
      }),
      4,
      4,
    );

  l.row('Requests, errors, duration');
  l.add(
    timeseries(
      'HTTP requests by route',
      [
        target(
          rate('http_server_request_duration_seconds_count', S, 'http_route'),
          '{{http_route}}',
        ),
      ],
      { unit: 'reqps', description: 'Route templates only; paths are never recorded.' },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'HTTP server errors by route',
        [
          target(
            orZero(
              rate(
                'http_server_request_duration_seconds_count',
                `${S}, http_response_status_code=~"5.."`,
                'http_route',
              ),
            ),
            '{{http_route}}',
          ),
        ],
        { unit: 'reqps', description: 'A full server answers room creation with 503.' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'HTTP duration, 95th percentile',
        [
          target(
            quantile(0.95, 'http_server_request_duration_seconds', 'http_route'),
            '{{http_route}}',
          ),
        ],
        { unit: 's' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'WebSocket messages by type',
        [
          target(
            rate('kritzel_ws_messages_total', S, 'kritzel_ws_message_type'),
            '{{kritzel_ws_message_type}}',
          ),
        ],
        { unit: 'ops', stack: true },
      ),
      8,
      8,
    )
    .add(
      timeseries('Rejected share of WebSocket messages', [target(rejectedShare, 'rejected')], {
        unit: 'percentunit',
        min: 0,
        description: 'Includes ordinary refusals such as a guesser trying to draw.',
      }),
      8,
      8,
    )
    .add(
      timeseries(
        'Operation duration, 95th percentile (click a dot for its trace)',
        [
          target(
            quantile(
              0.95,
              'kritzel_span_duration_seconds',
              'span_name',
              `${S}, span_kind="SPAN_KIND_SERVER"`,
            ),
            '{{span_name}}',
            { exemplar: true },
          ),
        ],
        {
          unit: 's',
          description:
            'Derived from spans by the collector. Each dot is an exemplar: one real request and its trace.',
        },
      ),
      8,
      8,
    );

  l.row('Game activity');
  l.add(
    timeseries(
      'Games per minute',
      [
        target(`60 * ${rate('kritzel_games_started_total')}`, 'started'),
        target(orZero(`60 * ${rate('kritzel_games_completed_total')}`), 'completed'),
        target(orZero(`60 * ${rate('kritzel_games_aborted_total')}`), 'aborted'),
      ],
      { description: 'Counted once per game, when the room state changes.' },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'Joins by outcome',
        [target(rate('kritzel_join_attempts_total', S, 'kritzel_outcome'), '{{kritzel_outcome}}')],
        { unit: 'ops', stack: true },
      ),
      8,
      8,
    )
    .add(
      timeseries('Rooms and players', [
        target(`sum(kritzel_rooms_active{${S}})`, 'rooms'),
        target(`sum(kritzel_players_connected{${S}})`, 'players'),
        target(`sum(kritzel_spectators_connected{${S}})`, 'spectators'),
      ]),
      8,
      8,
    );

  l.row('Objectives and logs');
  l.add(
    {
      ...bars('Error budget burn rate, 1 h window', burnRate, '{{sloth_slo}}', {
        description:
          'How fast each objective spends its error budget. 1 means exactly on budget; 14.4 sustained for an hour pages. Open the Service level objectives dashboards for detail.',
      }),
      fieldConfig: {
        defaults: {
          min: 0,
          max: 15,
          decimals: 2,
          noValue: 'no traffic',
          color: { mode: 'thresholds' },
          thresholds: thresholds([
            [null, 'green'],
            [1, 'yellow'],
            [14.4, 'red'],
          ]),
        },
        overrides: [],
      },
    },
    8,
    8,
  ).add(
    logs(
      'Server log (exported fields only)',
      `{service_name!="", service_name=~"$service", deployment_environment_name=~"$env"}`,
      'Room codes, names and messages are not exported. Expand a line and follow its trace link.',
    ),
    16,
    8,
  );
  return dashboard(
    'kritzel-overview',
    'Kritzel / Global Overview',
    'Is the instance healthy? Rate, errors and duration of requests, rooms, players and game activity.',
    l,
  );
}

// ── 2. Game Analytics ────────────────────────────────────────────────────

function game() {
  const l = new Layout();
  const guessAccuracy = `sum(increase(kritzel_guesses_total{${S}, kritzel_outcome="correct"}[$__range])) / sum(increase(kritzel_guesses_total{${S}}[$__range]))`;
  const completion = `(${orZero(increase('kritzel_games_completed_total'))}) / (sum(increase(kritzel_games_completed_total{${S}}[$__range])) + (${orZero(increase('kritzel_games_aborted_total'))}))`;
  l.add(
    stat('Games started', orZero(increase('kritzel_games_started_total')), { decimals: 0 }),
    4,
    4,
  )
    .add(
      stat('Games completed', orZero(increase('kritzel_games_completed_total')), {
        decimals: 0,
        description: 'Played every round.',
      }),
      4,
      4,
    )
    .add(
      stat('Games aborted', orZero(increase('kritzel_games_aborted_total')), {
        decimals: 0,
        description: 'Ended before the last round: too few players, or the server stopped.',
      }),
      4,
      4,
    )
    .add(
      stat('Completion ratio', completion, {
        unit: 'percentunit',
        decimals: 1,
        noValue: 'no finished games',
      }),
      4,
      4,
    )
    .add(
      stat(
        'Median game duration',
        quantile(0.5, 'kritzel_game_duration_seconds', '', S, '$__range'),
        { unit: 's', noValue: 'no finished games' },
      ),
      4,
      4,
    )
    .add(
      stat('Correct guesses', guessAccuracy, {
        unit: 'percentunit',
        decimals: 1,
        noValue: 'no guesses',
        description: 'Share of evaluated guesses that were correct.',
      }),
      4,
      4,
    );

  l.row('Games and turns');
  l.add(
    timeseries('Games per minute', [
      target(`60 * ${rate('kritzel_games_started_total')}`, 'started'),
      target(orZero(`60 * ${rate('kritzel_games_completed_total')}`), 'completed'),
      target(orZero(`60 * ${rate('kritzel_games_aborted_total')}`), 'aborted'),
    ]),
    8,
    8,
  )
    .add(
      timeseries(
        'Aborted games by reason',
        [
          target(
            orZero(`60 * ${rate('kritzel_games_aborted_total', S, 'kritzel_reason')}`),
            '{{kritzel_reason}}',
          ),
        ],
        { description: 'Per minute.' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Game duration',
        [
          target(quantile(0.5, 'kritzel_game_duration_seconds', '', S, '15m'), 'median'),
          target(quantile(0.9, 'kritzel_game_duration_seconds', '', S, '15m'), '90th percentile'),
        ],
        { unit: 's', description: 'From game start to the results screen, over 15 minutes.' },
      ),
      8,
      8,
    )
    .add(
      bars(
        'Turns by ending',
        increase('kritzel_turns_ended_total', S, 'kritzel_reason'),
        '{{kritzel_reason}}',
        { description: 'In the selected time range.' },
      ),
      8,
      8,
    )
    .add(
      bars(
        'Guesses by outcome',
        increase('kritzel_guesses_total', S, 'kritzel_outcome'),
        '{{kritzel_outcome}}',
        {
          description:
            'A guess is counted once, when it is evaluated. Chat outside a turn is not a guess.',
        },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Guesses per second',
        [target(rate('kritzel_guesses_total', S, 'kritzel_outcome'), '{{kritzel_outcome}}')],
        { unit: 'ops', stack: true },
      ),
      8,
      8,
    );

  l.row('People');
  l.add(
    timeseries(
      'Joins by role',
      [
        target(
          rate('kritzel_join_attempts_total', `${S}, kritzel_outcome="joined"`, 'kritzel_role'),
          '{{kritzel_role}}',
        ),
      ],
      { unit: 'ops' },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'Players per room',
        [
          target(
            `sum(kritzel_players_connected{${S}}) / sum(kritzel_rooms_active{${S}})`,
            'players per room',
          ),
        ],
        {
          min: 0,
          description: 'An average over all rooms. No per-room or per-player figures exist.',
        },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Reconnects and departures',
        [
          target(rate('kritzel_reconnects_total'), 'reconnects'),
          target(rate('kritzel_disconnects_total', S, 'kritzel_cause'), '{{kritzel_cause}}'),
        ],
        { unit: 'ops' },
      ),
      8,
      8,
    );
  return dashboard(
    'kritzel-game',
    'Kritzel / Game Analytics',
    'How games go: starts, completions, aborts, turns and guesses. Counts only; nothing about individual players, words or drawings.',
    l,
  );
}

// ── 3. WebSocket & Reliability ───────────────────────────────────────────

function websocket() {
  const l = new Layout();
  const within = (metric, le) =>
    `sum(increase(${metric}_bucket{${S}, le="${le}"}[$__range])) / sum(increase(${metric}_count{${S}}[$__range]))`;
  l.add(stat('Connections', `sum(kritzel_ws_connections_active{${S}})`), 4, 4)
    .add(
      stat('Messages per second', orZero(rate('kritzel_ws_messages_total')), {
        unit: 'ops',
        decimals: 1,
      }),
      4,
      4,
    )
    .add(
      stat('Processed within 100 ms', within('kritzel_ws_message_duration_seconds', '0.1'), {
        unit: 'percentunit',
        decimals: 2,
        steps: [
          [null, 'red'],
          [0.95, 'yellow'],
          [0.99, 'green'],
        ],
        noValue: 'no messages',
        description: 'Objective: 99 %. Server-side processing only.',
      }),
      4,
      4,
    )
    .add(
      stat(
        'Processing, 99th percentile',
        quantile(0.99, 'kritzel_ws_message_duration_seconds', '', S, '$__range'),
        { unit: 's', noValue: 'no messages' },
      ),
      4,
      4,
    )
    .add(stat('Reconnects', orZero(increase('kritzel_reconnects_total')), { decimals: 0 }), 4, 4)
    .add(
      stat('Reconnected within 5 s', within('kritzel_reconnect_duration_seconds', '5'), {
        unit: 'percentunit',
        decimals: 1,
        steps: [
          [null, 'red'],
          [0.9, 'yellow'],
          [0.99, 'green'],
        ],
        noValue: 'no reconnects',
        description:
          'Objective: 99 %. Measured from losing the connection to resuming the seat, so a player who stays away by choice counts too.',
      }),
      4,
      4,
    );

  l.row('Messages');
  l.add(
    timeseries(
      'Messages by type',
      [
        target(
          rate('kritzel_ws_messages_total', S, 'kritzel_ws_message_type'),
          '{{kritzel_ws_message_type}}',
        ),
      ],
      { unit: 'ops', stack: true },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'Rejected messages by reason',
        [
          target(
            orZero(rate('kritzel_messages_rejected_total', S, 'kritzel_reason')),
            '{{kritzel_reason}}',
          ),
        ],
        { unit: 'ops', stack: true },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Processing duration',
        [
          target(quantile(0.5, 'kritzel_ws_message_duration_seconds'), 'median'),
          target(quantile(0.95, 'kritzel_ws_message_duration_seconds'), '95th percentile'),
          target(quantile(0.99, 'kritzel_ws_message_duration_seconds'), '99th percentile'),
        ],
        {
          unit: 's',
          description: 'From reading a frame to queuing the answers. Not delivery to browsers.',
        },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Processing duration by type, 95th percentile',
        [
          target(
            quantile(0.95, 'kritzel_ws_message_duration_seconds', 'kritzel_ws_message_type'),
            '{{kritzel_ws_message_type}}',
          ),
        ],
        { unit: 's' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Message spans, 95th percentile (click a dot for its trace)',
        [
          target(
            quantile(
              0.95,
              'kritzel_span_duration_seconds',
              'span_name',
              `${S}, span_name=~"ws .*"`,
            ),
            '{{span_name}}',
            { exemplar: true },
          ),
        ],
        {
          unit: 's',
          description: 'Exemplars link a data point to one real message and its trace in Tempo.',
        },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Drawing relay duration',
        [
          target(quantile(0.5, 'kritzel_drawing_relay_duration_seconds'), 'median'),
          target(quantile(0.95, 'kritzel_drawing_relay_duration_seconds'), '95th percentile'),
          target(quantile(0.99, 'kritzel_drawing_relay_duration_seconds'), '99th percentile'),
        ],
        {
          unit: 's',
          description: 'From reading a drawing operation to queuing it for every recipient.',
        },
      ),
      8,
      8,
    );

  l.row('Joining and reconnecting');
  l.add(
    timeseries(
      'Join duration, 95th percentile',
      [
        target(
          quantile(0.95, 'kritzel_join_duration_seconds', 'kritzel_outcome'),
          '{{kritzel_outcome}}',
        ),
      ],
      { unit: 's' },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'Departures by cause',
        [
          target(
            orZero(rate('kritzel_disconnects_total', S, 'kritzel_cause')),
            '{{kritzel_cause}}',
          ),
        ],
        {
          unit: 'ops',
          stack: true,
          description:
            'connection_lost is a dropped socket; left, kicked, replaced and seat_expired are deliberate or follow from the rules.',
        },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Time away before reconnecting',
        [
          target(quantile(0.5, 'kritzel_reconnect_duration_seconds', '', S, '15m'), 'median'),
          target(
            quantile(0.95, 'kritzel_reconnect_duration_seconds', '', S, '15m'),
            '95th percentile',
          ),
        ],
        { unit: 's', description: 'As seen by the server, over 15 minutes.' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Join and reconnect as measured in browsers',
        [
          target(
            quantile(0.95, 'kritzel_rum_timing_seconds', 'kritzel_rum_timing', S, '15m'),
            '{{kritzel_rum_timing}}, 95th percentile',
          ),
        ],
        {
          unit: 's',
          description:
            'Only from players who switched browser measurements on. Empty unless the operator offers them.',
        },
      ),
      12,
      8,
    )
    .add(
      traces(
        'Recent join traces',
        '{ resource.service.name =~ "kritzel.*" && name =~ "room.join|room.reconnect|browser.join|browser.reconnect" }',
        'Open a trace to see the browser span, the server spans and their log lines.',
      ),
      12,
      8,
    );

  l.row('Browsers (only players who switched measurements on)');
  l.add(
    timeseries(
      'Loading and reaction time, 75th percentile',
      [
        target(
          quantile(0.75, 'kritzel_rum_web_vital_seconds', 'kritzel_rum_vital', S, '15m'),
          '{{kritzel_rum_vital}}',
        ),
      ],
      {
        unit: 's',
        description:
          'Largest Contentful Paint (lcp) and the slowest interaction of a page view (inp), over 15 minutes. Empty unless the operator offers browser measurements and players switch them on.',
      },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'Layout shift, 75th percentile',
        [target(quantile(0.75, 'kritzel_rum_layout_shift_ratio', '', S, '15m'), 'layout shift')],
        { description: 'Cumulative Layout Shift score, over 15 minutes.', min: 0 },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Script errors by kind',
        [
          target(
            orZero(rate('kritzel_rum_errors_total', S, 'kritzel_rum_error_kind')),
            '{{kritzel_rum_error_kind}}',
          ),
        ],
        {
          unit: 'ops',
          stack: true,
          description: 'Counts only. Messages and stacks are never sent.',
        },
      ),
      8,
      8,
    );
  return dashboard(
    'kritzel-websocket',
    'Kritzel / WebSocket & Reliability',
    'The realtime path: connections, message processing, drawing relay, joins and reconnects.',
    l,
  );
}

// ── 4. Runtime & Infrastructure ──────────────────────────────────────────

function runtime() {
  const l = new Layout();
  const STACK = 'job=~"prometheus|loki|tempo|grafana"';
  l.add(stat('Memory (RSS)', `max(process_memory_usage_bytes{${S}})`, { unit: 'bytes' }), 4, 4)
    .add(
      stat(
        'Heap used',
        `max(v8js_memory_heap_used_bytes{${S}} / v8js_memory_heap_limit_bytes{${S}})`,
        {
          unit: 'percentunit',
          decimals: 1,
          steps: [
            [null, 'green'],
            [0.7, 'yellow'],
            [0.85, 'red'],
          ],
        },
      ),
      4,
      4,
    )
    .add(
      stat('CPU cores used', `sum(rate(process_cpu_time_seconds_total{${S}}[${RATE}]))`, {
        decimals: 2,
      }),
      4,
      4,
    )
    .add(
      stat('Event-loop delay, 99th percentile', `max(nodejs_eventloop_delay_p99_seconds{${S}})`, {
        unit: 's',
        steps: [
          [null, 'green'],
          [0.05, 'yellow'],
          [0.1, 'red'],
        ],
      }),
      4,
      4,
    )
    .add(
      stat('Event-loop utilisation', `max(nodejs_eventloop_utilization_ratio{${S}})`, {
        unit: 'percentunit',
        decimals: 1,
        steps: [
          [null, 'green'],
          [0.7, 'yellow'],
          [0.9, 'red'],
        ],
      }),
      4,
      4,
    )
    .add(
      stat(
        'Spans dropped by the game',
        orZero(
          `sum(increase(otel_sdk_processor_span_processed_total{${S}, error_type!=""}[$__range]))`,
        ),
        {
          decimals: 0,
          steps: [
            [null, 'green'],
            [1, 'yellow'],
          ],
          description: 'Dropped because the export queue was full. Gameplay is unaffected.',
        },
      ),
      4,
      4,
    );

  l.row('Game process');
  l.add(
    timeseries(
      'Memory',
      [
        target(`max(process_memory_usage_bytes{${S}})`, 'resident set'),
        target(`max(v8js_memory_heap_used_bytes{${S}})`, 'heap used'),
        target(`max(v8js_memory_heap_limit_bytes{${S}})`, 'heap limit'),
      ],
      { unit: 'bytes' },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'CPU by mode',
        [
          target(
            `sum by (cpu_mode) (rate(process_cpu_time_seconds_total{${S}}[${RATE}]))`,
            '{{cpu_mode}}',
          ),
        ],
        {
          stack: true,
          description:
            'Cores. The game is single-threaded: sustained values near 1 mean saturation.',
        },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Event-loop delay',
        [
          target(`max(nodejs_eventloop_delay_p50_seconds{${S}})`, 'median'),
          target(`max(nodejs_eventloop_delay_p99_seconds{${S}})`, '99th percentile'),
          target(`max(nodejs_eventloop_delay_max_seconds{${S}})`, 'maximum'),
        ],
        { unit: 's', description: 'Per export interval.' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Garbage collection time',
        [
          target(
            `sum by (v8js_gc_type) (rate(v8js_gc_duration_seconds_sum{${S}}[${RATE}]))`,
            '{{v8js_gc_type}}',
          ),
        ],
        { unit: 'percentunit', stack: true, description: 'Share of time spent collecting.' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Garbage collection pause, 95th percentile',
        [
          target(
            quantile(0.95, 'v8js_gc_duration_seconds', 'v8js_gc_type', S, '15m'),
            '{{v8js_gc_type}}',
          ),
        ],
        { unit: 's' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Event-loop utilisation',
        [target(`max(nodejs_eventloop_utilization_ratio{${S}})`, 'busy')],
        { unit: 'percentunit', min: 0, max: 1 },
      ),
      8,
      8,
    );

  l.row('Telemetry pipeline');
  l.add(
    timeseries(
      'Export queues of the game',
      [
        target(`max(otel_sdk_processor_span_queue_size{${S}})`, 'spans queued'),
        target(`max(otel_sdk_processor_log_queue_size{${S}})`, 'log records queued'),
        target(`max(otel_sdk_processor_span_queue_capacity{${S}})`, 'capacity'),
      ],
      { description: 'A full queue drops new items; the game never waits for the collector.' },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'Collector: received',
        [
          target('sum(rate(otelcol_receiver_accepted_spans_total[' + RATE + ']))', 'spans'),
          target(
            'sum(rate(otelcol_receiver_accepted_metric_points_total[' + RATE + ']))',
            'metric points',
          ),
          target(
            'sum(rate(otelcol_receiver_accepted_log_records_total[' + RATE + ']))',
            'log records',
          ),
        ],
        { unit: 'ops' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Collector: refused or failed',
        [
          target(
            orZero(
              'sum(rate(otelcol_receiver_refused_spans_total[' +
                RATE +
                '])) + sum(rate(otelcol_receiver_failed_spans_total[' +
                RATE +
                ']))',
            ),
            'spans',
          ),
          target(
            orZero(
              'sum(rate(otelcol_receiver_refused_metric_points_total[' +
                RATE +
                '])) + sum(rate(otelcol_receiver_failed_metric_points_total[' +
                RATE +
                ']))',
            ),
            'metric points',
          ),
          target(
            orZero(
              'sum(rate(otelcol_receiver_refused_log_records_total[' +
                RATE +
                '])) + sum(rate(otelcol_receiver_failed_log_records_total[' +
                RATE +
                ']))',
            ),
            'log records',
          ),
        ],
        { unit: 'ops', description: 'Refused when the memory limiter protects the collector.' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Collector: exported',
        [
          target('sum(rate(otelcol_exporter_sent_spans_total[' + RATE + ']))', 'spans to Tempo'),
          target(
            'sum(rate(otelcol_exporter_sent_metric_points_total[' + RATE + ']))',
            'metric points to Prometheus',
          ),
          target(
            'sum(rate(otelcol_exporter_sent_log_records_total[' + RATE + ']))',
            'log records to Loki',
          ),
        ],
        { unit: 'ops' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Collector: export queues',
        [target('max by (exporter) (otelcol_exporter_queue_size)', '{{exporter}}')],
        { description: 'Grows when a backend is slow or down.' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Ingestion',
        [
          target(
            'sum(rate(loki_distributor_bytes_received_total[' + RATE + ']))',
            'logs into Loki',
          ),
          target(
            'sum(rate(tempo_distributor_bytes_received_total[' + RATE + ']))',
            'traces into Tempo',
          ),
        ],
        { unit: 'Bps' },
      ),
      8,
      8,
    );

  l.row('Backends');
  l.add(
    timeseries('Reachable', [target('max by (job) (up)', '{{job}}')], {
      min: 0,
      max: 1,
      description: '1 when the collector could scrape the component.',
    }),
    8,
    8,
  )
    .add(
      timeseries(
        'Memory by component',
        [
          target(`max by (job) (process_resident_memory_bytes{${STACK}})`, '{{job}}'),
          target('max(otelcol_process_memory_rss)', 'otel-collector'),
        ],
        { unit: 'bytes' },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Prometheus storage',
        [
          target(
            'max(prometheus_tsdb_storage_blocks_bytes) + max(prometheus_tsdb_wal_storage_size_bytes)',
            'bytes on disk',
          ),
        ],
        { unit: 'bytes' },
      ),
      4,
      8,
    )
    .add(
      timeseries('Active series and live traces', [
        target('max(prometheus_tsdb_head_series)', 'Prometheus series'),
        target('max(loki_ingester_memory_streams)', 'Loki streams'),
        target('max(tempo_live_store_live_traces)', 'Tempo live traces'),
      ]),
      4,
      8,
    );
  l.add(
    text(
      '**Not shown, because nothing here collects it:** node, pod and container metrics, network and disk I/O. They need access the application does not have; see `docs/OBSERVABILITY.md`.',
    ),
    24,
    2,
  );
  return dashboard(
    'kritzel-runtime',
    'Kritzel / Runtime & Infrastructure',
    'The Node.js process, the telemetry pipeline and the backends. Only what is actually measured.',
    l,
  );
}

// ── 5. Security & Abuse ──────────────────────────────────────────────────

function security() {
  const l = new Layout();
  l.add(
    stat('Rejected messages', orZero(increase('kritzel_messages_rejected_total')), { decimals: 0 }),
    4,
    4,
  )
    .add(
      stat(
        'Rejected share',
        `sum(increase(kritzel_ws_messages_total{${S}, kritzel_outcome="rejected"}[$__range])) / sum(increase(kritzel_ws_messages_total{${S}}[$__range]))`,
        {
          unit: 'percentunit',
          decimals: 2,
          steps: [
            [null, 'green'],
            [0.05, 'yellow'],
            [0.2, 'red'],
          ],
          noValue: 'no messages',
        },
      ),
      4,
      4,
    )
    .add(
      stat('Rate-limit hits', orZero(increase('kritzel_rate_limit_hits_total')), { decimals: 0 }),
      4,
      4,
    )
    .add(
      stat(
        'Room creations refused',
        orZero(increase('kritzel_rooms_create_attempts_total', `${S}, kritzel_outcome="rejected"`)),
        { decimals: 0 },
      ),
      4,
      4,
    )
    .add(
      stat(
        'Joins refused',
        orZero(increase('kritzel_join_attempts_total', `${S}, kritzel_outcome="rejected"`)),
        { decimals: 0, description: 'Mostly ordinary: wrong code, full room, kicked player.' },
      ),
      4,
      4,
    )
    .add(
      stat(
        'Measurement reports refused',
        orZero(increase('kritzel_rum_reports_total', `${S}, kritzel_outcome="rejected"`)),
        { decimals: 0, description: 'Malformed or rate-limited browser reports.' },
      ),
      4,
      4,
    );

  l.row('Refusals');
  l.add(
    timeseries(
      'Rejected messages by reason',
      [
        target(
          orZero(rate('kritzel_messages_rejected_total', S, 'kritzel_reason')),
          '{{kritzel_reason}}',
        ),
      ],
      {
        unit: 'ops',
        stack: true,
        description:
          'bad_request and invalid_op point at broken or hostile clients; not_allowed is usually a late click.',
      },
    ),
    8,
    8,
  )
    .add(
      timeseries(
        'Rejected messages by type',
        [
          target(
            orZero(rate('kritzel_messages_rejected_total', S, 'kritzel_ws_message_type')),
            '{{kritzel_ws_message_type}}',
          ),
        ],
        {
          unit: 'ops',
          stack: true,
          description: '"invalid" is a frame that is not a known message.',
        },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Rate-limit hits by scope',
        [
          target(
            orZero(rate('kritzel_rate_limit_hits_total', S, 'kritzel_scope')),
            '{{kritzel_scope}}',
          ),
        ],
        { unit: 'ops', stack: true },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Room creation by outcome',
        [
          target(
            rate('kritzel_rooms_create_attempts_total', S, 'kritzel_outcome, kritzel_reason'),
            '{{kritzel_outcome}} {{kritzel_reason}}',
          ),
        ],
        { unit: 'ops', stack: true },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'Refused joins by reason',
        [
          target(
            orZero(
              rate(
                'kritzel_join_attempts_total',
                `${S}, kritzel_outcome="rejected"`,
                'kritzel_reason',
              ),
            ),
            '{{kritzel_reason}}',
          ),
        ],
        {
          unit: 'ops',
          stack: true,
          description:
            'A burst of room_not_found from few connections can be someone guessing room codes.',
        },
      ),
      8,
      8,
    )
    .add(
      timeseries(
        'HTTP client and server errors',
        [
          target(
            orZero(
              rate(
                'http_server_request_duration_seconds_count',
                `${S}, http_response_status_code=~"4..|5.."`,
                'http_route, http_response_status_code',
              ),
            ),
            '{{http_response_status_code}} {{http_route}}',
          ),
        ],
        { unit: 'reqps', stack: true },
      ),
      8,
      8,
    );

  l.row('Browser reports and logs');
  l.add(
    timeseries(
      'Browser measurement reports',
      [
        target(
          orZero(rate('kritzel_rum_reports_total', S, 'kritzel_outcome, kritzel_reason')),
          '{{kritzel_outcome}} {{kritzel_reason}}',
        ),
      ],
      {
        unit: 'ops',
        stack: true,
        description: 'Empty unless the operator offers browser measurements.',
      },
    ),
    8,
    8,
  ).add(
    logs(
      'Warnings and errors',
      `{service_name!="", service_name=~"$service", deployment_environment_name=~"$env"} | detected_level=~"warn|error"`,
      'For example a refused room creation on a full server.',
    ),
    16,
    8,
  );
  l.add(
    text(
      '**Not measured yet:** connection attempts per address, heartbeat timeouts and backpressure evictions. The mechanisms do not exist in the server yet; no panel pretends otherwise.',
    ),
    24,
    2,
  );
  return dashboard(
    'kritzel-security',
    'Kritzel / Security & Abuse',
    'Refused messages, rate limits and other signs of broken or hostile clients. No addresses, no identities.',
    l,
  );
}

// ── write or check ───────────────────────────────────────────────────────

const files = {
  'kritzel-overview.json': overview(),
  'kritzel-game.json': game(),
  'kritzel-websocket.json': websocket(),
  'kritzel-runtime.json': runtime(),
  'kritzel-security.json': security(),
};

let stale = false;
mkdirSync(outDir, { recursive: true });
for (const [name, content] of Object.entries(files)) {
  const path = `${outDir}${name}`;
  const text = `${JSON.stringify(content, null, 2)}\n`;
  if (check) {
    let current = '';
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      // Missing counts as stale.
    }
    if (current !== text) {
      stale = true;
      console.error(`${name} is out of date; run pnpm dashboards:generate`);
    }
  } else {
    writeFileSync(path, text);
    console.log(`wrote ${name} (${content.panels.length} panels)`);
  }
}
if (stale) process.exit(1);
