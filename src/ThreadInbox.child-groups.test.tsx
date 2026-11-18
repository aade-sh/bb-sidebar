// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { renderSlot } from "./test-slot";
import { inbox, listProps, thread, loadInboxApp, defaultSidebarSettings } from "./test-inbox";
import { ChildGroupsProvider } from "./ChildGroups";
import { ChildThreadList, childThreadsByParent } from "./ChildThreadList";
import { STORAGE_KEYS } from "./lib/storage-keys";
import type { ChildGroup } from "./child-groups";

await loadInboxApp();

const fixtures = [
  thread({ id: "parent", title: "Sync planner" }),
  thread({ id: "pr", title: "PR desk", parentThreadId: "parent", createdAt: 100 }),
  thread({ id: "runner", title: "Runner", parentThreadId: "parent", createdAt: 200 }),
  thread({ id: "other", title: "Other parent" }),
  thread({ id: "foreign", title: "Other child", parentThreadId: "other" }),
];
const initialGroups: ChildGroup[] = [
  { id: "background", name: "Background", parentThreadId: "parent", threadIds: ["pr", "runner"], collapsed: true },
  { id: "work", name: "Work", parentThreadId: "parent", threadIds: [], collapsed: false },
  { id: "foreign-group", name: "Other group", parentThreadId: "other", threadIds: ["foreign"], collapsed: false },
];

function seedGroups() {
  localStorage.setItem(STORAGE_KEYS.childGroups.key, JSON.stringify(initialGroups));
}

function ChildFixture({
  threads,
  expanded = true,
  activeThreadId = null,
}: {
  threads: PluginSidebarThread[];
  expanded?: boolean;
  activeThreadId?: string | null;
}) {
  const byParent = childThreadsByParent(threads, { field: "created", direction: "descending" });
  return (
    <ChildGroupsProvider threads={threads} ready>
      <ChildThreadList
        threads={byParent.get("parent") ?? []}
        childrenByParent={byParent}
        expanded={expanded}
        activeThreadId={activeThreadId}
        parentProjectId="proj_1"
        onThreadOpen={() => {}}
        now={200}
      />
    </ChildGroupsProvider>
  );
}

function childFixture(threads = fixtures) {
  return renderSlot({ component: ChildFixture }, { threads }, { sidebarThreads: { threads } });
}

function fullFixture() {
  let serverGroups: ChildGroup[] = [];
  localStorage.setItem(STORAGE_KEYS.childExpansion.key, JSON.stringify(["parent", "other"]));
  return renderSlot(inbox, listProps, {
    sidebarThreads: {
      threads: fixtures,
      projects: [{ id: "proj_1", name: "Demo", isPersonal: false, href: "", settingsHref: "" }],
    },
    rpc: {
      getChildGroups: () => ({ groups: serverGroups }),
      setChildGroups: (input) => {
        const saved = input as { parentThreadId: string; groups: ChildGroup[] };
        serverGroups = [
          ...serverGroups.filter((group) => group.parentThreadId !== saved.parentThreadId),
          ...saved.groups,
        ];
        return { groups: saved.groups };
      },
      listLifecycle: () => ({ rows: [] }),
      getSidebarSettings: () => ({ ...defaultSidebarSettings, inactiveThreadsEnabled: false }),
    },
  });
}

