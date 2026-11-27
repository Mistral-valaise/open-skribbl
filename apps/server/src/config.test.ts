import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

describe('configuration (spec 012)', () => {
  it('uses the documented defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      host: '0.0.0.0',
      maxRooms: 500,
      trustProxy: false,
      logLevel: 'info',
    });
  });

  it('AC-012-02: PORT sets the listening port', () => {
    expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  });

  it('AC-012-04: an invalid value stops start-up with a message naming the variable', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadConfig({ MAX_ROOMS: '0' })).toThrow(/MAX_ROOMS/);
    expect(() => loadConfig({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
    expect(() => loadConfig({ LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });
});
