type Attrs = Record<string, string | number | boolean | undefined>;

/** Tiny element builder: h('div', { class: 'x' }, child, 'text'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  el.append(...children);
  return el;
}

export function html(markup: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as HTMLElement;
}

export const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Fire on a single, primary touch/click. A resting palm or second finger
 * is ignored.
 */
export function onTap(el: HTMLElement, fn: (e: PointerEvent) => void): void {
  el.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0) return;
    e.preventDefault();
    fn(e);
  });
  // Keyboard activation (Enter/Space) arrives as a click with no pointer.
  el.addEventListener('click', (e) => {
    if (e.detail === 0) fn(e as PointerEvent);
  });
}
