# Hosting Kritzel

Kritzel is one container that listens on one port and keeps nothing on disk. Everything below is optional except a reverse proxy with TLS when you serve it beyond your own machine.

## Run it

Build the image from a checkout:

```bash
docker build -t kritzel .
```

```bash
docker run -d --name kritzel -p 3000:3000 kritzel
```

Open <http://localhost:3000>. Or use the compose file in the repository root:

```bash
docker compose up -d
```

Once the repository's release workflow has run on `main` or a `v*` tag, the same image is available as `ghcr.io/mistral-valaise/open-skribbl` (`edge` for `main`, `latest` and the version for tags) and `docker build` is no longer needed.

The container runs as a non-root user and writes nothing, so `--read-only` and `--cap-drop ALL` work.

## Configuration

All variables are optional.

| Variable            | Default   | Meaning                                                                                                              |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| `PORT`              | `3000`    | Listening port                                                                                                       |
| `HOST`              | `0.0.0.0` | Listening address                                                                                                    |
| `MAX_ROOMS`         | `500`     | Maximum number of live rooms                                                                                         |
| `TRUST_PROXY`       | `false`   | Set to `true` behind a reverse proxy, so rate limits see the visitor's address instead of the proxy's                |
| `LOG_LEVEL`         | `info`    | `debug`, `info`, `warn` or `error`                                                                                   |
| `TELEMETRY_ENABLED` | `false`   | Set to `true` to export metrics, traces and logs over OTLP/HTTP; see [Observability](#observability)                 |
| `RUM_ENABLED`       | `false`   | Set to `true` to offer players the browser measurement switch and accept its reports; needs `TELEMETRY_ENABLED=true` |

An invalid value stops the container at start-up with a message that names the variable.

## Reverse proxy

The proxy terminates TLS and forwards everything, including the WebSocket at `/ws`, to the container. Set `TRUST_PROXY=true` on Kritzel.

### Caddy

```
kritzel.example.com {
	reverse_proxy kritzel:3000
}
```

Caddy obtains the certificate and upgrades WebSockets on its own. CI plays a game through Caddy in front of the image on every change (with Caddy's own local certificate).

### nginx

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name kritzel.example.com;

    ssl_certificate     /etc/letsencrypt/live/kritzel.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kritzel.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;
    }
}
```

### Traefik (compose labels)

```yaml
services:
  kritzel:
    image: ghcr.io/mistral-valaise/open-skribbl:latest
    environment:
      TRUST_PROXY: 'true'
    labels:
      - traefik.enable=true
      - traefik.http.routers.kritzel.rule=Host(`kritzel.example.com`)
      - traefik.http.routers.kritzel.entrypoints=websecure
      - traefik.http.routers.kritzel.tls.certresolver=letsencrypt
      - traefik.http.services.kritzel.loadbalancer.server.port=3000
```

## Platforms

Kritzel needs a platform that runs a long-lived container and keeps WebSocket connections open. Run exactly **one instance**: rooms live in the memory of one process ([ADR 0001](adr/0001-single-process-in-memory-state.md)), so a second instance would not see the first one's rooms.

| Platform    | What to set                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Fly.io**  | `fly launch` from the repository detects the Dockerfile. Internal port 3000, `TRUST_PROXY=true`, and in `fly.toml`: `auto_stop_machines = false`, `min_machines_running = 1`, one machine. |
| **Railway** | New project from the repository; it builds the Dockerfile. Add the variables `PORT=3000` and `TRUST_PROXY=true`, one replica.                                                              |
| **Render**  | New Web Service from the repository, runtime Docker, health check path `/healthz`, `TRUST_PROXY=true`, one instance. Free instances sleep when idle, which ends running games.             |

These three guides follow each platform's documented Docker workflow; they have not been run end to end as part of this repository's tests.

## Operations

- **Health:** `GET /healthz` answers `200 {"status":"ok"}`. The image has a matching `HEALTHCHECK`.
- **Logs:** one JSON object per line on stdout. They contain room codes and counts, never nicknames, chat text or words.
- **Updates:** pull or rebuild the image and restart. Running games end; players see "The server is restarting".
- **Stopping:** on `SIGTERM` the server tells every participant and exits within seconds.
- **Privacy:** the app makes no request to any other host, sets no cookies, and stores nothing on the server beyond the life of a room.

## Observability

Telemetry is optional and off by default. Without it the server loads no telemetry code and opens no outbound connection. To export metrics, traces and logs to an OpenTelemetry collector over OTLP/HTTP, set:

```
TELEMETRY_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector.example.internal:4318
```

The standard `OTEL_*` variables are honoured; gRPC export is not supported. This is the one case in which the server contacts another host, and only the one you name. Exported telemetry carries counts, durations and fixed label values, never nicknames, chat text, words, drawings or room codes. The health check does not depend on it, and a collector that is down never stops a game.

From a checkout, an optional Compose overlay starts the game with a collector, Prometheus, Loki, Tempo and Grafana, with dashboards and alert rules in place:

```bash
pnpm obs:up
```

Grafana is published on `127.0.0.1:3001` only, with a login. [OBSERVABILITY.md](OBSERVABILITY.md) describes every variable, metric, span and dashboard and the proposed service level objectives; [RUNBOOK.md](RUNBOOK.md) says what to do when an alert fires.

## Capacity

Measured with `pnpm loadtest` against the image limited to 1 CPU and 512 MB (`docker run --cpus 1 --memory 512m`): 30 rooms with 8 players each, every room in a running game for 60 s, drawers sending about ten drawing messages per second and guessers chatting.

| Result                   | Value                                                                   |
| ------------------------ | ----------------------------------------------------------------------- |
| Drawing messages relayed | 126,140 of 126,140                                                      |
| Relay latency            | median 1 ms, 95th percentile 2 ms, 99th percentile 3 ms, maximum 128 ms |
| Dropped connections      | 0                                                                       |
| Memory after the run     | 41 MiB                                                                  |

The client and the server ran on the same machine, so the latency excludes real network delay. A human drawer sends up to about 30 messages per second, three times the simulated rate.
