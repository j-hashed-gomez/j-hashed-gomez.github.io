/* resume.js — runtime for the dashboard CV.
   Orchestrates: splash, top bar, render() from CV_DATA, command palette,
   Konami easter egg, static toggle, IntersectionObserver triggers, custom
   cursor, contact modal, PDF generation. */

(function () {
  'use strict';

  // ---- state ------------------------------------------------------------
  let currentLang = 'en';
  const COOKIE_KEY = 'selectedLanguage';
  const STATIC_KEY = 'staticMode';

  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function setCookie(name, value, days = 365) {
    const d = new Date(); d.setTime(d.getTime() + days * 86400000);
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/;SameSite=Lax`;
  }

  // ---- boot --------------------------------------------------------------
  function boot(lang) {
    currentLang = lang;
    setCookie(COOKIE_KEY, lang);
    document.documentElement.lang = lang;
    render(lang);
    startUptime();
  }

  // ---- render full dashboard from CV_DATA -------------------------------
  function render(lang) {
    if (!window.CV_DATA) { console.error('CV_DATA missing'); return; }
    const D = window.CV_DATA;
    const L = D.ui_labels[lang];

    // Top bar labels
    document.getElementById('brand-name').textContent = D.meta.name.split(' ').slice(0, 2).join(' ').toUpperCase();
    document.getElementById('brand-role').textContent = D.meta.role[lang];
    document.getElementById('sys-label').textContent = L.sys;
    document.getElementById('sys-os').textContent = `${D.meta.os_name} ${D.meta.os_version}`;
    document.getElementById('sys-uptime-label').textContent = L.uptime;
    document.getElementById('sys-uid-label').textContent = L.uid;
    document.getElementById('sys-uid').textContent = D.meta.handle;

    // Hero
    document.getElementById('hero-prompt').innerHTML = `&gt; SUBJECT.profile.load()<span class="blink">_</span>`;
    const heroName = D.meta.name.toUpperCase();
    const heroEl = document.getElementById('hero-name');
    heroEl.textContent = heroName;
    heroEl.setAttribute('data-text', heroName);
    document.getElementById('hero-sub').textContent = `${D.meta.role[lang]} — ${CV_GRAPHS.computeStats(D).years}+ ${lang === 'es' ? 'años en TI' : 'years in IT'}`;
    document.getElementById('hero-tagline').innerHTML = `&gt; ${escapeHtml(D.meta.email)}<span class="blink">_</span>`;
    document.getElementById('hero-status-text').textContent = D.meta.status[lang];
    document.getElementById('scroll-hint-text').textContent = L.scroll_hint;

    // Section heads
    document.getElementById('section-01-label').textContent = L.section_01;
    document.getElementById('section-02-label').textContent = L.section_02;
    document.getElementById('section-03-label').textContent = L.section_03;
    document.getElementById('section-04-label').textContent = L.section_04;
    document.getElementById('section-05-label').textContent = L.section_05;
    document.getElementById('section-06-label').textContent = L.section_06;
    document.getElementById('section-07-label').textContent = L.section_07;
    document.getElementById('section-08-label').textContent = L.section_08;
    document.getElementById('section-09-label').textContent = L.section_09;
    document.getElementById('panel-01-label').textContent = L.panel_01;
    document.getElementById('panel-02-label').textContent = L.panel_02;
    document.getElementById('panel-03-label').textContent = L.panel_03;
    document.getElementById('panel-04-label').textContent = L.panel_04;
    document.getElementById('panel-05-label').textContent = L.panel_05;

    // Dashboard panels
    CV_GRAPHS.renderTimeline(document.getElementById('timeline-content'), D, lang);
    CV_GRAPHS.renderTelemetry(document.getElementById('telemetry-content'), D, lang);
    CV_GRAPHS.renderHeatmap(document.getElementById('heatmap-content'), D, lang);
    CV_GRAPHS.renderLog(document.getElementById('log-content'), D, lang);

    // Sections
    CV_GRAPHS.renderExperience(document.getElementById('experience-content'), D, lang);
    CV_GRAPHS.renderSkills(document.getElementById('skills-content'), D, lang);
    CV_GRAPHS.renderCertifications(document.getElementById('certifications-content'), D, lang);
    CV_GRAPHS.renderTrainings(document.getElementById('trainings-content'), D, lang);
    CV_GRAPHS.renderLanguages(document.getElementById('languages-content'), D, lang);
    CV_GRAPHS.renderAbout(document.getElementById('about-content'), D, lang);
    CV_GRAPHS.renderContact(document.getElementById('contact-content'), D, lang);
    CV_GRAPHS.renderEotActions(document.getElementById('eot-actions'), D, lang);
    CV_GRAPHS.renderOrbitalFallback(document.getElementById('orbital-fallback'), D, lang);

    // EOT footer
    document.getElementById('eot-footer').innerHTML = lang === 'es'
      ? '&gt; pulsa <span class="blink">_</span> para iniciar una nueva sesión'
      : '&gt; press <span class="blink">_</span> to start a new session';

    // Top bar lang button state
    document.getElementById('btn-lang-es').classList.toggle('is-active', lang === 'es');
    document.getElementById('btn-lang-en').classList.toggle('is-active', lang === 'en');

    // Contact modal i18n
    document.getElementById('contact-modal-title').textContent = lang === 'es' ? 'CONTACTO' : 'CONTACT';
    document.getElementById('label-name').textContent = lang === 'es' ? 'NOMBRE' : 'NAME';
    document.getElementById('label-message').textContent = lang === 'es' ? 'MENSAJE' : 'MESSAGE';
    document.getElementById('contact-btn-text-submit').textContent = lang === 'es' ? 'ENVIAR_MENSAJE' : 'SEND_MESSAGE';
    document.getElementById('btn-sending-text').textContent = lang === 'es' ? 'ENVIANDO…' : 'SENDING…';
    document.getElementById('contact-name').placeholder = lang === 'es' ? 'Tu nombre…' : 'Your name…';
    document.getElementById('contact-email').placeholder = lang === 'es' ? 'tu@email.com' : 'you@email.com';
    document.getElementById('contact-message').placeholder = lang === 'es' ? 'Escribe tu mensaje aquí…' : 'Write your message here…';

    // After re-render, rewire dynamic buttons
    document.getElementById('open-pdf-btn').addEventListener('click', generatePDF);
    document.getElementById('open-contact-btn').addEventListener('click', () => openContactModal());

    // Trigger graphs that depend on layout/visibility
    mountLazyGraphs();
  }

  // ---- top bar ----------------------------------------------------------
  const startedAt = Date.now();
  function startUptime() {
    const el = document.getElementById('sys-uptime');
    const clockEl = document.getElementById('ts-clock');
    function tick() {
      const s = Math.floor((Date.now() - startedAt) / 1000);
      const pad2 = (n) => String(n).padStart(2, '0');
      const h = pad2(Math.floor(s / 3600));
      const m = pad2(Math.floor((s % 3600) / 60));
      const ss = pad2(s % 60);
      if (el) el.textContent = `${h}:${m}:${ss}`;
      if (clockEl) {
        const d = new Date();
        clockEl.textContent = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
      }
    }
    tick(); setInterval(tick, 1000);
  }

  function bindTopbar() {
    document.getElementById('btn-lang-es').addEventListener('click', () => switchLang('es'));
    document.getElementById('btn-lang-en').addEventListener('click', () => switchLang('en'));
    document.getElementById('btn-palette').addEventListener('click', () => openPalette());
    document.getElementById('btn-static').addEventListener('click', () => toggleStatic());
  }

  function switchLang(lang) {
    if (lang === currentLang) return;
    currentLang = lang;
    setCookie(COOKIE_KEY, lang);
    document.documentElement.lang = lang;
    CV_GRAPHS.stopAll();
    render(lang);
  }

  // ---- static mode ------------------------------------------------------
  function applyStatic(on) {
    document.body.dataset.mode = on ? 'static' : 'live';
    const btn = document.getElementById('btn-static');
    if (btn) {
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'LIVE' : 'STATIC';
      btn.classList.toggle('is-active', on);
    }
    if (on) {
      CV_GRAPHS.stopAll();
    } else {
      // Re-mount visualizations
      mountLazyGraphs(true);
      // Restart log
      CV_GRAPHS.renderLog(document.getElementById('log-content'), window.CV_DATA, currentLang);
    }
    try { localStorage.setItem(STATIC_KEY, on ? '1' : '0'); } catch (_) {}
  }
  function toggleStatic() {
    applyStatic(document.body.dataset.mode !== 'static');
  }

  // ---- lazy mount of expensive graphs ----------------------------------
  let neuralMounted = false;
  let orbitalMounted = false;
  let telemetryAnimated = false;
  let lazyObserver = null;
  function mountLazyGraphs(force = false) {
    if (force) { neuralMounted = false; orbitalMounted = false; telemetryAnimated = false; }
    if (lazyObserver) { lazyObserver.disconnect(); lazyObserver = null; }
    // Re-mount everything fresh after a render() call
    neuralMounted = false; orbitalMounted = false; telemetryAnimated = false;

    const dashboardPanel = document.getElementById('panel-neural');
    const telemetryPanel = document.getElementById('panel-telemetry');
    const orbitalPanel = document.getElementById('orbital-wrap');

    lazyObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (entry.target === dashboardPanel && !neuralMounted) {
          neuralMounted = true;
          CV_GRAPHS.initNeuralGraph(
            document.getElementById('neural-canvas'),
            document.getElementById('neural-tooltip'),
            window.CV_DATA, currentLang
          );
        }
        if (entry.target === telemetryPanel && !telemetryAnimated) {
          telemetryAnimated = true;
          CV_GRAPHS.animateCountUps(telemetryPanel);
        }
        if (entry.target === orbitalPanel && !orbitalMounted) {
          orbitalMounted = true;
          // mobile path: orbital hidden via CSS; skip
          if (getComputedStyle(orbitalPanel).display !== 'none') {
            CV_GRAPHS.initOrbital(document.getElementById('orbital-canvas'), window.CV_DATA);
          }
        }
      });
    }, { threshold: 0.25 });

    [dashboardPanel, telemetryPanel, orbitalPanel].forEach((el) => { if (el) lazyObserver.observe(el); });
  }

  // ---- command palette --------------------------------------------------
  let paletteOpen = false;
  let paletteSelected = 0;
  let paletteFiltered = [];

  function getCommands() {
    return [
      { cmd: 'goto hero',          desc: 'scroll to hero',         run: () => scrollToId('hero') },
      { cmd: 'goto dashboard',     desc: 'system_monitor.live',    run: () => scrollToId('section-dashboard') },
      { cmd: 'goto experience',    desc: 'experience.history',     run: () => scrollToId('section-experience') },
      { cmd: 'goto orbital',       desc: 'active_integrations',    run: () => scrollToId('section-orbital') },
      { cmd: 'goto skills',        desc: 'skills.matrix',          run: () => scrollToId('section-skills') },
      { cmd: 'goto certs',         desc: 'certifications.ledger',  run: () => scrollToId('section-certs') },
      { cmd: 'goto trainings',     desc: 'trainings.archive',      run: () => scrollToId('section-trainings') },
      { cmd: 'goto languages',     desc: 'languages.dial',         run: () => scrollToId('section-languages') },
      { cmd: 'goto about',         desc: 'subject.profile',        run: () => scrollToId('section-about') },
      { cmd: 'goto contact',       desc: 'end_of_transmission',    run: () => scrollToId('section-contact') },
      { cmd: 'download cv.pdf',    desc: 'export to PDF',          run: () => generatePDF() },
      { cmd: 'open contact',       desc: 'send a message',         run: () => openContactModal() },
      { cmd: 'open linkedin',      desc: 'external link',          run: () => window.open(CV_DATA.meta.linkedin, '_blank') },
      { cmd: 'open github',        desc: 'external link',          run: () => window.open(CV_DATA.meta.github, '_blank') },
      { cmd: 'mailto jose',        desc: 'compose email',          run: () => location.href = 'mailto:' + CV_DATA.meta.email },
      { cmd: 'toggle static',      desc: 'ATS-friendly mode',      run: () => toggleStatic() },
      { cmd: 'switch lang es',     desc: 'español',                 run: () => switchLang('es') },
      { cmd: 'switch lang en',     desc: 'english',                 run: () => switchLang('en') },
      { cmd: 'sudo hire',          desc: 'reveal access grant',    run: () => showAccessGrant() },
    ];
  }

  function openPalette() {
    paletteOpen = true;
    paletteSelected = 0;
    const overlay = document.getElementById('palette-overlay');
    const input = document.getElementById('palette-input');
    overlay.classList.remove('hidden');
    input.value = '';
    refreshPalette('');
    setTimeout(() => input.focus(), 30);
  }
  function closePalette() {
    paletteOpen = false;
    document.getElementById('palette-overlay').classList.add('hidden');
  }
  function refreshPalette(q) {
    const cmds = getCommands();
    paletteFiltered = q ? cmds.filter((c) => (c.cmd + ' ' + c.desc).toLowerCase().includes(q.toLowerCase())) : cmds;
    if (paletteSelected >= paletteFiltered.length) paletteSelected = 0;
    const list = document.getElementById('palette-list');
    list.innerHTML = paletteFiltered.map((c, i) => `
      <li class="palette-item ${i === paletteSelected ? 'is-selected' : ''}" role="option" data-idx="${i}">
        <span class="cmd">&gt; ${escapeHtml(c.cmd)}</span>
        <span class="desc">${escapeHtml(c.desc)}</span>
      </li>`).join('');
    Array.from(list.children).forEach((li) => {
      li.addEventListener('click', () => { paletteSelected = parseInt(li.dataset.idx, 10); runSelected(); });
    });
  }
  function runSelected() {
    const c = paletteFiltered[paletteSelected];
    if (!c) return;
    closePalette();
    c.run();
  }
  function bindPalette() {
    const input = document.getElementById('palette-input');
    const overlay = document.getElementById('palette-overlay');
    input.addEventListener('input', () => { paletteSelected = 0; refreshPalette(input.value); });
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); paletteSelected = Math.min(paletteFiltered.length - 1, paletteSelected + 1); refreshPalette(input.value); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); paletteSelected = Math.max(0, paletteSelected - 1); refreshPalette(input.value); }
      else if (ev.key === 'Enter') { ev.preventDefault(); runSelected(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); closePalette(); }
    });
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closePalette(); });
    document.addEventListener('keydown', (ev) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        paletteOpen ? closePalette() : openPalette();
      } else if (paletteOpen && ev.key === 'Escape') {
        closePalette();
      }
    });
  }

  function scrollToId(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---- Konami easter egg -----------------------------------------------
  const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let konamiIdx = 0;
  function bindKonami() {
    document.addEventListener('keydown', (ev) => {
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      if (k === KONAMI[konamiIdx]) {
        konamiIdx++;
        if (konamiIdx === KONAMI.length) { konamiIdx = 0; showAccessGrant(); }
      } else {
        konamiIdx = (k === KONAMI[0]) ? 1 : 0;
      }
    });
  }
  function showAccessGrant() {
    const overlay = document.getElementById('grant-overlay');
    overlay.classList.remove('hidden');
    const close = () => overlay.classList.add('hidden');
    overlay.addEventListener('click', close, { once: true });
    setTimeout(close, 5000);
  }

  // ---- custom cursor ---------------------------------------------------
  function bindCursor() {
    if (!matchMedia('(pointer: fine)').matches) return;
    const cur = document.getElementById('cursor-block');
    document.addEventListener('mousemove', (ev) => {
      cur.style.transform = `translate(${ev.clientX - 6}px, ${ev.clientY - 9}px)`;
    });
    document.addEventListener('mouseover', (ev) => {
      const t = ev.target;
      if (t.closest && t.closest('a, button, [role=button], .chip, .timeline-fill, .palette-item, .splash-flag')) {
        cur.classList.add('cursor-hot');
      } else {
        cur.classList.remove('cursor-hot');
      }
    });
  }

  // ---- contact modal ---------------------------------------------------
  function openContactModal() {
    document.getElementById('contact-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }
  function closeContactModal() {
    document.getElementById('contact-modal').classList.add('hidden');
    document.body.style.overflow = '';
  }
  function bindContactModal() {
    document.getElementById('contact-modal-close').addEventListener('click', closeContactModal);
    document.getElementById('contact-modal').addEventListener('click', (ev) => {
      if (ev.target.id === 'contact-modal') closeContactModal();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !document.getElementById('contact-modal').classList.contains('hidden')) {
        closeContactModal();
      }
    });

    const form = document.getElementById('contact-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('contact-submit-btn');
      const btnText = document.getElementById('contact-btn-text-submit');
      const btnLoading = document.getElementById('contact-btn-loading');
      const formMessage = document.getElementById('contact-form-message');

      const formData = {
        name: document.getElementById('contact-name').value.trim(),
        email: document.getElementById('contact-email').value.trim(),
        message: document.getElementById('contact-message').value.trim(),
      };

      submitBtn.disabled = true;
      btnText.style.display = 'none';
      btnLoading.style.display = 'inline';
      formMessage.style.display = 'none';
      formMessage.className = 'contact-form-message';

      try {
        const response = await fetch('https://telegram-contact-form.jose-gnu.workers.dev', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (result.success) {
          formMessage.textContent = currentLang === 'es'
            ? '✓ Mensaje enviado correctamente. ¡Gracias!'
            : '✓ Message sent successfully. Thank you!';
          formMessage.className = 'contact-form-message success';
          form.reset();
          setTimeout(closeContactModal, 3000);
        } else {
          formMessage.textContent = '✗ ' + (result.error || (currentLang === 'es' ? 'Error al enviar el mensaje' : 'Error sending message'));
          formMessage.className = 'contact-form-message error';
        }
      } catch (err) {
        formMessage.textContent = currentLang === 'es'
          ? '✗ Error de red. Inténtalo más tarde.'
          : '✗ Network error. Please try again later.';
        formMessage.className = 'contact-form-message error';
      } finally {
        submitBtn.disabled = false;
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
      }
    });
  }

  // ---- PDF generation (jsPDF, reads from CV_DATA) -----------------------
  function getImageAsBase64(imgPath, callback) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function () {
      canvas.width = img.width; canvas.height = img.height;
      ctx.drawImage(this, 0, 0);
      callback(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = function () { callback(null); };
    img.src = imgPath;
  }

  function generatePDF() {
    getImageAsBase64('img/mifoto.png', (imageData) => generatePDFWithImage(imageData));
  }

  function generatePDFWithImage(imageData) {
    if (!window.jspdf) { console.warn('jsPDF not loaded'); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const D = window.CV_DATA;
    const lang = currentLang;

    const colors = {
      darkBg: [15, 23, 42],
      primary: [34, 197, 94],
      secondary: [59, 130, 246],
      accent: [168, 85, 247],
      white: [255, 255, 255],
      lightGray: [203, 213, 225],
    };

    // Header band
    doc.setFillColor(...colors.darkBg);
    doc.rect(0, 0, 210, 50, 'F');

    // Photo
    if (imageData) {
      try {
        doc.addImage(imageData, 'JPEG', 15, 10, 28, 35);
      } catch (_) {
        doc.setFillColor(...colors.white); doc.rect(15, 10, 28, 35, 'F');
      }
    } else {
      doc.setFillColor(...colors.white); doc.rect(15, 10, 28, 35, 'F');
    }
    doc.setDrawColor(...colors.secondary);
    doc.setLineWidth(2);
    doc.rect(15, 10, 28, 35, 'S');

    doc.setTextColor(...colors.white);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(D.meta.name.toUpperCase(), 50, 20);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(D.meta.role[lang], 50, 28);

    doc.setFontSize(10);
    doc.text(D.meta.email, 50, 36);
    doc.text(D.meta.location, 50, 42);

    let y = 55;
    const leftCol = 20, rightCol = 115, colWidth = 85;

    // LEFT COL — languages
    doc.setFillColor(...colors.secondary);
    doc.rect(leftCol - 5, y - 3, colWidth, 8, 'F');
    doc.setTextColor(...colors.white);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(lang === 'es' ? 'IDIOMAS' : 'LANGUAGES', leftCol, y + 2);

    y += 15;
    doc.setTextColor(...colors.darkBg);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    D.languages.forEach((l) => {
      doc.text(`• ${l.name[lang]} (${l.level[lang]})`, leftCol, y);
      y += 6;
    });

    y += 8;

    // LEFT COL — skills
    doc.setFillColor(...colors.secondary);
    doc.rect(leftCol - 5, y - 3, colWidth, 8, 'F');
    doc.setTextColor(...colors.white);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(lang === 'es' ? 'COMPETENCIAS' : 'SKILLS', leftCol, y + 2);

    y += 15;
    doc.setFontSize(9);
    D.skills[lang].forEach((g) => {
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...colors.primary);
      doc.text(g.group, leftCol, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...colors.darkBg);
      doc.text('• ' + g.items.join(', '), leftCol, y); y += 6;
    });

    y += 6;

    // LEFT COL — certifications (top 6)
    doc.setFillColor(...colors.secondary);
    doc.rect(leftCol - 5, y - 3, colWidth, 8, 'F');
    doc.setTextColor(...colors.white);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(lang === 'es' ? 'CERTIFICACIONES' : 'CERTIFICATIONS', leftCol, y + 2);
    y += 12;
    doc.setTextColor(...colors.darkBg);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    D.certifications.slice(0, 6).forEach((c) => {
      const lines = doc.splitTextToSize(`${c.year} · ${c.name}`, colWidth - 5);
      lines.forEach((line) => { doc.text(line, leftCol, y); y += 4; });
      y += 1;
    });

    // RIGHT COL — profile
    y = 55;
    doc.setFillColor(...colors.accent);
    doc.rect(rightCol - 5, y - 3, colWidth, 8, 'F');
    doc.setTextColor(...colors.white);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(lang === 'es' ? 'PERFIL PROFESIONAL' : 'PROFESSIONAL PROFILE', rightCol, y + 2);

    y += 12;
    doc.setTextColor(...colors.darkBg);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    const aboutLines = doc.splitTextToSize(D.about[lang][0], colWidth);
    aboutLines.forEach((line) => { doc.text(line, rightCol, y); y += 5; });

    y += 10;

    // RIGHT COL — experience
    doc.setFillColor(...colors.accent);
    doc.rect(rightCol - 5, y - 3, colWidth, 8, 'F');
    doc.setTextColor(...colors.white);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(lang === 'es' ? 'EXPERIENCIA' : 'EXPERIENCE', rightCol, y + 2);
    y += 12;

    D.experience.slice(0, 6).forEach((e) => {
      if (y > 250) {
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 210, 297, 'F');
        y = 25;
      }
      doc.setTextColor(...colors.primary);
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(e.period[lang], rightCol, y);
      doc.setTextColor(...colors.accent);
      const companyText = doc.splitTextToSize(e.company, 45);
      doc.text(companyText, rightCol + 50, y);
      y += 6;

      doc.setTextColor(...colors.darkBg);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(e.title[lang], rightCol, y);
      y += 6;

      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      const descLines = doc.splitTextToSize(e.description[lang], colWidth - 5);
      descLines.forEach((line) => { doc.text(line, rightCol, y); y += 4; });

      doc.setTextColor(...colors.secondary);
      doc.setFontSize(8);
      const stackLines = doc.splitTextToSize(e.stack.join(' • '), colWidth - 5);
      stackLines.forEach((line) => { doc.text(line, rightCol, y); y += 3; });

      y += 4;
    });

    // footer
    doc.setTextColor(...colors.lightGray);
    doc.setFontSize(8);
    doc.text(D.meta.email, 15, 287);
    doc.text((new Date()).toISOString().slice(0, 10), 195, 287, { align: 'right' });

    const fileName = lang === 'es' ? 'CV_Jose_Luis_Gomez_ES.pdf' : 'Resume_Jose_Luis_Gomez_EN.pdf';
    doc.save(fileName);
  }

  // ---- helpers ---------------------------------------------------------
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---- matrix rain (scoped to the hero) --------------------------------
  function initMatrixRain() {
    const canvas = document.getElementById('fx-matrix');
    const host = canvas && canvas.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const charset = 'アァカサタナハマヤラワヲンｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&{}[]<>=+*';
    const fontSize = 16;
    let w = 0, h = 0, cols = 0, drops = [], speeds = [];

    function setup() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = host.getBoundingClientRect();
      w = Math.max(320, rect.width);
      h = Math.max(320, rect.height);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / fontSize);
      drops = new Array(cols).fill(0).map(() => Math.random() * h / fontSize);
      speeds = new Array(cols).fill(0).map(() => 0.45 + Math.random() * 0.85);
      // black wash baseline
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
    }
    setup();
    const ro = new ResizeObserver(setup); ro.observe(host);

    let visible = true;
    const io = new IntersectionObserver((entries) => {
      visible = entries[0] && entries[0].isIntersecting;
    }, { threshold: 0 });
    io.observe(host);

    function frame() {
      if (visible) {
        ctx.fillStyle = 'rgba(0,0,0,0.075)';
        ctx.fillRect(0, 0, w, h);
        ctx.font = `${fontSize}px JetBrains Mono, VT323, monospace`;
        for (let i = 0; i < cols; i++) {
          const c = charset[(Math.random() * charset.length) | 0];
          const x = i * fontSize;
          const y = drops[i] * fontSize;
          if (Math.random() < 0.02) {
            ctx.fillStyle = '#E8FFE8';
            ctx.shadowColor = '#00FF41'; ctx.shadowBlur = 8;
          } else {
            ctx.fillStyle = '#00FF41';
            ctx.shadowBlur = 0;
          }
          ctx.fillText(c, x, y);
          drops[i] += speeds[i];
          if (y > h && Math.random() > 0.972) drops[i] = 0;
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---- panel tilt (3D) -------------------------------------------------
  function initPanelTilt() {
    const MAX = 8;        // max degrees
    const NEAR_PX = 24;   // panel "near edge" pop
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!matchMedia('(pointer: fine)').matches) return;

    function attach() {
      document.querySelectorAll('.panel:not([data-tilt-bound])').forEach((panel) => {
        panel.setAttribute('data-tilt-bound', '1');
        // inject a glare overlay once
        if (!panel.querySelector('.panel-glare')) {
          const glare = document.createElement('div');
          glare.className = 'panel-glare';
          panel.insertBefore(glare, panel.firstChild);
        }

        let raf = null, pendingX = 0, pendingY = 0, pendingMX = 0, pendingMY = 0;

        function onMove(ev) {
          const r = panel.getBoundingClientRect();
          const px = (ev.clientX - r.left) / r.width;   // 0..1
          const py = (ev.clientY - r.top) / r.height;
          const rx = (0.5 - py) * MAX * 2;              // rotateX
          const ry = (px - 0.5) * MAX * 2;              // rotateY
          pendingX = rx; pendingY = ry;
          pendingMX = px * 100; pendingMY = py * 100;
          if (!raf) raf = requestAnimationFrame(apply);
        }
        function apply() {
          raf = null;
          panel.style.transform =
            `perspective(1100px) rotateX(${pendingX.toFixed(2)}deg) rotateY(${pendingY.toFixed(2)}deg) translateZ(${NEAR_PX}px)`;
          panel.style.setProperty('--mx', pendingMX + '%');
          panel.style.setProperty('--my', pendingMY + '%');
        }
        function onEnter() { panel.classList.add('tilt-active'); }
        function onLeave() {
          panel.classList.remove('tilt-active');
          panel.style.transform = '';
        }

        panel.addEventListener('mouseenter', onEnter);
        panel.addEventListener('mousemove', onMove);
        panel.addEventListener('mouseleave', onLeave);
      });
    }
    attach();
    // re-attach when render() repaints sections
    const obs = new MutationObserver(() => attach());
    obs.observe(document.body, { subtree: true, childList: true });
  }

  // ---- init ------------------------------------------------------------
  window.addEventListener('DOMContentLoaded', () => {
    bindTopbar();
    bindPalette();
    bindKonami();
    bindCursor();
    bindContactModal();
    initMatrixRain();

    // Apply persisted static-mode preference
    try {
      if (localStorage.getItem(STATIC_KEY) === '1') {
        document.body.dataset.mode = 'static';
        const btn = document.getElementById('btn-static');
        btn.textContent = 'LIVE'; btn.classList.add('is-active'); btn.setAttribute('aria-pressed', 'true');
      } else {
        document.body.dataset.mode = 'live';
      }
    } catch (_) {}

    const cookieLang = getCookie(COOKIE_KEY);
    const lang = (cookieLang === 'es' || cookieLang === 'en') ? cookieLang : 'en';
    boot(lang);

    // Tilt depends on .panel existing — run after first paint
    requestAnimationFrame(() => initPanelTilt());
  });
})();
