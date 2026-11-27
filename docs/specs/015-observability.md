# 015 — Observability

|           |          |
| --------- | -------- |
| Status    | Approved |
| Milestone | M6       |

## Intent

An operator must be able to see whether Kritzel is healthy and why it is not, without learning anything about what the players said or drew. Telemetry is off unless the operator turns it on, speaks plain OpenTelemetry (OTLP) to any collector, and never becomes a reason for a game to fail.

## Behaviour

- A server started without telemetry configuration behaves exactly as before: it loads no telemetry SDK and opens no outbound connection.
- With `TELEMETRY_ENABLED=true` the server sends metrics, traces and logs over OTLP/HTTP to the collector named by the standard `OTEL_*` variables. Log lines stay on stdout as well.
- An optional overlay, `docker-compose.observability.yml`, starts a collector, Prometheus, Loki, Tempo and Grafana next to the game, with data sources, dashboards and rules already in place.
- With `RUM_ENABLED=true` the web app offers each player a switch, off by default, to share anonymous performance measurements with the operator. Nothing is measured or sent until the player turns it on.
- When the collector is down, slow or overloaded, games continue; telemetry that cannot be delivered is dropped.

## Rules

### Configuration

| Variable            | Default | Meaning                                                                                |
| ------------------- | ------- | -------------------------------------------------------------------------------------- |
| `TELEMETRY_ENABLED` | `false` | Export metrics, traces and logs over OTLP                                              |
| `RUM_ENABLED`       | `false` | Offer the browser measurement switch and accept its reports; needs `TELEMETRY_ENABLED` |
| `OTEL_SDK_DISABLED` | `false` | Standard switch; `true` turns all telemetry off and wins over `TELEMETRY_ENABLED`      |

The standard variables `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_EXPORTER_OTLP_TIMEOUT`, their per-signal forms, `OTEL_SERVICE_NAME`, `OTEL_RESOURCE_ATTRIBUTES`, `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`, `OTEL_METRIC_EXPORT_INTERVAL` and `OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER`, `OTEL_LOGS_EXPORTER` (`otlp` or `none`) are honoured. `OTEL_EXPORTER_OTLP_PROTOCOL` accepts `http/protobuf` (default) and `http/json`; `grpc` is not supported and stops the process at start-up.

The resource carries `service.name` (default `kritzel`), `service.version`, `service.instance.id` (random per process) and whatever `OTEL_RESOURCE_ATTRIBUTES` adds, such as `deployment.environment.name`.

### Telemetry contract

`docs/OBSERVABILITY.md` lists every metric with its instrument, unit, labels, buckets and Prometheus name, every span and every exported log attribute. The list is generated from, and tested against, the contract in `apps/server/src/telemetry/contract.ts`.

- **Counted once.** A game start, a game end, a turn end, a join, a reconnect and a guess are recorded when the room state changes, never per recipient or per broadcast.
- **Disconnect, reconnect, leave.** A lost socket is a _disconnect_. A join that resumes a seat is a _reconnect_; its duration is the time the seat was without a connection, as seen by the server. A `leave` message, a kick, a replaced connection and an expired seat are recorded under their own cause, so they can be told apart from lost connections.
- **Join validity.** A join refused for `room_not_found`, `room_full`, `kicked`, `invalid_nickname`, `invalid_avatar` or `version_mismatch` is the player's or host's doing and is labelled `validity="excluded"`. Every other join is `valid` and either succeeds or counts against the join objective.
- **Relay latency** is server-side only: from reading a `draw.op` frame to having queued it for every recipient. It says nothing about delivery to browsers.
- **Labels are allowlisted.** Label values come from fixed sets: message type, outcome, reason, cause, phase, role, route template, HTTP method and status. A value outside its set is recorded as `other`. Room codes, participant, connection and session ids, trace ids, URLs, addresses and free text are never labels. The cardinality budget is 600 series for the whole application at any load.
- **Spans** cover one operation: `room.create`, `room.join`, `room.reconnect`, `game.start`, `game.end`, `guess.evaluate`, `drawing.relay`, and one server span per HTTP request and per WebSocket message. No span covers a socket's lifetime or a whole game. At most one in `DRAW_SPAN_SAMPLE_EVERY` (64) drawing operations per connection produces a span.
- **Histogram buckets** for durations in seconds: 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60. Game duration uses 30, 60, 120, 300, 600, 900, 1800, 3600.

### Privacy

