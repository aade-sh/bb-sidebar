// @vitest-environment jsdom
import { expect, it } from "vitest";
import { fireEvent, within } from "@testing-library/react";
import { createWired } from "./test-wired";
import { thread, loadInboxApp } from "./test-inbox";
import { STORAGE_KEYS } from "./lib/storage-keys";

await loadInboxApp();

it("shows an agent's saved groups in two clients while keeping collapse state local", async () => {
  localStorage.setItem(STORAGE_KEYS.childExpansion.key, JSON.stringify(["parent"]));
  const wired = await createWired([
    thread({ id: "parent", title: "Planner", updatedAt: Date.now() }),
    thread({ id: "child", title: "PR desk", parentThreadId: "parent", updatedAt: Date.now() }),
  ]);
  const first = wired.mount();
  const second = wired.mount();
  await within(first.container).findByText("Planner");
  await within(second.container).findByText("Planner");
  const saved = {
    id: "background",
    name: "Background",
    parentThreadId: "parent",
    threadIds: ["child"],
    collapsed: false,
  };
  await wired.call("setChildGroups", { parentThreadId: "parent", groups: [saved] });
  const a = await within(first.container).findByRole("button", { name: "Background, 1 child thread" });
  const b = await within(second.container).findByRole("button", { name: "Background, 1 child thread" });
  fireEvent.click(a);
  expect(a.getAttribute("aria-expanded")).toBe("false");
  expect(b.getAttribute("aria-expanded")).toBe("true");
  await wired.call("setChildGroups", { parentThreadId: "parent", groups: [{ ...saved, name: "Operations" }] });
  expect(
    (await within(first.container).findByRole("button", { name: "Operations, 1 child thread" })).getAttribute(
      "aria-expanded",
    ),
  ).toBe("false");
  expect(
    (await within(second.container).findByRole("button", { name: "Operations, 1 child thread" })).getAttribute(
      "aria-expanded",
    ),
  ).toBe("true");
  expect(wired.harness.inspection.sdk.callsTo("threads.update")).toEqual([]);
});
