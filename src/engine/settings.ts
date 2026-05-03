/**
 * 全局运行时设置（内存存储，服务重启后恢复默认）。
 * 通过 /api/admin/settings 读写。
 */

interface Settings {
  thinkingEnabled: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_settings__: Settings | undefined;
}

function read(): Settings {
  if (!globalThis.__agent_world_settings__) {
    globalThis.__agent_world_settings__ = {
      thinkingEnabled: true,
    };
  }
  return globalThis.__agent_world_settings__;
}

export function getThinkingEnabled(): boolean {
  return read().thinkingEnabled;
}

export function setThinkingEnabled(v: boolean): void {
  read().thinkingEnabled = v;
}
