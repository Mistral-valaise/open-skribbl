/**
 * The telemetry contract (spec 015): every metric, label value, span and
 * exported log attribute of the server. Instruments are created from this
 * file, `docs/OBSERVABILITY.md` is tested against it, and nothing reaches a
 * label unless its value set is listed here.
 */

/** Spec 015, "Histogram buckets", in seconds. */
export const DURATION_BUCKETS = [
  0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
] as const;
export const GAME_DURATION_BUCKETS = [30, 60, 120, 300, 600, 900, 1800, 3600] as const;
/** Cumulative Layout Shift is a unitless score. */
export const CLS_BUCKETS = [0.01, 0.025, 0.05, 0.1, 0.15, 0.25, 0.5, 1] as const;

/** Spec 015: at most one drawing operation in this many produces a span. */
export const DRAW_SPAN_SAMPLE_EVERY = 64;
/** Spec 015, "cardinality budget". */
export const SERIES_BUDGET = 600;

/** Spec 015, "Delivery limits". */
export const DELIVERY = {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMs: 5000,
  metricIntervalMs: 15_000,
  exportTimeoutMs: 10_000,
  shutdownFlushMs: 3000,
} as const;

export const OTHER = 'other';

/** Allowed values per label. A value outside its set is recorded as `other`. */
export const LABEL_VALUES = {
  'kritzel.ws.message.type': [
    'join',
    'leave',
    'settings.update',
    'game.start',
    'game.playAgain',
    'player.kick',
    'word.choose',
    'draw.op',
    'chat.send',
    'reaction.send',
    'like.set',
    'gallery.get',
    'invalid',
  ],
  'kritzel.outcome': [
    'accepted',
    'rejected',
    'created',
    'joined',
    'resumed',
    'failed',
    'correct',
    'close',
    'wrong',
    'ok',
    'finished',
    'aborted',
  ],
  'kritzel.reason': [
    'none',
    'bad_request',
    'version_mismatch',
    'room_not_found',
    'room_full',
    'server_full',
    'kicked',
    'replaced',
    'invalid_nickname',
    'invalid_avatar',
    'not_allowed',
    'not_enough_players',
    'invalid_settings',
    'invalid_custom_words',
    'invalid_message',
    'message_blocked',
    'rate_limited',
    'drawing_limit',
    'invalid_op',
    'time_up',
    'all_guessed',
    'drawer_left',
    'room_disposed',
    'shutdown',
    'invalid_report',
  ],
  'kritzel.cause': ['connection_lost', 'left', 'kicked', 'replaced', 'seat_expired'],
  'kritzel.validity': ['valid', 'excluded'],
  'kritzel.role': ['player', 'spectator'],
  'kritzel.scope': ['draw', 'chat', 'room_create', 'telemetry'],
  'kritzel.rum.vital': ['lcp', 'inp', 'cls'],
  'kritzel.rum.error.kind': ['error', 'unhandledrejection'],
  'kritzel.rum.timing': ['join', 'reconnect'],
  'http.request.method': ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
  'http.route': [
    '/healthz',
    '/api/rooms',
    '/api/rooms/:code',
    '/api/config',
    '/api/telemetry',
    '/ws',
    '/*',
    'unmatched',
  ],
  'cpu.mode': ['user', 'system'],
  'v8js.gc.type': ['major', 'minor', 'incremental', 'weakcb'],
} as const;

export type LabelName = keyof typeof LABEL_VALUES;
export type Labels = Partial<Record<LabelName, string>> & {
  /** Three-digit status; bounded by the protocol, not by a list. */
  'http.response.status_code'?: number;
};

/** Reasons that make a refused join the player's or the host's doing (spec 015, "Join validity"). */
export const EXCLUDED_JOIN_REASONS: readonly string[] = [
  'room_not_found',
  'room_full',
  'kicked',
  'invalid_nickname',
  'invalid_avatar',
  'version_mismatch',
];

type Kind = 'counter' | 'histogram' | 'gauge' | 'observableCounter';

export interface MetricDefinition {
  /** OpenTelemetry instrument name. */
  name: string;
  kind: Kind;
  /** UCUM unit; `{thing}` annotations are not appended to the Prometheus name. */
  unit: string;
  description: string;
  labels: readonly (LabelName | 'http.response.status_code')[];
  buckets?: readonly number[];
  /** The name the collector's Prometheus translation produces. */
  prometheus: string;
}