- Exported telemetry never contains nicknames, chat or guess text, words (secret, custom or offered), drawing content, session tokens, room codes, invite links, query strings, request headers or client addresses.
- Log records are exported with allowlisted attributes only: `rooms`, `seats`, `code`, `reason`, `signal`, `port`, `host`, `maxRooms`, `trustProxy`, `logLevel`, `telemetry`, `rum`, `dropped`. The stdout line keeps the room code (spec 012); the exported record does not.
- The collector configuration repeats the allowlist, so a mistake in the application does not reach a backend.
- No per-player record exists: nothing identifies a browser across reports, and no report is stored with an address.

### Delivery limits

- Span and log queues hold at most 2048 items; a full queue drops the newest item. A batch has at most 512 items and is sent every 5 s; metrics are exported every 15 s unless `OTEL_METRIC_EXPORT_INTERVAL` says otherwise.
- An export times out after 10 s. On shutdown, flushing gets at most 3 s; then the process exits.
- Readiness and liveness (`/healthz`) do not depend on telemetry.

### Browser measurements

- `GET /api/config` returns `{ "rum": boolean }`. `POST /api/telemetry` exists only when RUM is enabled; otherwise it answers 404.
- The player's choice is stored in the browser as a preference (`kritzel.rum`), like the theme. There is no cookie and no identifier.
- Reported: Largest Contentful Paint, Interaction to Next Paint (the slowest interaction of the page view) and Cumulative Layout Shift where the browser supports them; a count of script errors by kind (`error`, `unhandledrejection`), never the message or stack; the duration and outcome of joining and reconnecting.
- A report is JSON of at most 4 KiB with at most 20 events and exactly the documented fields; anything else is refused with 400. Reports are limited to 30 per minute per address (429 beyond that). The server sets the resource (`service.name=kritzel-web`); the browser cannot.
- A join may carry a W3C `traceparent`. When RUM is enabled and the value is well-formed, the server's join span becomes a child of it, and the browser's later report of that join adds the root span. A malformed value is ignored. Baggage is not accepted.
- The Content-Security-Policy stays as specified in spec 012.

### Local stack

- Services: OpenTelemetry Collector (contrib), Prometheus, Loki and Tempo in single-binary mode, Grafana. Images are pinned by digest. Only Grafana (`127.0.0.1:3001`) is published, with a login; every other port stays inside the Compose network.
- Data source UIDs are `prometheus`, `loki` and `tempo`.
- Five dashboards: Global Overview (`kritzel-overview`), Game Analytics (`kritzel-game`), WebSocket & Reliability (`kritzel-websocket`), Runtime & Infrastructure (`kritzel-runtime`), Security & Abuse (`kritzel-security`).
- Correlation: histogram exemplars open the trace in Tempo; a trace opens its logs in Loki; a log line opens its trace; a span opens the matching metric query in Prometheus. Exemplars come from the collector's span metrics, because the JavaScript SDK does not export them (ADR 0006).
- Retention is 24 h for every backend by default.
- `pnpm obs:up`, `pnpm obs:down`, `pnpm obs:reset` and `pnpm obs:traffic` start, stop, wipe and exercise the stack.

### Synthetic traffic

- The traffic generator plays complete games against a running server with a seeded random source: the same seed produces the same sequence of actions. It reports as `service.name=kritzel-traffic` and never claims to be a player in server metrics.

### Overhead budget

Measured with the spec 012 load test (30 rooms of 8 players, 1 CPU, 512 MB), telemetry on versus off: p99 relay latency may rise by at most 5 ms, resident memory by at most 96 MB. The measured values are recorded in `docs/OBSERVABILITY.md`.

## Acceptance criteria

