import os from "node:os";

/**
 * argon2 hashing runs on libuv's threadpool (default: 4 threads), so on bigger
 * machines logins queue behind 4 workers. Size it to the CPU count unless the
 * operator chose a value. Must be imported first, before any threadpool work.
 */
process.env.UV_THREADPOOL_SIZE ??= String(Math.max(4, os.availableParallelism()));
