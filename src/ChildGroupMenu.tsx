import { useId, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { useSidebarThreads } from "./bb-sdk";
import { useChildGroups } from "./ChildGroups";
import { Icon } from "./components/Icon";
import { usePortalScopeProps } from "./lib/portal-scope";
import { primaryButtonClass, secondaryButtonClass } from "./settings-ui";

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-[0.3125rem] text-xs outline-none data-[highlighted]:bg-accent";

export function ChildGroupMenu({ thread, onCreate }: { thread: PluginSidebarThread; onCreate: () => void }) {
  const state = useChildGroups();
  const { threads } = useSidebarThreads();
  const portalScope = usePortalScopeProps();
  if (!state) return null;
  const ownGroups = state.groups.filter((group) => group.parentThreadId === thread.id);
  const parentGroups = state.groups.filter((group) => group.parentThreadId === thread.parentThreadId);
  const membership = parentGroups.find((group) => group.threadIds.includes(thread.id));
  const hasChildren = threads.some((child) => child.parentThreadId === thread.id && !child.isArchived);
  return (
    <>
      {hasChildren || ownGroups.length > 0 ? (
        <ContextMenu.Item className={itemClass} onSelect={onCreate}>
          New group…
        </ContextMenu.Item>
      ) : null}
      {thread.parentThreadId ? (
        <ContextMenu.Sub>
          <ContextMenu.SubTrigger className={itemClass}>
            Move to group
            <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" aria-hidden />
          </ContextMenu.SubTrigger>
          <ContextMenu.Portal>
            <ContextMenu.SubContent
              {...portalScope}
              aria-label="Move to group"
              sideOffset={4}
              className="z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {parentGroups.map((group) => (
                <ContextMenu.CheckboxItem
                  key={group.id}
                  className={itemClass}
                  checked={membership?.id === group.id}
                  onSelect={() => state.move(thread, group.id)}
                >
                  <ContextMenu.ItemIndicator>
                    <Icon name="Check" className="size-3" />
                  </ContextMenu.ItemIndicator>
                  {group.name}
                </ContextMenu.CheckboxItem>
              ))}
              <ContextMenu.CheckboxItem
                className={itemClass}
                checked={!membership}
                onSelect={() => state.move(thread, null)}
              >
                <ContextMenu.ItemIndicator>
                  <Icon name="Check" className="size-3" />
                </ContextMenu.ItemIndicator>
                No group
              </ContextMenu.CheckboxItem>
            </ContextMenu.SubContent>
          </ContextMenu.Portal>
        </ContextMenu.Sub>
      ) : null}
    </>
  );
}

export function NewChildGroupDialog({
  thread,
  open,
  onOpenChange,
}: {
  thread: PluginSidebarThread;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const state = useChildGroups();
  const [name, setName] = useState("");
  const inputId = useId();
  const portalScope = usePortalScopeProps();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          {...portalScope}
          onContextMenu={(event) => event.stopPropagation()}
          className="fixed left-1/2 top-1/2 z-50 w-72 max-w-[calc(100%_-_2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg"
        >
          <Dialog.Title className="text-sm font-semibold">New group</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-muted-foreground">
            Add a child group to {thread.displayTitle || thread.title}.
          </Dialog.Description>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              if (!name.trim() || !state) return;
              if (!(await state.create(thread.id, name))) return;
              setName("");
              onOpenChange(false);
            }}
          >
            <label htmlFor={inputId} className="mt-3 block text-xs">
              Group name
            </label>
            <input
              id={inputId}
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Dialog.Close asChild>
                <button type="button" className={secondaryButtonClass}>
                  Cancel
                </button>
              </Dialog.Close>
              <button type="submit" disabled={!name.trim()} className={primaryButtonClass}>
                Create
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
