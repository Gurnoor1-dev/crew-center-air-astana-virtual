/* ============================================================================
   Aeromexico Virtual — hero.js

   Adapted as an isolated, unlinked operations preview for Air Astana Virtual.
   The file intentionally remains self-contained and does not alter the public
   homepage or any existing site hero.
   ========================================================================== */

(function () {
    'use strict';

    const root = document.querySelector('[data-hero]');
    const A = window.AMV;
    const D = window.AMV_DATA || {};

    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

    const sky = root && root.querySelector('.sky__air');
    const film = D.video;
    if (sky && film && film.src) {
        sky.classList.add('sky__air--film');
        const v = document.createElement('video');
        v.className = 'hero__film';
        v.muted = true;
        v.defaultMuted = true;
        v.loop = true;
        v.playsInline = true;
        v.setAttribute('playsinline', '');
        v.setAttribute('aria-hidden', 'true');
        v.setAttribute('preload', calm.matches ? 'none' : 'metadata');
        if (film.poster) v.setAttribute('poster', film.poster);
        if (film.w) v.setAttribute('width', film.w);
        if (film.h) v.setAttribute('height', film.h);
        v.src = film.src;
        if (!calm.matches) {
            v.autoplay = true;
            const go = v.play();
            if (go && go.catch) go.catch(() => {});
        }
        sky.appendChild(v);
    }

    const strip = (root && root.querySelector('[data-hero-log]'))
                || document.querySelector('[data-hero-log]');
    if (!strip) return;

    function when(iso) {
        const t = Date.parse(iso || '');
        if (!Number.isFinite(t)) return '';
        const mins = Math.round((Date.now() - t) / 60000);
        if (mins < 2) return 'just landed';
        if (mins < 60) return mins + ' min ago';
        const hrs = Math.round(mins / 60);
        if (hrs < 24) return hrs + 'h ago';
        if (hrs < 48) return 'yesterday';
        const days = Math.round(hrs / 24);
        if (days < 7) return days + ' days ago';
        return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
            .format(new Date(t));
    }

    function card(f) {
        const who = f.pilot || f.flight || f.callsign || 'a crew pilot';
        const ago = when(f.at);
        return `
            <li class="hero__leg rounded-2xl border border-[#dfe4eb] bg-white p-5 shadow-sm">
                <span class="hero__leg-route mono text-sm font-black">${esc(f.from)} <i>→</i> ${esc(f.to)}</span>
                <span class="hero__leg-who mt-2 block text-xs text-[#687386]">Flown by <b class="text-[#17213a]">${esc(who)}</b></span>
                ${ago ? `<span class="hero__leg-meta mt-1 block text-[10px] font-bold uppercase tracking-wider text-[#687386]/70">${esc(ago)}</span>` : ''}
            </li>`;
    }

    function sample(log, n) {
        const pool = log.slice();
        const out = [];
        while (pool.length && out.length < n) {
            out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        }
        return out;
    }

    function mountLog(log) {
        if (!log || !log.length) return;
        const list = strip.querySelector('[data-hero-legs]');
        if (!list) return;
        const n = Math.min(3, log.length);

        function paint() {
            list.innerHTML = sample(log, n).map(card).join('');
            list.classList.remove('is-swapping');
        }

        paint();
        strip.hidden = false;
        if (A && A.refresh) A.refresh(strip);

        if (calm.matches || log.length <= n) return;
        setInterval(() => {
            if (document.hidden) return;
            list.classList.add('is-swapping');
            setTimeout(paint, 320);
        }, 9000);
    }

    if (window.AMV_CREW) {
        window.AMV_CREW.pireps({ limit: 24 }).then(mountLog).catch(() => {});
    }
})();
