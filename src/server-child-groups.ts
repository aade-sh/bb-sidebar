import { childGroupsSchema } from "./contract";
import type { ServerContext, ServerHandlers } from "./server-context";
import { CHILD_GROUPS_TAG } from "./rpc-tags";

const PREFIX = "child-groups:";

export function createServerChildGroups(ctx: ServerContext) {
  const getChildGroups: ServerHandlers["getChildGroups"] = async () => {
    const keys = await ctx.bb.storage.kv.list(PREFIX);
    const rows = await Promise.all(keys.map((key) => ctx.bb.storage.kv.get(key)));
    const groups = rows.flatMap((row) => childGroupsSchema.parse(row));
    return { groups };
  };
  const setChildGroups: ServerHandlers["setChildGroups"] = async ({ parentThreadId, groups }) => {
    await ctx.bb.sdk.threads.get({ threadId: parentThreadId });
    if (groups.some((group) => group.parentThreadId !== parentThreadId)) {
      throw new Error("Groups must belong to the selected parent");
    }
    const members = await Promise.all(
      groups.flatMap((group) => group.threadIds).map((threadId) => ctx.bb.sdk.threads.get({ threadId })),
    );
    if (members.some((thread) => thread.parentThreadId !== parentThreadId || thread.archivedAt !== null)) {
      throw new Error("Group members must be unarchived children of the selected parent");
    }
    await ctx.bb.storage.kv.set(PREFIX + parentThreadId, groups);
    ctx.bb.rpc.experimental_invalidate([CHILD_GROUPS_TAG]);
    return { groups };
  };
  return { getChildGroups, setChildGroups };
}
