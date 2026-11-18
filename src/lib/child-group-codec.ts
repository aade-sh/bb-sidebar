import type { ChildGroup } from "../child-groups";
import type { PreferenceCodec } from "./use-persisted-preference";

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isGroup(value: unknown): value is ChildGroup {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isText(record.id) &&
    isText(record.parentThreadId) &&
    isText(record.name) &&
    typeof record.collapsed === "boolean" &&
    Array.isArray(record.threadIds) &&
    record.threadIds.every(isText)
  );
}

export const childGroupCodec: PreferenceCodec<ChildGroup[]> = {
  fallback: () => [],
  decode: (stored) => {
    const value: unknown = JSON.parse(stored ?? "null");
    if (!Array.isArray(value) || !value.every(isGroup)) return null;
    return new Set(value.map((group) => group.id)).size === value.length ? value : null;
  },
  encode: JSON.stringify,
};
