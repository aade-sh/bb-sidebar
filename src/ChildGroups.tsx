import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useRpc, type PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import {
  askingThreadIds,
  mergeServerChildGroups,
  moveChildToGroup,
  openGroupsForRequests,
  type ChildGroup,
} from "./child-groups";
import type { bbSidebarRpcContract } from "./contract";
import { useSidebarRead } from "./bb-sdk";
import { errorDetail, toast } from "./lib/toast";
import { childGroupCodec } from "./lib/child-group-codec";
import { STORAGE_KEYS } from "./lib/storage-keys";
import { usePersistedPreference } from "./lib/use-persisted-preference";

interface ChildGroupsState {
  groups: ChildGroup[];
  create(parentThreadId: string, name: string): Promise<boolean>;
  move(thread: PluginSidebarThread, groupId: string | null): Promise<boolean>;
  toggle(groupId: string): void;
}

const ChildGroupsContext = createContext<ChildGroupsState | null>(null);

export function ChildGroupsProvider({
  children,
  threads,
  ready,
}: {
  children: ReactNode;
  threads: readonly PluginSidebarThread[];
  ready: boolean;
}) {
  const [groups, setGroups] = usePersistedPreference(STORAGE_KEYS.childGroups.key, childGroupCodec);
  const rpc = useRpc<typeof bbSidebarRpcContract>();
  const { data } = useSidebarRead("getChildGroups");
  useEffect(() => {
    if (data) setGroups((current) => mergeServerChildGroups(current, data.groups, threads));
  }, [data, threads, setGroups]);
  const previousRequests = useRef<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!ready) return;
    const asking = askingThreadIds(threads);
    const added = new Set([...asking].filter((id) => !previousRequests.current.has(id)));
    previousRequests.current = asking;
    setGroups((current) => openGroupsForRequests(current, threads, added));
  }, [threads, ready, setGroups]);
  const value = useMemo<ChildGroupsState>(() => {
    const save = async (parentThreadId: string, parentGroups: ChildGroup[]) => {
      try {
        const saved = await rpc.call("setChildGroups", { parentThreadId, groups: parentGroups });
        setGroups((current) => mergeServerChildGroups(current, saved.groups, threads));
        return true;
      } catch (error) {
        toast.error("Could not save child groups", { description: errorDetail(error) });
        return false;
      }
    };
    return {
      groups,
      create: async (parentThreadId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return false;
        return save(parentThreadId, [
          ...groups.filter((group) => group.parentThreadId === parentThreadId),
          { id: crypto.randomUUID(), parentThreadId, name: trimmed, threadIds: [], collapsed: false },
        ]);
      },
      move: async (thread, groupId) => {
        if (!thread.parentThreadId) return false;
        const next = moveChildToGroup(groups, thread, groupId);
        if (!next.some((group) => group.parentThreadId === thread.parentThreadId)) return true;
        const saved = await save(
          thread.parentThreadId,
          next.filter((group) => group.parentThreadId === thread.parentThreadId),
        );
        if (saved) setGroups((current) => moveChildToGroup(current, thread, groupId));
        return saved;
      },
      toggle: (groupId) =>
        setGroups((current) =>
          current.map((group) => (group.id === groupId ? { ...group, collapsed: !group.collapsed } : group)),
        ),
    };
  }, [groups, setGroups, rpc, threads]);
  return <ChildGroupsContext.Provider value={value}>{children}</ChildGroupsContext.Provider>;
}

export function useChildGroups() {
  return useContext(ChildGroupsContext);
}
