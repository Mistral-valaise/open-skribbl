/**
 * W3C Trace Context for one join or reconnect attempt (spec 015): the server
 * makes its join span a child of it, and the browser's timing report names
 * the same ids. The ids are random and say nothing about the browser.
 */

/** Fills the array with random bytes, like `crypto.getRandomValues`. */
export type RandomBytes = (bytes: Uint8Array<ArrayBuffer>) => void;

const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

function randomHex(length: number, random: RandomBytes): string {
  const bytes = new Uint8Array(length);
  random(bytes);
  // An id of zeros is invalid, and the server would ignore the whole value.
  if (bytes.every((byte) => byte === 0)) bytes[length - 1] = 1;
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `00-<trace id>-<span id>-01`: version 00, sampled. */
export function createTraceparent(
  random: RandomBytes = (bytes) => void crypto.getRandomValues(bytes),
): string {
  return `00-${randomHex(TRACE_ID_BYTES, random)}-${randomHex(SPAN_ID_BYTES, random)}-01`;
}
