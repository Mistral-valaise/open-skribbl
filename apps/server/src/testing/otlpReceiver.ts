import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface OtlpRequest {
  /** `/v1/traces`, `/v1/metrics` or `/v1/logs`. */
  path: string;
  contentType: string;
  /** Parsed when the exporter sent JSON, otherwise the raw bytes as latin1 text. */
  body: unknown;
}

export interface OtlpReceiver {
  url: string;
  requests: OtlpRequest[];
  /** Everything received, as one string, for "does not contain" checks. */
  text(): string;
  of(path: string): OtlpRequest[];
  close(): Promise<void>;
}

/**
 * A minimal OTLP/HTTP endpoint for tests: independent of the application and
 * of the OpenTelemetry SDK, it only records what arrives. With `hang` it
 * accepts connections and never answers.
 */
export async function startOtlpReceiver(options: { hang?: boolean } = {}): Promise<OtlpReceiver> {
  const requests: OtlpRequest[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks);
      const contentType = request.headers['content-type'] ?? '';
      let body: unknown = raw.toString('latin1');
      if (contentType.includes('json')) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          // Keep the raw text.
        }
      }
      requests.push({ path: request.url ?? '', contentType, body });
      if (options.hang) return;
      response.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    text: () => JSON.stringify(requests),
    of: (path) => requests.filter((request) => request.path === path),
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Resource attributes of the first OTLP/JSON request on `path`, as a plain object. */
export function resourceAttributes(receiver: OtlpReceiver, path: string): Record<string, unknown> {
  const body = receiver.of(path)[0]?.body as Record<string, unknown[]> | undefined;
  const key = Object.keys(body ?? {}).find((name) => name.startsWith('resource'));
  const first = (key ? body![key]![0] : undefined) as
    { resource?: { attributes?: { key: string; value: Record<string, unknown> }[] } } | undefined;
  return Object.fromEntries(
    (first?.resource?.attributes ?? []).map(({ key: name, value }) => [
      name,
      Object.values(value)[0],
    ]),
  );
}
