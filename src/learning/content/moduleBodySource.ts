// Phase L.6a — where the Reader gets a module body. In the app this IS the API transport (moduleBodySource.server.ts). The test
// environment resolves this one file to moduleBodySource.bundled.ts (vite.config.ts, VITEST only), so the many suites that read
// the real book keep reading the authored content without a server; the API transport has its own suites.
export { loadModuleBody } from "./moduleBodySource.server";
