import { describe, expect, it } from "vitest";
import {
  mergeServerChildGroups,
  moveChildToGroup,
  openGroupsForRequests,
  partitionChildGroups,
  type ChildGroup,
} from "./child-groups";
import { childGroupCodec } from "./lib/child-group-codec";
import { decodeStoredValue } from "./lib/storage-codec";
import { sidebarThread as thread } from "./test-fixtures";

const group = (overrides: Partial<ChildGroup> = {}): ChildGroup => ({
  id: "background",
  parentThreadId: "parent",
  name: "Background",
  threadIds: ["pr", "runner"],
  collapsed: true,
  ...overrides,
});

describe("child groups", () => {
  it("opens a newly received group for pending input while preserving local collapse choices and other parents", () => {
    const asking = [thread({ id: "pr", parentThreadId: "parent", hasPendingInteraction: true })];
    expect(mergeServerChildGroups([], [group()], asking)[0]!.collapsed).toBe(false);
    const legacy = group({ id: "legacy", parentThreadId: "other", threadIds: [] });
    const merged = mergeServerChildGroups([group(), legacy], [group({ name: "Operations" })], asking);
    expect(merged.find((item) => item.id === "background")!.collapsed).toBe(true);
    expect(merged.find((item) => item.id === "legacy")).toEqual(legacy);
  });

  it("keeps the existing sibling order and separates groups with the same name under different parents", () => {
    const groups = [group(), group({ id: "other-background", parentThreadId: "other", threadIds: ["foreign"] })];
    const siblings = [
      thread({ id: "runner", parentThreadId: "parent" }),
      thread({ id: "new", parentThreadId: "parent" }),
      thread({ id: "pr", parentThreadId: "parent" }),
      thread({ id: "archived", parentThreadId: "parent", isArchived: true }),
    ];
    const result = partitionChildGroups(siblings, groups, "parent");
    expect(result.ungrouped.map((row) => row.id)).toEqual(["new"]);
    expect(result.groups.map((entry) => entry.group.id)).toEqual(["background"]);
    expect(result.groups[0]!.threads.map((row) => row.id)).toEqual(["runner", "pr"]);
    expect(
      partitionChildGroups([thread({ id: "pr", parentThreadId: "other" })], groups, "other").ungrouped[0]!.id,
    ).toBe("pr");
  });

  it("moves a child between its parent's groups or out of a group without changing its parent", () => {
    const child = thread({ id: "pr", parentThreadId: "parent" });
    const groups = [group(), group({ id: "work", threadIds: [] }), group({ id: "foreign", parentThreadId: "other" })];
    expect(moveChildToGroup(groups, child, "foreign")).toBe(groups);
    const moved = moveChildToGroup(groups, child, "work");
    expect(moved[0]!.threadIds).toEqual(["runner"]);
    expect(moved[1]!.threadIds).toEqual(["pr"]);
    expect(moved[1]!.collapsed).toBe(false);
    expect(moveChildToGroup(moved, child, null).every((entry) => !entry.threadIds.includes("pr"))).toBe(true);
    expect(child.parentThreadId).toBe("parent");
  });

  it("opens the affected group for input, including a request below one of its children", () => {
    const groups = [group(), group({ id: "unaffected", threadIds: ["other"] })];
    const threads = [
      thread({ id: "pr", parentThreadId: "parent" }),
      thread({ id: "approval", parentThreadId: "pr", hasPendingInteraction: true }),
      thread({ id: "other", parentThreadId: "parent" }),
    ];
    expect(openGroupsForRequests(groups, threads, new Set(["approval"])).map((entry) => entry.collapsed)).toEqual([
      false,
      true,
    ]);
    expect(openGroupsForRequests(groups, threads, new Set())).toBe(groups);
    expect(openGroupsForRequests(groups, [thread({ id: "pr", parentThreadId: "other" })], new Set(["pr"]))).toBe(
      groups,
    );
  });

  it("round trips group names, membership, order and collapse state, and rejects malformed stored data", () => {
    const groups = [group({ name: "Review & follow-up" }), group({ id: "work", name: "Work", threadIds: [] })];
    expect(decodeStoredValue(childGroupCodec.encode(groups), childGroupCodec)).toEqual(groups);
    for (const stored of ["broken", "{}", '[{"name":"Work"}]', JSON.stringify([groups[0], groups[0]])]) {
      expect(decodeStoredValue(stored, childGroupCodec)).toBeNull();
    }
  });
});
