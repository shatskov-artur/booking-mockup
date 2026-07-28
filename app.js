/* =============================================================================
   app.js — логика макета. Обслуживает обе страницы (index.html и admin.html):
   темы, язык, календарь, слоты, валидация формы, список записей.
   Ничего никуда не отправляется — все данные из data.js.
   ============================================================================= */

(function () {
  'use strict';

  /* --- состояние ---------------------------------------------------------- */
  var state = {
    lang: 'pl',
    theme: 'pink',
    serviceId: null,
    dayOffset: null,
    time: null,
    adminRange: 'today',
    appointments: FAKE_APPOINTMENTS.map(function (a) { return Object.assign({}, a); }),
    /* календарь админки */
    calMonth: 0,            // 0 = текущий месяц, ±1 — соседние
    calSelectedDay: null,   // выбранный день (смещение от сегодня) или null
    /* перенос записи */
    moveId: null,           // какую запись переносим
    moveDay: null,
    moveTime: null,
    dragId: null,           // что тащим мышкой
    /* ручное добавление записи */
    addService: null,
    addDay: null,
    addTime: null,
    /* разделы админки */
    section: 'appts',
    /* галерея */
    gallery: GALLERY.map(function (g) { return Object.assign({}, g); }),
    galTab: 'active',
    galDragId: null,
    galNew: [],             // сжатые фото, ждущие названия перед добавлением
    /* услуги (копия — правки не должны менять data.js) */
    services: SERVICES.map(function (s) { return Object.assign({}, s); }),
    srvEditId: null,
    /* график и блокировки */
    schedule: SCHEDULE.map(function (s) { return Object.assign({}, s); }),
    blocks: BLOCKS.map(function (b) { return Object.assign({}, b); }),
    blkDay: null,
  };

  /* --- хранилище -----------------------------------------------------------
     Макет без бэкенда: правки мастера держим в localStorage, чтобы они
     не пропадали при перезагрузке. Записи не храним — они демонстрационные.
     ---------------------------------------------------------------------- */

  var STORE_KEYS = {
    gallery: 'booking.gallery',
    services: 'booking.services',
    schedule: 'booking.schedule',
    blocks: 'booking.blocks',
  };

  function save(what) {
    try {
      localStorage.setItem(STORE_KEYS[what], JSON.stringify(state[what]));
      return true;
    } catch (e) {
      /* Чаще всего это переполнение квоты из-за фото в data URL */
      return false;
    }
  }

  function load(what) {
    try {
      var raw = localStorage.getItem(STORE_KEYS[what]);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function loadAll() {
    ['gallery', 'services', 'schedule', 'blocks'].forEach(function (k) {
      var v = load(k);
      if (v) state[k] = v;
    });
  }

  /* --- утилиты ------------------------------------------------------------ */

  function t(key) {
    var dict = I18N[state.lang] || I18N.pl;
    return dict[key] !== undefined ? dict[key] : key;
  }

  /* Подстановка {name} в строку перевода */
  function tf(key, vars) {
    return String(t(key)).replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] !== undefined ? vars[k] : m;
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function $(sel) { return document.querySelector(sel); }

  function svgIcon(paths, size) {
    var s = size || 16;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + paths + '</svg>';
  }

  var ICON_CHECK = '<path d="M20 6L9 17l-5-5"/>';
  var ICON_CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';
  var ICON_X = '<path d="M18 6L6 18M6 6l12 12"/>';
  var ICON_ALERT = '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>';
  var ICON_CAL = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>';
  var ICON_MOVE = '<path d="M5 12h14M12 5l7 7-7 7"/>';
  var ICON_PHONE = '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/>';

  function getService(id) {
    /* Ищем среди всех услуг, включая выключенные: у старых записей услуга
       может быть уже скрыта, но название и цену показать всё равно надо. */
    for (var i = 0; i < state.services.length; i++) {
      if (state.services[i].id === id) return state.services[i];
    }
    return null;
  }

  /* Услуги для публичной части и записи — только включённые */
  function activeServices() {
    return state.services.filter(function (s) { return s.active !== false; });
  }

  /* Название услуги: у встроенных берём из переводов по key,
     у добавленных мастером — введённое ею title. */
  function srvName(srv) {
    if (!srv) return '—';
    return srv.title ? srv.title : t(srv.key);
  }

  function srvDesc(srv) {
    if (!srv) return '';
    if (srv.desc !== undefined && srv.desc !== null) return srv.desc;
    return srv.key ? t(srv.key + '_desc') : '';
  }

  function money(amount) { return amount + ' ' + t('currency'); }

  function dateFromOffset(offset) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d;
  }

  /* Дата словами на текущем языке. Названия дней/месяцев берём из переводов,
     а не из toLocaleDateString — иначе язык календаря не совпал бы с переключателем. */
  function formatDate(offset, withWeekday) {
    var d = dateFromOffset(offset);
    var s = d.getDate() + ' ' + t('months')[d.getMonth()];
    if (withWeekday) s = t('weekdays_full')[d.getDay()] + ', ' + s;
    return s;
  }

  function isWorkday(offset) {
    return isOpenDay(offset);
  }

  /* --- график работы и блокировки ----------------------------------------- */

  /* Настройки дня недели из графика мастера */
  function dayRule(offset) {
    var wd = dateFromOffset(offset).getDay();
    for (var i = 0; i < state.schedule.length; i++) {
      if (state.schedule[i].day === wd) return state.schedule[i];
    }
    /* графика нет — падаем на значения из SALON */
    return { day: wd, open: SALON.workdays.indexOf(wd) !== -1, from: SALON.hours.from, to: SALON.hours.to };
  }

  /* День рабочий, если открыт по графику и не заблокирован целиком (отпуск) */
  function isOpenDay(offset) {
    var rule = dayRule(offset);
    if (!rule.open) return false;
    for (var i = 0; i < state.blocks.length; i++) {
      var b = state.blocks[i];
      if (b.day === offset && !b.from) return false;   // блокировка на весь день
    }
    return true;
  }

  function hhmmToMins(s) {
    var p = String(s).split(':');
    return (+p[0]) * 60 + (+p[1] || 0);
  }

  /* Попадает ли интервал услуги в блокировку (обед, личные дела) */
  function isBlockedRange(offset, startMins, duration) {
    var end = startMins + duration;
    for (var i = 0; i < state.blocks.length; i++) {
      var b = state.blocks[i];
      if (b.day !== offset) continue;
      if (!b.from) return true;                        // весь день
      var bs = hhmmToMins(b.from), be = hhmmToMins(b.to);
      if (startMins < be && end > bs) return true;     // пересечение
    }
    return false;
  }

  function minutesToTime(mins) {
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* Занятость слотов детерминированная (от даты и времени, не Math.random) —
     иначе при каждой перерисовке занятые часы «прыгали» бы.
     Делим mins на шаг сетки: иначе (mins % 10) при шаге 30 всегда даёт 0
     и день выходит либо целиком занятым, либо целиком свободным. */
  function isBusy(offset, mins) {
    var d = dateFromOffset(offset);
    var slotIndex = Math.floor(mins / SALON.slotStep);
    var seed = (d.getDate() * 7 + d.getMonth() * 3 + slotIndex * 5) % 11;
    return seed < 4;   /* примерно треть слотов занята */
  }

  /* Слоты дня: шаг из SALON, отбрасываем те, где услуга не влезает до закрытия. */
  function buildSlots(offset, duration) {
    /* Часы берём из графика мастера, а не из константы — она правит их сама */
    var rule = dayRule(offset);
    var open = rule.from * 60;
    var close = rule.to * 60;
    var out = [];
    for (var m = open; m + duration <= close; m += SALON.slotStep) {
      /* Слот занят синтетически (демо) или попадает в блокировку */
      var busy = isBusy(offset, m) || isBlockedRange(offset, m, duration);
      out.push({ mins: m, label: minutesToTime(m), busy: busy });
    }
    return out;
  }

  /* --- переключатели темы и языка ---------------------------------------- */

  function applyTheme(id) {
    state.theme = id;
    document.documentElement.setAttribute('data-theme', id);
    try { localStorage.setItem('booking.theme', id); } catch (e) { /* file:// без хранилища */ }
    var btns = document.querySelectorAll('.theme__btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(btns[i].dataset.theme === id));
    }
  }

  /* Переключатели живут в двух местах: в шапке (десктоп) и в подвале
     (мобильный, где шапка не должна занимать первый экран). Заполняем оба. */
  function buildThemeSwitch() {
    var boxes = document.querySelectorAll('.themes');
    if (!boxes.length) return;

    for (var i = 0; i < boxes.length; i++) {
      (function (box) {
        box.innerHTML = '';
        THEMES.forEach(function (th) {
          var b = el('button', 'theme__btn');
          b.type = 'button';
          b.dataset.theme = th.id;
          b.style.background = th.swatch;
          b.setAttribute('aria-pressed', String(th.id === state.theme));
          b.addEventListener('click', function () { applyTheme(th.id); });
          box.appendChild(b);
        });
      })(boxes[i]);
    }
    retitleThemes();
  }

  /* Подписи тем зависят от языка — обновляем отдельно при смене языка */
  function retitleThemes() {
    THEMES.forEach(function (th) {
      var btns = document.querySelectorAll('.theme__btn[data-theme="' + th.id + '"]');
      for (var i = 0; i < btns.length; i++) {
        btns[i].title = t(th.key);
        btns[i].setAttribute('aria-label', t(th.key));
      }
    });
  }

  function buildLangSwitch() {
    var boxes = document.querySelectorAll('.lang');
    if (!boxes.length) return;

    for (var i = 0; i < boxes.length; i++) {
      (function (box) {
        box.innerHTML = '';
        LANGS.forEach(function (lg) {
          var b = el('button', 'lang__btn', lg.label);
          b.type = 'button';
          b.dataset.lang = lg.id;
          b.setAttribute('aria-pressed', String(lg.id === state.lang));
          b.addEventListener('click', function () { applyLang(lg.id); });
          box.appendChild(b);
        });
      })(boxes[i]);
    }
  }

  function applyLang(id) {
    state.lang = id;
    document.documentElement.lang = (id === 'ua' ? 'uk' : id);
    try { localStorage.setItem('booking.lang', id); } catch (e) { /* игнорируем */ }

    var btns = document.querySelectorAll('.lang__btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(btns[i].dataset.lang === id));
    }
    translate();
    retitleThemes();
    renderAll();
  }

  /* Проходим по всем data-i18n и подставляем текст */
  function translate() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].dataset.i18n;
      /* Блок RODO содержит подстановки — собираем отдельно */
      if (key === 'rodo_controller_text') {
        nodes[i].textContent = tf(key, { name: SALON.masterName, address: SALON.address, email: SALON.email });
      } else if (key === 'rodo_retention_text') {
        nodes[i].textContent = tf(key, { months: SALON.retentionMonths });
      } else if (key === 'rodo_rights_text') {
        nodes[i].textContent = tf(key, { email: SALON.email });
      } else if (key === 'srv_err_dur') {
        /* в тексте есть {step} — подставляем сразу, иначе висит в разметке */
        nodes[i].textContent = tf(key, { step: SALON.slotStep });
      } else {
        nodes[i].textContent = t(key);
      }
    }

    var arias = document.querySelectorAll('[data-i18n-aria-label]');
    for (var j = 0; j < arias.length; j++) {
      arias[j].setAttribute('aria-label', t(arias[j].dataset.i18nAriaLabel));
    }

    /* Плейсхолдеры полей */
    setPh('#fName', 'ph_name');
    setPh('#fPhone', 'ph_phone');
    setPh('#fNote', 'ph_note');

    /* Данные салона в разметке */
    var salonNodes = document.querySelectorAll('[data-salon]');
    for (var k = 0; k < salonNodes.length; k++) {
      salonNodes[k].textContent = SALON[salonNodes[k].dataset.salon];
    }
    var ph = $('#contactPhone');
    if (ph) ph.href = 'tel:' + SALON.phone.replace(/\s/g, '');
    var em = $('#contactEmail');
    if (em) em.href = 'mailto:' + SALON.email;

    var title = $('#pageTitle');
    if (title) document.title = title.textContent;
  }

  function setPh(sel, key) {
    var n = $(sel);
    if (n) n.placeholder = t(key);
  }

  /* --- услуги и галерея --------------------------------------------------- */

  function renderServices() {
    var grid = $('#servicesGrid');
    if (!grid) return;
    grid.innerHTML = '';

    activeServices().forEach(function (srv) {
      var card = el('article', 'card card--service');

      var top = el('div', 'service__top');
      var left = el('div');
      left.appendChild(el('h3', 'service__name', srvName(srv)));
      top.appendChild(left);
      top.appendChild(el('span', 'service__price', money(srv.price)));
      card.appendChild(top);

      card.appendChild(el('p', 'service__desc', srvDesc(srv)));

      var foot = el('div', 'service__foot');
      var meta = el('span', 'service__meta');
      meta.innerHTML = svgIcon(ICON_CLOCK, 15) + ' <span>' + srv.duration + ' ' + t('srv_duration') + '</span>';
      foot.appendChild(meta);

      var pick = el('button', 'btn btn--ghost btn--sm', t('srv_book'));
      pick.type = 'button';
      pick.addEventListener('click', function () {
        selectService(srv.id);
        var target = $('#booking');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      foot.appendChild(pick);

      card.appendChild(foot);
      grid.appendChild(card);
    });
  }

  function renderGallery() {
    var grid = $('#galleryGrid');
    if (!grid) return;
    grid.innerHTML = '';

    /* На сайте показываем только неархивные фото */
    visibleGallery().forEach(function (item) {
      var tile = el('figure', 'tile');
      /* загруженное фото важнее заглушки-градиента */
      if (item.src) {
        tile.style.backgroundImage = 'url(' + item.src + ')';
        tile.style.backgroundSize = 'cover';
        tile.style.backgroundPosition = 'center';
      } else {
        tile.style.background = item.gradient;
      }
      tile.style.margin = '0';

      var cap = el('figcaption', 'tile__caption');
      cap.appendChild(document.createTextNode(galTitle(item)));
      /* Пометку «место для фото» показываем только у заглушек */
      if (!item.src) cap.appendChild(el('span', 'tile__note', t('gallery_placeholder_note')));
      tile.appendChild(cap);
      grid.appendChild(tile);
    });
  }

  function visibleGallery() {
    return state.gallery.filter(function (g) { return !g.archived; });
  }

  /* Подпись фото: у заглушек из переводов, у загруженных — имя файла */
  function galTitle(item) {
    return item.title ? item.title : (item.key ? t(item.key) : '');
  }

  /* Декоративная плитка в hero — берём первые 4 градиента галереи */
  function renderHeroArt() {
    var art = $('#heroArt');
    if (!art) return;
    art.innerHTML = '';
    visibleGallery().slice(0, 4).forEach(function (item) {
      var s = el('span');
      if (item.src) {
        s.style.backgroundImage = 'url(' + item.src + ')';
        s.style.backgroundSize = 'cover';
        s.style.backgroundPosition = 'center';
      } else {
        s.style.background = item.gradient;
      }
      art.appendChild(s);
    });
  }

  /* --- форма записи ------------------------------------------------------- */

  function renderServicePicker() {
    var box = $('#servicePicker');
    if (!box) return;
    box.innerHTML = '';

    activeServices().forEach(function (srv) {
      var b = el('button', 'picker__item');
      b.type = 'button';
      b.dataset.id = srv.id;
      b.setAttribute('aria-pressed', String(state.serviceId === srv.id));

      var info = el('span');
      info.appendChild(el('strong', null, srvName(srv)));
      info.appendChild(el('span', null, srv.duration + ' ' + t('srv_duration')));
      b.appendChild(info);
      b.appendChild(el('span', 'picker__price', money(srv.price)));

      b.addEventListener('click', function () { selectService(srv.id); });
      box.appendChild(b);
    });
  }

  function selectService(id) {
    state.serviceId = id;
    /* Длительность изменилась — прежнее время может не влезать, сбрасываем */
    state.time = null;
    hideError('errService');
    renderServicePicker();
    renderSlots();
    renderSummary();
  }

  function renderDays() {
    var strip = $('#daysStrip');
    if (!strip) return;
    strip.innerHTML = '';

    for (var i = 0; i < SALON.daysAhead; i++) {
      (function (offset) {
        var d = dateFromOffset(offset);
        var open = isWorkday(offset);

        var b = el('button', 'day');
        b.type = 'button';
        b.disabled = !open;
        b.setAttribute('aria-pressed', String(state.dayOffset === offset));
        b.setAttribute('aria-label', formatDate(offset, true));

        b.appendChild(el('span', 'day__wd', offset === 0 ? t('today_label') : t('weekdays')[d.getDay()]));
        b.appendChild(el('span', 'day__num', String(d.getDate())));
        b.appendChild(el('span', 'day__mo', t('months')[d.getMonth()].slice(0, 3)));

        b.addEventListener('click', function () {
          state.dayOffset = offset;
          state.time = null;
          hideError('errSlot');
          renderDays();
          renderSlots();
          renderSummary();
        });

        strip.appendChild(b);
      })(i);
    }
  }

  function renderSlots() {
    var grid = $('#slotsGrid');
    var hint = $('#slotsHint');
    if (!grid) return;
    grid.innerHTML = '';

    var srv = getService(state.serviceId);

    if (!srv) {
      if (hint) hint.textContent = t('booking_select_service_first');
      return;
    }
    if (state.dayOffset === null) {
      if (hint) hint.textContent = t('booking_pick_date');
      return;
    }

    var slots = buildSlots(state.dayOffset, srv.duration);
    var free = slots.filter(function (s) { return !s.busy; });

    if (!free.length) {
      if (hint) hint.textContent = t('booking_no_slots');
      return;
    }
    if (hint) hint.textContent = t('booking_slots_hint');

    slots.forEach(function (s) {
      var b = el('button', 'slot', s.label);
      b.type = 'button';
      b.disabled = s.busy;
      b.setAttribute('aria-pressed', String(state.time === s.label));
      b.addEventListener('click', function () {
        state.time = s.label;
        hideError('errSlot');
        renderSlots();
        renderSummary();
      });
      grid.appendChild(b);
    });
  }

  function renderSummary() {
    var list = $('#summaryList');
    var empty = $('#summaryEmpty');
    if (!list || !empty) return;

    var srv = getService(state.serviceId);
    var hasSlot = state.dayOffset !== null && state.time;

    if (!srv && !hasSlot) {
      list.hidden = true;
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    list.hidden = false;
    list.innerHTML = '';

    if (srv) {
      addRow(list, t('summary_service'), srvName(srv));
      addRow(list, t('summary_duration'), srv.duration + ' ' + t('srv_duration'));
    }
    if (hasSlot) {
      addRow(list, t('summary_datetime'), formatDate(state.dayOffset, true) + ', ' + state.time);
    }
    if (srv) {
      addRow(list, t('summary_price'), money(srv.price), 'summary__total');
    }
  }

  function addRow(dl, key, val, cls) {
    var dt = el('dt', null, key);
    var dd = el('dd', null, val);
    if (cls) { dt.className = cls; dd.className = cls; }
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  /* --- валидация --------------------------------------------------------- */

  function showError(id, field) {
    var e = document.getElementById(id);
    if (e) e.classList.add('is-shown');
    if (field) field.setAttribute('aria-invalid', 'true');
  }

  function hideError(id, field) {
    var e = document.getElementById(id);
    if (e) e.classList.remove('is-shown');
    if (field) field.removeAttribute('aria-invalid');
  }

  function validName() {
    var f = $('#fName');
    return f && f.value.trim().length >= 2;
  }

  function validPhone() {
    var f = $('#fPhone');
    if (!f) return false;
    var digits = f.value.replace(/\D/g, '');
    return digits.length >= 9;
  }

  function initForm() {
    var form = $('#bookingForm');
    if (!form) return;

    var name = $('#fName');
    var phone = $('#fPhone');
    var consent = $('#fConsent');

    /* Валидация на blur, а не на каждый символ — иначе ошибка мигает при вводе */
    name.addEventListener('blur', function () {
      if (validName()) hideError('errName', name); else showError('errName', name);
    });
    name.addEventListener('input', function () {
      if (validName()) hideError('errName', name);
    });

    phone.addEventListener('blur', function () {
      if (validPhone()) hideError('errPhone', phone); else showError('errPhone', phone);
    });
    phone.addEventListener('input', function () {
      if (validPhone()) hideError('errPhone', phone);
    });

    consent.addEventListener('change', function () {
      if (consent.checked) hideError('errConsent');
    });

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      var firstBad = null;
      var srv = getService(state.serviceId);

      if (!srv) { showError('errService'); firstBad = firstBad || $('#servicePicker'); }
      else hideError('errService');

      if (state.dayOffset === null || !state.time) { showError('errSlot'); firstBad = firstBad || $('#daysStrip'); }
      else hideError('errSlot');

      if (!validName()) { showError('errName', name); firstBad = firstBad || name; }
      else hideError('errName', name);

      if (!validPhone()) { showError('errPhone', phone); firstBad = firstBad || phone; }
      else hideError('errPhone', phone);

      /* RODO: без согласия запись не оформляется */
      if (!consent.checked) { showError('errConsent'); firstBad = firstBad || consent; }
      else hideError('errConsent');

      if (firstBad) {
        if (firstBad.focus) firstBad.focus();
        else firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      showDone(srv);
    });

    var again = $('#againBtn');
    if (again) {
      again.addEventListener('click', function () {
        state.serviceId = null;
        state.dayOffset = null;
        state.time = null;
        form.reset();
        $('#doneScreen').hidden = true;
        form.hidden = false;
        var side = document.querySelector('.booking__side');
        if (side) side.hidden = false;
        renderServicePicker();
        renderDays();
        renderSlots();
        renderSummary();
        $('#booking').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  /* Экран «записано» вместо отправки — с явной пометкой, что это макет */
  function showDone(srv) {
    var form = $('#bookingForm');
    var done = $('#doneScreen');
    var side = document.querySelector('.booking__side');
    var dl = $('#doneSummary');

    dl.innerHTML = '';
    addRow(dl, t('summary_service'), srvName(srv));
    addRow(dl, t('summary_datetime'), formatDate(state.dayOffset, true) + ', ' + state.time);
    addRow(dl, t('summary_duration'), srv.duration + ' ' + t('srv_duration'));
    addRow(dl, t('summary_price'), money(srv.price), 'summary__total');

    form.hidden = true;
    if (side) side.hidden = true;
    done.hidden = false;
    done.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* --- админка ----------------------------------------------------------- */

  /* Записи в data.js заданы смещением в днях и не знают про календарь.
     Сегодня может быть любой день недели, поэтому смещение легко попадает
     на воскресенье — показывать клиентке визит в выходной нельзя.
     Сдвигаем такие записи на ближайший рабочий день. */
  function normalizeAppointmentDays() {
    state.appointments.forEach(function (a) {
      /* Прошлые и отменённые не двигаем: это история, а не план.
         Сдвиг нужен только будущим визитам, чтобы не попасть на выходной. */
      if (a.day < 0 || a.status === 'cancelled') return;
      var guard = 0;
      while (!isWorkday(a.day) && guard++ < 7) a.day += 1;
    });
  }

  function initAdmin() {
    /* Строго [data-range]: класс .tab используют ещё и вкладки галереи
       (Widoczne/Archiwum), и без фильтра клик по ним ломал бы режим списка. */
    var tabs = document.querySelectorAll('.tab[data-range]');
    if (!tabs.length) return;

    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function () {
          state.adminRange = tab.dataset.range;
          /* Уходя из режима месяца, снимаем выбранный день —
             иначе список остался бы отфильтрованным по нему. */
          if (state.adminRange !== 'month') state.calSelectedDay = null;
          for (var j = 0; j < tabs.length; j++) {
            tabs[j].setAttribute('aria-pressed', String(tabs[j].dataset.range === state.adminRange));
          }
          renderAdmin();
        });
      })(tabs[i]);
    }

    var prev = $('#calPrev');
    var next = $('#calNext');
    if (prev) prev.addEventListener('click', function () { shiftMonth(-1); });
    if (next) next.addEventListener('click', function () { shiftMonth(1); });

    initMoveModal();
    initAddModal();
    initSections();
    initGalleryAdmin();
    initServicesAdmin();
    initBlockModal();
  }

  /* Листаем месяц. Выбранный день сбрасываем — он относился к прошлому месяцу. */
  function shiftMonth(delta) {
    state.calMonth += delta;
    state.calSelectedDay = null;
    renderAdmin();
  }

  function visibleAppointments() {
    return state.appointments.filter(function (a) {
      if (a.hidden) return false;
      /* Отменённые — отдельный режим: показываем все, включая прошлые,
         иначе не увидеть, кто отменял раньше. */
      if (state.adminRange === 'cancelled') return a.status === 'cancelled';
      /* В остальных режимах отменённые прошлых дней не мешаются */
      if (a.day < 0) return false;
      if (state.adminRange === 'today') return a.day === 0;
      if (state.adminRange === 'week') return a.day >= 0 && a.day < 7;
      /* месяц: либо конкретный выбранный день, либо весь показанный месяц */
      if (state.calSelectedDay !== null) return a.day === state.calSelectedDay;
      return isInShownMonth(a.day);
    });
  }

  /* --- аналитика отмен ---------------------------------------------------- */

  function cancelledAppts() {
    return state.appointments.filter(function (a) {
      return !a.hidden && a.status === 'cancelled';
    });
  }

  /* Считаем отмены по ключу (клиентка или услуга), сортируем по убыванию */
  function rankCancellations(keyFn) {
    var map = {};
    cancelledAppts().forEach(function (a) {
      var k = keyFn(a);
      if (!k) return;
      if (!map[k]) map[k] = { key: k, count: 0, lost: 0 };
      map[k].count += 1;
      var srv = getService(a.serviceId);
      if (srv) map[k].lost += srv.price;
    });
    var out = [];
    for (var k in map) if (map.hasOwnProperty(k)) out.push(map[k]);
    out.sort(function (x, y) { return y.count - x.count || y.lost - x.lost; });
    return out;
  }

  function renderCancPane() {
    var pane = $('#cancPane');
    if (!pane) return;

    if (state.adminRange !== 'cancelled') { pane.hidden = true; return; }
    pane.hidden = false;

    var byClient = rankCancellations(function (a) { return a.client; });
    var byService = rankCancellations(function (a) {
      var srv = getService(a.serviceId);
      return srv ? srvName(srv) : null;
    });

    /* Повторные отмены подсвечиваем: с них стоит брать депозит */
    renderRank('#cancByClient', byClient, 2);
    renderRank('#cancByService', byService, 0);
  }

  /* warnFrom — с какого количества помечать как проблемное (0 = не помечать) */
  function renderRank(sel, rows, warnFrom) {
    var box = $(sel);
    if (!box) return;
    box.innerHTML = '';

    if (!rows.length) {
      box.appendChild(el('li', 'rank__empty', t('canc_empty')));
      return;
    }

    var max = rows[0].count;
    rows.slice(0, 6).forEach(function (row) {
      var warn = warnFrom > 0 && row.count >= warnFrom;
      var li = el('li', 'rank__row' + (warn ? ' rank__row--warn' : ''));

      var top = el('div', 'rank__top');
      top.appendChild(el('span', 'rank__name', row.key));
      top.appendChild(el('span', 'rank__count', row.count + ' × · ' + money(row.lost)));
      li.appendChild(top);

      var bar = el('div', 'rank__bar');
      var fill = el('div', 'rank__fill');
      fill.style.width = Math.round((row.count / max) * 100) + '%';
      bar.appendChild(fill);
      li.appendChild(bar);

      /* Текстом дублируем предупреждение — не только цветом полоски */
      if (warn) li.appendChild(el('span', 'rank__note', tf('canc_repeat_warn', { n: row.count })));

      box.appendChild(li);
    });
  }

  /* --- календарь загруженности ------------------------------------------- */

  /* Первое число месяца, который сейчас показан (0 = текущий, ±1 = соседние) */
  function shownMonthStart() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(1);
    d.setMonth(d.getMonth() + state.calMonth);
    return d;
  }

  /* Смещение в днях от сегодня до конкретной даты */
  function offsetOfDate(date) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((date - today) / 86400000);
  }

  function isInShownMonth(offset) {
    var d = dateFromOffset(offset);
    var m = shownMonthStart();
    return d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
  }

  /* Сколько визитов в этот день (отменённые не считаем — день реально свободен) */
  function dayLoad(offset) {
    var n = 0;
    state.appointments.forEach(function (a) {
      if (!a.hidden && a.day === offset && a.status !== 'cancelled') n += 1;
    });
    return n;
  }

  /* Градация загруженности от dayCapacity в data.js */
  function loadLevel(count) {
    var cap = SALON.dayCapacity;
    if (count === 0) return 'free';
    if (count <= Math.max(1, Math.round(cap * 0.25))) return 'low';
    if (count <= Math.max(2, Math.round(cap * 0.5))) return 'mid';
    if (count < cap) return 'high';
    return 'full';
  }

  var LOAD_KEYS = {
    free: 'cal_load_free', low: 'cal_load_low', mid: 'cal_load_mid',
    high: 'cal_load_high', full: 'cal_load_full',
  };

  function renderCalendar() {
    var box = $('#calendar');
    if (!box) return;

    /* Календарь нужен только в режиме месяца */
    if (state.adminRange !== 'month') { box.hidden = true; return; }
    box.hidden = false;

    var start = shownMonthStart();
    setText('#calTitle', t('months_nom')[start.getMonth()] + ' ' + start.getFullYear());

    /* Шапка дней недели — с понедельника, как принято в Польше */
    var wd = $('#calWeekdays');
    wd.innerHTML = '';
    for (var i = 1; i <= 7; i++) {
      wd.appendChild(el('span', 'cal__wd', t('weekdays')[i % 7]));
    }

    var grid = $('#calGrid');
    grid.innerHTML = '';

    /* Пустые клетки до первого числа (getDay: 0=вс, приводим к пн=0) */
    var lead = (start.getDay() + 6) % 7;
    for (var k = 0; k < lead; k++) {
      var gap = el('button', 'cal__day cal__day--empty');
      gap.type = 'button';
      gap.disabled = true;
      gap.setAttribute('aria-hidden', 'true');
      gap.tabIndex = -1;
      grid.appendChild(gap);
    }

    var daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    for (var day = 1; day <= daysInMonth; day++) {
      grid.appendChild(buildCalDay(new Date(start.getFullYear(), start.getMonth(), day)));
    }

    renderCalLegend();
  }

  function buildCalDay(date) {
    var offset = offsetOfDate(date);
    var open = SALON.workdays.indexOf(date.getDay()) !== -1;
    var count = dayLoad(offset);
    var level = loadLevel(count);
    var isToday = offset === 0;
    var isPast = offset < 0;

    var b = el('button', 'cal__day cal__day--' + level);
    b.type = 'button';
    b.dataset.offset = String(offset);

    if (!open) b.classList.add('cal__day--closed');
    if (isToday) b.classList.add('cal__day--today');
    /* Прошедшие дни и выходные не выбираем: записей туда не поставить */
    b.disabled = isPast || !open;

    b.setAttribute('aria-pressed', String(state.calSelectedDay === offset));

    /* Подпись для скринридера: дата + загруженность словами, не только цветом */
    var aria = formatDate(offset, true) + ', ' +
      (!open ? t('cal_closed') : count + ' ' + t('cal_visits') + ' — ' + t(LOAD_KEYS[level])) +
      (isToday ? ' (' + t('cal_today_marker') + ')' : '');
    b.setAttribute('aria-label', aria);

    b.appendChild(el('span', 'cal__num', String(date.getDate())));

    if (open && count > 0) {
      b.appendChild(el('span', 'cal__count', String(count)));
      /* Точки дублируют цвет — доступность при дальтонизме */
      var dots = el('span', 'cal__dots');
      var shown = Math.min(count, 4);
      for (var i = 0; i < shown; i++) dots.appendChild(el('span', 'cal__dot'));
      b.appendChild(dots);
    }

    b.addEventListener('click', function () {
      /* Повторный клик по тому же дню снимает фильтр */
      state.calSelectedDay = (state.calSelectedDay === offset) ? null : offset;
      renderAdmin();
    });

    /* Двойной клик — сразу добавить запись на этот день */
    b.addEventListener('dblclick', function () {
      if (b.disabled) return;
      openAdd(offset);
    });

    /* Цель для drag & drop — перенос записи на этот день */
    b.addEventListener('dragover', function (ev) {
      if (state.dragId === null || b.disabled) return;
      ev.preventDefault();
      b.classList.add('cal__day--drop');
    });
    b.addEventListener('dragleave', function () { b.classList.remove('cal__day--drop'); });
    b.addEventListener('drop', function (ev) {
      ev.preventDefault();
      b.classList.remove('cal__day--drop');
      if (state.dragId === null || b.disabled) return;
      dropOnDay(state.dragId, offset);
    });

    return b;
  }

  function renderCalLegend() {
    var box = $('#calLegend');
    if (!box) return;
    box.innerHTML = '';
    box.appendChild(el('span', null, t('cal_legend') + ':'));

    ['free', 'low', 'mid', 'high', 'full'].forEach(function (lvl) {
      var item = el('span', 'cal__legend-item');
      var sw = el('span', 'cal__legend-swatch cal__day--' + lvl);
      item.appendChild(sw);
      item.appendChild(el('span', null, t(LOAD_KEYS[lvl])));
      box.appendChild(item);
    });
  }

  function renderAdmin() {
    var list = $('#apptList');
    if (!list) return;

    renderCalendar();
    renderCancPane();

    var cancelledMode = state.adminRange === 'cancelled';

    var items = visibleAppointments().slice().sort(function (a, b) {
      /* В режиме отмен свежие сверху — так виднее последние потери */
      if (cancelledMode) return b.day - a.day || b.time.localeCompare(a.time);
      return a.day - b.day || a.time.localeCompare(b.time);
    });

    /* Заголовок над списком: в режиме месяца поясняем, что именно показано */
    var listTitle = $('#listTitle');
    if (listTitle) {
      if (state.adminRange === 'month' && state.calSelectedDay !== null) {
        listTitle.hidden = false;
        listTitle.textContent = tf('cal_day_visits', { date: formatDate(state.calSelectedDay, true) });
      } else {
        listTitle.hidden = true;
      }
    }

    /* Сводка сверху. В режиме отмен показываем потери, а не доход. */
    if (cancelledMode) {
      var lost = 0;
      items.forEach(function (a) {
        var s = getService(a.serviceId);
        if (s) lost += s.price;
      });
      /* Доля отмен от всех записей — главный показатель, за которым следить */
      var all = state.appointments.filter(function (a) { return !a.hidden; }).length;
      var rate = all ? Math.round((items.length / all) * 100) : 0;

      setLabel('#statTotal', 'canc_total');
      setLabel('#statRevenue', 'canc_lost');
      setLabel('#statPending', 'canc_rate');
      setText('#statTotal', String(items.length));
      setText('#statRevenue', money(lost));
      setText('#statPending', rate + '%');
    } else {
      var revenue = 0, pending = 0;
      items.forEach(function (a) {
        var srv = getService(a.serviceId);
        if (a.status !== 'cancelled' && srv) revenue += srv.price;
        if (a.status === 'pending') pending += 1;
      });
      setLabel('#statTotal', 'admin_total');
      setLabel('#statRevenue', 'admin_revenue');
      setLabel('#statPending', 'admin_pending_count');
      setText('#statTotal', String(items.length));
      setText('#statRevenue', money(revenue));
      setText('#statPending', String(pending));
    }

    list.innerHTML = '';

    if (!items.length) {
      var empty = el('div', 'empty');
      empty.innerHTML = svgIcon(ICON_CAL, 34);
      /* В режиме месяца без выбранного дня подсказываем, что делать дальше */
      var msg = (state.adminRange === 'month' && state.calSelectedDay === null)
        ? t('cal_pick_day') : t('admin_empty');
      empty.appendChild(el('p', null, msg));
      list.appendChild(empty);
      return;
    }

    /* Группируем по дням — в режиме недели иначе непонятно, где кончается день.
       Но если день уже выбран в календаре, его название стоит в заголовке
       над списком — вторая подпись была бы дублем. */
    var singleDay = state.adminRange === 'today' ||
      (state.adminRange === 'month' && state.calSelectedDay !== null);

    var lastDay = null;
    items.forEach(function (a) {
      if (!singleDay && a.day !== lastDay) {
        lastDay = a.day;
        var label = a.day === 0 ? t('today_label')
          : a.day === 1 ? t('tomorrow_label')
          : formatDate(a.day, true);
        list.appendChild(el('h3', 'day-group__title', label));
      }
      list.appendChild(buildApptCard(a, cancelledMode));
    });
  }

  function buildApptCard(a, cancelledMode) {
    var srv = getService(a.serviceId);
    var card = el('article', 'appt appt--' + a.status);

    /* Перетаскивание на день в календаре — доступно только в режиме месяца,
       где календарь виден. Основной способ переноса — кнопка «Przełóż». */
    if (state.adminRange === 'month' && a.status !== 'cancelled') {
      card.draggable = true;
      card.addEventListener('dragstart', function (ev) {
        state.dragId = a.id;
        card.classList.add('appt--dragging');
        if (ev.dataTransfer) {
          ev.dataTransfer.effectAllowed = 'move';
          ev.dataTransfer.setData('text/plain', String(a.id));
        }
      });
      card.addEventListener('dragend', function () {
        state.dragId = null;
        card.classList.remove('appt--dragging');
      });
    }

    var main = el('div');

    var row1 = el('div', 'appt__row');
    row1.appendChild(el('span', 'appt__time', a.time));
    row1.appendChild(el('span', 'appt__client', a.client));
    row1.appendChild(buildChip(a.status));
    main.appendChild(row1);

    /* В режиме отмен сразу показываем, сколько раз клиентка отменяла —
       по этому мастер решает, брать ли с неё депозит. */
    if (cancelledMode) {
      var times = cancelledAppts().filter(function (x) { return x.client === a.client; }).length;
      if (times > 1) {
        var warn = el('span', 'chip chip--cancelled');
        warn.innerHTML = svgIcon(ICON_ALERT, 13) + ' <span>' + tf('canc_repeat_warn', { n: times }) + '</span>';
        row1.appendChild(warn);
      }
    }

    var row2 = el('div', 'appt__row');
    row2.appendChild(el('span', 'appt__srv', srvName(srv)));
    if (srv) row2.appendChild(el('span', 'appt__price', money(srv.price)));
    /* Телефон — рабочая ссылка «позвонить»: на телефоне это основной
       способ связаться с клиенткой, поэтому с иконкой и заметный. */
    var phone = el('a', 'appt__phone');
    phone.href = 'tel:' + a.phone.replace(/\s/g, '');
    phone.innerHTML = svgIcon(ICON_PHONE, 14) + '<span>' + a.phone + '</span>';
    row2.appendChild(phone);
    main.appendChild(row2);

    card.appendChild(main);

    /* Действия. Неприменимые кнопки не показываем вовсе — отключённая кнопка
       только занимает место и путает («почему не нажимается?»). */
    var actions = el('div', 'appt__actions');

    /* Подтвердить — пока запись ждёт подтверждения, а также у отменённой:
       отменить могли по ошибке или клиентка передумала.
       У прошедших дат смысла нет — визит уже не состоится. */
    if (a.status !== 'confirmed' && a.day >= 0) {
      var ok = el('button', 'btn btn--primary btn--sm');
      ok.type = 'button';
      ok.innerHTML = svgIcon(ICON_CHECK, 15) + ' <span>' + t('admin_confirm') + '</span>';
      ok.addEventListener('click', function () { setStatus(a.id, 'confirmed'); });
      actions.appendChild(ok);
    }

    /* Перенос и отмена — для любой активной записи */
    if (a.status !== 'cancelled') {
      var mv = el('button', 'btn btn--ghost btn--sm');
      mv.type = 'button';
      mv.innerHTML = svgIcon(ICON_MOVE, 15) + ' <span>' + t('admin_move') + '</span>';
      mv.addEventListener('click', function () { openMove(a.id); });
      actions.appendChild(mv);

      var no = el('button', 'btn btn--ghost btn--sm');
      no.type = 'button';
      no.innerHTML = svgIcon(ICON_X, 15) + ' <span>' + t('admin_cancel') + '</span>';
      no.addEventListener('click', function () { setStatus(a.id, 'cancelled'); });
      actions.appendChild(no);
    }

    /* RODO: право на удаление данных — с подтверждением */
    var del = el('button', 'btn btn--danger btn--sm');
    del.type = 'button';
    del.innerHTML = svgIcon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', 15) +
      ' <span>' + t('admin_delete') + '</span>';
    del.addEventListener('click', function () {
      if (window.confirm(t('admin_delete_confirm'))) removeAppt(a.id);
    });
    actions.appendChild(del);

    card.appendChild(actions);
    return card;
  }

  /* Статус помечен и цветом, и иконкой, и текстом — не только цветом */
  function buildChip(status) {
    var chip = el('span', 'chip chip--' + status);
    var icon = status === 'confirmed' ? ICON_CHECK : status === 'cancelled' ? ICON_X : ICON_ALERT;
    chip.innerHTML = svgIcon(icon, 13) + ' <span>' + t('status_' + status) + '</span>';
    return chip;
  }

  /* --- перенос записи ---------------------------------------------------- */

  function getAppt(id) {
    for (var i = 0; i < state.appointments.length; i++) {
      if (state.appointments[i].id === id) return state.appointments[i];
    }
    return null;
  }

  /* Занято ли время реальной записью. exceptId — саму переносимую запись
     не считаем занятой, иначе её нельзя было бы оставить на своём времени. */
  function isTakenByAppt(offset, time, exceptId) {
    for (var i = 0; i < state.appointments.length; i++) {
      var a = state.appointments[i];
      if (a.hidden || a.status === 'cancelled') continue;
      if (a.id === exceptId) continue;
      if (a.day === offset && a.time === time) return true;
    }
    return false;
  }

  function initMoveModal() {
    var modal = $('#moveModal');
    if (!modal) return;

    /* Закрытие: крестик, кнопка «Отмена», клик по затемнению */
    var closers = modal.querySelectorAll('[data-close]');
    for (var i = 0; i < closers.length; i++) {
      closers[i].addEventListener('click', closeMove);
    }

    /* Escape закрывает — обязательный путь выхода из модалки */
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !modal.hidden) closeMove();
    });

    var save = $('#moveSave');
    if (save) save.addEventListener('click', saveMove);
  }

  function openMove(id) {
    var a = getAppt(id);
    if (!a) return;

    state.moveId = id;
    state.moveDay = a.day;
    state.moveTime = a.time;

    var srv = getService(a.serviceId);
    var info = $('#moveInfo');
    info.innerHTML = '';
    addRow(info, t('move_client'), a.client);
    addRow(info, t('move_service'), srvName(srv));
    addRow(info, t('move_current'), formatDate(a.day, true) + ', ' + a.time);

    hideError('moveErr');
    renderMoveDays();
    renderMoveSlots();

    var modal = $('#moveModal');
    modal.hidden = false;
    /* Фокус внутрь окна, чтобы клавиатура работала сразу */
    var firstDay = modal.querySelector('.day:not(:disabled)');
    if (firstDay) firstDay.focus();
  }

  function closeMove() {
    var modal = $('#moveModal');
    if (!modal) return;
    modal.hidden = true;
    state.moveId = null;
    state.moveDay = null;
    state.moveTime = null;
  }

  function renderMoveDays() {
    var strip = $('#moveDays');
    if (!strip) return;
    strip.innerHTML = '';

    /* Переносим в пределах того же горизонта, что и запись клиента */
    for (var i = 0; i < SALON.daysAhead; i++) {
      (function (offset) {
        var d = dateFromOffset(offset);
        var open = isWorkday(offset);

        var b = el('button', 'day');
        b.type = 'button';
        b.disabled = !open;
        b.setAttribute('aria-pressed', String(state.moveDay === offset));
        b.setAttribute('aria-label', formatDate(offset, true));

        b.appendChild(el('span', 'day__wd', offset === 0 ? t('today_label') : t('weekdays')[d.getDay()]));
        b.appendChild(el('span', 'day__num', String(d.getDate())));
        b.appendChild(el('span', 'day__mo', t('months')[d.getMonth()].slice(0, 3)));

        b.addEventListener('click', function () {
          state.moveDay = offset;
          state.moveTime = null;   /* на другом дне прежнее время может быть занято */
          hideError('moveErr');
          renderMoveDays();
          renderMoveSlots();
        });

        strip.appendChild(b);
      })(i);
    }
  }

  function renderMoveSlots() {
    var grid = $('#moveSlots');
    var hint = $('#moveHint');
    if (!grid) return;
    grid.innerHTML = '';

    var a = getAppt(state.moveId);
    if (!a || state.moveDay === null) { if (hint) hint.textContent = t('move_pick_day'); return; }

    var srv = getService(a.serviceId);
    var slots = buildSlots(state.moveDay, srv ? srv.duration : 60);

    /* Слот занят, если там уже стоит другая запись или его закрывает
       синтетическая занятость публичного календаря. */
    var free = 0;
    slots.forEach(function (s) {
      var taken = isTakenByAppt(state.moveDay, s.label, state.moveId) || s.busy;
      if (!taken) free += 1;

      var b = el('button', 'slot', s.label);
      b.type = 'button';
      b.disabled = taken;
      b.setAttribute('aria-pressed', String(state.moveTime === s.label));
      b.addEventListener('click', function () {
        state.moveTime = s.label;
        hideError('moveErr');
        renderMoveSlots();
      });
      grid.appendChild(b);
    });

    if (hint) hint.textContent = free ? t('booking_slots_hint') : t('move_no_slots');
  }

  function saveMove() {
    if (state.moveDay === null || !state.moveTime) {
      showError('moveErr');
      return;
    }
    var a = getAppt(state.moveId);
    if (!a) { closeMove(); return; }

    /* То же время — просто закрываем, ничего не меняя */
    if (a.day === state.moveDay && a.time === state.moveTime) {
      showToast(t('move_same'));
      closeMove();
      return;
    }

    a.day = state.moveDay;
    a.time = state.moveTime;
    /* Мастер сама выбрала новое время — значит оно согласовано,
       отдельное подтверждение не требуется. */
    a.status = 'confirmed';

    var msg = tf('move_done', { date: formatDate(a.day, true), time: a.time });
    closeMove();
    renderAdmin();
    showToast(msg);
  }

  /* Перенос перетаскиванием: день берём с календаря, время — первое свободное */
  function dropOnDay(id, offset) {
    var a = getAppt(id);
    if (!a) return;

    var srv = getService(a.serviceId);
    var slots = buildSlots(offset, srv ? srv.duration : 60);
    var slot = null;
    for (var i = 0; i < slots.length; i++) {
      if (!slots[i].busy && !isTakenByAppt(offset, slots[i].label, id)) { slot = slots[i]; break; }
    }

    /* Свободных часов нет — открываем модалку, пусть выберет вручную */
    if (!slot) {
      openMove(id);
      state.moveDay = offset;
      state.moveTime = null;
      renderMoveDays();
      renderMoveSlots();
      showToast(t('move_no_slots'));
      return;
    }

    a.day = offset;
    a.time = slot.label;
    a.status = 'confirmed';   /* перенос вручную = согласовано, см. saveMove */
    state.dragId = null;
    renderAdmin();
    showToast(tf('move_done', { date: formatDate(offset, true), time: slot.label }));
  }

  /* --- ручное добавление записи ------------------------------------------
     Клиентки пишут в личку или звонят — мастер вносит их в график сама.
     ------------------------------------------------------------------- */

  function initAddModal() {
    var btn = $('#addBtn');
    if (!btn) return;

    btn.addEventListener('click', function () { openAdd(null); });

    var modal = $('#addModal');
    var closers = modal.querySelectorAll('[data-add-close]');
    for (var i = 0; i < closers.length; i++) {
      closers[i].addEventListener('click', closeAdd);
    }
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !modal.hidden) closeAdd();
    });

    var save = $('#addSave');
    if (save) save.addEventListener('click', saveAdd);

    /* Валидация на blur — как в публичной форме */
    var name = $('#addName');
    var phone = $('#addPhone');
    name.addEventListener('blur', function () {
      if (name.value.trim().length >= 2) hideError('addErrName', name); else showError('addErrName', name);
    });
    name.addEventListener('input', function () {
      if (name.value.trim().length >= 2) hideError('addErrName', name);
    });
    phone.addEventListener('blur', function () {
      if (phone.value.replace(/\D/g, '').length >= 9) hideError('addErrPhone', phone); else showError('addErrPhone', phone);
    });
    phone.addEventListener('input', function () {
      if (phone.value.replace(/\D/g, '').length >= 9) hideError('addErrPhone', phone);
    });
  }

  /* dayOffset — если открыли кликом по дню календаря, день уже выбран */
  function openAdd(dayOffset) {
    state.addService = null;
    state.addDay = (dayOffset !== null && dayOffset !== undefined) ? dayOffset : null;
    state.addTime = null;

    $('#addName').value = '';
    $('#addPhone').value = '';
    hideError('addErrService');
    hideError('addErrSlot');
    hideError('addErrName', $('#addName'));
    hideError('addErrPhone', $('#addPhone'));

    renderAddServices();
    renderAddDays();
    renderAddSlots();

    var modal = $('#addModal');
    modal.hidden = false;
    var first = modal.querySelector('.picker__item');
    if (first) first.focus();
  }

  function closeAdd() {
    var modal = $('#addModal');
    if (!modal) return;
    modal.hidden = true;
    state.addService = null;
    state.addDay = null;
    state.addTime = null;
  }

  function renderAddServices() {
    var box = $('#addServices');
    if (!box) return;
    box.innerHTML = '';

    activeServices().forEach(function (srv) {
      var b = el('button', 'picker__item');
      b.type = 'button';
      b.dataset.id = srv.id;
      b.setAttribute('aria-pressed', String(state.addService === srv.id));

      var infoBox = el('span');
      infoBox.appendChild(el('strong', null, srvName(srv)));
      infoBox.appendChild(el('span', null, srv.duration + ' ' + t('srv_duration')));
      b.appendChild(infoBox);
      b.appendChild(el('span', 'picker__price', money(srv.price)));

      b.addEventListener('click', function () {
        state.addService = srv.id;
        /* другая длительность — прежнее время может не влезть */
        state.addTime = null;
        hideError('addErrService');
        renderAddServices();
        renderAddSlots();
      });
      box.appendChild(b);
    });
  }

  function renderAddDays() {
    var strip = $('#addDays');
    if (!strip) return;
    strip.innerHTML = '';

    for (var i = 0; i < SALON.daysAhead; i++) {
      (function (offset) {
        var d = dateFromOffset(offset);
        var open = isWorkday(offset);

        var b = el('button', 'day');
        b.type = 'button';
        b.disabled = !open;
        b.setAttribute('aria-pressed', String(state.addDay === offset));
        b.setAttribute('aria-label', formatDate(offset, true));

        b.appendChild(el('span', 'day__wd', offset === 0 ? t('today_label') : t('weekdays')[d.getDay()]));
        b.appendChild(el('span', 'day__num', String(d.getDate())));
        b.appendChild(el('span', 'day__mo', t('months')[d.getMonth()].slice(0, 3)));

        b.addEventListener('click', function () {
          state.addDay = offset;
          state.addTime = null;
          hideError('addErrSlot');
          renderAddDays();
          renderAddSlots();
        });

        strip.appendChild(b);
      })(i);
    }
  }

  function renderAddSlots() {
    var grid = $('#addSlots');
    var hint = $('#addHint');
    if (!grid) return;
    grid.innerHTML = '';

    if (!state.addService) { if (hint) hint.textContent = t('booking_select_service_first'); return; }
    if (state.addDay === null) { if (hint) hint.textContent = t('move_pick_day'); return; }

    var srv = getService(state.addService);
    var slots = buildSlots(state.addDay, srv.duration);
    var free = 0;

    slots.forEach(function (s) {
      /* Занято, если стоит другая запись или закрыто синтетической занятостью */
      var taken = isTakenByAppt(state.addDay, s.label, null) || s.busy;
      if (!taken) free += 1;

      var b = el('button', 'slot', s.label);
      b.type = 'button';
      b.disabled = taken;
      b.setAttribute('aria-pressed', String(state.addTime === s.label));
      b.addEventListener('click', function () {
        state.addTime = s.label;
        hideError('addErrSlot');
        renderAddSlots();
      });
      grid.appendChild(b);
    });

    if (hint) hint.textContent = free ? t('booking_slots_hint') : t('move_no_slots');
  }

  function saveAdd() {
    var name = $('#addName');
    var phone = $('#addPhone');
    var bad = null;

    if (!state.addService) { showError('addErrService'); bad = bad || $('#addServices'); }
    else hideError('addErrService');

    if (state.addDay === null || !state.addTime) { showError('addErrSlot'); bad = bad || $('#addDays'); }
    else hideError('addErrSlot');

    if (name.value.trim().length < 2) { showError('addErrName', name); bad = bad || name; }
    else hideError('addErrName', name);

    if (phone.value.replace(/\D/g, '').length < 9) { showError('addErrPhone', phone); bad = bad || phone; }
    else hideError('addErrPhone', phone);

    if (bad) {
      if (bad.focus) bad.focus();
      return;
    }

    /* Двойная проверка: пока заполняли форму, слот мог занять кто-то ещё */
    if (isTakenByAppt(state.addDay, state.addTime, null)) {
      showToast(t('add_taken'));
      state.addTime = null;
      renderAddSlots();
      return;
    }

    /* id — максимальный существующий + 1, чтобы не столкнуться с заглушками */
    var maxId = 0;
    state.appointments.forEach(function (a) { if (a.id > maxId) maxId = a.id; });

    var added = {
      id: maxId + 1,
      day: state.addDay,
      time: state.addTime,
      serviceId: state.addService,
      client: name.value.trim(),
      phone: phone.value.trim(),
      /* Мастер вносит запись сама — значит время уже согласовано */
      status: 'confirmed',
    };
    state.appointments.push(added);

    var msg = tf('add_done', { date: formatDate(added.day, true), time: added.time });

    /* Показываем добавленный день, иначе запись «исчезает» из вида */
    if (state.adminRange === 'month') state.calSelectedDay = added.day;

    closeAdd();
    renderAdmin();
    showToast(msg);
  }

  /* =========================================================================
     ВХОД В АДМИНКУ
     Бутафория: пароль в data.js, виден в исходнике. Задача — не пустить
     случайного посетителя, а не защитить данные. Настоящая авторизация
     появится в версии с бэкендом.
     ====================================================================== */

  var LOCK_KEY = 'booking.unlocked';

  function initLock() {
    var screen = $('#lockScreen');
    if (!screen) return;   /* публичная страница — замка нет */

    var unlocked = false;
    try { unlocked = sessionStorage.getItem(LOCK_KEY) === '1'; } catch (e) { /* приватный режим */ }

    if (unlocked) {
      screen.hidden = true;
      document.body.classList.remove('is-locked');
    } else {
      screen.hidden = false;
      document.body.classList.add('is-locked');
    }

    var pass = $('#lockPass');
    var btn = $('#lockBtn');

    function tryEnter() {
      if (pass.value === ADMIN_PASS) {
        try { sessionStorage.setItem(LOCK_KEY, '1'); } catch (e) { /* не критично */ }
        hideError('lockErr', pass);
        screen.hidden = true;
        document.body.classList.remove('is-locked');
        pass.value = '';
        /* Пока замок висел, размеры были нулевые — перерисовываем */
        renderAll();
      } else {
        showError('lockErr', pass);
        pass.select();
      }
    }

    btn.addEventListener('click', tryEnter);
    /* Enter в поле — самый частый способ, особенно на телефоне */
    pass.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); tryEnter(); }
    });
    pass.addEventListener('input', function () {
      if (pass.value) hideError('lockErr', pass);
    });

    var logout = $('#logoutBtn');
    if (logout) {
      logout.addEventListener('click', function () {
        try { sessionStorage.removeItem(LOCK_KEY); } catch (e) { /* ignore */ }
        screen.hidden = false;
        document.body.classList.add('is-locked');
        var p = $('#lockPass');
        if (p) { p.value = ''; p.focus(); }
      });
    }
  }

  /* =========================================================================
     РАЗДЕЛЫ АДМИНКИ
     ====================================================================== */

  function initSections() {
    var nav = $('#secNav');
    if (!nav) return;

    var btns = nav.querySelectorAll('.secnav__btn');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { showSection(b.dataset.section); });
      })(btns[i]);
    }
  }

  function showSection(id) {
    state.section = id;

    var btns = document.querySelectorAll('.secnav__btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', String(btns[i].dataset.section === id));
    }
    var panes = document.querySelectorAll('.section-pane');
    for (var j = 0; j < panes.length; j++) {
      panes[j].hidden = panes[j].dataset.pane !== id;
    }

    /* Кнопка «Dodaj wizytę» теперь внутри раздела «Wizyty» и прячется
       вместе с ним — отдельно управлять ею не нужно. */
    renderSectionContent();
  }

  function renderSectionContent() {
    if (state.section === 'gallery') renderGalleryAdmin();
    else if (state.section === 'services') renderServicesAdmin();
    else if (state.section === 'schedule') { renderSchedule(); renderBlocks(); }
  }

  /* =========================================================================
     ГАЛЕРЕЯ В АДМИНКЕ
     ====================================================================== */

  function initGalleryAdmin() {
    var input = $('#galInput');
    if (!input) return;

    $('#galUploadBtn').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      handleFiles(input.files);
      input.value = '';   /* сброс, иначе тот же файл не выберется второй раз */
    });

    /* Диалог названий для новых фото */
    var modal = $('#galModal');
    if (modal) {
      var closers = modal.querySelectorAll('[data-gal-close]');
      for (var c = 0; c < closers.length; c++) closers[c].addEventListener('click', closeGalNew);
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && !modal.hidden) closeGalNew();
      });
      $('#galSave').addEventListener('click', saveGalNew);
    }

    var tabs = document.querySelectorAll('.gal-tab');
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener('click', function () {
          state.galTab = tab.dataset.galtab;
          for (var j = 0; j < tabs.length; j++) {
            tabs[j].setAttribute('aria-pressed', String(tabs[j].dataset.galtab === state.galTab));
          }
          renderGalleryAdmin();
        });
      })(tabs[i]);
    }
  }

  /* Сжимаем фото перед сохранением: в localStorage ~5 МБ, снимок с телефона
     в оригинале займёт всё место и запись упадёт. */
  function shrinkImage(file, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, PHOTO.maxSide / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale);
        var h = Math.round(img.height * scale);
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        try {
          cb(canvas.toDataURL('image/jpeg', PHOTO.quality));
        } catch (e) {
          cb(null);
        }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }

  function handleFiles(files) {
    if (!files || !files.length) return;

    var list = [];
    for (var i = 0; i < files.length; i++) list.push(files[i]);

    /* Не изображения молча не проглатываем — говорим, что пропустили */
    var skipped = list.filter(function (f) { return !/^image\//.test(f.type); });
    var images = list.filter(function (f) { return /^image\//.test(f.type); });
    if (skipped.length) showToast(tf('gal_bad_file', { name: skipped[0].name }));
    if (!images.length) return;

    var room = PHOTO.maxFiles - state.gallery.length;
    if (room <= 0) { showToast(tf('gal_too_many', { n: PHOTO.maxFiles })); return; }
    if (images.length > room) {
      images = images.slice(0, room);
      showToast(tf('gal_too_many', { n: PHOTO.maxFiles }));
    }

    /* Сжимаем всё, потом показываем диалог: мастер задаёт название и услугу
       до того, как фото попадут в галерею. Имя файла — лишь подсказка. */
    var pending = images.length;
    var prepared = [];

    images.forEach(function (file) {
      shrinkImage(file, function (dataUrl) {
        if (dataUrl) {
          prepared.push({
            fileName: file.name,
            suggested: file.name.replace(/\.[^.]+$/, ''),
            src: dataUrl,
          });
        }
        pending -= 1;
        if (pending === 0) openGalNew(prepared);
      });
    });
  }

  function openGalNew(prepared) {
    if (!prepared.length) return;
    state.galNew = prepared;
    renderGalNew();
    var modal = $('#galModal');
    modal.hidden = false;
    var first = modal.querySelector('.gal-new__fields input');
    if (first) { first.focus(); first.select(); }
  }

  function closeGalNew() {
    var m = $('#galModal');
    if (m) m.hidden = true;
    state.galNew = [];
  }

  function renderGalNew() {
    var box = $('#galNewList');
    if (!box) return;
    box.innerHTML = '';

    state.galNew.forEach(function (item, idx) {
      var row = el('div', 'gal-new__row');

      var thumb = el('div', 'gal-new__thumb');
      thumb.style.backgroundImage = 'url(' + item.src + ')';
      thumb.setAttribute('role', 'img');
      thumb.setAttribute('aria-label', item.fileName);
      row.appendChild(thumb);

      var fields = el('div', 'gal-new__fields');

      /* Подпись «i из n» помогает не потеряться при загрузке пачки */
      if (state.galNew.length > 1) {
        fields.appendChild(el('span', 'gal-new__file',
          tf('gal_of', { i: idx + 1, n: state.galNew.length }) + ' · ' + item.fileName));
      } else {
        fields.appendChild(el('span', 'gal-new__file', item.fileName));
      }

      var name = document.createElement('input');
      name.type = 'text';
      name.value = item.suggested;
      name.placeholder = t('gal_name_ph');
      name.setAttribute('aria-label', t('gal_name_label'));
      name.addEventListener('input', function () {
        item.suggested = name.value;
        if (name.value.trim()) name.removeAttribute('aria-invalid');
      });
      fields.appendChild(name);

      var sel = el('select');
      sel.setAttribute('aria-label', t('gal_service_label'));
      var optAll = el('option', null, t('gal_service_all'));
      optAll.value = '';
      sel.appendChild(optAll);
      state.services.forEach(function (srv) {
        var o = el('option', null, srvName(srv));
        o.value = srv.id;
        if (item.serviceId === srv.id) o.selected = true;
        sel.appendChild(o);
      });
      sel.addEventListener('change', function () { item.serviceId = sel.value || null; });
      fields.appendChild(sel);

      row.appendChild(fields);
      box.appendChild(row);
    });
  }

  function saveGalNew() {
    var box = $('#galNewList');
    var inputs = box.querySelectorAll('.gal-new__fields input');

    /* Без названия не пускаем: под фото на сайте будет пустая подпись */
    var bad = null;
    for (var i = 0; i < inputs.length; i++) {
      if (!inputs[i].value.trim()) {
        inputs[i].setAttribute('aria-invalid', 'true');
        bad = bad || inputs[i];
      }
    }
    if (bad) { showToast(t('gal_name_empty')); bad.focus(); return; }

    var maxId = 0;
    state.gallery.forEach(function (g) { if (g.id > maxId) maxId = g.id; });

    /* unshift в обратном порядке — чтобы первое выбранное осталось первым */
    state.galNew.slice().reverse().forEach(function (item) {
      maxId += 1;
      state.gallery.unshift({
        id: maxId,
        key: null,
        title: item.suggested.trim(),
        gradient: null,
        src: item.src,
        serviceId: item.serviceId || null,
        archived: false,
      });
    });

    var added = state.galNew.length;
    closeGalNew();
    finishUpload(added);
  }

  function finishUpload(added) {
    if (!added) return;
    /* Не влезло в localStorage — честно говорим и откатываем сохранение */
    if (!save('gallery')) {
      showToast(t('gal_storage_full'));
    } else {
      showToast(tf('gal_added', { n: added }));
    }
    state.galTab = 'active';
    var tabs = document.querySelectorAll('.gal-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute('aria-pressed', String(tabs[i].dataset.galtab === 'active'));
    }
    renderGalleryAdmin();
    renderGallery();     /* публичная галерея на index.html */
    renderHeroArt();
  }

  function renderGalleryAdmin() {
    var grid = $('#galGrid');
    if (!grid) return;

    var archived = state.galTab === 'archived';
    var items = state.gallery.filter(function (g) { return !!g.archived === archived; });

    setText('#galCount', tf('gal_count', { n: items.length }));
    grid.innerHTML = '';

    if (!items.length) {
      var empty = el('div', 'empty');
      empty.style.gridColumn = '1 / -1';
      empty.innerHTML = svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>', 34);
      empty.appendChild(el('p', null, archived ? t('gal_empty_archive') : t('gal_empty')));
      grid.appendChild(empty);
      return;
    }

    items.forEach(function (item) { grid.appendChild(buildGalItem(item)); });
  }

  function buildGalItem(item) {
    var box = el('div', 'gal-item');
    box.dataset.id = String(item.id);

    var img = el('div', 'gal-item__img');
    if (item.src) {
      img.style.backgroundImage = 'url(' + item.src + ')';
    } else {
      img.style.background = item.gradient;
    }
    img.setAttribute('role', 'img');
    img.setAttribute('aria-label', galTitle(item));
    box.appendChild(img);

    /* Заглушки помечаем — чтобы мастер видела, что это не её фото */
    if (!item.src) {
      box.appendChild(el('span', 'gal-item__badge', t('gal_placeholder_badge')));
    }

    var body = el('div', 'gal-item__body');

    /* Название правится прямо в плитке. У заглушек оно приходит из переводов;
       как только мастер его меняет, оно становится её собственным (title)
       и больше не переключается вместе с языком. */
    var nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'gal-item__name';
    nameInput.value = galTitle(item);
    nameInput.setAttribute('aria-label', t('gal_name_label'));
    nameInput.placeholder = t('gal_name_ph');
    nameInput.addEventListener('change', function () { renamePhoto(item.id, nameInput); });
    nameInput.addEventListener('blur', function () { renamePhoto(item.id, nameInput); });
    nameInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); nameInput.blur(); }
    });
    body.appendChild(nameInput);

    /* Привязка к услуге — чтобы показывать примеры работ у нужной услуги */
    var sel = el('select', 'gal-item__srv');
    sel.setAttribute('aria-label', t('gal_service_label'));
    var optAll = el('option', null, t('gal_service_all'));
    optAll.value = '';
    sel.appendChild(optAll);
    state.services.forEach(function (srv) {
      var o = el('option', null, srvName(srv));
      o.value = srv.id;
      if (item.serviceId === srv.id) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      item.serviceId = sel.value || null;
      save('gallery');
    });
    body.appendChild(sel);

    /* Порядок стрелками — обязательная альтернатива перетаскиванию:
       HTML5 drag-and-drop не работает на тач-экранах, а смотреть будут
       в основном с телефона. */
    var siblings = state.gallery.filter(function (g) { return !!g.archived === !!item.archived; });
    var pos = -1;
    siblings.forEach(function (g, i) { if (g.id === item.id) pos = i; });

    var order = el('div', 'gal-item__order');

    var left = el('button', 'gal-item__arrow');
    left.type = 'button';
    left.innerHTML = svgIcon('<path d="M15 18l-6-6 6-6"/>', 16);
    left.setAttribute('aria-label', t('gal_move_left'));
    left.title = t('gal_move_left');
    left.disabled = pos <= 0;
    left.addEventListener('click', function () { nudgePhoto(item.id, -1); });
    order.appendChild(left);

    order.appendChild(el('span', 'gal-item__pos', (pos + 1) + '/' + siblings.length));

    var right = el('button', 'gal-item__arrow');
    right.type = 'button';
    right.innerHTML = svgIcon('<path d="M9 18l6-6-6-6"/>', 16);
    right.setAttribute('aria-label', t('gal_move_right'));
    right.title = t('gal_move_right');
    right.disabled = pos < 0 || pos >= siblings.length - 1;
    right.addEventListener('click', function () { nudgePhoto(item.id, 1); });
    order.appendChild(right);

    body.appendChild(order);

    var actions = el('div', 'gal-item__actions');

    var arch = el('button', 'btn btn--ghost btn--sm');
    arch.type = 'button';
    arch.textContent = item.archived ? t('gal_unarchive') : t('gal_archive');
    arch.addEventListener('click', function () { toggleArchive(item.id); });
    actions.appendChild(arch);

    var del = el('button', 'btn btn--danger btn--sm');
    del.type = 'button';
    del.textContent = t('gal_delete');
    del.addEventListener('click', function () {
      if (window.confirm(t('gal_delete_confirm'))) deletePhoto(item.id);
    });
    actions.appendChild(del);

    body.appendChild(actions);
    box.appendChild(body);

    /* Порядок вывода — перетаскиванием. Тащим за картинку. */
    box.draggable = true;
    box.addEventListener('dragstart', function (ev) {
      state.galDragId = item.id;
      box.classList.add('gal-item--dragging');
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
    });
    box.addEventListener('dragend', function () {
      state.galDragId = null;
      box.classList.remove('gal-item--dragging');
    });
    box.addEventListener('dragover', function (ev) {
      if (state.galDragId === null || state.galDragId === item.id) return;
      ev.preventDefault();
      box.classList.add('gal-item--over');
    });
    box.addEventListener('dragleave', function () { box.classList.remove('gal-item--over'); });
    box.addEventListener('drop', function (ev) {
      ev.preventDefault();
      box.classList.remove('gal-item--over');
      if (state.galDragId === null || state.galDragId === item.id) return;
      reorderGallery(state.galDragId, item.id);
    });

    return box;
  }

  /* Переименование фото. Пустое имя не принимаем — возвращаем прежнее,
     иначе на сайте появилась бы подпись без текста. */
  function renamePhoto(id, input) {
    var item = null;
    state.gallery.forEach(function (g) { if (g.id === id) item = g; });
    if (!item) return;

    var next = input.value.trim();
    if (!next) {
      input.value = galTitle(item);
      showToast(t('gal_name_empty'));
      return;
    }
    if (next === galTitle(item)) return;   // ничего не изменилось

    item.title = next;
    item.key = null;   /* с этого момента живём на своём названии, не на переводе */
    save('gallery');
    showToast(t('gal_renamed'));
    renderGallery();   /* подпись на публичной странице */
    renderHeroArt();
  }

  function toggleArchive(id) {
    state.gallery.forEach(function (g) {
      if (g.id === id) g.archived = !g.archived;
    });
    save('gallery');
    var item = state.gallery.filter(function (g) { return g.id === id; })[0];
    showToast(item && item.archived ? t('gal_archived_msg') : t('gal_restored_msg'));
    renderGalleryAdmin();
    renderGallery();
    renderHeroArt();
  }

  function deletePhoto(id) {
    state.gallery = state.gallery.filter(function (g) { return g.id !== id; });
    save('gallery');
    showToast(t('gal_deleted_msg'));
    renderGalleryAdmin();
    renderGallery();
    renderHeroArt();
  }

  /* Сдвиг фото на одну позицию среди соседей той же вкладки (видимые/архив).
     Индексы в state.gallery не совпадают с позициями на экране, поэтому
     считаем позицию среди соседей, а меняем — в общем массиве. */
  function nudgePhoto(id, delta) {
    var item = null;
    state.gallery.forEach(function (g) { if (g.id === id) item = g; });
    if (!item) return;

    var siblings = state.gallery.filter(function (g) { return !!g.archived === !!item.archived; });
    var pos = -1;
    siblings.forEach(function (g, i) { if (g.id === id) pos = i; });
    var target = siblings[pos + delta];
    if (pos < 0 || !target) return;

    var from = state.gallery.indexOf(item);
    var to = state.gallery.indexOf(target);
    state.gallery.splice(from, 1);
    state.gallery.splice(to, 0, item);

    save('gallery');
    renderGalleryAdmin();
    renderGallery();
    renderHeroArt();
  }

  /* Вставляем перетаскиваемое фото перед целевым */
  function reorderGallery(dragId, targetId) {
    var from = -1, to = -1;
    state.gallery.forEach(function (g, i) {
      if (g.id === dragId) from = i;
      if (g.id === targetId) to = i;
    });
    if (from < 0 || to < 0) return;
    var moved = state.gallery.splice(from, 1)[0];
    state.gallery.splice(to, 0, moved);
    save('gallery');
    renderGalleryAdmin();
    renderGallery();
    renderHeroArt();
  }

  /* =========================================================================
     УСЛУГИ В АДМИНКЕ
     ====================================================================== */

  function initServicesAdmin() {
    var addBtn = $('#srvAddBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', function () { openSrv(null); });

    var modal = $('#srvModal');
    var closers = modal.querySelectorAll('[data-srv-close]');
    for (var i = 0; i < closers.length; i++) closers[i].addEventListener('click', closeSrv);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !modal.hidden) closeSrv();
    });
    $('#srvSave').addEventListener('click', saveSrv);
  }

  function renderServicesAdmin() {
    var list = $('#srvList');
    if (!list) return;
    list.innerHTML = '';

    state.services.forEach(function (srv) {
      var row = el('div', 'srv-row' + (srv.active === false ? ' srv-row--off' : ''));

      var info = el('div');
      var nameLine = el('div');
      nameLine.appendChild(el('span', 'srv-row__name', srvName(srv)));
      if (srv.active === false) {
        var badge = el('span', 'chip chip--cancelled', t('srv_hidden_badge'));
        badge.style.marginLeft = 'var(--sp-2)';
        nameLine.appendChild(badge);
      }
      info.appendChild(nameLine);
      info.appendChild(el('div', 'srv-row__meta', srv.duration + ' ' + t('srv_duration')));
      row.appendChild(info);

      row.appendChild(el('span', 'srv-row__price', money(srv.price)));

      var actions = el('div', 'srv-row__actions');

      var ed = el('button', 'btn btn--ghost btn--sm');
      ed.type = 'button';
      ed.textContent = t('srv_edit');
      ed.addEventListener('click', function () { openSrv(srv.id); });
      actions.appendChild(ed);

      var del = el('button', 'btn btn--danger btn--sm');
      del.type = 'button';
      del.textContent = t('srv_del');
      del.addEventListener('click', function () {
        /* Предупреждаем, если на услугу уже есть записи */
        var used = state.appointments.filter(function (a) {
          return !a.hidden && a.serviceId === srv.id;
        }).length;
        var msg = t('srv_del_confirm') + (used ? '\n\n' + tf('srv_in_use', { n: used }) : '');
        if (window.confirm(msg)) deleteSrv(srv.id);
      });
      actions.appendChild(del);

      row.appendChild(actions);
      list.appendChild(row);
    });
  }

  function openSrv(id) {
    state.srvEditId = id;
    var srv = id ? getService(id) : null;

    setText('#srvModalTitle', srv ? t('srv_edit_title') : t('srv_new_title'));
    $('#srvName').value = srv ? srvName(srv) : '';
    $('#srvPrice').value = srv ? srv.price : '';
    $('#srvDur').value = srv ? srv.duration : SALON.slotStep * 2;
    $('#srvDesc').value = srv ? srvDesc(srv) : '';
    $('#srvActive').checked = srv ? srv.active !== false : true;

    hideError('srvErrName', $('#srvName'));
    hideError('srvErrPrice', $('#srvPrice'));
    hideError('srvErrDur', $('#srvDur'));

    $('#srvModal').hidden = false;
    $('#srvName').focus();
  }

  function closeSrv() {
    var m = $('#srvModal');
    if (m) m.hidden = true;
    state.srvEditId = null;
  }

  function saveSrv() {
    var name = $('#srvName');
    var price = $('#srvPrice');
    var dur = $('#srvDur');
    var bad = null;

    if (!name.value.trim()) { showError('srvErrName', name); bad = bad || name; }
    else hideError('srvErrName', name);

    var p = parseInt(price.value, 10);
    if (!p || p <= 0) { showError('srvErrPrice', price); bad = bad || price; }
    else hideError('srvErrPrice', price);

    /* Длительность кратна шагу сетки — иначе слоты «съедут» */
    var d = parseInt(dur.value, 10);
    if (!d || d <= 0 || d % SALON.slotStep !== 0) {
      showError('srvErrDur', dur);   /* текст с {step} подставлен в translate() */
      bad = bad || dur;
    } else hideError('srvErrDur', dur);

    if (bad) { if (bad.focus) bad.focus(); return; }

    if (state.srvEditId) {
      state.services.forEach(function (s) {
        if (s.id !== state.srvEditId) return;
        /* Заменили название — с этого момента живём на title, не на key */
        s.title = name.value.trim();
        s.price = p;
        s.duration = d;
        s.desc = $('#srvDesc').value.trim();
        s.active = $('#srvActive').checked;
      });
      showToast(t('srv_saved'));
    } else {
      state.services.push({
        id: 'srv_' + (Date.now ? Date.now() : state.services.length + 1),
        key: null,
        title: name.value.trim(),
        price: p,
        duration: d,
        desc: $('#srvDesc').value.trim(),
        active: $('#srvActive').checked,
      });
      showToast(t('srv_added_msg'));
    }

    save('services');
    closeSrv();
    renderServicesAdmin();
    /* публичная часть и формы записи тоже обновляются */
    renderServices();
    renderServicePicker();
    renderSlots();
    renderSummary();
  }

  function deleteSrv(id) {
    state.services = state.services.filter(function (s) { return s.id !== id; });
    save('services');
    showToast(t('srv_deleted_msg'));
    renderServicesAdmin();
    renderServices();
    renderServicePicker();
    renderGalleryAdmin();   /* в выпадашках фото услуги тоже поменялись */
  }

  /* =========================================================================
     ГРАФИК РАБОТЫ И БЛОКИРОВКИ
     ====================================================================== */

  function hourOptions(sel, selected) {
    sel.innerHTML = '';
    for (var h = 6; h <= 23; h++) {
      var o = el('option', null, minutesToTime(h * 60));
      o.value = String(h);
      if (h === selected) o.selected = true;
      sel.appendChild(o);
    }
  }

  function renderSchedule() {
    var list = $('#schList');
    if (!list) return;
    list.innerHTML = '';

    /* С понедельника — привычный для Польши порядок */
    var order = [1, 2, 3, 4, 5, 6, 0];
    order.forEach(function (wd) {
      var rule = null;
      state.schedule.forEach(function (s) { if (s.day === wd) rule = s; });
      if (!rule) return;

      var row = el('div', 'sch-row' + (rule.open ? '' : ' sch-row--closed'));

      row.appendChild(el('span', 'sch-row__day', t('weekdays_full')[wd]));

      /* Это ГЛОБАЛЬНАЯ настройка «как я работаю»: ограничивает, на какое
         время вообще можно записаться. Существующие записи здесь ни при чём —
         ни блокировок, ни меток о занятости. Мастер ставит часы под себя,
         а конкретные визиты разбирает в разделе «Wizyty». */
      var toggle = el('label', 'sch-row__toggle');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!rule.open;
      cb.addEventListener('change', function () {
        rule.open = cb.checked;
        save('schedule');
        renderSchedule();
        refreshAfterScheduleChange();
      });
      toggle.appendChild(cb);
      toggle.appendChild(el('span', null, rule.open ? t('sch_open') : t('sch_closed')));
      row.appendChild(toggle);

      var hours = el('div', 'sch-row__hours');
      hours.appendChild(el('label', null, t('sch_from')));
      var from = el('select');
      hourOptions(from, rule.from);
      hours.appendChild(from);
      hours.appendChild(el('label', null, t('sch_to')));
      var to = el('select');
      hourOptions(to, rule.to);
      hours.appendChild(to);

      function onHours() {
        var f = +from.value, tt = +to.value;
        /* Конец раньше начала — не сохраняем, говорим об ошибке */
        if (tt <= f) {
          showToast(t('sch_err_range'));
          from.value = String(rule.from);
          to.value = String(rule.to);
          return;
        }
        rule.from = f;
        rule.to = tt;
        save('schedule');
        showToast(t('sch_saved'));
        refreshAfterScheduleChange();
      }
      from.addEventListener('change', onHours);
      to.addEventListener('change', onHours);

      row.appendChild(hours);
      list.appendChild(row);
    });
  }

  /* График поменялся — пересобираем всё, что от него зависит */
  function refreshAfterScheduleChange() {
    renderDays();
    renderSlots();
    renderSummary();
    renderCalendar();
  }

  function renderBlocks() {
    var list = $('#blkList');
    if (!list) return;
    list.innerHTML = '';

    var items = state.blocks.slice().sort(function (a, b) { return a.day - b.day; });

    if (!items.length) {
      var empty = el('div', 'empty');
      empty.innerHTML = svgIcon(ICON_CLOCK, 34);
      empty.appendChild(el('p', null, t('blk_empty')));
      list.appendChild(empty);
      return;
    }

    items.forEach(function (b) {
      var row = el('div', 'blk-row');
      var when = b.from ? (formatDate(b.day, true) + ', ' + b.from + '–' + b.to)
        : (formatDate(b.day, true) + ', ' + t('blk_whole_day_label'));
      row.appendChild(el('span', 'blk-row__when', when));
      row.appendChild(el('span', 'blk-row__reason', b.reason || ''));

      var actions = el('div', 'blk-row__actions');
      var del = el('button', 'btn btn--danger btn--sm');
      del.type = 'button';
      del.textContent = t('blk_del');
      del.addEventListener('click', function () { deleteBlock(b.id); });
      actions.appendChild(del);
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  function initBlockModal() {
    var addBtn = $('#blkAddBtn');
    if (!addBtn) return;

    addBtn.addEventListener('click', openBlk);

    var modal = $('#blkModal');
    var closers = modal.querySelectorAll('[data-blk-close]');
    for (var i = 0; i < closers.length; i++) closers[i].addEventListener('click', closeBlk);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !modal.hidden) closeBlk();
    });

    var whole = $('#blkWhole');
    whole.addEventListener('change', function () {
      $('#blkRange').hidden = whole.checked;
    });

    $('#blkSave').addEventListener('click', saveBlk);
  }

  function openBlk() {
    state.blkDay = null;
    $('#blkWhole').checked = true;
    $('#blkRange').hidden = true;
    $('#blkReason').value = '';
    hideError('blkErr', $('#blkReason'));

    hourOptions($('#blkFrom'), 13);
    hourOptions($('#blkTo'), 14);
    renderBlkDays();
    renderBlkNotice();

    $('#blkModal').hidden = false;
    var first = $('#blkDays').querySelector('.day:not(:disabled)');
    if (first) first.focus();
  }

  function closeBlk() {
    var m = $('#blkModal');
    if (m) m.hidden = true;
    state.blkDay = null;
  }

  /* Активные записи дня — нужны, чтобы показать занятость до выбора */
  function apptsOfDay(offset) {
    return state.appointments.filter(function (a) {
      return !a.hidden && a.status !== 'cancelled' && a.day === offset;
    }).sort(function (x, y) { return x.time.localeCompare(y.time); });
  }

  function renderBlkDays() {
    var strip = $('#blkDays');
    if (!strip) return;
    strip.innerHTML = '';

    /* Блокировать можно любой день горизонта, включая уже закрытые по графику
       — мастер может отметить отпуск на воскресенье, это не мешает.
       Число записей показываем сразу на кнопке: иначе о конфликте узнаёшь
       только после клика и ошибки. */
    for (var i = 0; i < SALON.daysAhead; i++) {
      (function (offset) {
        var d = dateFromOffset(offset);
        var busy = apptsOfDay(offset).length;

        var b = el('button', 'day' + (busy ? ' day--busy' : ''));
        b.type = 'button';
        b.setAttribute('aria-pressed', String(state.blkDay === offset));
        b.setAttribute('aria-label', formatDate(offset, true) + ', ' +
          (busy ? tf('blk_day_busy', { n: busy }) : t('blk_day_free')));

        b.appendChild(el('span', 'day__wd', offset === 0 ? t('today_label') : t('weekdays')[d.getDay()]));
        b.appendChild(el('span', 'day__num', String(d.getDate())));
        /* Вместо месяца показываем занятость — она важнее при блокировке */
        if (busy) {
          var badge = el('span', 'day__busy');
          badge.innerHTML = svgIcon(ICON_ALERT, 11) + '<span>' + busy + '</span>';
          b.appendChild(badge);
        } else {
          b.appendChild(el('span', 'day__mo', t('months')[d.getMonth()].slice(0, 3)));
        }

        b.addEventListener('click', function () {
          state.blkDay = offset;
          hideError('blkErr', $('#blkReason'));
          renderBlkDays();
          renderBlkNotice();
        });
        strip.appendChild(b);
      })(i);
    }
  }

  /* Подсказка под полосой: что именно стоит в выбранный день */
  function renderBlkNotice() {
    var box = $('#blkNotice');
    if (!box) return;

    if (state.blkDay === null) {
      box.textContent = t('blk_legend');
      box.className = 'hint';
      return;
    }

    var items = apptsOfDay(state.blkDay);
    if (!items.length) {
      box.textContent = t('blk_selected_free');
      box.className = 'hint';
      return;
    }

    /* Перечисляем время и клиенток — сразу видно, кого переносить */
    var list = items.slice(0, 4).map(function (a) { return a.time + ' ' + a.client; }).join(', ');
    if (items.length > 4) list += ' …';
    box.textContent = tf('blk_selected_busy', { n: items.length, list: list });
    box.className = 'hint hint--warn';
  }

  function blkError(key) {
    var span = $('#blkErrText');
    if (span) span.textContent = t(key);
    showError('blkErr');
  }

  function saveBlk() {
    var reason = $('#blkReason');
    var whole = $('#blkWhole').checked;

    if (state.blkDay === null) { blkError('add_err_slot'); return; }
    if (!reason.value.trim()) { blkError('blk_err_reason'); reason.focus(); return; }

    var from = null, to = null;
    if (!whole) {
      var f = +$('#blkFrom').value, tt = +$('#blkTo').value;
      if (tt <= f) { blkError('blk_err_range'); return; }
      from = minutesToTime(f * 60);
      to = minutesToTime(tt * 60);
    }

    /* Существующие записи блокировку НЕ отменяют: отпуск и перерывы —
       решение мастера, а не проверка расписания. Она видит число визитов
       на кнопке дня и разбирается с ними отдельно (перенос/отмена). */
    var maxId = 0;
    state.blocks.forEach(function (b) { if (b.id > maxId) maxId = b.id; });
    state.blocks.push({
      id: maxId + 1,
      day: state.blkDay,
      from: from,
      to: to,
      reason: reason.value.trim(),
    });

    save('blocks');
    closeBlk();
    renderBlocks();
    refreshAfterScheduleChange();
    showToast(t('blk_added_msg'));
  }

  function deleteBlock(id) {
    state.blocks = state.blocks.filter(function (b) { return b.id !== id; });
    save('blocks');
    renderBlocks();
    refreshAfterScheduleChange();
    showToast(t('blk_deleted_msg'));
  }

  var toastTimer = null;
  function showToast(msg) {
    var box = $('#toast');
    if (!box) return;
    setText('#toastText', msg);
    box.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.hidden = true; }, 4000);
  }

  function setStatus(id, status) {
    state.appointments.forEach(function (a) {
      if (a.id === id) a.status = status;
    });
    renderAdmin();
  }

  function removeAppt(id) {
    state.appointments.forEach(function (a) {
      if (a.id === id) a.hidden = true;
    });
    renderAdmin();
  }

  function setText(sel, val) {
    var n = $(sel);
    if (n) n.textContent = val;
  }

  /* Подпись над числом в сводке. Меняем и data-i18n тоже — иначе при смене
     языка translate() вернёт старый ключ и подпись «поедет». */
  function setLabel(valueSel, key) {
    var v = $(valueSel);
    if (!v || !v.parentNode) return;
    var label = v.parentNode.querySelector('.stat__k');
    if (!label) return;
    label.dataset.i18n = key;
    label.textContent = t(key);
  }

  /* --- запуск ------------------------------------------------------------ */

  function renderAll() {
    renderServices();
    renderGallery();
    renderHeroArt();
    renderServicePicker();
    renderDays();
    renderSlots();
    renderSummary();
    renderAdmin();
    renderSectionContent();
  }

  function init() {
    loadAll();   /* правки мастера из localStorage — до первой отрисовки */
    try {
      var savedTheme = localStorage.getItem('booking.theme');
      var savedLang = localStorage.getItem('booking.lang');
      if (savedTheme) state.theme = savedTheme;
      if (savedLang && I18N[savedLang]) state.lang = savedLang;
    } catch (e) { /* file:// может блокировать localStorage — не критично */ }

    normalizeAppointmentDays();   /* до первой отрисовки списка */
    buildThemeSwitch();
    buildLangSwitch();
    applyTheme(state.theme);
    applyLang(state.lang);   /* внутри вызовет translate() и renderAll() */
    initLock();
    initForm();
    initAdmin();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
