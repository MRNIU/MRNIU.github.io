import en from "./en.json";
import zhCN from "./zh-CN.json";

const locales: Record<string, typeof en> = {
  en,
  "zh-CN": zhCN,
};

type Messages = typeof en;

export function getMessages(locale: string): Messages {
  return locales[locale] || locales.en;
}

export function t(messages: Messages, key: string, vars?: Record<string, string>): string {
  const keys = key.split(".");
  let value: any = messages;
  for (const k of keys) {
    value = value?.[k];
    if (value === undefined) return key;
  }
  if (typeof value !== "string") return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(`{${k}}`, v);
    }
  }
  return value;
}
