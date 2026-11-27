import { z } from 'zod';

// Zod can compile schemas with `new Function`. The app's Content-Security-
// Policy forbids that, and merely probing for it logs a violation in the
// browser, so the interpreter is used everywhere.
z.config({ jitless: true });

export { z };
