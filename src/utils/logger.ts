// Thin logging facade so call sites don't reach for `console` directly.
// `debug`/`info` are silenced in production builds; `warn`/`error` always
// surface so real problems remain visible in the field.
const isDev = import.meta.env.DEV;

type LogArgs = unknown[];

export const logger = {
  debug: (...args: LogArgs) => {
    if (isDev) console.debug(...args);
  },
  info: (...args: LogArgs) => {
    if (isDev) console.info(...args);
  },
  warn: (...args: LogArgs) => console.warn(...args),
  error: (...args: LogArgs) => console.error(...args),
};
