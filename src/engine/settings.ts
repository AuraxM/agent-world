/**
 * 全局运行时设置（内存存储，服务重启后恢复默认）。
 * 通过 /api/admin/settings 读写。
 */

export type Language = "zh" | "en" | "ja";

export const SUPPORTED_LANGUAGES: readonly Language[] = ["zh", "en", "ja"];

interface Settings {
  thinkingEnabled: boolean;
  language: Language;
}

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_settings__: Settings | undefined;
}

function read(): Settings {
  if (!globalThis.__agent_world_settings__) {
    globalThis.__agent_world_settings__ = {
      thinkingEnabled: true,
      language: "zh",
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

export function getLanguage(): Language {
  return read().language;
}

export function setLanguage(v: Language): void {
  read().language = v;
}

export function isSupportedLanguage(v: unknown): v is Language {
  return typeof v === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}
