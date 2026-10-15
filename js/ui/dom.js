// Small DOM helpers shared by the UI modules.
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ICONS = {
  party: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10l-1 9a4 4 0 0 1-8 0z"/><path d="M12 16v5M8 21h8"/></svg>',
  ok: '<svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 16 16"><path d="M8 4v5M8 12v.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  err: '<svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  pb: '<svg viewBox="0 0 16 16"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="currentColor"/></svg>',
  info: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="2.4" fill="currentColor"/></svg>',
};

export function toast(text, { kind = 'info', sub = '', ms = 3200 } = {}) {
  const host = $('#toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="t-icon">${ICONS[kind] || ICONS.info}</span><b>${esc(text)}</b>${sub ? `<span class="dim">${esc(sub)}</span>` : ''}`;
  host.appendChild(el);
  while (host.children.length > 3) host.firstChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 450);
  }, ms);
}

export function copyButtons(root) {
  for (const b of root.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        b.textContent = 'Copied';
      } catch {
        b.textContent = 'Select & copy';
      }
      setTimeout(() => { b.textContent = 'Copy'; }, 1600);
    });
  }
}

/** Animate a number into an element (ease-out). */
export function countUp(el, to, { digits = 0, ms = 900, from = 0 } = {}) {
  const start = performance.now();
  const target = Number(to);
  if (!Number.isFinite(target)) { el.textContent = to; return; }
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const e = 1 - Math.pow(1 - t, 3);
    el.textContent = (from + (target - from) * e).toFixed(digits);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