describe("parent child groups", () => {
  it("keeps the selected child visible and reads another plugin's working status through the existing resolver", () => {
    seedGroups();
    renderSlot(
      { component: ChildFixture },
      { threads: fixtures, activeThreadId: "pr" },
      {
        sidebarThreads: { threads: fixtures },
        sidebarRowStatuses: { runner: { icon: "Eye", label: "Monitoring", tone: "running" } },
      },
    );
    expect(
      screen.getByRole("button", { name: /Background, 2 child threads, 1 working/ }).getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getByRole("link", { name: /^Open child thread: PR desk/ }).getAttribute("aria-current")).toBe("page");
  });

  it("opens only the affected group for a new question and allows a later manual collapse", async () => {
    seedGroups();
    const rendered = childFixture();
    expect(screen.getByRole("button", { name: /^Background,/ }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("link", { name: /^Open child thread: PR desk/ })).toBeNull();
    const asking = fixtures.map((row) => (row.id === "pr" ? { ...row, hasPendingInteraction: true } : row));
    rendered.lifecycle.rerender(<ChildFixture threads={asking} />);
    await screen.findByRole("link", { name: "Open child thread: PR desk, Needs you" });
    const badge = screen.getByRole("button", { name: /^Background,/ });
    expect(badge.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByRole("button", { name: /^Other group,/ })).toBeNull();
    fireEvent.click(badge);
    expect(badge.getAttribute("aria-expanded")).toBe("false");
    rendered.lifecycle.rerender(<ChildFixture threads={[...asking]} />);
    expect(badge.getAttribute("aria-expanded")).toBe("false");
    rendered.lifecycle.rerender(<ChildFixture threads={fixtures} />);
    rendered.lifecycle.rerender(<ChildFixture threads={asking} />);
    await waitFor(() => expect(badge.getAttribute("aria-expanded")).toBe("true"));
  });

  it("retains collapse state and existing child sorting after remounting", () => {
    seedGroups();
    let rendered = childFixture();
    fireEvent.click(screen.getByRole("button", { name: /^Background,/ }));
    expect(
      within(screen.getByRole("list", { name: "Background child threads" }))
        .getAllByRole("link")
        .map((row) => row.textContent),
    ).toEqual([expect.stringContaining("Runner"), expect.stringContaining("PR desk")]);
    rendered.lifecycle.unmount();
    rendered = childFixture();
    expect(screen.getByRole("button", { name: /^Background,/ }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /^Background,/ }));
    rendered.lifecycle.rerender(<ChildFixture threads={fixtures} expanded={false} />);
    expect(screen.queryByRole("button", { name: /^Background,/ })).toBeNull();
    rendered.lifecycle.unmount();
    childFixture();
    expect(screen.getByRole("button", { name: /^Background,/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("creates a named group through the parent's existing menu and keeps other parents separate", async () => {
    const rendered = fullFixture();
    fireEvent.contextMenu(await screen.findByText("Sync planner"));
    fireEvent.click(await screen.findByRole("menuitem", { name: "New group…" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Group name" }), { target: { value: "Review" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await screen.findByRole("button", { name: "Review, 0 child threads" });
    fireEvent.contextMenu(screen.getByText("Other child"));
    fireEvent.keyDown(await screen.findByRole("menuitem", { name: "Move to group" }), { key: "ArrowRight" });
    const menu = await screen.findByRole("menu", { name: "Move to group" });
    expect(within(menu).queryByText("Review")).toBeNull();
    expect(rendered.rpcCalls.some((call) => call.method === "setThreadParent")).toBe(false);
  });

  it("moves a child through the existing menu without losing row links or changing parentage", async () => {
    seedGroups();
    localStorage.setItem(
      STORAGE_KEYS.childGroups.key,
      JSON.stringify(initialGroups.map((group) => ({ ...group, collapsed: false }))),
    );
    const rendered = fullFixture();
    fireEvent.contextMenu(await screen.findByText("PR desk"));
    fireEvent.keyDown(await screen.findByRole("menuitem", { name: "Move to group" }), { key: "ArrowRight" });
    const menu = await screen.findByRole("menu", { name: "Move to group" });
    expect(within(menu).queryByText("Other group")).toBeNull();
    fireEvent.click(within(menu).getByRole("menuitemcheckbox", { name: "Work" }));
    const work = await screen.findByRole("list", { name: "Work child threads" });
    const row = within(work).getByRole("link", { name: "Open child thread: PR desk" });
    expect(row.getAttribute("href")).toBe("/projects/proj_1/threads/pr");
    fireEvent.click(row);
    expect(rendered.linkCalls).toContainEqual({ href: "/projects/proj_1/threads/pr", split: false });
    expect(rendered.rpcCalls.some((call) => call.method === "setThreadParent")).toBe(false);
  });
});
