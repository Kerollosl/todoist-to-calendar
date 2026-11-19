// Task-list selection as a pure reducer over the currently visible order.
//
//   click            toggles the task (checkbox semantics)
//   cmd/ctrl+click   adds/removes one task (same as click; never clears others)
//   shift+click      adds the range from the anchor to the clicked task
//   ↑/↓ Home/End     move the keyboard cursor; with shift, extend the range
//   Space            toggles the task under the cursor
//   cmd/ctrl+A       selects every visible task
//   dragStart        dragging an unselected task selects just that task

export interface SelectionState {
  readonly selected: ReadonlySet<string>;
  /** Fixed end of shift-ranges. */
  readonly anchor: string | null;
  /** Keyboard cursor (aria-activedescendant). */
  readonly active: string | null;
}

export type SelectionAction =
  | { type: "click"; id: string; shift: boolean; toggle: boolean }
  | { type: "move"; to: "next" | "prev" | "first" | "last"; extend: boolean }
  | { type: "toggleActive" }
  | { type: "selectAll" }
  | { type: "clear" }
  | { type: "dragStart"; id: string }
  | { type: "sync" };

export const EMPTY_SELECTION: SelectionState = { selected: new Set(), anchor: null, active: null };

function range(order: readonly string[], a: string, b: string): string[] {
  const i = order.indexOf(a);
  const j = order.indexOf(b);
  if (i < 0 || j < 0) return [b];
  return order.slice(Math.min(i, j), Math.max(i, j) + 1);
}

function toggled(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function reduceSelection(state: SelectionState, action: SelectionAction, order: readonly string[]): SelectionState {
  switch (action.type) {
    case "click": {
      if (!order.includes(action.id)) return state;
      if (action.shift && state.anchor && order.includes(state.anchor)) {
        const next = new Set(state.selected);
        for (const id of range(order, state.anchor, action.id)) next.add(id);
        return { selected: next, anchor: state.anchor, active: action.id };
      }
      return { selected: toggled(state.selected, action.id), anchor: action.id, active: action.id };
    }
    case "move": {
      if (order.length === 0) return state;
      const current = state.active ? order.indexOf(state.active) : -1;
      const last = order.length - 1;
      const index =
        action.to === "first" ? 0
        : action.to === "last" ? last
        : current < 0 ? 0
        : action.to === "next" ? Math.min(current + 1, last)
        : Math.max(current - 1, 0);
      const active = order[index]!;
      if (!action.extend) return { ...state, active };
      const anchor = state.anchor && order.includes(state.anchor) ? state.anchor : (state.active ?? active);
      const next = new Set(state.selected);
      for (const id of range(order, anchor, active)) next.add(id);
      return { selected: next, anchor, active };
    }
    case "toggleActive": {
      const active = state.active && order.includes(state.active) ? state.active : order[0];
      if (!active) return state;
      return { selected: toggled(state.selected, active), anchor: active, active };
    }
    case "selectAll":
      return { ...state, selected: new Set(order) };
    case "clear":
      return { ...state, selected: new Set(), anchor: null };
    case "dragStart":
      if (state.selected.has(action.id)) return state;
      return { selected: new Set([action.id]), anchor: action.id, active: action.id };
    case "sync": {
      const visible = new Set(order);
      const selected = new Set([...state.selected].filter((id) => visible.has(id)));
      const same = selected.size === state.selected.size;
      const anchor = state.anchor && visible.has(state.anchor) ? state.anchor : null;
      const active = state.active && visible.has(state.active) ? state.active : null;
      if (same && anchor === state.anchor && active === state.active) return state;
      return { selected, anchor, active };
    }
  }
}

/** Selected IDs in visible order (the order tasks are numbered in the event). */
export function selectedInOrder(state: SelectionState, order: readonly string[]): string[] {
  return order.filter((id) => state.selected.has(id));
}
