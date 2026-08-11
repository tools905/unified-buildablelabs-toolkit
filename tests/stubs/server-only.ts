// Vitest runs in Node, not Next.js's bundler, so the real "server-only"
// package (which Next.js provides at build time) isn't resolvable here.
// Aliased in vitest.config.ts so services that import "server-only" can
// still be unit tested directly.
export {};
