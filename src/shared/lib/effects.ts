/**
 * Efectos visuales globales. Solo presentación: no leen ni escriben datos, no llaman al backend
 * y no cambian ningún flujo. Se activan una vez desde main.tsx con initEffects().
 *
 *  1. Tooltips animados (reemplazan al "title" nativo en todo el sistema).
 *  2. Animación de salida de modales, drawers y calendario.
 *  3. Indicador deslizante en los chips de filtro (Todos / Por recibir / …).
 *  4. Resaltado de filas que cambian por tiempo real + aviso "Datos actualizados".
 *  5. Check de confirmación en botones que terminan de guardar.
 *  6. Transición suave entre páginas (View Transitions) con sidebar y topbar fijos.
 */

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function make<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Transición entre páginas
// ─────────────────────────────────────────────────────────────────────────────
let routeDone: (() => void) | null = null;
let bypass = false;

/** Lo llama App cuando la nueva ruta ya se pintó: así la transición espera a que la página esté lista. */
export function notifyRouteRendered() {
    const done = routeDone;
    routeDone = null;
    done?.();
}

function initPageTransitions() {
    if (typeof document.startViewTransition !== 'function') return;
    document.addEventListener(
        'click',
        e => {
            if (bypass || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const a = e.target instanceof Element ? (e.target.closest('a[href]') as HTMLAnchorElement | null) : null;
            if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || reduced()) return;
            const url = new URL(a.href, location.href);
            if (url.origin !== location.origin || url.pathname === location.pathname) return;
            // Se detiene el clic, se toma la "foto" de la página actual y recién entonces se deja navegar.
            e.preventDefault();
            e.stopPropagation();
            document.startViewTransition(
                () =>
                    new Promise<void>(resolve => {
                        routeDone = resolve;
                        bypass = true;
                        try {
                            a.click();
                        } finally {
                            bypass = false;
                        }
                        window.setTimeout(resolve, 700); // por si la ruta redirige o tarda
                    }),
            );
        },
        true,
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Tooltips
// ─────────────────────────────────────────────────────────────────────────────
function initTooltips() {
    const tip = make('div', 'ec-tip');
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let current: HTMLElement | null = null;
    let timer = 0;

    const hide = () => {
        window.clearTimeout(timer);
        tip.classList.remove('is-on');
        current = null;
    };
    const show = (target: HTMLElement) => {
        const text = target.dataset.tip;
        if (!text || !target.isConnected) return;
        tip.textContent = text;
        tip.dataset.pos = 'above';
        tip.style.left = '0px';
        tip.style.top = '0px';
        const r = target.getBoundingClientRect();
        const t = tip.getBoundingClientRect();
        let top = r.top - t.height - 8;
        if (top < 8) {
            top = r.bottom + 8;
            tip.dataset.pos = 'below';
        }
        const left = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), window.innerWidth - t.width - 8);
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
        tip.classList.add('is-on');
    };
    // El "title" nativo se guarda en data-tip para mostrar el tooltip propio (y se conserva como aria-label).
    const adopt = (target: HTMLElement) => {
        const title = target.getAttribute('title');
        if (title === null) return;
        if (title.trim()) {
            target.dataset.tip = title;
            if (!target.hasAttribute('aria-label') && !target.textContent?.trim()) target.setAttribute('aria-label', title);
        }
        target.removeAttribute('title');
    };
    const find = (n: EventTarget | null) => (n instanceof Element ? (n.closest('[title],[data-tip]') as HTMLElement | null) : null);

    document.addEventListener('mouseover', e => {
        if (current && !current.isConnected) hide();
        const t = find(e.target);
        if (!t || t === current) return;
        adopt(t);
        if (!t.dataset.tip) return;
        hide();
        current = t;
        timer = window.setTimeout(() => show(t), 320);
    });
    document.addEventListener('mouseout', e => {
        if (!current) return;
        const to = e.relatedTarget as Node | null;
        if (to && current.contains(to)) return;
        hide();
    });
    document.addEventListener('focusin', e => {
        const t = find(e.target);
        if (!t || !(e.target as HTMLElement).matches(':focus-visible')) return;
        adopt(t);
        if (!t.dataset.tip) return;
        hide();
        current = t;
        show(t);
    });
    document.addEventListener('focusout', hide);
    document.addEventListener('pointerdown', hide, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('keydown', e => e.key === 'Escape' && hide());
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Animación de salida
// ─────────────────────────────────────────────────────────────────────────────
const LEAVE_SEL = '.modal-backdrop,.purchase-modal-backdrop,.drawer-backdrop,.ps-backdrop,.dp';

/** Cuando un modal/drawer se desmonta, se deja una copia que se desvanece (la pantalla ya no lo necesita). */
function leaveGhost(node: HTMLElement) {
    if (reduced() || node.classList.contains('ec-leaving')) return;
    const ghost = node.cloneNode(true) as HTMLElement;
    const from = node.querySelectorAll<HTMLInputElement>('input,select,textarea');
    const to = ghost.querySelectorAll<HTMLInputElement>('input,select,textarea');
    from.forEach((f, i) => {
        if (to[i]) to[i].value = f.value;
    });
    ghost.classList.add('ec-leaving');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('inert', '');
    ghost.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    document.body.appendChild(ghost);
    window.setTimeout(() => ghost.remove(), 340);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Indicador deslizante de chips de filtro
// ─────────────────────────────────────────────────────────────────────────────
let chipFrame = 0;
function syncChips() {
    chipFrame = 0;
    const groups = new Set<HTMLElement>();
    document.querySelectorAll<HTMLElement>('.filter-chip').forEach(c => c.parentElement && groups.add(c.parentElement));
    groups.forEach(g => {
        if (!g.classList.contains('ec-chip-group')) g.classList.add('ec-chip-group');
        let slider = g.querySelector<HTMLElement>(':scope > .ec-chip-slider');
        const on = g.querySelector<HTMLElement>(':scope > .filter-chip.is-on');
        if (!on) {
            slider?.classList.remove('is-visible');
            return;
        }
        let fresh = false;
        if (!slider) {
            slider = make('span', 'ec-chip-slider');
            slider.setAttribute('aria-hidden', 'true');
            g.prepend(slider);
            fresh = true;
        }
        slider.style.width = on.offsetWidth + 'px';
        slider.style.height = on.offsetHeight + 'px';
        slider.style.borderRadius = getComputedStyle(on).borderRadius;
        slider.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
        if (fresh) {
            const s = slider;
            requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('is-visible')));
        } else {
            slider.classList.add('is-visible');
        }
    });
}
const queueChips = () => {
    if (!chipFrame) chipFrame = requestAnimationFrame(syncChips);
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. Tiempo real: filas que cambian
// ─────────────────────────────────────────────────────────────────────────────
const ROW_SEL = '.vrow:not(.vrow--head),.sales-row--body,.table__body-row,.alert-row,.rtable:not(.rtable--head)';
let rtUntil = 0;
let lastInput = 0;
let flashCount = 0;
const flashedAt = new WeakMap<Element, number>();

function flashRow(row: Element) {
    const now = Date.now();
    if (now - (flashedAt.get(row) ?? 0) < 1500) return;
    flashedAt.set(row, now);
    flashCount++;
    try {
        row.animate(
            [
                { boxShadow: 'inset 3px 0 0 var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 26%, transparent)' },
                { boxShadow: 'inset 3px 0 0 transparent', backgroundColor: 'transparent' },
            ],
            { duration: 1700, easing: 'ease-out' },
        );
    } catch {
        // Navegador sin soporte: simplemente no se resalta.
    }
}

function showLive(message: string) {
    document.querySelector('.ec-live')?.remove();
    const pill = make('div', 'ec-live');
    pill.setAttribute('role', 'status');
    pill.textContent = message;
    document.body.appendChild(pill);
    requestAnimationFrame(() => pill.classList.add('is-on'));
    window.setTimeout(() => {
        pill.classList.remove('is-on');
        window.setTimeout(() => pill.remove(), 350);
    }, 2600);
}

function initRealtimeFlash() {
    const markInput = () => {
        lastInput = Date.now();
    };
    window.addEventListener('pointerdown', markInput, true);
    window.addEventListener('keydown', markInput, true);
    window.addEventListener('ec:realtime', () => {
        rtUntil = Date.now() + 6000;
        flashCount = 0;
        window.setTimeout(() => {
            if (flashCount > 0 && !reduced()) showLive('Datos actualizados en tiempo real');
        }, 2500);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Check de confirmación en botones
// ─────────────────────────────────────────────────────────────────────────────
function watchButton(from: Node | null) {
    const el = from instanceof Element ? from : from?.parentElement;
    const btn = el?.closest<HTMLElement>('.btn--primary');
    if (!btn) return;
    const text = (btn.textContent ?? '').trim();
    if (/(…|\.\.\.)$/.test(text)) {
        btn.dataset.ecBusy = '1';
    } else if (btn.dataset.ecBusy) {
        delete btn.dataset.ecBusy;
        btn.classList.add('is-done');
        window.setTimeout(() => btn.classList.remove('is-done'), 1100);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Observador único
// ─────────────────────────────────────────────────────────────────────────────
function initObserver() {
    const obs = new MutationObserver(muts => {
        const live = Date.now() < rtUntil && Date.now() - lastInput > 600;
        let chips = false;
        for (const m of muts) {
            if (m.type === 'childList') {
                chips = true;
                m.removedNodes.forEach(n => {
                    if (n instanceof HTMLElement && n.matches(LEAVE_SEL)) leaveGhost(n);
                });
                if (live) {
                    m.addedNodes.forEach(n => {
                        if (!(n instanceof HTMLElement)) return;
                        const row = n.matches(ROW_SEL) ? n : n.closest(ROW_SEL);
                        if (row) flashRow(row);
                    });
                    if (m.target instanceof HTMLElement) {
                        const row = m.target.closest(ROW_SEL);
                        if (row) flashRow(row);
                    }
                }
                watchButton(m.target);
            } else if (m.type === 'characterData') {
                if (live) {
                    const row = m.target.parentElement?.closest(ROW_SEL);
                    if (row) flashRow(row);
                }
                watchButton(m.target);
            } else if (m.type === 'attributes' && m.target instanceof HTMLElement && m.target.classList.contains('filter-chip')) {
                chips = true;
            }
        }
        if (chips) queueChips();
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', queueChips);
    queueChips();
}

let started = false;
export function initEffects() {
    if (started || typeof window === 'undefined') return;
    started = true;
    initTooltips();
    initPageTransitions();
    initRealtimeFlash();
    initObserver();
}