const metric = <const T extends MetricDefinition>(definition: T): T => definition;

export const METRICS = {
  roomsActive: metric({
    name: 'kritzel.rooms.active',
    kind: 'gauge',
    unit: '{room}',
    description: 'Live rooms in this process.',
    labels: [],
    prometheus: 'kritzel_rooms_active',
  }),
  playersConnected: metric({
    name: 'kritzel.players.connected',
    kind: 'gauge',
    unit: '{player}',
    description: 'Players with an open connection.',
    labels: [],
    prometheus: 'kritzel_players_connected',
  }),
  spectatorsConnected: metric({
    name: 'kritzel.spectators.connected',
    kind: 'gauge',
    unit: '{spectator}',
    description: 'Spectators with an open connection.',
    labels: [],
    prometheus: 'kritzel_spectators_connected',
  }),
  wsConnectionsActive: metric({
    name: 'kritzel.ws.connections.active',
    kind: 'gauge',
    unit: '{connection}',
    description: 'Open WebSocket connections, joined or not.',
    labels: [],
    prometheus: 'kritzel_ws_connections_active',
  }),
  roomsCreated: metric({
    name: 'kritzel.rooms.create.attempts',
    kind: 'counter',
    unit: '{attempt}',
    description: 'Room creation requests by outcome.',
    labels: ['kritzel.outcome', 'kritzel.reason'],
    prometheus: 'kritzel_rooms_create_attempts_total',
  }),
  joinAttempts: metric({
    name: 'kritzel.join.attempts',
    kind: 'counter',
    unit: '{attempt}',
    description: 'Join messages by outcome, reason, role and validity.',
    labels: ['kritzel.outcome', 'kritzel.reason', 'kritzel.role', 'kritzel.validity'],
    prometheus: 'kritzel_join_attempts_total',
  }),
  reconnects: metric({
    name: 'kritzel.reconnects',
    kind: 'counter',
    unit: '{reconnect}',
    description: 'Joins that resumed an existing seat.',
    labels: [],
    prometheus: 'kritzel_reconnects_total',
  }),
  disconnects: metric({
    name: 'kritzel.disconnects',
    kind: 'counter',
    unit: '{disconnect}',
    description: 'Seats that lost their connection or were removed, by cause.',
    labels: ['kritzel.cause'],
    prometheus: 'kritzel_disconnects_total',
  }),
  gamesStarted: metric({
    name: 'kritzel.games.started',
    kind: 'counter',
    unit: '{game}',
    description: 'Games started.',
    labels: [],
    prometheus: 'kritzel_games_started_total',
  }),
  gamesCompleted: metric({
    name: 'kritzel.games.completed',
    kind: 'counter',
    unit: '{game}',
    description: 'Games that played every round.',
    labels: [],
    prometheus: 'kritzel_games_completed_total',
  }),
  gamesAborted: metric({
    name: 'kritzel.games.aborted',
    kind: 'counter',
    unit: '{game}',
    description: 'Games that ended before the last round, by reason.',
    labels: ['kritzel.reason'],
    prometheus: 'kritzel_games_aborted_total',
  }),
  turnsEnded: metric({
    name: 'kritzel.turns.ended',
    kind: 'counter',
    unit: '{turn}',
    description: 'Turns ended, by reason.',
    labels: ['kritzel.reason'],
    prometheus: 'kritzel_turns_ended_total',
  }),
  guesses: metric({
    name: 'kritzel.guesses',
    kind: 'counter',
    unit: '{guess}',
    description: 'Guesses evaluated, by outcome.',
    labels: ['kritzel.outcome'],
    prometheus: 'kritzel_guesses_total',
  }),
  wsMessages: metric({
    name: 'kritzel.ws.messages',
    kind: 'counter',
    unit: '{message}',
    description: 'Inbound WebSocket messages by type and outcome.',
    labels: ['kritzel.ws.message.type', 'kritzel.outcome'],
    prometheus: 'kritzel_ws_messages_total',
  }),
  messagesRejected: metric({
    name: 'kritzel.messages.rejected',
    kind: 'counter',
    unit: '{message}',
    description: 'Inbound WebSocket messages answered with an error, by code.',
    labels: ['kritzel.ws.message.type', 'kritzel.reason'],
    prometheus: 'kritzel_messages_rejected_total',
  }),
  rateLimitHits: metric({
    name: 'kritzel.rate_limit.hits',
    kind: 'counter',
    unit: '{hit}',
    description: 'Requests or messages refused by a rate limit, by scope.',
    labels: ['kritzel.scope'],
    prometheus: 'kritzel_rate_limit_hits_total',
  }),
  gameDuration: metric({
    name: 'kritzel.game.duration',
    kind: 'histogram',
    unit: 's',
    description: 'Time from game start to the results screen.',
    labels: ['kritzel.outcome'],
    buckets: GAME_DURATION_BUCKETS,
    prometheus: 'kritzel_game_duration_seconds',
  }),
  wsMessageDuration: metric({
    name: 'kritzel.ws.message.duration',
    kind: 'histogram',
    unit: 's',
    description: 'Server-side processing time of one inbound WebSocket message.',
    labels: ['kritzel.ws.message.type'],
    buckets: DURATION_BUCKETS,
    prometheus: 'kritzel_ws_message_duration_seconds',
  }),
  joinDuration: metric({
    name: 'kritzel.join.duration',
    kind: 'histogram',
    unit: 's',
    description: 'Time from reading a join message to queuing its answer.',
    labels: ['kritzel.outcome'],
    buckets: DURATION_BUCKETS,
    prometheus: 'kritzel_join_duration_seconds',
  }),
  reconnectDuration: metric({
    name: 'kritzel.reconnect.duration',
    kind: 'histogram',
    unit: 's',
    description: 'Time a resumed seat was without a connection, as seen by the server.',
    labels: [],
    buckets: DURATION_BUCKETS,
    prometheus: 'kritzel_reconnect_duration_seconds',
  }),
  drawingRelayDuration: metric({
    name: 'kritzel.drawing.relay.duration',
    kind: 'histogram',
    unit: 's',
    description:
      'Time from reading a drawing operation to queuing it for every recipient. Not delivery time.',
    labels: [],
    buckets: DURATION_BUCKETS,
    prometheus: 'kritzel_drawing_relay_duration_seconds',
  }),
  httpDuration: metric({
    name: 'http.server.request.duration',
    kind: 'histogram',
    unit: 's',
    description: 'Duration of HTTP requests by method, route template and status.',
    labels: ['http.request.method', 'http.route', 'http.response.status_code'],
    buckets: DURATION_BUCKETS,
    prometheus: 'http_server_request_duration_seconds',
  }),
  rumEvents: metric({
    name: 'kritzel.rum.reports',
    kind: 'counter',
    unit: '{report}',
    description: 'Browser measurement reports by outcome.',
    labels: ['kritzel.outcome', 'kritzel.reason'],
    prometheus: 'kritzel_rum_reports_total',
  }),
  rumVital: metric({
    name: 'kritzel.rum.web_vital',
    kind: 'histogram',
    unit: 's',
    description: 'Largest Contentful Paint and Interaction to Next Paint reported by browsers.',
    labels: ['kritzel.rum.vital'],
    buckets: DURATION_BUCKETS,
    prometheus: 'kritzel_rum_web_vital_seconds',
  }),
  rumLayoutShift: metric({
    name: 'kritzel.rum.layout_shift',
    kind: 'histogram',
    unit: '1',
    description: 'Cumulative Layout Shift score reported by browsers.',
    labels: [],
    buckets: CLS_BUCKETS,
    prometheus: 'kritzel_rum_layout_shift_ratio',
  }),
  rumErrors: metric({
    name: 'kritzel.rum.errors',
    kind: 'counter',
    unit: '{error}',
    description: 'Script errors reported by browsers, by kind. No message, no stack.',
    labels: ['kritzel.rum.error.kind'],
    prometheus: 'kritzel_rum_errors_total',
  }),
  rumTiming: metric({
    name: 'kritzel.rum.timing',
    kind: 'histogram',
    unit: 's',
    description: 'Join and reconnect duration as measured in the browser.',
    labels: ['kritzel.rum.timing', 'kritzel.outcome'],
    buckets: DURATION_BUCKETS,
    prometheus: 'kritzel_rum_timing_seconds',
  }),
  processMemory: metric({
    name: 'process.memory.usage',
    kind: 'gauge',
    unit: 'By',
    description: 'Resident set size of the server process.',
    labels: [],
    prometheus: 'process_memory_usage_bytes',
  }),
  heapUsed: metric({
    name: 'v8js.memory.heap.used',
    kind: 'gauge',
    unit: 'By',
    description: 'Used V8 heap.',
    labels: [],
    prometheus: 'v8js_memory_heap_used_bytes',
  }),
  heapLimit: metric({
    name: 'v8js.memory.heap.limit',
    kind: 'gauge',
    unit: 'By',
    description: 'V8 heap size limit.',
    labels: [],
    prometheus: 'v8js_memory_heap_limit_bytes',
  }),
  cpuTime: metric({
    name: 'process.cpu.time',
    kind: 'observableCounter',
    unit: 's',
    description: 'CPU time used by the server process, by mode.',
    labels: ['cpu.mode'],
    prometheus: 'process_cpu_time_seconds_total',
  }),
  gcDuration: metric({
    name: 'v8js.gc.duration',
    kind: 'histogram',
    unit: 's',
    description: 'Garbage-collection pauses, by type.',
    labels: ['v8js.gc.type'],
    buckets: DURATION_BUCKETS,
    prometheus: 'v8js_gc_duration_seconds',
  }),
  eventLoopDelayP50: metric({
    name: 'nodejs.eventloop.delay.p50',
    kind: 'gauge',
    unit: 's',
    description: 'Median event-loop delay since the last export.',
    labels: [],
    prometheus: 'nodejs_eventloop_delay_p50_seconds',
  }),
  eventLoopDelayP99: metric({
    name: 'nodejs.eventloop.delay.p99',
    kind: 'gauge',
    unit: 's',
    description: '99th percentile event-loop delay since the last export.',
    labels: [],
    prometheus: 'nodejs_eventloop_delay_p99_seconds',
  }),
  eventLoopDelayMax: metric({
    name: 'nodejs.eventloop.delay.max',
    kind: 'gauge',
    unit: 's',
    description: 'Longest event-loop delay since the last export.',
    labels: [],
    prometheus: 'nodejs_eventloop_delay_max_seconds',
  }),
  eventLoopUtilization: metric({
    name: 'nodejs.eventloop.utilization',
    kind: 'gauge',
    unit: '1',
    description: 'Share of time the event loop was busy since the last export.',
    labels: [],
    prometheus: 'nodejs_eventloop_utilization_ratio',
  }),
} as const;

