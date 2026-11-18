import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { ancestorsOfAskingThreads, threadAsksForInput } from "./child-status";

export interface ChildGroup {
  id: string;
  parentThreadId: string;
  name: string;
  threadIds: string[];
  collapsed: boolean;
}

export function mergeServerChildGroups(
  local: ChildGroup[],
  remote: ChildGroup[],
  threads: readonly PluginSidebarThread[],
): ChildGroup[] {
  const parents = new Set(remote.map((group) => group.parentThreadId));
  const localById = new Map(local.map((group) => [group.id, group]));
  const changed = new Set(
    remote
      .filter((group) => {
        const previous = localById.get(group.id);
        return !previous || group.threadIds.some((id) => !previous.threadIds.includes(id));
      })
      .map((group) => group.id),
  );
  const merged = remote.map((group) => ({
    ...group,
    collapsed: localById.get(group.id)?.collapsed ?? group.collapsed,
  }));
  const opened = new Map(
    openGroupsForRequests(merged, threads, askingThreadIds(threads)).map((group) => [group.id, group]),
  );
  return [
    ...local.filter((group) => !parents.has(group.parentThreadId)),
    ...merged.map((group) => (changed.has(group.id) ? opened.get(group.id)! : group)),
  ];
}

export function partitionChildGroups(
  siblings: readonly PluginSidebarThread[],
  groups: readonly ChildGroup[],
  parentThreadId: string,
) {
  const parentGroups = groups.filter((group) => group.parentThreadId === parentThreadId);
  const assignments = new Map<string, string>();
  for (const group of parentGroups) {
    for (const id of group.threadIds) {
      if (!assignments.has(id)) assignments.set(id, group.id);
    }
  }
  const visible = siblings.filter((thread) => !thread.isArchived);
  return {
    ungrouped: visible.filter((thread) => !assignments.has(thread.id)),
    groups: parentGroups.map((group) => ({
      group,
      threads: visible.filter((thread) => assignments.get(thread.id) === group.id),
    })),
  };
}

export function moveChildToGroup(
  groups: ChildGroup[],
  thread: PluginSidebarThread,
  groupId: string | null,
): ChildGroup[] {
  const target = groups.find((group) => group.id === groupId);
  if (groupId !== null && target?.parentThreadId !== thread.parentThreadId) return groups;
  return groups.map((group) => {
    const threadIds = group.threadIds.filter((id) => id !== thread.id);
    if (group.id === groupId) return { ...group, threadIds: [...threadIds, thread.id], collapsed: false };
    return threadIds.length === group.threadIds.length ? group : { ...group, threadIds };
  });
}

export function askingThreadIds(threads: readonly PluginSidebarThread[]): Set<string> {
  return new Set(
    threads.filter((thread) => !thread.isArchived && threadAsksForInput(thread)).map((thread) => thread.id),
  );
}

export function openGroupsForRequests(
  groups: ChildGroup[],
  threads: readonly PluginSidebarThread[],
  newRequests: ReadonlySet<string>,
): ChildGroup[] {
  if (newRequests.size === 0) return groups;
  const affected = new Set(ancestorsOfAskingThreads(threads, (thread) => newRequests.has(thread.id)));
  for (const id of newRequests) affected.add(id);
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  let changed = false;
  const result = groups.map((group) => {
    const asks = group.threadIds.some(
      (id) => affected.has(id) && byId.get(id)?.parentThreadId === group.parentThreadId,
    );
    if (!group.collapsed || !asks) return group;
    changed = true;
    return { ...group, collapsed: false };
  });
  return changed ? result : groups;
}