- **AC-015-01** A server started without telemetry variables sends no request to an OTLP endpoint, even when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- **AC-015-02** With `TELEMETRY_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` set, the production container image delivers metrics, traces and logs to an OTLP/HTTP receiver.
- **AC-015-03** With `OTEL_SDK_DISABLED=true` and `TELEMETRY_ENABLED=true` nothing is exported.
- **AC-015-04** `OTEL_EXPORTER_OTLP_PROTOCOL=grpc` and `TELEMETRY_ENABLED=maybe` each stop the process with a non-zero exit code and a message naming the variable.
- **AC-015-05** Exported data carries `service.name`, `service.version` and `service.instance.id`; `OTEL_SERVICE_NAME` and `OTEL_RESOURCE_ATTRIBUTES=deployment.environment.name=demo` are reflected.
- **AC-015-06** With one room holding two players and one spectator, the gauges report 1 room, 2 players, 1 spectator and 3 connections; after the room is disposed they report 0.
- **AC-015-07** A game with three players counts one start and one completion and records one game duration; a game whose room is disposed mid-game counts one abort and no completion.
- **AC-015-08** Join attempts are counted by outcome and reason; a join to an unknown room is counted as `validity="excluded"`, a successful join as `validity="valid"`.
- **AC-015-09** A lost socket counts one disconnect with cause `connection_lost`; resuming the seat counts one reconnect and records its duration; a `leave` counts cause `left` and no reconnect.
- **AC-015-10** Guesses are counted as `correct`, `close` or `wrong`, once per guess.
- **AC-015-11** WebSocket messages are counted by type and outcome; a rejected message is counted by its error code, and exceeding the drawing rate limit counts a rate-limit hit with scope `draw`.
- **AC-015-12** Processing a message records the WebSocket message duration; a join records the join duration; a relayed drawing operation records the relay duration.
- **AC-015-13** HTTP requests are measured by method, route template and status; a request to `/r/ABCDEF` or an unknown path is recorded with a route label that does not contain the path.
- **AC-015-14** After 12 rooms have each played a game, no metric label value contains a room code, participant id or nickname, and the application exports at most 600 series.
- **AC-015-15** Process memory, heap usage, CPU time, garbage-collection duration and event-loop delay are exported.
- **AC-015-16** Creating a room, joining, reconnecting, starting a game, guessing and ending a game each produce a span with the documented name, parented to the HTTP or WebSocket span that caused it; a span caused by a timer is a root span.
- **AC-015-17** 640 drawing operations on one connection produce 10 `drawing.relay` spans.
- **AC-015-18** A log line written inside a span carries its `trace_id` and `span_id` on stdout, and the exported log record carries the same ids, the severity and the time.
- **AC-015-19** An exported log record contains only allowlisted attributes; the room code of a `room created` line is absent from it.
- **AC-015-20** After a game played with sentinel values for nickname, chat text, guess, custom word, session token and room code, no exported metric, span or log record contains any of them.
- **AC-015-21** With an unreachable collector a full game completes, and the span queue never holds more than 2048 items.
- **AC-015-22** With a collector that accepts connections and never answers, the process stops within 10 s of `SIGTERM` with exit code 0.
- **AC-015-23** The `shutting down` log record reaches the receiver before the process exits.
- **AC-015-24** `/api/config` answers `{"rum":false}` by default and `POST /api/telemetry` answers 404.
- **AC-015-25** With RUM enabled, a valid report is answered with 204 and its web-vital, error and timing events appear in the corresponding metrics.
- **AC-015-26** A report with an unknown field, more than 20 events or more than 4 KiB is answered with 400 and records nothing; the 31st report within a minute from one address is answered with 429.
- **AC-015-27** The web app sends no request to `/api/telemetry` until the player turns the switch on, and none after turning it off.
- **AC-015-28** A join carrying a valid `traceparent` produces a `room.join` span in that trace; the browser's timing report for it adds a root span with the reported ids. A malformed `traceparent` is ignored.
- **AC-015-29** With RUM switched on, the browser contacts no origin other than the app's own, and the Content-Security-Policy header is unchanged.
- **AC-015-30** The switch and its explanation exist in English, German, Spanish and French.
- **AC-015-31** The Compose stack started from empty volumes has the data sources `prometheus`, `loki` and `tempo`, and Grafana reports each as healthy.
- **AC-015-32** The five dashboards are provisioned with their UIDs, and every metric a panel queries is in the telemetry contract or produced by a provisioned rule.
- **AC-015-33** After the synthetic scenario, Prometheus holds the application metrics under the names documented in `docs/OBSERVABILITY.md`.
- **AC-015-34** After the synthetic scenario, Loki holds log lines of the service with the trace id as structured metadata, and Tempo holds its traces.
- **AC-015-35** One real operation can be followed in all four directions: an exemplar's trace id resolves in Tempo, the trace's log lines are found in Loki, a log line's trace id resolves in Tempo, and the span's metric query returns series in Prometheus.
- **AC-015-36** The alert and recording rules pass `promtool check rules`, and their unit tests pass, including no-data behaviour and minimum-volume guards.
- **AC-015-37** A span and a log record sent to the collector with a disallowed attribute arrive in Tempo and Loki without it.
- **AC-015-38** `docker-compose.yml` defines only the game service and sets no telemetry variable.
- **AC-015-39** Two runs of the traffic generator with the same seed plan the same actions, and a run completes a full game.
- **AC-015-40** The load test with telemetry enabled stays within the overhead budget, and the measured values are recorded in `docs/OBSERVABILITY.md`.
- **AC-015-41** `docs/OBSERVABILITY.md` lists every metric and span of the contract, and `docs/RUNBOOK.md` has a section for every alert.

## Out of scope

gRPC export, automatic instrumentation of third-party modules, session replay, per-player analytics, third-party telemetry endpoints, heartbeat and backpressure metrics (the mechanisms belong to the security and resilience work and do not exist yet), high availability of the backends, production SLO guarantees, Kubernetes manifests (spec 016).
