// Keyboard "firewall". Calendar has single-key shortcuts (c, d, w, /, …). Our UI
// lives in a closed shadow root, so to Calendar every key typed into our search
// box looks like it came from our host element and could trigger a shortcut.
//
// So we listen on window in the capture phase, which runs before Calendar's own
// listeners. Keydowns go to our handlers (top of the stack first). Any key event
// that comes from our UI is then stopped, so Calendar never sees it. Stopping
// propagation does not cancel default actions, so typing, Tab focus and button
// activation still work.

export type KeyHandler = (event: KeyboardEvent, fromUi: boolean) => boolean;

const stack: KeyHandler[] = [];

export function pushKeyHandler(handler: KeyHandler): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index >= 0) stack.splice(index, 1);
  };
}

export function installKeyFirewall(isFromUi: (event: Event) => boolean): void {
  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent)) return;
    const fromUi = isFromUi(event);
    if (event.type === "keydown") {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]?.(event, fromUi)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
    }
    if (fromUi) event.stopImmediatePropagation();
  };
  for (const type of ["keydown", "keypress", "keyup"]) window.addEventListener(type, onKey, true);
}
