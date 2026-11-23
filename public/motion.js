/* iParkar Learning — motion for quiz.iparkar.com, matching iparkar.com's animations.js
   - Intro title rises word by word and its marigold highlight sweeps in; banner parts fade in after it.
   - The stats slide in from the right and count up.
   - Sections below appear as they scroll into view, once; steps, tiles, topics and cards come in one after another.
   - Cards lift and tilt slightly on hover; the top bar gets a shadow once you scroll.
   Nothing animates for visitors who turn on reduced motion, and without JavaScript the page is fully visible. */
(function () {
  "use strict";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const css = `
  .qm-up{opacity:0;transform:translateY(22px);transition:opacity .7s ease-out,transform .7s cubic-bezier(.2,.8,.2,1);transition-delay:calc(var(--d,0)*.1s)}
  .qm-right{opacity:0;transform:translateX(40px);transition:opacity .8s ease-out,transform .8s cubic-bezier(.2,.8,.2,1);transition-delay:.6s}
  .qm-up.qm-in,.qm-right.qm-in{opacity:1;transform:none}
  .qm-load{animation:qm-fade .7s ease-out both;animation-delay:calc(var(--t,0)*1s)}
  .qm-w{display:inline-block;animation:qm-rise .7s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(.15s + var(--i)*.08s)}
  .qa-hl.qm-hl{background:linear-gradient(#ffb110,#ffb110) no-repeat 0 0/0% 100%;animation:qm-rise .7s cubic-bezier(.2,.8,.2,1) both,qm-sweep .6s cubic-bezier(.6,0,.2,1) forwards;animation-delay:calc(.15s + var(--i)*.08s),var(--sweep,.9s)}
  .qm-pop{animation:qm-pop .6s cubic-bezier(.2,.8,.2,1) backwards;animation-delay:calc(var(--t,0)*1s)}
  .qm-in .qa-step__num{animation:qm-pop .6s .35s cubic-bezier(.2,.8,.2,1) backwards}
  .qm-tiltwrap{perspective:900px}
  @keyframes qm-rise{from{opacity:0;transform:translateY(.45em)}to{opacity:1;transform:none}}
  @keyframes qm-fade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
  @keyframes qm-pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:none}}
  @keyframes qm-sweep{to{background-size:100% 100%}}`;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);

  /* top bar shadow */
  const bar = $(".topbar");
  const onScroll = () => bar && bar.classList.toggle("qa-scrolled", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const about = $("#about");
  if (!about) return;

  /* title: words rise, highlight sweeps */
  const title = $("#aboutTitle");
  let words = 0;
  if (title) {
    const out = document.createDocumentFragment();
    [...title.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { out.appendChild(document.createTextNode(part)); return; }
          const s = document.createElement("span"); s.className = "qm-w"; s.style.setProperty("--i", words++); s.textContent = part; out.appendChild(s);
        });
      } else if (n.nodeType === 1) {
        n.classList.add("qm-w"); n.style.setProperty("--i", words++);
        if (n.classList.contains("qa-hl")) { n.classList.add("qm-hl"); n.style.setProperty("--sweep", (0.5 + words * 0.08).toFixed(2) + "s"); }
        out.appendChild(n);
      } else out.appendChild(n);
    });
    title.textContent = ""; title.appendChild(out);
  }

  /* the rest of the banner text fades in after the title; buttons pop */
  let t = 0.35 + words * 0.08;
  $$(".qa-banner__text > *", about).forEach((el) => {
    if (el === title) return;
    if (el.matches(".qa-cta")) { $$(".qa-btn", el).forEach((b) => { b.classList.add("qm-pop"); b.style.setProperty("--t", (t += 0.12).toFixed(2)); }); return; }
    el.classList.add("qm-load"); el.style.setProperty("--t", (t += 0.12).toFixed(2));
  });

  const reveal = [];
  const mark = (el, cls = "qm-up", d = 0) => { el.classList.add(cls); el.style.setProperty("--d", Math.min(d, 8)); reveal.push(el); };

  /* stats slide in and count up */
  const stats = $(".qa-stats", about);
  if (stats) {
    mark(stats, "qm-right");
    $$("[data-count]", stats).forEach((s) => { s.textContent = "0" + (s.dataset.suffix || ""); });
  }

  /* sections: headings and copy reveal; lists come in one item after another */
  $$(".qa-section", about).forEach((sec) => {
    [...sec.children].forEach((child, i) => {
      if (child.matches(".qa-stagger")) { [...child.children].forEach((c, k) => mark(c, "qm-up", k + 1)); return; }
      const inner = child.querySelector(".qa-stagger");
      if (inner) {
        [...child.children].forEach((c, k) => { if (c === inner) [...inner.children].forEach((x, j) => mark(x, "qm-up", j + 1)); else mark(c, "qm-up", k); });
        return;
      }
      mark(child, "qm-up", i);
    });
  });

  /* cards lift and tilt slightly on hover */
  $$(".qa-card", about).forEach((c) => {
    if (c.parentElement) c.parentElement.classList.add("qm-tiltwrap");
    c.addEventListener("pointermove", (ev) => {
      if (ev.pointerType !== "mouse" || c.classList.contains("qm-up")) return;
      const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
      c.style.transform = `rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 4).toFixed(2)}deg) translateY(-4px)`;
    });
    c.addEventListener("pointerleave", () => { c.style.transform = ""; });
  });

  const countUp = (el) => {
    const end = +el.dataset.count, sfx = el.dataset.suffix || "", dur = end > 9 ? 1200 : 700, t0 = performance.now();
    const tick = (now) => { const p = Math.min(1, (now - t0) / dur); el.textContent = Math.round(end * (1 - (1 - p) ** 3)) + sfx; if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };

  /* play each item once as it comes into view, then hand it back to the normal styles (hover effects) */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.classList.add("qm-in");
      const settle = (ev) => { if (ev.target !== el) return; el.classList.remove("qm-up", "qm-right"); el.removeEventListener("transitionend", settle); };
      el.addEventListener("transitionend", settle);
      $$("[data-count]", el).forEach((c, i) => setTimeout(() => countUp(c), 700 + i * 200));
      io.unobserve(el);
    });
  }, { threshold: 0.05 });
  reveal.forEach((el) => io.observe(el));

  /* at the very bottom, show whatever is left; before printing, show everything */
  addEventListener("scroll", () => {
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) reveal.forEach((el) => { if (!el.classList.contains("qm-in") && el.getBoundingClientRect().top < innerHeight) { el.classList.add("qm-in"); io.unobserve(el); } });
  }, { passive: true });
  addEventListener("beforeprint", () => reveal.forEach((el) => el.classList.add("qm-in")));
})();
