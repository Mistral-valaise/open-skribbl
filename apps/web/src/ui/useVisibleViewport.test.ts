import { describe, expect, it } from 'vitest';
import { isTyping, TallestTracker } from './useVisibleViewport.js';

describe('typing layout (spec 011)', () => {
  it('AC-011-17: a phone whose visible height drops by a keyboard is typing', () => {
    expect(isTyping({ width: 360, height: 740, tallest: 740 })).toBe(false);
    expect(isTyping({ width: 360, height: 330, tallest: 740 })).toBe(true);
    // A large phone with a small keyboard: plenty of pixels left, still typing.
    expect(isTyping({ width: 412, height: 560, tallest: 860 })).toBe(true);
  });

  it('AC-011-19: the browser hiding its address bar is not a keyboard', () => {
    expect(isTyping({ width: 360, height: 684, tallest: 740 })).toBe(false);
    expect(isTyping({ width: 360, height: 621, tallest: 740 })).toBe(false);
    expect(isTyping({ width: 360, height: 620, tallest: 740 })).toBe(true);
  });

  it('a small phone without a keyboard keeps the full layout', () => {
    expect(isTyping({ width: 320, height: 460, tallest: 460 })).toBe(false);
  });

  it('a page loaded at a very short height is typing even without a taller one seen', () => {
    expect(isTyping({ width: 360, height: 351, tallest: 351 })).toBe(true);
    expect(isTyping({ width: 360, height: 352, tallest: 352 })).toBe(false);
  });

  it('from tablet width the layout never switches', () => {
    expect(isTyping({ width: 640, height: 300, tallest: 900 })).toBe(false);
    expect(isTyping({ width: 1280, height: 300, tallest: 900 })).toBe(false);
  });

  it('the tallest height is remembered per width, so a rotation starts over', () => {
    const tracker = new TallestTracker();
    expect(tracker.update(360, 740)).toBe(740);
    expect(tracker.update(360, 330)).toBe(740);
    expect(tracker.update(360, 760)).toBe(760);
    // Landscape: another width, another baseline.
    expect(tracker.update(740, 360)).toBe(360);
    expect(tracker.update(360, 330)).toBe(330);
  });
});
