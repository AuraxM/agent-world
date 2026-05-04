export interface Logger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export function createLogger(component: string): Logger {
  const prefix = `[${component}]`;

  function format(message: string, context?: Record<string, unknown>): string {
    if (context && Object.keys(context).length > 0) {
      return `${prefix} ${message} ${JSON.stringify(context)}`;
    }
    return `${prefix} ${message}`;
  }

  return {
    info(message, context) {
      console.log(format(message, context));
    },
    warn(message, context) {
      console.warn(format(message, context));
    },
    error(message, context) {
      console.error(format(message, context));
    },
  };
}
