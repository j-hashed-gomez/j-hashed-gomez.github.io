/* Visualizations and section renderers used by resume.js.
   Each renderer mutates the innerHTML of the container it receives.
   Reads from window.CV_DATA. */

(function (global) {
  'use strict';

  const YEARS_START = 2006;
  const YEARS_END = 2026;
  const YEARS = (() => {
    const a = [];
    for (let y = YEARS_START; y <= YEARS_END; y++) a.push(y);
    return a;
  })();

  // -------------------------------------------------------------------------
  // utilities
  // -------------------------------------------------------------------------
  const esc = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const yearFromIso = (iso) => iso ? parseInt(iso.slice(0, 4), 10) : YEARS_END;
  const monthIndex = (iso) => iso ? (yearFromIso(iso) - YEARS_START) * 12 + (parseInt(iso.slice(5, 7), 10) - 1) : (YEARS_END - YEARS_START) * 12 + 11;
  const totalMonths = (YEARS_END - YEARS_START + 1) * 12;

  const CLOUD_TECHS = new Set(['Azure', 'AWS', 'GCP', 'OpenShift', 'IBM Cloud Pak', 'Virtuozzo', 'Hybrid Cloud']);

  // -------------------------------------------------------------------------
  // derived stats / heatmap matrix
  // -------------------------------------------------------------------------
  function computeStats(data) {
    const exps = data.experience;
    const techCount = new Map();
    const companies = new Set();
    const clouds = new Set();
    let earliest = YEARS_END;

    exps.forEach((e) => {
      companies.add(e.company);
      earliest = Math.min(earliest, yearFromIso(e.start));
      e.stack.forEach((t) => {
        techCount.set(t, (techCount.get(t) || 0) + 1);
        if (CLOUD_TECHS.has(t)) clouds.add(t);
      });
    });

    return {
      years: YEARS_END - earliest,
      roles: exps.length,
      certs: data.certifications.length,
      trainings: data.trainings.length,
      companies: companies.size,
      clouds: clouds.size,
      techCount,
    };
  }

  function computeHeatmap(data, topN = 14) {
    const stats = computeStats(data);
    const ranked = [...stats.techCount.entries()].sort((a, b) => b[1] - a[1]);
    const techs = ranked.slice(0, topN).map((r) => r[0]);

    const matrix = techs.map((tech) => {
      const row = { tech, cells: YEARS.map(() => 0), total: 0 };
      data.experience.forEach((e) => {
        if (!e.stack.includes(tech)) return;
        const yStart = yearFromIso(e.start);
        const yEnd = e.end ? yearFromIso(e.end) : YEARS_END;
        for (let y = yStart; y <= yEnd; y++) {
          const idx = y - YEARS_START;
          if (idx >= 0 && idx < row.cells.length) row.cells[idx] += 1;
        }
      });
      row.total = row.cells.reduce((a, b) => a + (b > 0 ? 1 : 0), 0);
      return row;
    });

    return matrix;
  }

  // -------------------------------------------------------------------------
  // PANEL_01: career_timeline — absolute-positioned bars at month precision
  // -------------------------------------------------------------------------
  function renderTimeline(el, data, lang) {
    el.classList.remove('timeline-bars');
    el.classList.add('career-timeline');
    const rowHeight = 28;
    const exps = [...data.experience].reverse();      // oldest first → top
    const nowMonth = new Date().getFullYear() * 12 + new Date().getMonth();
    const ENDM = (YEARS_END - YEARS_START + 1) * 12;  // exclusive month index for the right edge

    const bars = exps.map((e, i) => {
      const ms = monthIndex(e.start);                                       // [0 .. ENDM-1]
      let me;
      if (e.end) {
        me = monthIndex(e.end);                                             // exclusive (== next job's start)
      } else {
        // Live job: stop at "now", capped to the timeline horizon.
        me = Math.min(ENDM, Math.max(ms + 1, nowMonth - YEARS_START * 12 + 1));
      }
      const dm = Math.max(1, me - ms);                                      // duration in months
      const left  = (ms / ENDM) * 100;
      const width = (dm / ENDM) * 100;
      const top   = i * rowHeight;
      const company = e.company.replace(/\s*\(.+\)/, '');
      return `
        <div class="bar${e.live ? ' curr' : ''}"
             style="left:${left.toFixed(3)}%;width:${width.toFixed(3)}%;top:${top}px"
             title="${esc(e.period[lang])} — ${esc(e.company)}">
          <span>${esc(company)}</span>
          <span class="role">· ${esc(e.title[lang])}</span>
        </div>`;
    }).join('');

    const tickStep = 2;
    const ticks = [];
    for (let y = YEARS_START; y <= YEARS_END; y += tickStep) ticks.push(y);
    if (ticks[ticks.length - 1] !== YEARS_END) ticks.push(YEARS_END);

    el.style.minHeight = `${exps.length * rowHeight + 60}px`;
    el.innerHTML = bars + `
      <div class="axis"></div>
      <div class="ticks">${ticks.map((y) => `<span>${y}</span>`).join('')}</div>`;
  }

  // -------------------------------------------------------------------------
  // PANEL_02: telemetry — name / val / mini-bar (e-dani layout)
  // -------------------------------------------------------------------------
  const TELEMETRY_MAX = {
    years: 30, roles: 15, companies: 12, certs: 15, trainings: 12, clouds: 10,
  };
  function renderTelemetry(el, data, lang) {
    const stats = computeStats(data);
    const labels = data.telemetry[lang];
    el.innerHTML = labels.map((m) => {
      const v = stats[m.key] ?? 0;
      const max = TELEMETRY_MAX[m.key] ?? 100;
      const pct = Math.min(100, Math.round((v / max) * 100));
      return `
        <div class="tele-row">
          <div class="name">${esc(m.label)}</div>
          <div class="val" data-target="${v}">0</div>
          <div class="tele-bar"><i style="width:0%" data-target-pct="${pct}"></i></div>
        </div>`;
    }).join('');
  }

  function animateCountUps(rootEl, duration = 1400) {
    const values = rootEl.querySelectorAll('.tele-row .val');
    const bars   = rootEl.querySelectorAll('.tele-bar > i');
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      values.forEach((v) => {
        const target = parseInt(v.getAttribute('data-target'), 10) || 0;
        v.textContent = Math.round(target * eased);
      });
      bars.forEach((b) => {
        const target = parseInt(b.getAttribute('data-target-pct'), 10) || 0;
        b.style.width = (target * eased).toFixed(1) + '%';
      });
      if (t < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // -------------------------------------------------------------------------
  // PANEL_03: stack_heatmap.matrix — .heatmap > .label + .cells > .cell.on/.dim
  // -------------------------------------------------------------------------
  function renderHeatmap(el, data /*, lang */) {
    const matrix = computeHeatmap(data);
    const max = Math.max(1, ...matrix.flatMap((row) => row.cells));
    let total = 0;

    const inner = matrix.map((row) => {
      const cells = row.cells.map((v) => {
        if (v === 0) return `<div class="cell" aria-hidden="true"></div>`;
        total++;
        const cls = v / max > 0.5 ? 'cell on' : 'cell dim';
        return `<div class="${cls}" aria-hidden="true"></div>`;
      }).join('');
      return `
        <div class="label">${esc(row.tech)}</div>
        <div class="cells">${cells}</div>`;
    }).join('');

    el.innerHTML = inner;
    const sCount = document.getElementById('heatmap-samples');
    if (sCount) sCount.textContent = `SAMPLES: ${total}`;
  }

  // -------------------------------------------------------------------------
  // PANEL_05: now_playing.log
  // -------------------------------------------------------------------------
  let logTimer = null;
  function renderLog(el, data, lang) {
    if (logTimer) { clearInterval(logTimer); logTimer = null; }
    el.innerHTML = '';
    const lines = data.log_lines[lang].slice();
    const pad = (n) => String(n).padStart(2, '0');
    function pushLine() {
      const line = lines[Math.floor(Math.random() * lines.length)];
      const m = line.match(/^\[(OK|INFO|WARN|ERR)\]\s+(.*)$/);
      const lvl = m ? m[1] : 'OK';
      const msg = m ? m[2] : line;
      const now = new Date();
      const ts = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const row = document.createElement('div');
      row.className = 'np-row';
      row.innerHTML = `<span class="ts">[${ts}]</span><span class="lvl lvl-${lvl}">${lvl}</span><span class="msg">${esc(msg)}</span>`;
      el.insertBefore(row, el.firstChild);
      while (el.children.length > 9) el.removeChild(el.lastChild);
    }
    pushLine();
    pushLine();
    pushLine();
    logTimer = setInterval(pushLine, 2200);
  }

  // -------------------------------------------------------------------------
  // SECTION 02: experience.history — Dani-style central rail (alternating L/R)
  // -------------------------------------------------------------------------
  function renderExperience(el, data, lang) {
    const labels = data.ui_labels[lang];
    el.classList.add('timeline');
    el.classList.remove('exp-list');
    const rows = data.experience.map((e, idx) => {
      const side = idx % 2 === 0 ? 'right' : 'left';
      const liveBadge = e.live ? `<span class="live-badge">${esc(labels.live_badge)}</span>` : '';
      const id = `ROLE_${String(idx + 1).padStart(2, '0')}`;
      const bullets = (e.bullets[lang] || [])
        .map((b) => `<li>${esc(b)}</li>`).join('');
      const tags = e.stack.map((s) => `<span class="chip">${esc(s)}</span>`).join('');
      const desc = esc(e.description[lang]);
      return `
        <div class="tl-row ${side}${e.live ? ' curr' : ''}">
          <div class="node" aria-hidden="true"></div>
          <div class="tl-card">
            <article class="panel">
              <div class="head">
                <span class="id">[ ${id} ]</span>
                <span>${esc(e.period[lang])}</span>
              </div>
              <h3>${esc(e.company)}${liveBadge}</h3>
              <div class="role">${esc(e.title[lang])}</div>
              <p style="font-size:12.5px;color:rgba(232,255,232,.85);margin:0 0 10px;">${desc}</p>
              ${bullets ? `<ul>${bullets}</ul>` : ''}
              <div class="tags">${tags}</div>
            </article>
          </div>
        </div>`;
    }).join('');
    el.innerHTML = rows;

    const counter = document.getElementById('exp-count');
    if (counter) counter.textContent = `[ ${data.experience.length} ROLES ]`;
  }

  // -------------------------------------------------------------------------
  // SECTION 04: skills.matrix
  // -------------------------------------------------------------------------
  function renderSkills(el, data, lang) {
    const groups = data.skills[lang];
    el.innerHTML = groups.map((g) => `
      <div class="skill-group">
        <div class="group-name">${esc(g.group)}</div>
        <ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
      </div>
    `).join('');
  }

  // -------------------------------------------------------------------------
  // SECTION 05: certifications.ledger
  // -------------------------------------------------------------------------
  function renderCertifications(el, data /*, lang */) {
    el.innerHTML = data.certifications.map((c) => {
      let name = esc(c.name);
      if (c.highlight) {
        const re = new RegExp(`(${c.highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
        name = name.replace(re, '<b>$1</b>');
      }
      return `
        <div class="ledger-row">
          <span class="year">${c.year}</span>
          <span class="icon">✓</span>
          <span class="name">${name}</span>
        </div>`;
    }).join('');
    const counter = document.getElementById('certs-count');
    if (counter) counter.textContent = `[ ${data.certifications.length} ]`;
  }

  // -------------------------------------------------------------------------
  // SECTION 06: trainings.archive
  // -------------------------------------------------------------------------
  function renderTrainings(el, data, lang) {
    el.innerHTML = data.trainings.map((t) => `
      <div class="ledger-row">
        <span class="year">${t.hours}h</span>
        <span class="hours">${esc(t.provider)}</span>
        <span class="icon">■</span>
        <span class="name">${esc(t.name[lang])}</span>
      </div>
    `).join('');
    const counter = document.getElementById('trainings-count');
    if (counter) counter.textContent = `[ ${data.trainings.length} ]`;
  }

  // -------------------------------------------------------------------------
  // SECTION 07: languages.dial / other.modules
  // -------------------------------------------------------------------------
  function renderLanguages(el, data, lang) {
    const labels = data.ui_labels[lang];
    const meta = data.meta;
    const dials = data.languages.map((l) => {
      const C = 2 * Math.PI * 45;
      const off = C * (1 - l.percent / 100);
      return `
        <div class="lang-dial">
          <div class="ring">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle class="bg-ring" cx="50" cy="50" r="45"></circle>
              <circle class="fg-ring" cx="50" cy="50" r="45"
                stroke-dasharray="${C.toFixed(2)}"
                stroke-dashoffset="${off.toFixed(2)}"></circle>
            </svg>
            <div class="value">${l.percent}%</div>
          </div>
          <div class="name">${esc(l.name[lang])}</div>
          <div class="level">${esc(l.level[lang])}</div>
        </div>`;
    }).join('');
    const modules = `
      <div class="modules">
        <span class="k">${esc(labels.location_h)}</span>
        <span class="v">${esc(meta.location)}</span>
        <span class="k">Remote</span>
        <span class="v">${meta.remote ? '✓' : '—'}</span>
        <span class="k">B2B</span>
        <span class="v">${meta.b2b ? '✓ open' : '—'}</span>
        <span class="k">GitHub</span>
        <span class="v"><a href="${esc(meta.github)}" target="_blank" rel="noopener">${esc(meta.github.replace(/^https?:\/\//, ''))}</a></span>
        <span class="k">LinkedIn</span>
        <span class="v"><a href="${esc(meta.linkedin)}" target="_blank" rel="noopener">${esc(meta.linkedin.replace(/^https?:\/\//, ''))}</a></span>
      </div>`;
    el.innerHTML = dials + modules;
  }

  // -------------------------------------------------------------------------
  // SECTION 08: subject.profile / about
  // -------------------------------------------------------------------------
  function renderAbout(el, data, lang) {
    el.innerHTML = data.about[lang].map((p) => `<p>${esc(p)}</p>`).join('');
  }

  // -------------------------------------------------------------------------
  // SECTION 09: contact card + actions
  // -------------------------------------------------------------------------
  function renderContact(el, data, lang) {
    const labels = data.ui_labels[lang];
    const m = data.meta;
    const rows = [
      [labels.contact_h.toUpperCase(),
        `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>`],
      ['LINKEDIN',
        `<a href="${esc(m.linkedin)}" target="_blank" rel="noopener">${esc(m.linkedin.replace(/^https?:\/\//, ''))}</a>`],
      ['GITHUB',
        `<a href="${esc(m.github)}" target="_blank" rel="noopener">${esc(m.github.replace(/^https?:\/\//, ''))}</a>`],
      [labels.location_h.toUpperCase(), esc(m.location)],
      ['STATUS', esc(m.status[lang])],
    ];
    el.innerHTML = rows.map(([k, v]) => `<span class="k">${esc(k)}</span><span class="v">${v}</span>`).join('');
  }

  function renderEotActions(el, data, lang) {
    const labels = data.ui_labels[lang];
    el.innerHTML = `
      <button class="eot-btn" id="open-pdf-btn"     type="button">⇩ ${esc(labels.download_pdf)}</button>
      <button class="eot-btn" id="open-contact-btn" type="button">✉ ${esc(labels.contact)}</button>
      <a class="eot-btn" href="${esc(data.meta.linkedin)}" target="_blank" rel="noopener">↗ LinkedIn</a>
      <a class="eot-btn" href="${esc(data.meta.github)}"   target="_blank" rel="noopener">↗ GitHub</a>`;
  }

  // -------------------------------------------------------------------------
  // SECTION 03: orbital fallback (mobile-only chips)
  // -------------------------------------------------------------------------
  function renderOrbitalFallback(el, data /*, lang */) {
    el.innerHTML = data.orbital.map((t) => `<span class="chip">${esc(t)}</span>`).join('');
  }

  // -------------------------------------------------------------------------
  // PANEL_04: neural graph (Canvas 2D, force-directed)
  // -------------------------------------------------------------------------
  let neuralCtl = null;
  function initNeuralGraph(canvas, tooltip, data /*, lang */) {
    if (neuralCtl) neuralCtl.stop();
    const ctx = canvas.getContext('2d');
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // Pick top techs by frequency for clearer graph
    const stats = computeStats(data);
    const techList = [...stats.techCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map((r) => r[0]);
    const techSet = new Set(techList);

    const jobs = data.experience.map((e, i) => ({
      id: 'j' + i, type: 'job', label: e.company.replace(/\s*\(.+\)/, ''), live: !!e.live,
      x: 0, y: 0, vx: 0, vy: 0, r: 11, stack: e.stack.filter((s) => techSet.has(s)),
    }));
    const techs = techList.map((t, i) => ({
      id: 't' + i, type: 'tech', label: t,
      x: 0, y: 0, vx: 0, vy: 0, r: 6,
    }));
    const nodes = jobs.concat(techs);
    const byId = new Map(nodes.map((n) => [n.label, n]));
    const edges = [];
    jobs.forEach((j) => {
      j.stack.forEach((tName) => {
        const tNode = byId.get(tName);
        if (tNode) edges.push({ a: j, b: tNode, packets: [] });
      });
    });

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // re-center any newly placed nodes
      nodes.forEach((n) => {
        if (!n._init) {
          n.x = rect.width / 2 + (Math.random() - 0.5) * rect.width * 0.7;
          n.y = rect.height / 2 + (Math.random() - 0.5) * rect.height * 0.7;
          n._init = true;
        }
      });
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // physics constants
    const IDEAL = 80;
    const SPRING = 0.04;
    const REPEL = 1400;
    const DAMP = 0.86;

    let dragging = null;
    let mouseX = 0, mouseY = 0, hoverNode = null;
    function rectXY(ev) {
      const r = canvas.getBoundingClientRect();
      return [ev.clientX - r.left, ev.clientY - r.top];
    }
    function pickNode(x, y) {
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = x - n.x, dy = y - n.y;
        if (dx * dx + dy * dy <= (n.r + 4) ** 2) return n;
      }
      return null;
    }
    canvas.addEventListener('mousedown', (ev) => {
      const [x, y] = rectXY(ev);
      const n = pickNode(x, y);
      if (n) { dragging = n; }
    });
    canvas.addEventListener('mousemove', (ev) => {
      const [x, y] = rectXY(ev);
      mouseX = x; mouseY = y;
      if (dragging) {
        dragging.x = x; dragging.y = y; dragging.vx = 0; dragging.vy = 0;
      } else {
        hoverNode = pickNode(x, y);
        if (hoverNode) {
          tooltip.style.display = 'block';
          tooltip.style.left = (x + 14) + 'px';
          tooltip.style.top = (y + 14) + 'px';
          tooltip.textContent = hoverNode.label + (hoverNode.live ? ' · live' : '');
        } else {
          tooltip.style.display = 'none';
        }
      }
    });
    window.addEventListener('mouseup', () => { dragging = null; });
    canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; hoverNode = null; });

    function step() {
      const rect = canvas.getBoundingClientRect();
      const cx = rect.width / 2, cy = rect.height / 2;

      // repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          let d2 = dx * dx + dy * dy + 0.1;
          let d = Math.sqrt(d2);
          if (d > 220) continue;
          const f = REPEL / d2;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          a.vx -= fx; a.vy -= fy;
          b.vx += fx; b.vy += fy;
        }
      }
      // springs
      edges.forEach((e) => {
        const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const f = (d - IDEAL) * SPRING;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        e.a.vx += fx; e.a.vy += fy;
        e.b.vx -= fx; e.b.vy -= fy;
      });
      // center gravity
      nodes.forEach((n) => {
        n.vx += (cx - n.x) * 0.002;
        n.vy += (cy - n.y) * 0.002;
        n.vx *= DAMP; n.vy *= DAMP;
        if (n !== dragging) { n.x += n.vx; n.y += n.vy; }
        n.x = Math.max(n.r + 4, Math.min(rect.width - n.r - 4, n.x));
        n.y = Math.max(n.r + 4, Math.min(rect.height - n.r - 4, n.y));
      });

      // packets along edges
      edges.forEach((e) => {
        if (Math.random() < 0.012) e.packets.push({ t: 0 });
        for (let i = e.packets.length - 1; i >= 0; i--) {
          e.packets[i].t += 0.012;
          if (e.packets[i].t > 1) e.packets.splice(i, 1);
        }
      });

      draw();
    }

    function draw() {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      // edges (bezier curve with slight wobble)
      edges.forEach((e) => {
        const mx = (e.a.x + e.b.x) / 2, my = (e.a.y + e.b.y) / 2;
        const nx = -(e.b.y - e.a.y), ny = (e.b.x - e.a.x);
        const nlen = Math.sqrt(nx * nx + ny * ny) || 1;
        const wob = 8 * Math.sin(performance.now() * 0.0014 + (e.a.x + e.b.y) * 0.01);
        const cx = mx + (nx / nlen) * wob, cy = my + (ny / nlen) * wob;
        const hot = hoverNode && (hoverNode === e.a || hoverNode === e.b);
        ctx.strokeStyle = hot ? 'rgba(57,255,20,.85)' : 'rgba(0,143,17,.45)';
        ctx.lineWidth = hot ? 1.6 : 1;
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.quadraticCurveTo(cx, cy, e.b.x, e.b.y);
        ctx.stroke();
        e.packets.forEach((p) => {
          const t = p.t;
          const it = 1 - t;
          const px = it * it * e.a.x + 2 * it * t * cx + t * t * e.b.x;
          const py = it * it * e.a.y + 2 * it * t * cy + t * t * e.b.y;
          ctx.fillStyle = 'rgba(57,255,20,.9)';
          ctx.beginPath(); ctx.arc(px, py, 1.6, 0, Math.PI * 2); ctx.fill();
        });
      });

      // nodes
      nodes.forEach((n) => {
        const isJob = n.type === 'job';
        const hot = (hoverNode === n);
        ctx.fillStyle = isJob
          ? (n.live ? '#39FF14' : '#00FF41')
          : '#00E5FF';
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = isJob ? 1.5 : 1;
        ctx.strokeStyle = isJob ? 'rgba(0,0,0,.4)' : 'rgba(0,0,0,.5)';
        ctx.stroke();
        if (hot) {
          ctx.strokeStyle = 'rgba(57,255,20,.6)';
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2); ctx.stroke();
        }
        if (isJob) {
          ctx.fillStyle = '#cdebd3';
          ctx.font = '500 10px JetBrains Mono, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y + n.r + 12);
        }
      });
    }

    let raf = null;
    function loop() { step(); raf = requestAnimationFrame(loop); }
    loop();

    neuralCtl = {
      stop() {
        if (raf) cancelAnimationFrame(raf);
        ro.disconnect();
        neuralCtl = null;
      },
    };
    return neuralCtl;
  }

  // -------------------------------------------------------------------------
  // SECTION 03: orbital (Three.js)
  // -------------------------------------------------------------------------
  let orbitalCtl = null;
  function initOrbital(canvas, data) {
    if (orbitalCtl) orbitalCtl.stop();
    if (typeof window.THREE === 'undefined') {
      console.warn('[orbital] THREE not loaded');
      return null;
    }
    const THREE = window.THREE;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    function size() {
      const r = canvas.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / Math.max(1, r.height);
      camera.updateProjectionMatrix();
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    camera.position.set(0, 1.6, 9);

    // Core wireframe
    const coreGeo = new THREE.IcosahedronGeometry(1.2, 1);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x00FF41, wireframe: true, transparent: true, opacity: 0.5 });
    const core = new THREE.Mesh(coreGeo, coreMat);
    scene.add(core);

    const innerGeo = new THREE.IcosahedronGeometry(0.75, 0);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0x00E5FF, wireframe: true, transparent: true, opacity: 0.35 });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    scene.add(inner);

    // Nodes on an orbital sphere
    function spriteForLabel(text, color = '#00FF41') {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const cx = c.getContext('2d');
      cx.fillStyle = 'rgba(0,8,0,.85)';
      cx.fillRect(0, 0, c.width, c.height);
      cx.strokeStyle = color; cx.lineWidth = 2;
      cx.strokeRect(1, 1, c.width - 2, c.height - 2);
      cx.font = 'bold 28px JetBrains Mono, monospace';
      cx.fillStyle = color;
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.fillText(text, c.width / 2, c.height / 2);
      const tex = new THREE.CanvasTexture(c);
      tex.needsUpdate = true;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
      const sp = new THREE.Sprite(mat);
      sp.scale.set(1.4, 0.36, 1);
      return sp;
    }

    const radius = 4;
    const items = data.orbital;
    const nodes = [];
    items.forEach((label, i) => {
      const phi = Math.acos(-1 + (2 * i) / items.length);
      const theta = Math.sqrt(items.length * Math.PI) * phi;
      const grp = new THREE.Group();
      grp.position.set(
        radius * Math.cos(theta) * Math.sin(phi),
        radius * Math.sin(theta) * Math.sin(phi),
        radius * Math.cos(phi)
      );
      const color = (i % 3 === 0) ? '#00E5FF' : '#00FF41';
      const sp = spriteForLabel(label, color);
      grp.add(sp);
      // halo
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 })
      );
      halo.position.set(-0.85, 0, 0);
      grp.add(halo);
      scene.add(grp);
      nodes.push({ grp, halo, basePhase: Math.random() * Math.PI * 2 });
    });

    // Orbit ring
    const ringGeo = new THREE.TorusGeometry(radius, 0.01, 8, 90);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00FF41, transparent: true, opacity: 0.25 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // Drag to rotate, scroll to zoom
    const root = new THREE.Group();
    while (scene.children.length) root.add(scene.children[0]);
    scene.add(root);

    // ---- Packet stream: pulses travel from each orbital node toward the core ---
    const packetGeo = new THREE.SphereGeometry(0.07, 10, 10);
    const packets = [];
    let coreFlash = 0;

    function spawnPacket(nodeIdx) {
      const node = nodes[nodeIdx];
      if (!node) return;
      const mat = new THREE.MeshBasicMaterial({
        color: 0x39FF14,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(packetGeo, mat);
      // Start at the node's local position; the core sits at the origin of root.
      mesh.position.copy(node.grp.position);
      root.add(mesh);
      packets.push({ mesh, mat, start: node.grp.position.clone(), t: 0 });
    }
    // Stagger the initial spawn so packets don't pulse in unison.
    nodes.forEach((_, i) => setTimeout(() => spawnPacket(i), i * 220));

    function updatePackets() {
      // Periodically spawn new packets so the flow is continuous.
      if (Math.random() < 0.18) spawnPacket((Math.random() * nodes.length) | 0);
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.t += 0.022;
        if (p.t >= 1) {
          root.remove(p.mesh);
          p.mat.dispose();
          packets.splice(i, 1);
          coreFlash = 1;
          continue;
        }
        const e = Math.pow(p.t, 1.4);              // ease-in toward the core
        p.mesh.position.x = p.start.x * (1 - e);
        p.mesh.position.y = p.start.y * (1 - e);
        p.mesh.position.z = p.start.z * (1 - e);
        const closeness = 1 - p.t;
        p.mat.opacity = 0.35 + 0.6 * closeness;     // brighter near the source
        const s = 0.7 + 0.6 * closeness;            // shrink as it approaches
        p.mesh.scale.setScalar(s);
      }
    }

    let isDown = false, lastX = 0, lastY = 0;
    let yaw = 0, pitch = 0, vYaw = 0.005, vPitch = 0.0025;
    canvas.addEventListener('mousedown', (ev) => { isDown = true; lastX = ev.clientX; lastY = ev.clientY; });
    window.addEventListener('mouseup', () => { isDown = false; });
    canvas.addEventListener('mousemove', (ev) => {
      if (!isDown) return;
      const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
      yaw += dx * 0.008;
      pitch += dy * 0.008;
      pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
      vYaw = vPitch = 0;
    });
    canvas.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      camera.position.z = Math.max(5, Math.min(16, camera.position.z + ev.deltaY * 0.01));
    }, { passive: false });

    // touch
    let tLastX = 0, tLastY = 0;
    canvas.addEventListener('touchstart', (ev) => {
      if (!ev.touches[0]) return;
      tLastX = ev.touches[0].clientX; tLastY = ev.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', (ev) => {
      if (!ev.touches[0]) return;
      const dx = ev.touches[0].clientX - tLastX;
      const dy = ev.touches[0].clientY - tLastY;
      tLastX = ev.touches[0].clientX; tLastY = ev.touches[0].clientY;
      yaw += dx * 0.008; pitch += dy * 0.008;
      pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
    }, { passive: true });

    size();
    const ro = new ResizeObserver(size); ro.observe(canvas);

    let raf = null;
    function render(t) {
      if (!isDown) { yaw += vYaw; pitch += vPitch * 0.4; }
      pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));
      root.rotation.y = yaw;
      root.rotation.x = pitch;
      core.rotation.y += 0.003;
      core.rotation.x += 0.001;
      inner.rotation.y -= 0.005;

      // Packets stream into the core.
      updatePackets();
      // Core flashes briefly each time a packet lands.
      coreFlash = Math.max(0, coreFlash - 0.05);
      core.material.opacity = 0.5 + coreFlash * 0.45;
      inner.material.opacity = 0.35 + coreFlash * 0.55;
      const coreScale = 1 + coreFlash * 0.08;
      core.scale.setScalar(coreScale);
      inner.scale.setScalar(coreScale);

      nodes.forEach((n) => {
        const k = 1 + 0.18 * Math.sin(t * 0.003 + n.basePhase);
        n.halo.scale.setScalar(k);
        n.halo.material.opacity = 0.18 + 0.18 * (k - 1);
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    orbitalCtl = {
      stop() {
        if (raf) cancelAnimationFrame(raf);
        ro.disconnect();
        scene.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        });
        renderer.dispose();
        orbitalCtl = null;
      },
    };
    return orbitalCtl;
  }

  // -------------------------------------------------------------------------
  // exports
  // -------------------------------------------------------------------------
  global.CV_GRAPHS = {
    YEARS_START, YEARS_END,
    computeStats,
    computeHeatmap,
    renderTimeline,
    renderTelemetry,
    animateCountUps,
    renderHeatmap,
    renderLog,
    renderExperience,
    renderSkills,
    renderCertifications,
    renderTrainings,
    renderLanguages,
    renderAbout,
    renderContact,
    renderEotActions,
    renderOrbitalFallback,
    initNeuralGraph,
    initOrbital,
    stopAll() {
      if (logTimer) { clearInterval(logTimer); logTimer = null; }
      if (neuralCtl) neuralCtl.stop();
      if (orbitalCtl) orbitalCtl.stop();
    },
  };
})(window);
