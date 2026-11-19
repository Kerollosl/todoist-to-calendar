import { describe, expect, it } from "vitest";
import { EMPTY_SELECTION, reduceSelection, selectedInOrder, type SelectionAction, type SelectionState } from "../src/core/selection";

const order = ["a", "b", "c", "d", "e"];
const run = (actions: SelectionAction[], start: SelectionState = EMPTY_SELECTION, list = order) =>
  actions.reduce((state, action) => reduceSelection(state, action, list), start);
const ids = (state: SelectionState) => selectedInOrder(state, order);
const click = (id: string, mods: Partial<{ shift: boolean; toggle: boolean }> = {}): SelectionAction => ({
  type: "click",
  id,
  shift: false,
  toggle: false,
  ...mods,
});

describe("click", () => {
  it("toggles a single task", () => {
    expect(ids(run([click("b")]))).toEqual(["b"]);
    expect(ids(run([click("b"), click("b")]))).toEqual([]);
  });
  it("keeps other selections (checkbox semantics)", () => {
    expect(ids(run([click("a"), click("c")]))).toEqual(["a", "c"]);
  });
  it("cmd/ctrl-click adds one without clearing", () => {
    expect(ids(run([click("a"), click("d", { toggle: true })]))).toEqual(["a", "d"]);
  });
  it("ignores tasks that are not visible", () => {
    const state = run([click("a")]);
    expect(run([click("zzz")], state)).toBe(state);
  });
});

describe("shift-click ranges", () => {
  it("adds the range from the anchor, in either direction", () => {
    expect(ids(run([click("b"), click("d", { shift: true })]))).toEqual(["b", "c", "d"]);
    expect(ids(run([click("d"), click("b", { shift: true })]))).toEqual(["b", "c", "d"]);
  });
  it("keeps the anchor so later shift-clicks re-extend from it", () => {
    const state = run([click("b"), click("c", { shift: true }), click("e", { shift: true })]);
    expect(ids(state)).toEqual(["b", "c", "d", "e"]);
    expect(state.anchor).toBe("b");
  });
  it("unions with an existing selection", () => {
    expect(ids(run([click("a"), click("c"), click("e", { shift: true })]))).toEqual(["a", "c", "d", "e"]);
  });
  it("behaves like a click when there is no anchor", () => {
    expect(ids(run([click("c", { shift: true })]))).toEqual(["c"]);
  });
});

describe("keyboard", () => {
  it("moves the cursor without selecting", () => {
    const state = run([{ type: "move", to: "next", extend: false }, { type: "move", to: "next", extend: false }]);
    expect(state.active).toBe("b");
    expect(ids(state)).toEqual([]);
  });
  it("clamps at the ends and supports first/last", () => {
    expect(run([{ type: "move", to: "prev", extend: false }]).active).toBe("a");
    expect(run([{ type: "move", to: "last", extend: false }, { type: "move", to: "next", extend: false }]).active).toBe("e");
    expect(run([{ type: "move", to: "last", extend: false }, { type: "move", to: "first", extend: false }]).active).toBe("a");
  });
  it("Space toggles the task under the cursor", () => {
    const state = run([{ type: "move", to: "next", extend: false }, { type: "move", to: "next", extend: false }, { type: "toggleActive" }]);
    expect(ids(state)).toEqual(["b"]);
    expect(ids(reduceSelection(state, { type: "toggleActive" }, order))).toEqual([]);
  });
  it("shift+arrow extends a range from the anchor", () => {
    const state = run([click("b"), { type: "move", to: "next", extend: true }, { type: "move", to: "next", extend: true }]);
    expect(ids(state)).toEqual(["b", "c", "d"]);
    expect(state.active).toBe("d");
  });
  it("select all and clear", () => {
    expect(ids(run([{ type: "selectAll" }]))).toEqual(order);
    const cleared = run([click("b"), { type: "clear" }]);
    expect(ids(cleared)).toEqual([]);
    expect(cleared.anchor).toBeNull();
    expect(cleared.active).toBe("b");
  });
  it("does nothing on an empty list", () => {
    expect(run([{ type: "move", to: "next", extend: false }, { type: "toggleActive" }], EMPTY_SELECTION, [])).toBe(EMPTY_SELECTION);
  });
});

describe("dragStart", () => {
  it("keeps the selection when dragging a selected task", () => {
    const state = run([click("a"), click("c")]);
    expect(run([{ type: "dragStart", id: "c" }], state)).toBe(state);
  });
  it("selects only the dragged task when it was not selected", () => {
    expect(ids(run([click("a"), click("c"), { type: "dragStart", id: "d" }]))).toEqual(["d"]);
  });
});

describe("sync", () => {
  it("drops selections that are no longer visible", () => {
    const state = run([click("a"), click("c"), click("e")]);
    const synced = reduceSelection(state, { type: "sync" }, ["a", "b", "c"]);
    expect([...synced.selected].sort()).toEqual(["a", "c"]);
    expect(synced.active).toBeNull();
  });
  it("returns the same object when nothing changed", () => {
    const state = run([click("a")]);
    expect(reduceSelection(state, { type: "sync" }, order)).toBe(state);
  });
});

describe("selectedInOrder", () => {
  it("returns selected IDs in visible order regardless of click order", () => {
    expect(ids(run([click("e"), click("a"), click("c")]))).toEqual(["a", "c", "e"]);
  });
});
