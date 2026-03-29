/** Inject a <style> tag once, identified by an ID. No-op if already injected. */
export function injectStyle(id: string, css: string): void {
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}

/** Remove an element from the DOM by selector. No-op if not found. */
export function removeElement(selector: string): void {
  document.querySelector(selector)?.remove();
}