export type MetricKey = keyof typeof METRICS;

/** Span names (spec 015, "Spans"). WebSocket and HTTP server spans are named by `spanNameFor*`. */
export const SPANS = {
  roomCreate: 'room.create',
  roomJoin: 'room.join',
  roomReconnect: 'room.reconnect',
  gameStart: 'game.start',
  gameEnd: 'game.end',
  guessEvaluate: 'guess.evaluate',
  drawingRelay: 'drawing.relay',
  browserJoin: 'browser.join',
  browserReconnect: 'browser.reconnect',
} as const;

export const spanNameForWs = (type: string) => `ws ${bounded('kritzel.ws.message.type', type)}`;
export const spanNameForHttp = (method: string, route: string) =>
  `${bounded('http.request.method', method)} ${bounded('http.route', route)}`;

/** Log attributes that may leave the process (spec 015, "Privacy"). */
export const LOG_ATTRIBUTE_ALLOWLIST: readonly string[] = [
  'rooms',
  'seats',
  'code',
  'reason',
  'signal',
  'port',
  'host',
  'maxRooms',
  'trustProxy',
  'logLevel',
  'telemetry',
  'rum',
  'dropped',
];

/** Returns `value` when the label allows it, `other` otherwise. */
export function bounded(label: LabelName, value: string): string {
  return (LABEL_VALUES[label] as readonly string[]).includes(value) ? value : OTHER;
}

/** Applies `bounded` to every label of a measurement. */
export function boundedLabels(labels: Labels): Record<string, string | number> {
  const result: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(labels)) {
    if (value === undefined) continue;
    if (name === 'http.response.status_code') {
      const status = Number(value);
      result[name] = Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
    } else {
      result[name] = bounded(name as LabelName, String(value));
    }
  }
  return result;
}
