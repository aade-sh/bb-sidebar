import { useId, type ReactNode } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { childStatusPhrase, childStatusSummary, childSubtree, type ThreadWorking } from "./child-status";
import { partitionChildGroups, type ChildGroup } from "./child-groups";
import { useChildGroups } from "./ChildGroups";
import { Icon } from "./components/Icon";

export function ChildThreadGroupRows({
  threads,
  childrenByParent,
  isWorking,
  activeThreadId,
  renderRows,
}: {
  threads: readonly PluginSidebarThread[];
  childrenByParent: ReadonlyMap<string, readonly PluginSidebarThread[]>;
  isWorking: ThreadWorking;
  activeThreadId: string | null | undefined;
  renderRows: (threads: readonly PluginSidebarThread[]) => ReactNode;
}) {
  const state = useChildGroups();
  const parentThreadId = threads[0]?.parentThreadId;
  if (!state || !parentThreadId) return renderRows(threads);
  const partition = partitionChildGroups(threads, state.groups, parentThreadId);
  if (partition.groups.length === 0) return renderRows(threads);
  return (
    <>
      {renderRows(partition.ungrouped)}
      {partition.groups.map(({ group, threads: members }) => (
        <ChildGroupRows
          key={group.id}
          group={group}
          threads={members}
          childrenByParent={childrenByParent}
          isWorking={isWorking}
          activeThreadId={activeThreadId}
          onToggle={() => state.toggle(group.id)}
        >
          {renderRows(members)}
        </ChildGroupRows>
      ))}
    </>
  );
}

function ChildGroupRows({
  group,
  threads,
  childrenByParent,
  isWorking,
  activeThreadId,
  onToggle,
  children,
}: {
  group: ChildGroup;
  threads: readonly PluginSidebarThread[];
  childrenByParent: ReadonlyMap<string, readonly PluginSidebarThread[]>;
  isWorking: ThreadWorking;
  activeThreadId: string | null | undefined;
  onToggle: () => void;
  children: ReactNode;
}) {
  const controls = useId();
  const subtree = childSubtree(threads, childrenByParent);
  const summary = childStatusSummary(subtree, isWorking);
  const expanded = !group.collapsed || subtree.some((thread) => thread.id === activeThreadId);
  const phrase = childStatusPhrase(summary);
  const needsYou = summary.needsYou > 0 ? `${summary.needsYou} need${summary.needsYou === 1 ? "s" : ""} you` : null;
  return (
    <li className="list-none">
      <button
        type="button"
        aria-label={`${group.name}, ${threads.length} child thread${threads.length === 1 ? "" : "s"}${phrase}`}
        aria-expanded={expanded}
        aria-controls={controls}
        onClick={onToggle}
        className="flex h-7 w-full items-center gap-1 rounded-md px-1.5 text-xs text-muted-foreground outline-none hover:bg-sidebar-accent/60 focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Icon name={expanded ? "ChevronDown" : "ChevronRight"} className="size-3 shrink-0" aria-hidden />
        <span className="min-w-0 truncate font-medium">{group.name}</span>
        <span className="shrink-0 tabular-nums">({threads.length})</span>
        {needsYou ? (
          <span className="ml-auto shrink-0 text-2xs text-[color:var(--bb-sidebar-tone-pending)]">{needsYou}</span>
        ) : null}
      </button>
      {expanded ? (
        <ul
          id={controls}
          aria-label={`${group.name} child threads`}
          className="ml-3 flex flex-col border-l border-border"
        >
          {threads.length > 0 ? children : <li className="px-2 py-1 text-2xs text-muted-foreground">No threads</li>}
        </ul>
      ) : null}
    </li>
  );
}
