# Telemetry is opt-in OpenTelemetry, instrumented by hand

Operators asked to see whether an instance is healthy. We export metrics, traces and logs over OTLP/HTTP, off by default, and instrument the server by hand through one adapter (`apps/server/src/telemetry`) instead of using automatic instrumentation.

The server ships as a single ESM file bundled by esbuild. Automatic instrumentation patches modules as they are loaded; a bundle has no module loads to patch, so it would silently record nothing in the production image while working in development. Fastify hooks and explicit calls at the gateway and the room runtime work the same in both, and they let us decide what is recorded: the adapter takes label values from a fixed contract and log attributes from an allowlist, which is how the privacy goal survives. The OpenTelemetry SDK is imported dynamically and only when `TELEMETRY_ENABLED=true`, so a default start loads none of it and opens no connection.

Rules in `packages/shared` stay pure. The room runtime compares the state before and after each `reduce` call and derives what happened, so a game start is counted once however many clients are told about it.

## Considered options

- **Automatic instrumentation with external dependencies**: stop bundling, ship `node_modules` and preload the SDK. Rejected: a larger image and attack surface, and it records URLs, headers and addresses we would then have to scrub.
- **A Prometheus `/metrics` endpoint**: simple, but covers one signal, adds a route that must be kept private, and leaves traces and logs to another mechanism.
- **Exemplars from the SDK**: the JavaScript metrics SDK we pin (`@opentelemetry/sdk-metrics` 3.1.1) contains no exemplar support. The collector's span-metrics connector derives duration histograms with exemplars from our spans instead; dashboards that link to traces use those.
- **gRPC export**: needs a native-leaning dependency tree for no benefit to a single small server. Not supported; `OTEL_EXPORTER_OTLP_PROTOCOL=grpc` stops start-up with a clear message.

## Consequences

- A new operation is invisible until someone adds it to the contract and calls the adapter. That is deliberate.
- Browser measurements are a second opt-in, by the player, and are reported to the same origin; the server re-emits them, so no browser ever talks to a collector.
- A browser may name the parent of its join span, but the server's sampler decides what is kept. Trace ids chosen by a browser can still be chosen to fall inside a ratio sample; the report rate limit and the bounded queues cap what that can cost.
- Node.js 22.15 or newer is required by the SDK; the image already runs on Node 22.
