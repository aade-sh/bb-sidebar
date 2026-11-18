import { describe, expect, it } from "vitest";
import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { bbSidebarRpcContract } from "./contract";
import { createServerChildGroups } from "./server-child-groups";

const group = (parentThreadId: string, threadId: string) => ({
  id: "group-" + parentThreadId,
  parentThreadId,
  name: "Background",
  threadIds: [threadId],
  collapsed: true,
});
const factory = (bb: BbPluginApi) => {
  bb.rpc.register(
    {
      getChildGroups: bbSidebarRpcContract.getChildGroups,
      setChildGroups: bbSidebarRpcContract.setChildGroups,
    },
    createServerChildGroups({ bb, db: bb.storage.database() }),
  );
};

describe("saved child groups", () => {
  it("persists per-parent groups across reload and does not change thread parentage", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "bb-sidebar",
      sdk: {
        threads: {
          get: async ({ threadId }) =>
            makeThreadResponse({
              id: threadId,
              parentThreadId: threadId.startsWith("child-") ? threadId.slice(6) : null,
            }),
        },
      },
    });
    factory(bb);
    await harness.behavior.callRpc("setChildGroups", { parentThreadId: "one", groups: [group("one", "child-one")] });
    await harness.behavior.callRpc("setChildGroups", { parentThreadId: "two", groups: [group("two", "child-two")] });
    const restored = (await harness.lifecycle.reload(factory)).harness;
    const saved = await restored.behavior.callRpc("getChildGroups", {});
    expect(saved).toEqual({ groups: [group("one", "child-one"), group("two", "child-two")] });
    expect(harness.inspection.sdk.callsTo("threads.update")).toEqual([]);
    await restored.lifecycle.dispose();
  });

  it("rejects a foreign child or duplicate membership without changing the saved groups", async () => {
    const { bb, harness } = createFakePluginHost({
      pluginId: "bb-sidebar",
      sdk: {
        threads: {
          get: async ({ threadId }) =>
            makeThreadResponse({
              id: threadId,
              parentThreadId: threadId === "child" ? "one" : "other",
            }),
        },
      },
    });
    factory(bb);
    const valid = group("one", "child");
    await harness.behavior.callRpc("setChildGroups", { parentThreadId: "one", groups: [valid] });
    await expect(
      harness.behavior.callRpc("setChildGroups", {
        parentThreadId: "one",
        groups: [group("one", "foreign")],
      }),
    ).rejects.toThrow("unarchived children");
    await expect(
      harness.behavior.callRpc("setChildGroups", {
        parentThreadId: "one",
        groups: [valid, { ...valid, id: "duplicate" }],
      }),
    ).rejects.toThrow("rpc input validation failed");
    expect(await harness.behavior.callRpc("getChildGroups", {})).toEqual({ groups: [valid] });
    await harness.lifecycle.dispose();
  });
});
