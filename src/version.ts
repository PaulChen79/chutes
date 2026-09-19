declare const __CHUTES_VERSION__: string;

/** Injected from package.json at build time so the two can never drift. */
export const version = typeof __CHUTES_VERSION__ === "string" ? __CHUTES_VERSION__ : "0.0.0-dev";
