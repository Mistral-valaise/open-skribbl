import { PROTOCOL_VERSION } from '@kritzel/shared';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

createApp().listen(port, host, () => {
  console.log(
    JSON.stringify({ level: 'info', msg: 'listening', host, port, protocol: PROTOCOL_VERSION }),
  );
});
