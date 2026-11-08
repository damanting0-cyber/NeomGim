// ==UserScript==
// @name         NeomGim
// @namespace    neomgim
// @version      1.18.0
// @description  이제 편하게 넘김.
// @match        https://hitomi.la/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      ltn.hitomi.la
// @noframes
// @updateURL    https://raw.githubusercontent.com/damanting0-cyber/NeomGim/main/NeomGim.user.js
// @downloadURL  https://raw.githubusercontent.com/damanting0-cyber/NeomGim/main/NeomGim.user.js
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.18.0';
  const LANG = 'korean';
  const KOREAN_LINK = `/index-${LANG}.html`;
  const TOP_W = 760;
  const ID_RE = /-(\d+)\.html/;
  const DATE_RE = /(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/;
  const WORK_HREF_RE = /\d{5,}\.html(?:$|[?#])/i;
  const LIST_PAGE_RE = /^\/(reader|galleries|doujinshi|manga|artistcg|gamecg|imageset|anime|cg)\//;
  const IS_WORK_PAGE = LIST_PAGE_RE.test(location.pathname);
  const IS_READER = /^\/reader\//.test(location.pathname);
  const IS_SEARCH = /^\/search\.html$/.test(location.pathname);

  const W = () => (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

  // 사이트의 작품 정보(galleryinfo). 아이폰 Userscripts 처럼 스크립트가 사이트와 분리된 공간에서 돌면
  // 사이트 변수를 직접 못 읽으므로, 사이트 안에서 도는 작은 코드로 문서에 적어 두게 하고 그것을 읽는다.
  let giBridge = null, giAsked = false;
  function pageGI() {
    try {
      const g = W()['galleryinfo'];
      if (g && g.files) return g;
    } catch (e) {}
    if (giBridge) return giBridge;
    try {
      const raw = document.documentElement && document.documentElement.getAttribute('data-hk-gi');
      if (raw) { giBridge = JSON.parse(raw); return giBridge; }
    } catch (e) {}
    if (!giAsked && typeof unsafeWindow === 'undefined' && document.documentElement) {
      giAsked = true;
      askPageGI();
    }
    return null;
  }
  function askPageGI() {
    try {
      const sc = document.createElement('script');
      sc.textContent = '(function(){function put(){try{var g=window.galleryinfo;if(g&&g.files){' +
        'document.documentElement.setAttribute("data-hk-gi",JSON.stringify(g));return true}}catch(e){}return false}' +
        'if(!put()){var n=0,t=setInterval(function(){if(put()||++n>80)clearInterval(t)},200)}})();';
      (document.head || document.documentElement).appendChild(sc);
      sc.remove();
    } catch (e) {}
    // 그래도 안 되면 작품 정보 파일을 직접 받아 온다
    const gid = getCurrentId();
    if (gid && IS_WORK_PAGE) {
      fetchGalleryFiles(gid).then(files => {
        if (files && !giBridge) giBridge = { id: gid, files };
      }).catch(() => {});
    }
  }

  const KEY = {
    saved: 'hk_saved',
    settings: 'hk_settings',
    watched: 'hk_watch',
    thumbs: 'hk_thumbs',
    hist: 'hk_hist',
    terms: 'hk_terms',
    dates: 'hk_dates',
    block: 'hk_block',
    thumbOrd: 'hk_thumb_ord',
    dateOrd: 'hk_date_ord',
  };

  // 진단 로그는 없앴다 (기록하지 않음)
  function hlog() {}

  const store = {
    get(key, def) {
      try {
        if (typeof GM_getValue === 'function') {
          const v = GM_getValue(key, null);
          return v ? JSON.parse(v) : def;
        }
      } catch (e) {}
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : def;
      } catch (e) { return def; }
    },
    set(key, val) {
      const s = JSON.stringify(val);
      try {
        if (typeof GM_setValue === 'function') { GM_setValue(key, s); return; }
      } catch (e) {}
      try { localStorage.setItem(key, s); } catch (e) {}
    }
  };

  const SETTING_DEFAULTS = {
    enabled: true,
    reader: true,
    koreanOnly: true,
    cardStyle: true,
    koreanTitle: true,
    infinite: true,
    preload: true,
    mergeTitles: true,
    blockOn: true,
    jSort: 'date',
  };
  const settings = Object.assign({}, SETTING_DEFAULTS, store.get(KEY.settings, {}));
  const saveSettings = () => store.set(KEY.settings, settings);

  function setEnabled(v) {
    settings.enabled = v;
    saveSettings();
    location.reload();
  }

  try {
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand(
        settings.enabled ? 'NeomGim 끄기' : 'NeomGim 켜기',
        () => setEnabled(!settings.enabled)
      );
    }
  } catch (e) {}

  function mountOffButton() {
    if (document.getElementById('hk-off')) return;
    const h = document.createElement('div');
    h.id = 'hk-off';
    h.style.cssText =
      'all:initial!important;position:fixed!important;right:12px!important;bottom:12px!important;' +
      'z-index:2147483647!important;display:block!important;';
    const sh = h.attachShadow({ mode: 'open' });
    sh.innerHTML = `
      <style>
        button { all: initial; cursor: pointer; padding: 8px 14px; border-radius: 999px;
          background: rgba(28,28,32,.9); color: #f2f2f5; border: 1px solid rgba(255,255,255,.18);
          font: 600 12px/1.2 -apple-system, 'Malgun Gothic', sans-serif; opacity: .75; }
        button { transition: opacity .2s ease, transform .3s cubic-bezier(.22,1,.36,1); }
        button:active { opacity: 1; transform: scale(.92); transition-duration: .1s; }
      </style>
      <button>NeomGim 켜기</button>`;
    sh.querySelector('button').addEventListener('click', () => setEnabled(true));
    document.documentElement.appendChild(h);
  }

  if (!settings.enabled) {
    if (document.body) mountOffButton();
    else document.addEventListener('DOMContentLoaded', mountOffButton);
    return;
  }

  // 새로고침 직후 원래 히토미 화면이 잠깐 보이지 않도록, 스크립트가 시작되자마자 (모든 페이지에서) 화면을 가린다.
  // 첫 정리가 끝나면 걷히고, 혹시 문제가 생겨도 3초 뒤에는 저절로 걷힌다.
  onRoot(() => {
    try {
      const bootCss = document.createElement('style');
      bootCss.id = 'hk-boot-css';
      bootCss.textContent = 'html.hk-boot{background:#111111!important}html.hk-boot body{opacity:0!important}';
      (document.head || document.documentElement).appendChild(bootCss);
      document.documentElement.classList.add('hk-boot');
    } catch (e) {}
  });
  setTimeout(() => { try { document.documentElement.classList.remove('hk-boot'); } catch (e) {} }, 3000);

  function redirectTargetFor(path) {
    if (path === '/' || path === '/index.html') return KOREAN_LINK;
    if (/-all\.html$/.test(path)) return path.replace(/-all\.html$/, `-${LANG}.html`);
    return null;
  }
  {
    const target = redirectTargetFor(location.pathname);
    if (target) {
      location.replace(target + location.search + location.hash);
      return;
    }
  }

  let saved = store.get(KEY.saved, []);
  const saveList = () => store.set(KEY.saved, saved);

  let watched = store.get(KEY.watched, []);
  const saveWatched = () => store.set(KEY.watched, watched);

  // 차단 목록: 작품(품번·제목)과 작가·그룹 이름
  let blocks = store.get(KEY.block, null);
  if (!blocks || typeof blocks !== 'object') blocks = {};
  if (!Array.isArray(blocks.works)) blocks.works = [];
  if (!Array.isArray(blocks.artists)) blocks.artists = [];
  const saveBlocks = () => store.set(KEY.block, blocks);

  // 캐시 정리 순서: 넣은(갱신한) 순서대로 기억해 두고, 넘치면 가장 오래된 것부터 지운다.
  // (객체 키는 숫자 순으로 돌아서 '품번이 작은 것'부터 지워지던 문제를 막는다) 일지 · 기록에 있는 작품은 지우지 않는다.
  function keepIds() {
    const k = new Set();
    saved.forEach(x => k.add(String(x.id)));
    watched.forEach(x => k.add(String(x.id)));
    return k;
  }
  function lruOrder(storeKey, obj, max) {
    let ord = store.get(storeKey, null);
    const seen = new Set();
    ord = (Array.isArray(ord) ? ord : []).map(String).filter(k => (k in obj) && !seen.has(k) && seen.add(k));
    // 순서를 모르는 예전 항목은 가장 오래된 쪽에 둔다
    ord = Object.keys(obj).filter(k => !seen.has(k)).concat(ord);
    return {
      touch(id) {
        const i = ord.indexOf(id);
        if (i >= 0) ord.splice(i, 1);
        ord.push(id);
      },
      trim() {
        if (ord.length <= max) return;
        const keep = keepIds();
        for (let i = 0; i < ord.length && ord.length > max;) {
          if (keep.has(ord[i])) { i++; continue; }
          delete obj[ord[i]];
          ord.splice(i, 1);
        }
      },
      save() { store.set(storeKey, ord); }
    };
  }

  let thumbs = store.get(KEY.thumbs, {});
  const thumbOrd = lruOrder(KEY.thumbOrd, thumbs, 1500);
  let thumbsDirty = false;
  function setThumb(id, url) {
    if (!id || !url || /^data:/.test(url)) return;
    if (url.indexOf('//') === 0) url = 'https:' + url;
    id = String(id);
    if (thumbs[id] === url) return;
    thumbs[id] = url;
    thumbOrd.touch(id);
    thumbOrd.trim();
    thumbsDirty = true;
  }
  let thumbsTimer = 0;
  function writeThumbs() {
    clearTimeout(thumbsTimer);
    thumbsTimer = 0;
    if (!thumbsDirty) return;
    thumbsDirty = false;
    store.set(KEY.thumbs, thumbs);
    thumbOrd.save();
  }
  function flushThumbs() {
    if (thumbsTimer || !thumbsDirty) return;
    thumbsTimer = setTimeout(writeThumbs, 700);
  }

  const terms = store.get(KEY.terms, []);
  const termSet = new Set(terms);
  let termsDirty = false;
  function addTerm(t) {
    t = (t || '').trim();
    if (t.length < 2 || t.length > 60 || termSet.has(t)) return;
    termSet.add(t);
    terms.push(t);
    if (terms.length > 800) termSet.delete(terms.shift());
    termsDirty = true;
  }
  let termsTimer = 0;
  function writeTerms() {
    clearTimeout(termsTimer);
    termsTimer = 0;
    if (!termsDirty) return;
    termsDirty = false;
    store.set(KEY.terms, terms);
  }
  function flushTerms() {
    if (termsTimer || !termsDirty) return;
    termsTimer = setTimeout(writeTerms, 700);
  }

  let hist = store.get(KEY.hist, []);
  function pushHist(q) {
    hist = [q].concat(hist.filter(h => h !== q)).slice(0, 30);
    store.set(KEY.hist, hist);
  }

  const dates = store.get(KEY.dates, {});
  const dateOrd = lruOrder(KEY.dateOrd, dates, 1500);
  let dateTimer = 0;
  function setDate(id, d) {
    if (!id || !d) return;
    id = String(id);
    if (dates[id] === d) return;
    dates[id] = d;
    dateOrd.touch(id);
    dateOrd.trim();
    paintDate(id);
    clearTimeout(dateTimer);
    dateTimer = setTimeout(flushDates, 800);
  }
  const dateQ = { q: [], seen: new Set(), active: 0 };
  function wantDate(id) {
    if (!id || dates[id] || dateQ.seen.has(String(id))) return;
    if (dateQ.seen.size > 4000) dateQ.seen.clear();
    dateQ.seen.add(String(id));
    dateQ.q.push(String(id));
    pumpDate();
  }
  function fmtDate(m) {
    const p = n => String(n).padStart(2, '0');
    let out = `${m[1]}.${p(m[2])}.${p(m[3])}`;
    if (m[4] != null) out += ` ${+m[4]}:${m[5]}`;
    return out;
  }
  function pumpDate() {
    while (dateQ.active < 2 && dateQ.q.length) {
      const id = dateQ.q.shift();
      dateQ.active++;
      const fromHtml = () => fetch('/galleries/' + id + '.html', { credentials: 'same-origin' })
        .then(r => (r.ok ? r.text() : ''))
        .then(t => {
          const m = t.match(/(?:date|등록|발매)[^0-9]{0,24}(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/i)
            || t.match(DATE_RE);
          return m ? fmtDate(m) : '';
        })
        .catch(() => '');
      const fromJs = () => gmGet('https://ltn.hitomi.la/galleries/' + id + '.js')
        .catch(() => fetchT('/galleries/' + id + '.js', { credentials: 'same-origin' }, 8000).then(r => (r.ok ? r.text() : '')))
        .then(t => {
          const m = String(t || '').match(/"date"\s*:\s*"([^"]+)"/);
          const d = m && m[1].match(DATE_RE);
          return d ? fmtDate(d) : '';
        })
        .catch(() => '');
      fromHtml()
        .then(s => s || fromJs())
        .then(s => {
          if (s) setDate(id, s);
          else hlog('날짜 못 찾음', id);
        })
        .catch(() => {})
        .then(() => { dateQ.active--; pumpDate(); });
    }
  }

  function paintDate(id) {
    const key = String(id);
    document.querySelectorAll('.hk-card-host[data-hk-id="' + key + '"]').forEach(h => {
      const d = h.shadowRoot && h.shadowRoot.querySelector('.dline');
      if (d) d.textContent = dates[key] || '';
    });
  }
  function noteDate(id, raw) {
    const m = String(raw || '').match(DATE_RE);
    if (!m) return;
    setDate(id, fmtDate(m));
  }
  function flushDates() { clearTimeout(dateTimer); store.set(KEY.dates, dates); dateOrd.save(); }
  window.addEventListener('pagehide', () => { flushDates(); writeThumbs(); writeTerms(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { flushDates(); writeThumbs(); writeTerms(); }
  });

  // 목록 페이지: 히토미 원래 UI는 처음부터 투명하게 두고, 작품 목록과 이 스크립트가 만든 것만 보이게 한다
  const LIST_BG_CSS = IS_WORK_PAGE ? '' : `
    html, body { background-color: #111111 !important; }
    body { visibility: hidden !important; }
    .gallery-content, #hk-sentinel, #hk-bg, .page-container { visibility: visible !important; }
  `;

  const SITE_CSS = `
    ${LIST_BG_CSS}
    html.hk-restoring body, html.hk-boot body { opacity: 0 !important; }
    .hk-slot { flex: 0 0 100%; width: 100%; grid-column: 1 / -1; pointer-events: none; }
    body { transition: opacity .2s ease; }
    .hk-banner, .hk-native { display: none !important; }
    #search-button, button#search, .search-button, input[type="submit"][value="Search" i] { display: none !important; }
    .search-content, #search-content, #search-form, .search-bar, #search-box,
    .search-box, #query-input, #search-options { display: none !important; }
    .gallery-content > div.hk-hidden, .gallery-content > div.hk-artsoff, .gallery-content > div.hk-merged, .gallery-content > div.hk-blocked { display: none !important; }
    .gallery-content > .hk-stray { display: none !important; }
    .hk-vanish { display: none !important; }
    .gallery-content > div.hk-metaon { z-index: 30 !important; }
    .gallery-content > div.hk-lpfocus { z-index: 2147483001 !important; }
    hk-dim {
      position: fixed !important; top: 0 !important; right: 0 !important; bottom: 0 !important; left: 0 !important; z-index: 2147483000 !important; display: block !important;
      background: rgba(10, 10, 14, 0.28);
      -webkit-backdrop-filter: blur(9px) saturate(1.1); backdrop-filter: blur(9px) saturate(1.1);
      opacity: 0; transition: opacity .25s ease;
    }
    hk-dim.on { opacity: 1; }
    .gallery-content > div.hk-metaon:active { transform: none !important; }
    ${settings.infinite ? 'html:not(.hk-pager-on) .page-container { display: none !important; }' : ''}
    .gallery-content .hk-hide { display: none !important; }
    ${settings.cardStyle ? `
    .gallery-content {
      display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      gap: 44px 40px !important; width: 100% !important; max-width: 440px !important;
      margin: 14px auto 0 !important; padding: 0 20px !important; float: none !important;
      box-sizing: border-box !important;
    }
    .gallery-content > div {
      width: auto !important; max-width: none !important; height: auto !important;
      min-height: 0 !important; float: none !important; margin: 0 !important;
      padding: 0 !important; box-sizing: border-box !important; position: static !important;
    }
    .gallery-content > div[data-hk-done]::before {
      content: ''; position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 0;
      border-radius: 18px; pointer-events: none; background-color: #1e1e22;
      background-image: linear-gradient(to top, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.12));
      animation: hkPulse 1.1s ease-in-out infinite alternate;
    }
    .gallery-content > div[data-hk-done].hk-img-ok::before { animation: hkGone .4s ease forwards; }
    .gallery-content > div:not([data-hk-done]):not(.hk-slot) {
      position: relative !important; aspect-ratio: 3 / 4; overflow: hidden !important; border-radius: 18px;
    }
    .gallery-content > div:not([data-hk-done]):not(.hk-slot) > * { visibility: hidden !important; }
    .gallery-content > div:not([data-hk-done]):not(.hk-slot)::before {
      content: ''; position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 0;
      border-radius: 18px; pointer-events: none; background-color: #1e1e22;
      background-image: linear-gradient(to top, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0.12));
      animation: hkPulse 1.1s ease-in-out infinite alternate;
    }
    /* 로딩 표시는 opacity만 움직여서(합성 단계에서 처리) 스크롤 중 프레임이 덜 떨어지게 한다 */
    @keyframes hkPulse { from { opacity: .45; } to { opacity: 1; } }
    @keyframes hkGone { from { opacity: 1; } to { opacity: 0; } }
    .gallery-content > div[data-hk-done] {
      position: relative !important;
      border-radius: 18px; overflow: visible;
      background: transparent; border: 1px solid transparent;
      transition: transform .4s cubic-bezier(.22, 1, .36, 1), box-shadow .4s cubic-bezier(.22, 1, .36, 1), border-color .3s ease, background .3s ease;
    }
    .gallery-content > div[data-hk-done].hk-img-ok {
      background: #1e1e22; border-color: rgba(255, 255, 255, 0.1);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
    }
    @media (max-width: 520px) {
      .gallery-content { gap: 30px 24px !important; padding: 0 14px !important; }
    }` : ''}
  `;

  const CARD_CSS = `
    :host { all: initial; display: block; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    .card {
      position: relative; display: block; aspect-ratio: 3 / 4; overflow: hidden; border-radius: 18px;
      background: transparent; color: #f2f2f5;
      font-family: 'Pretendard Variable', Pretendard, -apple-system, 'Malgun Gothic', sans-serif;
      visibility: hidden;
    }
    .card.hk-on { visibility: visible; animation: hkCardIn .5s ease backwards; }
    @keyframes hkCardIn { from { opacity: 0; } to { opacity: 1; } }
    .thumb { position: absolute; top: 0; right: 0; bottom: 0; left: 0; display: block; cursor: pointer; }
    .thumb picture { display: block !important; width: 100% !important; height: 100% !important; }
    .card { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
    .thumb img {
      -webkit-touch-callout: none !important; -webkit-user-drag: none !important;
      display: block !important; width: 100% !important; height: 100% !important;
      max-width: none !important; max-height: none !important; margin: 0 !important;
      object-fit: cover !important; border: 0 !important;
      transition: transform .7s cubic-bezier(.22, 1, .36, 1), opacity .4s ease !important;
    }
    .card::after {
      content: ''; position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 5;
      border-radius: 18px; border: 1.5px solid rgba(255, 255, 255, 0.42);
      pointer-events: none; opacity: 0; transition: opacity .45s ease, border-color .45s ease;
    }
    .card.ready::after { opacity: 1; }
    .card.viewed.ready::after { border-color: rgba(170, 205, 255, 0.72); }
    .grp {
      position: absolute; top: 8px; right: 8px; z-index: 3; cursor: pointer;
      padding: 3px 9px; border-radius: 999px; font: inherit; font-size: 11px; font-weight: 700; line-height: 1.3;
      color: #fff; background: rgba(20, 20, 26, 0.78); border: 1px solid rgba(255, 255, 255, 0.35);
      transition: background .25s ease, transform .2s ease;
    }
    .grp:active { transform: scale(.94); }
    .grplist {
      position: absolute; top: 38px; right: 8px; left: 8px; z-index: 4; max-height: 60%; overflow-y: auto;
      padding: 8px; border-radius: 14px; background: rgba(18, 18, 22, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.2); font-size: 12px;
      animation: seenIn .3s cubic-bezier(.22, 1, .36, 1) backwards;
    }
    .grplist .gh { color: rgba(255, 255, 255, 0.6); font-size: 11px; margin: 0 4px 4px; }
    .grplist a {
      display: flex; justify-content: space-between; gap: 8px; padding: 7px 8px;
      border-radius: 10px; color: #fff; text-decoration: none;
    }
    .grplist a { transition: background .2s ease, transform .3s cubic-bezier(.22, 1, .36, 1); }
    .grplist a:active { background: rgba(255, 255, 255, 0.12); transform: scale(.97); transition-duration: .1s; }
    .grplist .d { color: rgba(255, 255, 255, 0.6); font-size: 10.5px; }
    .info {
      position: absolute; left: 0; right: 0; bottom: 0;
      padding: 10px 12px 11px 12px; cursor: pointer;
      border-radius: 0 0 17px 17px;
      background: #d9dce3;
      transition: padding .3s ease;
    }
    .info .title a { cursor: pointer; }
    .title a.cut {
      -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 44px), transparent 100%);
      mask-image: linear-gradient(to right, #000 calc(100% - 44px), transparent 100%);
    }
    .title a {
      display: block; white-space: nowrap; overflow: hidden; text-overflow: clip;
      color: #000; text-decoration: none;
      font-size: 13px; font-weight: 600; line-height: 1.35; letter-spacing: -0.01em;
      transition: color .25s ease;
    }
    .dline { font-size: 10.5px; line-height: 1.3; color: rgba(0, 0, 0, 0.5); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .dline:empty { display: none; }
    .card.viewed .dline { color: rgba(0, 0, 0, 0.62); }
    .card.viewed .info {
      background: #bcd4f5;
    }
    @keyframes seenIn { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
    @media (min-width: 521px) {
      .info { padding: 10px 14px 12px 14px; }
      .title a { font-size: 14.5px; }
    }
  `;

  const CARD_HTML = `
    <div class="card">
      <a class="thumb"></a>
      <button class="grp" type="button" style="display:none"></button>
      <div class="grplist" style="display:none"></div>
      <div class="info">
        <div class="title"><a></a></div>
        <div class="dline"></div>
      </div>
    </div>`;
  let cardSheet = null;
  try {
    cardSheet = new CSSStyleSheet();
    cardSheet.replaceSync(CARD_CSS);
  } catch (e) { cardSheet = null; }

  const PANEL_CSS = `
    :host { all: initial; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    .root {
      --border: rgba(255, 255, 255, 0.18);
      --text: #f4f5f7;
      --sub: rgba(255, 255, 255, 0.58);
      --ease: cubic-bezier(.22, 1, .36, 1);
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
      font-size: 13px; line-height: 1.3; letter-spacing: -0.01em; color: var(--text);
    }

    .pill {
      background: rgba(26, 26, 30, 0.84);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.38);
      -webkit-backdrop-filter: blur(20px) saturate(1.5);
      backdrop-filter: blur(20px) saturate(1.5);
    }

    @keyframes hkBarIn {
      from { opacity: 0; transform: translateY(24px) scale(0.98); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes hkSwap {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes seenIn { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }

    /* 하단 버튼 묶음의 빈 공간은 손가락이 그대로 아래 페이지에 닿게 한다 (빈 곳에서 시작한 끌기도 넘김이 되도록) */
    .wrap { pointer-events: none; }
    .wrap > .tl, .wrap > .bottom > * { pointer-events: auto; }
    .bottom { pointer-events: none; }
    .wrap {
      position: fixed; right: 16px; bottom: 16px; z-index: 2;
      display: flex; flex-direction: column; align-items: flex-end; gap: 12px;
      max-width: calc(100vw - 32px);
      transition: transform .3s var(--ease);
    }
    .scrim {
      position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 1;
      display: none; background: transparent;
      -webkit-tap-highlight-color: transparent;
    }
    .scrim.on { display: block; }
    .stack {
      position: absolute; right: 0; bottom: calc(100% + 12px);
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      width: min(440px, calc(100vw - 32px));
      pointer-events: none; max-height: 76vh;
    }
    .stack > * { pointer-events: auto; }
    .stack > .out { pointer-events: none; }

    .tl {
      display: flex; align-items: center; gap: 2px;
      height: 44px; padding: 0 5px; border-radius: 999px;
      animation: hkBarIn .7s var(--ease) .16s backwards;
    }
    .tl .pg {
      padding: 0 12px 0 14px; font-size: 13px; font-weight: 700; color: #fff;
      font-variant-numeric: tabular-nums; white-space: nowrap; cursor: pointer;
      user-select: none; -webkit-tap-highlight-color: transparent;
      transition: transform .22s var(--ease), opacity .2s ease;
    }
    .tl .pg:active { transform: scale(.86); opacity: .7; transition-duration: .1s; }
    .tl .pg.active { transform: scale(.9); }
    .tl .ib { width: 34px; height: 34px; }
    .tl .ib svg { width: 17px; height: 17px; }
    .hh { font-size: 15px; font-weight: 800; letter-spacing: .02em; line-height: 1; }

    button { font: inherit; color: inherit; }
    .ib {
      -webkit-appearance: none; appearance: none; border: 0; background: none; flex: none;
      display: inline-flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; border-radius: 50%; color: var(--text); cursor: pointer;
      transition: background .22s var(--ease), color .22s var(--ease), transform .22s var(--ease);
    }
    .ib svg { display: block; width: 19px; height: 19px; transition: transform .5s var(--ease); }
    .ib:active { transform: scale(.9); transition-duration: .1s; }
    .ib.active { background: rgba(255, 255, 255, 0.20); color: #fff; transform: scale(.9); }
    .ib.gear:active svg { transform: rotate(60deg); }
    .ib.pin.on { color: #ffd54a; }
    .ib.pin.on svg .jb { fill: currentColor; fill-opacity: .28; }

    .bar {
      display: flex; align-items: center; gap: 2px;
      height: 52px; padding: 0 6px; border-radius: 999px;
      animation: hkBarIn .7s var(--ease) .1s backwards;
    }
    .bar, .filt, .tl {
      transform: scale(calc(1 - 0.05 * var(--p, 0))); transform-origin: 100% 50%;
    }
    .cur {
      -webkit-appearance: none; appearance: none; border: 0; background: none; cursor: pointer;
      flex: none; padding: 0 4px 0 16px; font-size: 15px; font-weight: 700; color: #fff;
      font-variant-numeric: tabular-nums; white-space: nowrap; transition: color .2s;
    }
    .cur.done { color: #9fe0a8; }

    .bottom {
      display: flex; align-items: center; justify-content: flex-end;
      flex-wrap: wrap; gap: 10px; max-width: 100%;
    }
    .filt {
      -webkit-appearance: none; appearance: none; border: 1px solid rgba(255, 255, 255, 0.26); flex: none; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px;
      height: 52px; padding: 0 17px 0 15px; border-radius: 999px;
      color: var(--text); font: inherit; font-size: 12.5px; font-weight: 700;
      animation: hkBarIn .7s var(--ease) .12s backwards;
      transition: color .2s var(--ease), transform .22s var(--ease);
    }
    .filt svg { display: block; width: 16px; height: 16px; opacity: .85; }
    .filt .fl { white-space: nowrap; }
    .filt.active { color: #fff; transform: scale(calc(.94 - 0.05 * var(--p, 0))); }
    @keyframes hkCh { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .hlk { font-size: 13px; font-weight: 700; color: #fff; margin-top: 12px; }
    .hld { font-size: 12px; color: var(--sub); line-height: 1.5; margin-top: 3px; }

    .toast, .panel { display: none; width: 100%; }
    .toast { width: auto; }
    .panel {
      padding: 12px; border-radius: 26px;
      max-height: min(72vh, 600px); overflow-y: auto;
      transition: max-height .3s var(--ease);
      scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .28) transparent;
      background: rgba(26, 26, 30, 0.9) !important;
      transform-origin: 100% 100%; will-change: transform, opacity;
    }
    .panel.open, .toast.open { display: block; }
    .panel.open.out, .toast.open.out { pointer-events: none; }
    .toast {
      transform-origin: 100% 100%;
      padding: 9px 16px; border-radius: 999px; color: #fff; white-space: nowrap;
      background: rgba(24, 24, 28, 0.92) !important;
    }
    .toast.has-act { padding: 5px 5px 5px 16px; }
    .toast .tmsg { vertical-align: middle; }
    .toast .tact {
      -webkit-appearance: none; appearance: none; cursor: pointer; vertical-align: middle;
      height: 30px; margin-left: 12px; padding: 0 14px; border-radius: 999px; border: 0;
      background: rgba(255, 255, 255, 0.92); color: #14161a; font: inherit; font-size: 12.5px; font-weight: 700;
      transition: transform .3s var(--ease);
    }
    .toast .tact:active { transform: scale(.9); transition-duration: .1s; }
    .panel.mini { width: auto; min-width: 220px; padding: 14px 16px; }
    .panel.mini .val { margin-bottom: 10px; }

    .panel.hist { display: flex; flex-direction: column; overflow: hidden; position: relative; padding: 0; }
    .hhead { flex: none; display: flex; align-items: center; gap: 8px; padding: 12px 12px 10px; }
    .hhead > .seg {
      flex: none; width: max-content; margin: 0; padding: 4px;
      background: rgba(30, 30, 36, 0.92); border: 1px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
    }
    .hhead > .hrow { flex: 1 1 auto; min-width: 0; margin: 0; }
    .panel.hist > .hbody {
      flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      padding: 4px 12px 12px; scrollbar-width: thin;
      -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%);
      mask-image: linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%); scrollbar-color: rgba(255, 255, 255, .28) transparent;
    }
    .panel.hist > .hbody.at-top {
      -webkit-mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 24px), transparent 100%);
      mask-image: linear-gradient(to bottom, #000 0, #000 calc(100% - 24px), transparent 100%);
    }
    .panel.top {
      position: fixed; top: 12px; right: 16px; bottom: auto;
      width: min(440px, calc(100vw - 32px));
      max-height: min(64vh, 540px);
      transform-origin: 100% 0;
    }
    .root.leave .wrap { opacity: 0; transform: translateY(10px); transition: opacity .28s ease, transform .28s ease; }
    .root.enter .wrap { animation: hkWrapIn .5s var(--ease) .12s backwards; }
    .root.morph .bar, .root.morph .filt, .root.morph .tl { animation: none; }
    .wrap > .tl, .bottom { transition: filter .25s ease, opacity .25s ease; }
    .root.dim .wrap > .tl, .root.dim .bottom { filter: blur(5px); opacity: .6; }
    .root.dim .wrap > .tl, .root.dim .wrap > .tl *, .root.dim .bottom, .root.dim .bottom * { pointer-events: none !important; }
    @keyframes hkWrapIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
    .glass {
      position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 1;
      border-radius: 26px; pointer-events: none;
      background: rgba(0, 0, 0, 0);
      visibility: hidden; opacity: 0;
    }
    .hfix {
      position: relative; flex: none;
      width: 44px; height: 44px; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      background: rgba(26, 26, 30, 0.84); color: var(--text);
      border: 1px solid rgba(255, 255, 255, 0.22);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38);
      transition: transform .22s var(--ease), background .22s var(--ease);
    }
    .hfix:active, .hfix.active { transform: scale(.92); }
    .hfix.active { background: rgba(60, 60, 68, 0.92); }
    .fxtop, .fxbot { position: fixed; left: 0; right: 0; pointer-events: none; z-index: 0; transition: opacity .25s ease; }
    .fxtop { top: 0; height: 64px; background: linear-gradient(to bottom, rgba(17, 17, 17, 0.75), rgba(17, 17, 17, 0)); }
    .fxbot { bottom: 0; height: 72px; background: linear-gradient(to top, rgba(17, 17, 17, 0.9), rgba(17, 17, 17, 0)); }
    .root.at-top .fxtop { opacity: 0; }
    .glass { display: none !important; }
    .glass.on { visibility: visible; opacity: 1; }

    .tgrid { display: flex; flex-direction: column; gap: 6px; }
    .tog {
      position: relative; display: flex; align-items: center; justify-content: flex-start;
      min-height: 46px; padding: 0 64px 0 18px; border-radius: 999px; text-align: left;
      background: rgba(255, 255, 255, 0.08); color: var(--sub);
      font-size: 13px; font-weight: 600; cursor: pointer; user-select: none;
      transition: background .25s var(--ease), color .25s var(--ease), transform .3s var(--ease);
    }
    .tog::after {
      content: ''; position: absolute; right: 8px; top: 50%; width: 44px; height: 26px; margin-top: -13px;
      border-radius: 999px; background: rgba(255, 255, 255, 0.16);
      transition: background .25s var(--ease);
    }
    .tog::before {
      content: ''; position: absolute; right: 29px; top: 50%; width: 20px; height: 20px; margin-top: -10px; z-index: 1;
      border-radius: 50%; background: rgba(255, 255, 255, 0.75); box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
      transition: transform .3s var(--ease), background .25s var(--ease);
    }
    .tog:active { transform: scale(.98); transition-duration: .1s; }
    .tog.on { background: rgba(255, 255, 255, 0.16); color: #fff; }
    .tog.on::after { background: #9fe0a8; }
    .tog.on::before { transform: translateX(18px); background: #fff; }

    .sgl { margin-top: 8px; }
    .sgl:empty { margin-top: 0; }
    .hbody.hin { animation: hkSwap .32s var(--ease); }
    .sg {
      display: flex; align-items: center; gap: 8px;
      padding: 11px 14px; border-radius: 14px; cursor: pointer; font-size: 14px;
      transition: background .2s var(--ease);
    }
    .sg.hl { background: rgba(255, 255, 255, 0.13); }
    .sg { transition: background .2s var(--ease), transform .3s var(--ease); }
    .sg:active { background: rgba(255, 255, 255, 0.13); transform: scale(.98); transition-duration: .1s; }
    .sg .t { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sg .t mark { background: none; color: #fff; font-weight: 800; text-decoration: underline; text-underline-offset: 3px; }
    .sg .k { flex: none; color: var(--sub); font-size: 11px; font-variant-numeric: tabular-nums; }
    .sg .ty {
      flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 8px;
      border-radius: 999px; background: rgba(255, 255, 255, 0.10);
      color: var(--sub); font-size: 10.5px; font-weight: 700;
    }
    .sg .ty.f { color: #ffc2da; }
    .sg .ty.m { color: #b9d5ff; }
    .sg .ty.a { color: #ffe0a8; }
    .sg .x {
      flex: none; width: 24px; height: 24px; border-radius: 50%; text-align: center;
      line-height: 24px; color: var(--sub); transition: background .2s, color .2s, transform .3s var(--ease);
    }
    .sg .x:active { color: #fff; background: rgba(255, 255, 255, 0.14); transform: scale(.88); }

    .slist { display: flex; flex-direction: column; gap: 4px; }
    .srow {
      -webkit-appearance: none; appearance: none; border: 0; background: none; flex: none;
      display: flex; align-items: center; justify-content: flex-start; gap: 0;
      padding: 12px 15px; border-radius: 14px; color: var(--text);
      font: inherit; font-size: 13.5px; font-weight: 500; text-align: left; cursor: pointer;
      transition: background .2s var(--ease), color .2s var(--ease);
    }
    .srow { transition: background .2s var(--ease), color .2s var(--ease), transform .3s var(--ease); }
    .srow:active { background: rgba(255, 255, 255, 0.13); transform: scale(.98); transition-duration: .1s; }
    .srow.on { background: rgba(255, 255, 255, 0.20); color: #fff; font-weight: 700; }
    .srow.on::after { content: '✓'; font-size: 12px; margin-left: auto; }

    .btn {
      -webkit-appearance: none; appearance: none;
      display: inline-flex; align-items: center; justify-content: center; flex: none;
      height: 34px; padding: 0 14px; border-radius: 999px;
      border: 1px solid var(--border); background: rgba(255, 255, 255, 0.10);
      color: var(--text); font-weight: 500; white-space: nowrap; cursor: pointer; text-decoration: none;
      transition: background .25s var(--ease), border-color .25s var(--ease), color .25s var(--ease), transform .25s var(--ease);
    }
    .btn:active { transform: scale(.95); transition-duration: .1s; }
    .btn.sm { height: 28px; padding: 0 12px; font-size: 12px; }
    .btn.fit { height: 38px; padding: 0 16px; }
    .btn.primary { background: rgba(255, 255, 255, 0.92); border-color: transparent; color: #14161a; font-weight: 700; }
    .field {
      -webkit-appearance: none; appearance: none;
      flex: 1 1 0; min-width: 0; width: 100%; height: 38px; padding: 0 14px; border-radius: 999px;
      border: 1px solid var(--border); background: rgba(255, 255, 255, 0.07);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.22);
      color: #fff; font: inherit; font-size: 14px; outline: none;
      transition: border-color .25s var(--ease), background .25s var(--ease), box-shadow .3s var(--ease);
    }
    .field::placeholder { color: var(--sub); }
    .field:focus {
      border-color: rgba(255, 255, 255, 0.4); background: rgba(255, 255, 255, 0.10);
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.22), 0 0 0 3px rgba(255, 255, 255, 0.12);
    }

    .seg { display: flex; gap: 4px; padding: 4px; margin-bottom: 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.09); }
    .segb {
      -webkit-appearance: none; appearance: none; border: 0; background: none; flex: 1 1 0;
      height: 32px; border-radius: 999px; color: var(--sub); font: inherit; font-size: 12.5px;
      font-weight: 600; cursor: pointer;
      transition: background .25s var(--ease), color .25s var(--ease);
    }
    .segb { transition: background .25s var(--ease), color .25s var(--ease), transform .3s var(--ease); }
    .segb:active { transform: scale(.94); transition-duration: .1s; }
    .segb { white-space: nowrap; padding: 0 14px; }
    .segb.on { background: rgba(255, 255, 255, 0.20); color: #fff; }
    .seg { position: relative; }
    .segb { position: relative; z-index: 1; }
    .segi {
      position: absolute; left: 0; top: 4px; bottom: 4px; width: 0; z-index: 0;
      border-radius: 999px; background: rgba(255, 255, 255, 0.20); pointer-events: none;
      opacity: 0; transition: transform .42s var(--ease), width .42s var(--ease);
    }
    .seg.slide .segi { opacity: 1; }
    .seg.slide .segb.on { background: none; }
    .seg.noanim .segi { transition: none; }
    .seg.sm { margin: 0; padding: 3px; gap: 2px; }
    .seg.sm .segi { top: 3px; bottom: 3px; }
    .seg.sm .segb { height: 26px; padding: 0 11px; font-size: 11.5px; }
    .jbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 10px; }
    .jbar .jn { color: var(--sub); font-size: 11.5px; font-weight: 600; padding-left: 4px; }
    .tog.inl { min-height: 40px; margin-top: 10px; }
    .panel.cpop {
      position: absolute; left: 0; top: 0; width: 300px;
      padding: 14px; border-radius: 22px; max-height: 60vh;
      background: rgba(24, 24, 28, 0.82) !important;
    }
    .cpop .ttl { font-size: 14.5px; margin-bottom: 2px; }
    .cpop .lbl { margin-top: 10px; }
    .acard { text-decoration: none; color: inherit; cursor: pointer; }
    .helpfab {
      -webkit-appearance: none; appearance: none; flex: none; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; padding: 0; border-radius: 50%;
      border: 1px solid var(--border); background: rgba(255, 255, 255, 0.10);
      color: #fff; font: 700 15px/1 -apple-system, 'Malgun Gothic', sans-serif;
      transition: background .2s var(--ease), transform .3s var(--ease);
    }
    .helpfab:active { background: rgba(255, 255, 255, 0.2); transform: scale(.88); transition-duration: .1s; }

    .pstars { display: flex; align-items: center; margin-right: 2px; }
    .bstar {
      -webkit-appearance: none; appearance: none; border: 0; background: none; cursor: pointer; flex: none;
      width: 22px; height: 40px; padding: 0; display: inline-flex; align-items: center; justify-content: center;
      color: rgba(255, 255, 255, 0.34); transition: color .18s var(--ease), transform .2s var(--ease);
    }
    .bstar svg { display: block; width: 18px; height: 18px; fill: none; }
    .pstars.saved .bstar:not(.on) { color: rgba(255, 213, 74, 0.5); }
    .bstar.on { color: #ffd54a; }
    .bstar.on svg { fill: currentColor; }
    .bstar:active { transform: scale(.8); transition-duration: .1s; }
    @media (max-width: 520px) {
      .bstar { width: 19px; height: 36px; }
      .bstar svg { width: 16px; height: 16px; }
    }

    .panel.hist > .hbody.jpad { padding-bottom: 66px; }
    .jfoot {
      position: absolute; left: 10px; right: 10px; bottom: 10px; z-index: 3;
      display: flex; flex-direction: column; gap: 6px; padding: 6px;
      border-radius: 22px; background: rgba(34, 34, 40, 0.72);
      border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 10px 26px rgba(0, 0, 0, 0.45);
      -webkit-backdrop-filter: blur(18px) saturate(1.5);
      backdrop-filter: blur(18px) saturate(1.5);
    }
    .jfr { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .jfr .jn { color: var(--sub); font-size: 11.5px; font-weight: 600; padding-left: 8px; white-space: nowrap; }
    .sdiv {
      grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; cursor: pointer;
      margin: 4px 0 0; padding: 6px 6px 6px 4px; border-radius: 12px;
      color: #ffd54a; font-size: 12px; font-weight: 700; user-select: none;
      -webkit-tap-highlight-color: transparent;
      transition: background .2s ease, transform .3s cubic-bezier(.22, 1, .36, 1);
    }
    .sdiv:active { background: rgba(255, 255, 255, 0.08); transform: scale(.98); transition-duration: .1s; }
    .sdiv .sdc { order: 3; display: inline-flex; color: var(--sub); transition: transform .3s cubic-bezier(.22, 1, .36, 1); }
    .sdiv .sdc svg { width: 15px; height: 15px; display: block; }
    .sdiv.fold .sdc { transform: rotate(-90deg); }
    .sdiv.fold { color: rgba(255, 213, 74, 0.7); }
    .sdiv:first-child { margin-top: 0; }
    .item.jhide { display: none !important; }
    .sdiv::after { content: ''; order: 1; flex: 1 1 auto; height: 1px; background: rgba(255, 255, 255, 0.18); }
    .sdiv .sdn { order: 2; color: var(--sub); font-size: 11px; font-weight: 600; }
    .sdiv .sdl.none { color: var(--sub); }
    .sdiv .st { display: inline-flex; }
    .sdiv .st svg { width: 13px; height: 13px; fill: none; }
    .sdiv .st svg.on { fill: currentColor; }

    .chip.bad { background: rgba(255, 90, 90, 0.18); border-color: rgba(255, 120, 120, 0.45); }
    .bkl { display: flex; flex-direction: column; gap: 6px; }
    .bkb {
      -webkit-appearance: none; appearance: none; cursor: pointer; width: 100%;
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 10px 14px; border-radius: 14px; border: 1px solid rgba(255, 120, 120, 0.35);
      background: rgba(255, 90, 90, 0.14); color: #fff; font: inherit; font-size: 13px; font-weight: 700; text-align: left;
      transition: transform .3s var(--ease), background .2s ease;
    }
    .bkb:active { transform: scale(.97); background: rgba(255, 90, 90, 0.26); transition-duration: .1s; }
    .bkb .bkt { flex: none; }
    .bkb .bks { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: rgba(255, 255, 255, 0.7); font-size: 12px; font-weight: 600; }
    .srow.bwr { gap: 8px; }
    .srow .bwid { flex: none; font-weight: 700; font-variant-numeric: tabular-nums; }
    .srow .bwt { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--sub); }
    .srow .bwx { flex: none; color: var(--sub); }

    .hhd { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
    .btn.hback { flex: none; width: 34px; padding: 0; font-size: 15px; }
    .seg.hseg { flex: 1 1 auto; margin: 0; }
    .seg.hseg .segb { flex: 1 1 0; padding: 0 4px; }
    .hcards { display: flex; flex-direction: column; gap: 6px; }
    .hcard { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 16px; background: rgba(255, 255, 255, 0.07); }
    .hic {
      flex: none; width: 34px; height: 34px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      background: rgba(255, 255, 255, 0.12); color: #fff; font-size: 14px;
    }
    .hic svg { display: block; width: 17px; height: 17px; }
    .htx { min-width: 0; }
    .hct { color: #fff; font-size: 13px; font-weight: 700; }
    .hcd { margin-top: 2px; color: var(--sub); font-size: 12px; line-height: 1.45; }

    .row { display: flex; align-items: center; gap: 6px; }
    .row + .row, .row + .list, .lbl + .row, .row + .lbl, .hint + .lbl { margin-top: 8px; }
    .row.wrap-row { flex-wrap: wrap; }
    .list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .item {
      position: relative; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none;
      display: flex; flex-direction: column; gap: 6px; min-width: 0;
      padding: 6px; border-radius: 16px; background: rgba(255, 255, 255, 0.08);
      transition: background .3s var(--ease), transform .3s var(--ease);
    }
    .item:active { background: rgba(255, 255, 255, 0.14); transition-duration: .12s; }
    .item img { -webkit-touch-callout: none; -webkit-user-drag: none; }
    .item.menu-on { z-index: 6; background: rgba(255, 255, 255, 0.16); transform: none; }
    .hhead, .jfoot, .list > *, .sdiv { transition: filter .25s ease, opacity .25s ease, background .3s var(--ease), transform .3s var(--ease); }
    .panel.lpfocus .hhead, .panel.lpfocus .jfoot,
    .panel.lpfocus .list > :not(.menu-on) { filter: blur(4px); opacity: .45; }
    .panel.lpfocus .hhead *, .panel.lpfocus .jfoot * { pointer-events: none; }
    .info .pid { color: #fff; font-size: 11.5px; font-weight: 700; font-variant-numeric: tabular-nums; }
    .cmenu {
      position: absolute; top: calc(100% + 6px); z-index: 12; display: flex; gap: 2px; padding: 4px;
      border-radius: 16px; background: rgba(40, 40, 46, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
      -webkit-backdrop-filter: blur(18px) saturate(1.5); backdrop-filter: blur(18px) saturate(1.5);
      transform-origin: 50% 0;
    }
    .cmb {
      -webkit-appearance: none; appearance: none; border: 0; background: none; cursor: pointer; flex: none;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      min-width: 44px; padding: 6px 7px 5px; border-radius: 12px; color: #fff;
      font: inherit; font-size: 10.5px; font-weight: 600; white-space: nowrap;
      transition: background .2s ease, transform .3s var(--ease);
    }
    .cmb svg { width: 16px; height: 16px; display: block; }
    .cmb.gold { color: #ffd54a; }
    .item.life { box-shadow: inset 0 0 0 1.5px rgba(255, 213, 74, 0.55); background: rgba(255, 213, 74, 0.08); }
    .st.life { color: #ffd54a; }
    .st svg.six {
      color: #ffb3d1; fill: currentColor;
      filter: drop-shadow(0 0 3px rgba(255, 170, 120, 0.95));
      transform-origin: 50% 50%;
    }
    .st svg.six.pop { animation: hkSix .9s cubic-bezier(.22, 1, .36, 1) .25s backwards; }
    @keyframes hkSix {
      0% { transform: scale(0) rotate(-140deg); opacity: 0; }
      55% { transform: scale(1.8) rotate(12deg); opacity: 1; }
      100% { transform: none; opacity: 1; }
    }
    .sdiv .sdl.life { display: inline-flex; align-items: center; gap: 6px; }
    .sdiv .sdl.life .sdt { color: #ffb3d1; }
    .cmb:active { background: rgba(255, 255, 255, 0.14); transform: scale(.9); transition-duration: .1s; }
    .cmb.danger { color: #ff8f8f; }
    .ask {
      display: none; align-items: center; gap: 6px; transform-origin: 100% 100%;
      padding: 6px 6px 6px 16px; border-radius: 999px; white-space: nowrap;
      background: rgba(24, 24, 28, 0.86) !important;
    }
    .ask.open { display: flex; }
    .ask.open.out { pointer-events: none; }
    .ask .amsg { color: #fff; font-size: 13px; font-weight: 600; margin-right: 6px; }
    .ask .abtn {
      -webkit-appearance: none; appearance: none; border: 0; cursor: pointer; flex: none;
      height: 32px; padding: 0 14px; border-radius: 999px;
      background: rgba(255, 255, 255, 0.14); color: #fff; font: inherit; font-size: 12.5px; font-weight: 700;
      transition: transform .3s var(--ease);
    }
    .ask .abtn.yes { background: rgba(255, 255, 255, 0.92); color: #14161a; }
    .ask .abtn:active { transform: scale(.9); transition-duration: .1s; }
    .tb {
      width: 100%; aspect-ratio: 3 / 4; border-radius: 11px; overflow: hidden;
      background: rgba(0, 0, 0, 0.28); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      text-align: center; color: var(--sub); font-size: 11px; line-height: 1.2;
    }
    .tb img { display: block; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .45s ease, transform .6s var(--ease); }
    .tb img.ld { opacity: 1; }
    .tb { position: relative; }
    .foot { display: flex; align-items: flex-start; gap: 2px; padding: 0 0 2px 4px; min-width: 0; flex: 1 0 auto; }
    .info { flex: 1 1 0; min-width: 0; cursor: pointer; }
    .info .id { font-weight: 700; color: #fff; }
    .info .ttl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #eee; font-size: 12px; }
    .info .dt { color: var(--sub); font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .info .dt .dd { line-height: 1.3; }
    .info .st { display: block; width: max-content; margin-bottom: 3px; color: #ffd54a; }
    .info .st svg { width: 12px; height: 12px; margin-right: 1px; vertical-align: -1px; fill: none; }
    .info .st svg.on { fill: currentColor; }
    .empty { color: var(--sub); padding: 18px 4px; text-align: center; grid-column: 1 / -1; }

    .stars { display: flex; gap: 0; margin: 2px 0 2px -6px; }
    .starb {
      -webkit-appearance: none; appearance: none; border: 0; background: none; cursor: pointer;
      padding: 2px 5px; line-height: 1; color: rgba(255, 255, 255, 0.24);
      transition: color .18s var(--ease), transform .18s var(--ease);
    }
    .starb svg { width: 24px; height: 24px; display: block; fill: none; }
    .starb.on { color: #ffd54a; }
    .starb.on svg { fill: currentColor; }
    .starb:active { transform: scale(.84); }
    .bmt { margin: 2px 2px 0; color: #fff; font-weight: 700; font-size: 13.5px; line-height: 1.45; word-break: break-word; }
    .ico {
      -webkit-appearance: none; appearance: none; border: 0; background: none; flex: none;
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%; color: var(--sub); font-size: 14px; cursor: pointer;
      transition: color .2s, background .2s, transform .2s var(--ease);
    }
    .ico:active { transform: scale(.88); }
    .ico.on { color: #ffd54a; }

    .lbl { margin: 14px 2px 6px; color: var(--sub); font-size: 11px; font-weight: 600; }
    .lbl:first-child { margin-top: 2px; }
    .hint { margin: 8px 2px 0; color: var(--sub); font-size: 11.5px; line-height: 1.5; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      display: inline-flex; align-items: center; padding: 6px 11px; border-radius: 999px;
      border: 1px solid var(--border); background: rgba(255, 255, 255, 0.10);
      font-size: 12px; cursor: pointer; user-select: none; text-decoration: none; color: #fff;
      transition: background .25s var(--ease), transform .2s var(--ease);
    }
    .chip:active { transform: scale(.95); }
    .chip.f { background: rgba(255, 110, 150, 0.22); border-color: rgba(255, 130, 165, 0.45); }
    .chip.m { background: rgba(100, 160, 255, 0.22); border-color: rgba(120, 170, 255, 0.45); }
    .chip.a { background: rgba(160, 130, 255, 0.22); border-color: rgba(175, 150, 255, 0.45); }

    .ttl { font-size: 15.5px; font-weight: 700; line-height: 1.4; word-break: break-word; }
    .val { font-size: 13.5px; color: #fff; word-break: break-word; }
    .row2 { display: flex; gap: 8px; }
    .row2 > div { flex: 1 1 0; min-width: 0; }
    .copy { cursor: pointer; color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; text-decoration: underline; text-underline-offset: 3px; }
    .copy:active { color: #d8e6ff; }
    .muted { color: var(--sub); padding: 6px 2px; }

    .pvgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
    .pvc {
      position: relative; aspect-ratio: 3 / 4; border-radius: 10px; overflow: hidden;
      background: rgba(255, 255, 255, 0.08); color: var(--sub); font-size: 11px;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .pvc { transition: transform .3s var(--ease); }
    .pvc:active { transform: scale(.95); transition-duration: .1s; }
    .pvc img, .pvc canvas { display: block; width: 100%; height: 100%; object-fit: cover; }
    .pvc.ok { outline: 1px solid rgba(159, 224, 168, 0.55); outline-offset: -1px; }
    .pvc.cur { outline: 2px solid #fff; outline-offset: -2px; }
    .pvn {
      position: absolute; left: 5px; bottom: 4px; font-size: 10.5px; font-weight: 700;
      color: #fff; text-shadow: 0 1px 2px #000;
    }

    .diag {
      margin-top: 6px; padding: 10px 12px; border-radius: 14px;
      background: rgba(0, 0, 0, 0.32); color: #e6e6ea;
      font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace;
      white-space: pre-wrap; word-break: break-all; max-height: 46vh; overflow-y: auto;
      scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .28) transparent;
    }

    @media (max-width: 520px) {
      .wrap { right: 10px; bottom: 10px; gap: 10px; }
      .bar, .filt { height: 48px; }
      .tl { height: 40px; }
      .cur { font-size: 14px; padding-left: 12px; }
      .ib { width: 36px; height: 36px; }
      .tl .ib { width: 30px; height: 30px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }
  `;

  const FX_CSS = `
    #hk-fx-ov {
      position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 2147483645;
      pointer-events: none; visibility: hidden;
      background-color: rgba(10, 10, 14, 0);
      transition: background-color .55s cubic-bezier(.22, 1, .36, 1), visibility 0s linear .55s;
    }
    #hk-fx-ov.on {
      visibility: visible;
      background-color: rgba(10, 10, 14, 0.55);
      transition: background-color .38s cubic-bezier(.45, 0, .25, 1), visibility 0s;
    }
    #hk-fx-ov.nt { transition: none !important; visibility: visible; }
    @keyframes hkSpin { to { transform: rotate(360deg); } }
    .hk-spin {
      position: absolute; left: 50%; top: 50%; width: 28px; height: 28px; margin: -14px 0 0 -14px;
      border-radius: 50%; border: 2.5px solid rgba(255, 255, 255, 0.22); border-top-color: rgba(255, 255, 255, 0.9);
      animation: hkSpin .8s linear infinite;
    }
    .hk-zoom img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
    .hk-zoom img.hk-z-thumb { object-fit: cover; transition: opacity .35s ease; }
    .hk-zoom img.hk-z-page { object-fit: contain; opacity: 0; transition: opacity .35s ease; }
    .hk-zoom img.hk-z-page.ok { opacity: 1; }
    .hk-pg { transform: translate(var(--hk-px, 0px), var(--hk-py, 0px)) scale(var(--hk-z, 1)); transform-origin: 50% 50%; }
    html.hk-zanim .hk-pg { transition: transform .3s cubic-bezier(.22, 1, .36, 1); }
    .hk-zoom {
      position: fixed; z-index: 2147483646; pointer-events: none; overflow: hidden;
      background-color: #3a3a40;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
      transition: opacity .25s ease, top .46s cubic-bezier(.5, 0, .15, 1), left .46s cubic-bezier(.5, 0, .15, 1),
        width .46s cubic-bezier(.5, 0, .15, 1), height .46s cubic-bezier(.5, 0, .15, 1),
        border-radius .46s cubic-bezier(.5, 0, .15, 1), box-shadow .46s ease, background-color .4s ease;
    }
    .hk-zoom.pg-on { background-color: #111111; }
    .hk-zoom img.hk-z-thumb.gone { opacity: 0; transition: opacity .38s ease; }
    @media (prefers-reduced-motion: reduce) {
      #hk-fx-ov, .hk-zoom { transition-duration: .01ms !important; }
    }
    ${IS_READER ? `
    #reader-navbar, #reader-nav, #reader-header, #reader-topbar, .reader-navbar, .reader-nav,
    #navbar, #top-nav, #topbar, #header, nav.navbar, .navbar, .navbar-fixed-top, .navbar-static-top,
    body > nav, body > header, #nav, .hk-fx-hide {
      display: none !important;
    }
    html, body {
      height: 100% !important; overflow: hidden !important;
      overscroll-behavior: none !important; touch-action: none !important;
      padding: 0 !important; margin: 0 !important;
    }
    html, body, #comicImages, #comicImages *, #mobileImages, #mobileImages * {
      -webkit-user-select: none !important; user-select: none !important;
      -webkit-touch-callout: none !important; -webkit-tap-highlight-color: transparent !important;
    }
    img { -webkit-user-drag: none !important; user-drag: none !important; }

    #mobileImages {
      position: fixed !important; top: 0 !important; left: 0 !important;
      width: var(--hk-vw, 100%) !important; height: var(--hk-vh, 100%) !important;
      display: flex !important; align-items: center !important; justify-content: center !important;
      margin: 0 !important; padding: 0 !important; overflow: hidden !important; background: transparent !important;
    }
    #mobileImages img {
      position: relative !important; display: block !important; float: none !important;
      width: auto !important; height: auto !important;
      max-width: var(--hk-vw, 100%) !important; max-height: var(--hk-vh, 100%) !important;
      margin: 0 !important; object-fit: contain !important;
      transform: translate(var(--hk-px, 0px), var(--hk-py, 0px))
                 scale(var(--hk-z, 1)) !important;
      transform-origin: 50% 50% !important;
    }
    html.hk-turning #mobileImages, html.hk-turning #mobileImages img,
    html.hk-turning #comicImages, html.hk-turning #comicImages img,
    html.hk-turning #image-container, html.hk-turning #image-container img { visibility: hidden !important; }
    html.hk-zanim #mobileImages img { transition: transform .3s cubic-bezier(.22, 1, .36, 1) !important; }
    ` : ''}
  `;

  function onRoot(fn) {
    if (document.documentElement) { fn(); return; }
    const t = setInterval(() => {
      if (document.documentElement) { clearInterval(t); fn(); }
    }, 0);
  }

  function injectSiteCss() {
    if (document.getElementById('hk-site-css')) return;
    const parent = document.head || document.documentElement;
    if (!parent) {
      document.addEventListener('DOMContentLoaded', injectSiteCss, { once: true });
      return;
    }
    const st = document.createElement('style');
    st.id = 'hk-site-css';
    st.textContent = SITE_CSS;
    parent.appendChild(st);
  }

  function injectFxCss() {
    if (document.getElementById('hk-fx-css')) return;
    const parent = document.head || document.documentElement;
    if (!parent) {
      document.addEventListener('DOMContentLoaded', injectFxCss, { once: true });
      return;
    }
    const st = document.createElement('style');
    st.id = 'hk-fx-css';
    st.textContent = FX_CSS;
    parent.appendChild(st);
  }

  function injectFont() {
    if (document.getElementById('hk-font')) return;
    const parent = document.head || document.documentElement;
    if (!parent) return;
    const s = document.createElement('style');
    s.id = 'hk-font';
    s.textContent = `
      @font-face {
        font-family: 'Pretendard Variable';
        font-weight: 45 920; font-style: normal; font-display: swap;
        src: url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/woff2/PretendardVariable.woff2') format('woff2-variations');
      }`;
    parent.appendChild(s);
  }

  function getCurrentId() {
    const m = location.pathname.match(/[-/](\d+)\.html$/);
    return m ? m[1] : null;
  }

  function getPageTitle() {
    const h1 = document.querySelector('#gallery-brand h1, h1');
    const t = h1 ? h1.textContent : document.title;
    return (t || '').replace(/\s*\|.*$/, '').trim();
  }

  // fromEl 을 주면 그 자리에서 커지며 열린다 (목록 카드와 같은 전환)
  function goTo(id, fromEl) {
    const url = `/${settings.reader ? 'reader' : 'galleries'}/${id}.html`;
    if (!IS_WORK_PAGE) saveScroll();
    const r = fromEl && fromEl.getBoundingClientRect ? fromEl.getBoundingClientRect() : null;
    if (r && r.width > 4 && r.height > 4) {
      const im = fromEl.querySelector && fromEl.querySelector('img');
      fxGo(url, {
        rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        thumb: im ? (im.currentSrc || im.src || '') : '',
        page: warmUrl.get(String(id)) || ''
      });
      return;
    }
    leaveTo(url);
  }

  function cardWorkId(card) {
    const a = Array.from(card.querySelectorAll('a[href]')).find(x => ID_RE.test(x.getAttribute('href')));
    return a ? a.getAttribute('href').match(ID_RE)[1] : null;
  }

  function koreanTitle(t) {
    if (!/[가-힣]/.test(t)) return t;
    const paren = t.match(/[(\[]([^)\]]*[가-힣][^)\]]*)[)\]]/);
    if (paren) {
      const outside = t.replace(paren[0], '');
      if (!/[가-힣]/.test(outside)) return paren[1].trim();
    }
    const parts = t.split(/\s*[\/|｜]\s*|\s+[-–—]\s+/).map(s => s.trim()).filter(Boolean);
    const kr = parts.filter(p => /[가-힣]/.test(p));
    return kr.length ? kr.join(' / ') : t;
  }

  function titleKey(t) {
    const k = (t || '').toLowerCase().replace(/[\s\-_~!@#$%^&*()\[\]{}<>.,:;'"`+=|\\\/?·…，。！？「」『』【】]/g, '');
    return k.length >= 2 ? k : '';
  }

  function getDate(card) {
    const dEl = card.querySelector('.date, .dj-date, [class*="date"]');
    const m = (dEl && dEl.textContent.match(DATE_RE)) || card.textContent.match(DATE_RE);
    if (!m) return '';
    return fmtDate(m);
  }

  function forceLoad(media) {
    const imgs = media.tagName === 'IMG' ? [media] : Array.from(media.querySelectorAll('img'));
    if (media.tagName !== 'IMG') {
      media.querySelectorAll('source[data-srcset]').forEach(src => {
        if (!src.getAttribute('srcset')) src.setAttribute('srcset', src.getAttribute('data-srcset'));
      });
    }
    imgs.forEach(im => {
      const d = im.getAttribute('data-src');
      const cur = im.getAttribute('src') || '';
      if (d && (!cur || /^data:/.test(cur))) im.setAttribute('src', d);
    });
  }

  const isSaved = id => saved.some(s => s.id === id);
  const savedOf = id => saved.find(s => s.id === id) || null;
  const STAR_D = 'M12 3.6l2.5 5.1 5.6.8-4.1 4 1 5.6L12 16.4l-5 2.7 1-5.6-4.1-4 5.6-.8z';
  const starSvg = on => `<svg class="${on ? 'on' : ''}" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="${STAR_D}"/></svg>`;
  function starsEl(n, life) {
    const box = document.createElement('span');
    box.className = 'st' + (life ? ' life' : '');
    box.title = life ? '인생작' : n + '점';
    box.innerHTML = life
      ? [1, 2, 3, 4, 5].map(() => starSvg(true)).join('') + starSvg(true).replace('<svg class="on"', '<svg class="on six"')
      : [1, 2, 3, 4, 5].map(i => starSvg(i <= n)).join('');
    return box;
  }

  function addSaved(id, title, alias, stars, arts) {
    if (isSaved(id)) return false;
    saved.unshift({
      id, title: title || '', alias: alias || '',
      stars: Math.max(0, Math.min(5, Math.round(+stars || 0))),
      arts: Array.isArray(arts) ? arts.slice(0, 16) : [],
      ts: Date.now()
    });
    saveList();
    return true;
  }

  function updateSaved(id, alias, stars, arts) {
    const it = savedOf(id);
    if (!it) return false;
    it.alias = alias || '';
    it.stars = Math.max(0, Math.min(5, Math.round(+stars || 0)));
    if (Array.isArray(arts) && arts.length) it.arts = arts.slice(0, 16);
    saveList();
    return true;
  }

  function pageArtists(id) {
    const out = [];
    const push = v => {
      const s = String(v || '').replace(/_/g, ' ').trim();
      if (s && out.indexOf(s) < 0) out.push(s);
    };
    try {
      const g = pageGI();
      if (g && (!id || String(g.id) === String(id))) {
        (g.artists || []).forEach(a => a && push(a.artist));
      }
    } catch (e) {}
    if (!out.length) {
      document.querySelectorAll('a[href^="/artist/"]').forEach(a => {
        if (a.closest('.gallery-content')) return;
        const m = (a.getAttribute('href') || '').match(/^\/artist\/(.+)-[a-z]+\.html/i);
        if (!m) return;
        try { push(decodeURIComponent(m[1])); } catch (e) {}
      });
    }
    return out;
  }

  function removeSaved(id) {
    saved = saved.filter(s => s.id !== id);
    saveList();
  }

  function recordWatch(titleOnly) {
    const id = getCurrentId();
    if (!id || !IS_WORK_PAGE) return;
    watched = store.get(KEY.watched, watched);
    let title = getPageTitle();
    if (title && settings.koreanTitle) title = koreanTitle(title);
    const cover = document.querySelector('.cover img, .cover-column img');
    if (cover) { setThumb(id, cover.getAttribute('data-src') || cover.currentSrc || cover.src); flushThumbs(); }
    const ex = watched.find(w => w.id === id);
    if (ex) {
      if (title && title !== ex.title && !/^hitomi/i.test(title)) ex.title = title;
      if (!titleOnly) {
        ex.ts = Date.now();
        watched = [ex].concat(watched.filter(w => w !== ex));
      }
    } else if (!titleOnly) {
      watched.unshift({ id, title: /^hitomi/i.test(title) ? '' : title, ts: Date.now() });
    }
    watched = watched.slice(0, 300);
    saveWatched();
  }

  function goSite() {
    leaveTo(KOREAN_LINK);
  }

  function goBackToList() {
    let from = null;
    try {
      from = sessionStorage.getItem('hk_from');
      sessionStorage.setItem('hk_home', '1');
    } catch (e) {}
    if (from) leaveTo(from);
    else goSite();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => window.prompt('복사하세요:', text));
    }
    window.prompt('복사하세요:', text);
    return Promise.resolve();
  }

  const SORTS = [
    ['date', `/index-${LANG}.html`],
    ['today', `/popular/today-${LANG}.html`],
    ['week', `/popular/week-${LANG}.html`],
    ['month', `/popular/month-${LANG}.html`],
    ['year', `/popular/year-${LANG}.html`]
  ];
  const SORT_KR = { date: '최신', today: '일간 인기', week: '주간 인기', month: '월간 인기', year: '연간 인기' };

  function currentSort() {
    const p = location.pathname;
    const m = p.match(/^\/popular\/(today|week|month|year)-/);
    if (m) return m[1];
    if (p === '/' || /^\/index-/.test(p)) return 'date';
    return null;
  }

  const SCROLL_KEY = 'hk_scroll:' + location.pathname + location.search;
  let loadedPages = 1;
  let scrollTarget = null;

  function saveScroll() {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(window.scrollY));
      sessionStorage.setItem(SCROLL_KEY + ':p', String(loadedPages));
      sessionStorage.setItem('hk_from', location.href);
    } catch (e) {}
    try { saveLayout(); } catch (e) {}
  }

  function saveLayout() {
    if (!inf || !inf.gc) return;
    const gc = inf.gc;
    const y0 = window.scrollY;
    const vis = Array.from(gc.children).filter(c => c.dataset.hkPage && c.getBoundingClientRect().height > 0);
    if (!vis.length) return;
    const tops = [];
    vis.forEach(c => {
      const p = +c.dataset.hkPage;
      const y = c.getBoundingClientRect().top + y0;
      if (tops[p] === undefined || y < tops[p]) tops[p] = y;
    });
    const last = inf.page;
    for (let p = 1; p <= last; p++) if (tops[p] === undefined) return;
    tops[last + 1] = gc.getBoundingClientRect().bottom + y0;
    const mid = window.innerHeight / 2;
    let best = null, bd = Infinity;
    vis.forEach(c => {
      const r = c.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bd) { bd = d; best = { c, r }; }
    });
    sessionStorage.setItem(SCROLL_KEY + ':t', JSON.stringify(tops.slice(1)));
    if (best) {
      const id = cardWorkId(best.c);
      if (id) sessionStorage.setItem(SCROLL_KEY + ':a', id);
      sessionStorage.setItem(SCROLL_KEY + ':ao', String(best.r.top));
      sessionStorage.setItem(SCROLL_KEY + ':ap', best.c.dataset.hkPage);
    }
  }

  function readSaved(suffix) {
    try { return sessionStorage.getItem(SCROLL_KEY + suffix); } catch (e) { return null; }
  }

  function clearSaved() {
    try { ['', ':p', ':t', ':a', ':ao', ':ap'].forEach(x => sessionStorage.removeItem(SCROLL_KEY + x)); } catch (e) {}
  }

  (function readScrollTarget() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      const v = sessionStorage.getItem(SCROLL_KEY);
      const home = sessionStorage.getItem('hk_home') === '1';
      if (home) sessionStorage.removeItem('hk_home');
      if (v && ((nav && nav.type === 'back_forward') || home)) scrollTarget = +v;
      if (scrollTarget != null && document.documentElement) {
        document.documentElement.classList.add('hk-restoring');
        setTimeout(endRestore, 15000);
      }
      history.scrollRestoration = 'manual';
    } catch (e) {}
  })();

  function restoreScroll() {
    if (scrollTarget == null || slotMode) return;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (maxY >= scrollTarget - 5) {
      window.scrollTo(0, scrollTarget);
      scrollTarget = null;
      endRestore();
      clearSaved();
    }
  }

  function rewriteLinks(root) {
    root.querySelectorAll('a[href="/"], a[href="/index-all.html"], a[href$="-all.html"]').forEach(a => {
      if (a.closest('.gallery-content')) return;
      const href = a.getAttribute('href');
      if (href === '/' || href === '/index-all.html') a.setAttribute('href', KOREAN_LINK);
      else a.setAttribute('href', href.replace(/-all\.html$/, `-${LANG}.html`));
    });
  }

  function filterGalleries(root) {
    root.querySelectorAll('.gallery-content > div').forEach(item => {
      if (item.dataset.krChecked) return;
      if (!item.querySelector('a')) return;
      item.dataset.krChecked = '1';
      if (settings.koreanOnly && !item.querySelector(`a[href^="${KOREAN_LINK}"]`)) item.classList.add('hk-hidden');
    });
  }

  const FILTER_RE = /^(date published|popular\s*:?\s*(today|week|month|year)?)$/i;
  function hideNative() {
    document.querySelectorAll(
      'input[type="search"], input#query-input, input[name="q"], input[name="query"]'
    ).forEach(inp => {
      if (inp.dataset.hkNative) return;
      inp.dataset.hkNative = '1';
      const box = inp.closest('form, .search-content, #search-content, .search-bar, #search-box');
      (box || inp).classList.add('hk-native');
    });
    document.querySelectorAll('a[href^="/popular/"], a[href*="/popular/"]').forEach(a => {
      if (a.closest('.gallery-content') || a.dataset.hkNative) return;
      a.dataset.hkNative = '1';
      (a.closest('li') || a).classList.add('hk-native');
    });
    document.querySelectorAll('select, option, a, li, label, button, span, div').forEach(el => {
      if (el.dataset.hkNative || el.closest('.gallery-content')) return;
      if (el.childElementCount > 0 && el.tagName !== 'OPTION') return;
      if (!FILTER_RE.test(el.textContent.trim())) return;
      let t = el.closest('select');
      if (!t) {
        const li = el.closest('li');
        t = li || el;
        const list = li && li.parentElement;
        if (list && Array.from(list.children).every(c => FILTER_RE.test(c.textContent.trim()))) t = list;
      }
      el.dataset.hkNative = '1';
      t.classList.add('hk-native');
    });
    document.querySelectorAll('button, input[type="button"], input[type="submit"], a').forEach(b => {
      if (b.dataset.hkNative || b.closest('.gallery-content')) return;
      const t = (b.value || b.textContent || '').trim();
      if (!/^search$/i.test(t)) return;
      b.dataset.hkNative = '1';
      (b.closest('form, .search-content, #search-content') || b).classList.add('hk-native');
    });
    document.querySelectorAll('h1, h2, h3, div, span').forEach(h => {
      if (h.dataset.hkNative || h.closest('.gallery-content') || h.closest('#hk-host')) return;
      if (h.childElementCount > 0) return;
      if (!/^(recently added|popular.*|search results?)$/i.test(h.textContent.trim())) return;
      h.dataset.hkNative = '1';
      let box = h.parentElement;
      while (box && box.parentElement && box.parentElement !== document.body
        && !box.querySelector('.gallery-content')
        && box.parentElement.children.length === 1) box = box.parentElement;
      (box && !box.querySelector('.gallery-content') ? box : h).classList.add('hk-banner');
    });
  }

  function pruneNative() {
    const gc = document.querySelector('.gallery-content');
    if (!gc || IS_WORK_PAGE) return;
    const KEEP_ID = new Set(['hk-host', 'hk-fx-ov', 'hk-sentinel', 'hk-off', 'hk-cover', 'hk-bg', 'hk-empty']);
    const KEEP_CLS = new Set(['hk-zoom', 'page-container']);
    const keep = el => KEEP_ID.has(el.id) || Array.from(el.classList || []).some(c => KEEP_CLS.has(c));
    const chain = new Set();
    for (let n = gc.parentElement; n && n !== document.documentElement; n = n.parentElement) chain.add(n);
    const scrub = parent => {
      Array.from(parent.children).forEach(ch => {
        if (ch === gc) return;
        if (chain.has(ch)) { scrub(ch); return; }
        if (keep(ch)) return;
        ch.classList.add('hk-vanish');
      });
    };
    scrub(document.body);
  }

  function paintListBg() {
    if (IS_WORK_PAGE) return;
    const set = (el, prop, val) => { if (el) el.style.setProperty(prop, val, 'important'); };

    set(document.documentElement, 'background-color', '#111111');

    const gc = document.querySelector('.gallery-content');
    set(document.body, 'background-color', '#111111');
    set(document.body, 'background-image', 'none');
    if (gc) {
      set(gc, 'background-color', 'transparent');
      set(gc, 'background-image', 'none');
      set(gc, 'border', '0');
      set(gc, 'box-shadow', 'none');
      for (let n = gc.parentElement; n && n !== document.documentElement; n = n.parentElement) {
        set(n, 'background-color', 'transparent');
        set(n, 'background-image', 'none');
        set(n, 'border', '0');
        set(n, 'box-shadow', 'none');
      }
    }

    if (document.body && !document.getElementById('hk-bg')) {
      const bg = document.createElement('div');
      bg.id = 'hk-bg';
      bg.style.cssText = 'position:fixed!important;left:-50vw!important;top:-50vh!important;right:-50vw!important;bottom:-50vh!important;' +
        'background:#111111!important;z-index:-1!important;pointer-events:none!important;';
      document.body.insertBefore(bg, document.body.firstChild);
    }
  }

  function hideStrayTiles(root) {
    const box = (root && root.querySelectorAll) ? root : document;
    box.querySelectorAll('.gallery-content > *').forEach(el => {
      if (el.dataset.hkDone || el.classList.contains('hk-stray') || el.classList.contains('hk-hidden')) return;
      if (el.tagName === 'HK-DIM') return;
      const links = el.querySelectorAll('a[href]');
      for (let i = 0; i < links.length; i++) {
        if (WORK_HREF_RE.test(links[i].getAttribute('href') || '')) return;
      }
      el.classList.add('hk-stray');
    });
  }

  let openCardMeta = null;

  // 제목이 칸보다 길어 잘릴 때만 오른쪽 끝을 흐리게 만든다
  const cutQ = new Set();
  let cutRaf = 0;
  function markCut(a) {
    if (!a || !a.isConnected) return;
    a.classList.toggle('cut', a.scrollWidth > a.clientWidth + 1);
  }
  function queueCut(a) {
    cutQ.add(a);
    if (cutRaf) return;
    cutRaf = requestAnimationFrame(() => {
      cutRaf = 0;
      const list = Array.from(cutQ);
      cutQ.clear();
      list.forEach(markCut);
    });
  }
  function recheckCuts() {
    document.querySelectorAll('.hk-card-host').forEach(h => {
      const a = h.shadowRoot && h.shadowRoot.querySelector('.title a');
      if (a) queueCut(a);
    });
  }
  let cutResizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(cutResizeT); cutResizeT = setTimeout(recheckCuts, 150); });
  try { document.fonts && document.fonts.ready.then(recheckCuts); } catch (e) {}

  function buildCardHost(media, readerUrl, title, id, seenIds, meta) {
    const cardHost = document.createElement('div');
    cardHost.className = 'hk-card-host';
    cardHost.style.cssText = 'display:block;';
    const sh = cardHost.attachShadow({ mode: 'open' });
    if (cardSheet) sh.adoptedStyleSheets = [cardSheet];
    sh.innerHTML = (cardSheet ? '' : `<style>${CARD_CSS}</style>`) + CARD_HTML;

    const thumbA = sh.querySelector('.thumb');
    thumbA.href = readerUrl;
    thumbA.appendChild(media);

    const titleA = sh.querySelector('.title a');
    titleA.href = readerUrl;
    titleA.textContent = settings.koreanTitle ? koreanTitle(title) : title;
    titleA.title = title;
    sh.querySelector('.dline').textContent = dates[id] || '';
    if (!dates[id]) wantDate(id);

    cardHost.dataset.hkId = id;
    cardHost._hkInfo = { id, title, meta: meta || { artists: [], groups: [], tags: [] } };
    if (pgReady.has(String(id))) sh.querySelector('.card').classList.add('ready');
    sh.querySelector('.card').classList.toggle('viewed', seenIds.has(id));

    const grp = sh.querySelector('.grp'), grpList = sh.querySelector('.grplist');
    grp.addEventListener('click', e => {
      e.stopPropagation();
      if (grpList.style.display !== 'none') { grpList.style.display = 'none'; return; }
      const ids = cardHost._hkIds || [];
      grpList.textContent = '';
      const h = document.createElement('div');
      h.className = 'gh';
      h.textContent = `같은 제목 ${ids.length}개`;
      grpList.appendChild(h);
      ids.forEach(o => {
        const a = document.createElement('a');
        a.href = `/reader/${o.id}.html#1`;
        const s1 = document.createElement('span');
        s1.textContent = `No. ${o.id}`;
        const s2 = document.createElement('span');
        s2.className = 'd';
        s2.textContent = o.date || '';
        a.append(s1, s2);
        grpList.appendChild(a);
      });
      grpList.style.display = 'block';
    });

    sh.addEventListener('click', saveScroll, true);
    // 제목 줄(제목·날짜)을 누르면 작품으로 가지 않고 ⋯ 와 같은 상세 팝업을 연다
    sh.querySelector('.info').addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (openCardMeta) openCardMeta({ id, title, meta: meta || { artists: [], groups: [], tags: [] } }, cardHost);
    });
    queueCut(titleA);

    return { cardHost, sh };
  }

  function restyleOneCard(card, seenIds) {
    if (card.dataset.hkDone || card.classList.contains('hk-hidden')) return;
    if (!card.dataset.krChecked) return;

    const links = Array.from(card.querySelectorAll('a[href]'));
    const img = card.querySelector('img');
    if (!img || !links.length) return;

    const workLinks = links.filter(a => ID_RE.test(a.getAttribute('href')));
    const idLink = workLinks[0];
    if (!idLink) return;
    const id = idLink.getAttribute('href').match(ID_RE)[1];

    const titleLink = workLinks.find(a => a.textContent.trim());
    const title = (titleLink && titleLink.textContent.trim())
      || (img.alt || '').trim() || `No. ${id}`;

    const media = img.closest('picture') || img;
    forceLoad(media);

    setThumb(id, img.getAttribute('data-src') || img.currentSrc || img.src);
    if (!thumbs[id]) {
      img.addEventListener('load', () => { setThumb(id, img.currentSrc || img.src); flushThumbs(); }, { once: true });
    }

    links.filter(a => /^\/(artist|group)\//.test(a.getAttribute('href')) && a.textContent.trim())
      .slice(0, 3)
      .forEach(a => addTerm('artist:' + a.textContent.trim().toLowerCase().replace(/\s+/g, '_')));
    const dispTitle = settings.koreanTitle ? koreanTitle(title) : title;
    addTerm(dispTitle);

    const date = getDate(card);
    const readerUrl = `/reader/${id}.html#1`;
    card.dataset.hkDone = '1';
    card.dataset.hkDate = date || '';
    card.dataset.hkKey = (title === `No. ${id}`) ? '' : titleKey(dispTitle);
    setDate(id, date);

    const { cardHost, sh } = buildCardHost(media, readerUrl, title, id, seenIds, readCardMeta(card));

    const cardEl = sh.querySelector('.card');
    const reveal = () => { cardEl.classList.add('hk-on'); card.classList.add('hk-img-ok'); };
    if (img.complete && img.naturalWidth) reveal();
    else {
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', () => { cardEl.classList.add('hk-on'); card.classList.add('hk-img-ok'); }, { once: true });
    }

    Array.from(card.children).forEach(c => c.classList.add('hk-hide'));
    card.appendChild(cardHost);
  }

  function restyleCards(root) {
    const seenIds = new Set(watched.map(w => w.id));
    root.querySelectorAll('.gallery-content > div:not(.hk-slot)').forEach(card => restyleOneCard(card, seenIds));
    hideStrayTiles(root);
  }

  function refreshViewed() {
    const set = new Set(watched.map(w => w.id));
    document.querySelectorAll('.hk-card-host').forEach(h => {
      if (!h.shadowRoot) return;
      const ids = h._hkIds ? h._hkIds.map(o => o.id) : [h.dataset.hkId];
      h.shadowRoot.querySelector('.card').classList.toggle('viewed', ids.some(i => set.has(i)));
    });
  }

  function mergeDuplicates() {
    const groups = new Map();
    const hosts = [];
    document.querySelectorAll('.gallery-content > div[data-hk-done]').forEach(card => {
      const host = card.querySelector('.hk-card-host');
      if (!host) return;
      host._hkIds = null;
      hosts.push(host);
      const key = card.dataset.hkKey;
      let hide = false;
      if (settings.mergeTitles && key && !card.classList.contains('hk-hidden') && !card.classList.contains('hk-artsoff') && !card.classList.contains('hk-blocked')) {
        const o = { id: host.dataset.hkId, date: card.dataset.hkDate || '' };
        const g = groups.get(key);
        if (g) { g.ids.push(o); hide = true; }
        else groups.set(key, { host, ids: [o] });
      }
      card.classList.toggle('hk-merged', hide);
    });
    groups.forEach(g => { if (g.ids.length > 1) g.host._hkIds = g.ids; });
    hosts.forEach(h => {
      const sh = h.shadowRoot;
      if (!sh) return;
      const b = sh.querySelector('.grp'), l = sh.querySelector('.grplist');
      if (h._hkIds) {
        b.style.display = '';
        b.textContent = '×' + h._hkIds.length;
        b.title = '제목이 같은 작품 ' + h._hkIds.length + '개';
      } else {
        b.style.display = 'none';
        l.style.display = 'none';
      }
    });
    refreshViewed();
  }

  // 다른 탭에서 바꾼 일지 · 기록 · 차단 · 설정을 다시 읽는다.
  // (각 탭이 처음 읽은 목록을 그대로 저장하면, 다른 탭에서 남긴 것을 덮어써서 지우게 된다)
  function resyncStore() {
    const before = JSON.stringify([saved, watched]);
    saved = store.get(KEY.saved, []);
    watched = store.get(KEY.watched, []);
    const b = store.get(KEY.block, null) || {};
    blocks.works = Array.isArray(b.works) ? b.works : [];
    blocks.artists = Array.isArray(b.artists) ? b.artists : [];
    Object.assign(settings, store.get(KEY.settings, {}));
    refreshViewed();
    applyBlocks();
    mergeDuplicates();
    if (window.__hkResyncUI && JSON.stringify([saved, watched]) !== before) window.__hkResyncUI();
  }
  window.addEventListener('pageshow', e => { if (e.persisted) resyncStore(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resyncStore(); });
  window.addEventListener('focus', resyncStore);

  const TAXO_RE = /^\/(tag|artist|group|series|character)\/(.+)-[a-z]+\.html/i;

  function isBlockedCard(card) {
    if (settings.blockOn === false) return false;
    const host = card.querySelector('.hk-card-host');
    const id = (host && host.dataset.hkId) || cardWorkId(card);
    if (id && blocks.works.some(w => w.id === id)) return true;
    if (!blocks.artists.length) return false;
    const m = readCardMeta(card);
    return m.artists.concat(m.groups).some(a => blocks.artists.indexOf(normArtName(a)) >= 0);
  }
  function applyBlocks() {
    document.querySelectorAll('.gallery-content > div[data-hk-done]').forEach(card => {
      card.classList.toggle('hk-blocked', isBlockedCard(card));
    });
  }
  const CARD_META = new WeakMap();
  const normArtName = s => String(s || '').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

  function readCardMeta(card) {
    let info = CARD_META.get(card);
    if (info) return info;
    const artists = [], groups = [], tags = [];
    card.querySelectorAll('a[href]').forEach(a => {
      const m = (a.pathname || '').match(TAXO_RE);
      if (!m) return;
      let name = m[2];
      try { name = decodeURIComponent(name); } catch (e) {}
      name = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
      if (!name) return;
      const type = m[1].toLowerCase();
      const arr = type === 'artist' ? artists : type === 'group' ? groups : type === 'tag' ? tags : null;
      if (arr && arr.indexOf(name) < 0) arr.push(name);
    });
    info = { artists, groups, tags };
    CARD_META.set(card, info);
    return info;
  }

  let inf = null;
  let infTimer = 0;
  let infCount = -1;

  function curPageNo() {
    const m = location.search.match(/[?&]page=(\d+)/);
    return m ? Math.max(1, +m[1]) : 1;
  }

  function pageUrl(n) {
    let q = location.search.replace(/([?&])page=\d+&?/, '$1').replace(/[?&]$/, '');
    if (n > 1) q += (q.indexOf('?') === -1 ? '?' : '&') + 'page=' + n;
    return location.pathname + q;
  }

  async function fetchCardsFast(url) {
    try {
      const r = await fetchT(url, { credentials: 'same-origin' }, 8000);
      if (!r.ok) return null;
      const d = new DOMParser().parseFromString(await r.text(), 'text/html');
      const gc = d.querySelector('.gallery-content');
      if (!gc) return null;
      const list = Array.from(gc.children).filter(c => c.querySelector('a[href]'));
      if (!list.length) return null;
      if (!list.every(c => c.querySelector('img[src]'))) return null;
      return list.map(c => document.adoptNode(c));
    } catch (e) { return null; }
  }

  function fetchCards(url, expect) {
    return fetchCardsFast(url).then(list => list || fetchCardsFrame(url, expect));
  }

  function fetchCardsFrame(url, expect) {
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.setAttribute('aria-hidden', 'true');
      f.tabIndex = -1;
      f.style.cssText = 'position:fixed!important;left:-10000px!important;top:0!important;' +
        'width:1100px!important;height:900px!important;border:0!important;opacity:0!important;pointer-events:none!important;';
      let last = -1, stable = 0, empty = 0, ticks = 0, timer = 0;
      const finish = list => {
        clearInterval(timer);
        let out = list;
        if (list && list.length) out = list.map(c => document.adoptNode(c));
        f.remove();
        resolve(out);
      };
      timer = setInterval(() => {
        ticks++;
        let list = [], complete = false;
        if (ticks > 80) { finish(null); return; }
        try {
          const d = f.contentDocument;
          if (!d || d.URL === 'about:blank') return;
          complete = d.readyState === 'complete';
          const gc = d.querySelector('.gallery-content');
          if (gc) list = Array.from(gc.children).filter(c => c.querySelector('a[href]') && c.querySelector('img'));
        } catch (e) { finish(null); return; }
        if (list.length) {
          stable = list.length === last ? stable + 1 : 0;
          last = list.length;
          if (stable >= (list.length >= expect ? 1 : 12)) { finish(list); return; }
        } else if (complete && ++empty > 32) { finish([]); return; }
        if (ticks > 80) finish(list.length ? list : null);
      }, 120);
      f.src = url;
      (document.body || document.documentElement).appendChild(f);
    });
  }

  function setStatus(msg) {
    if (!inf) return;
    inf.el.textContent = msg;
    inf.el.style.setProperty('cursor', inf.stopped ? 'pointer' : 'default', 'important');
  }

  function kickInfinite() {
    setTimeout(() => {
      if (!inf || !inf.io) return;
      inf.io.unobserve(inf.el);
      inf.io.observe(inf.el);
    }, 60);
  }

  function prefetchNext() {
    if (!inf || inf.stopped || inf.pre || slotMode) return;
    const n = inf.page + 1;
    inf.pre = { n, p: fetchCards(pageUrl(n), inf.perPage).catch(() => null) };
  }

  async function loadNext() {
    if (!inf || inf.loading) return;
    inf.loading = true;
    inf.stopped = false;
    setStatus('불러오는 중…');
    const n = inf.page + 1;
    let cards = null;
    try {
      cards = inf.pre && inf.pre.n === n ? await inf.pre.p : await fetchCards(pageUrl(n), inf.perPage);
    } catch (e) { cards = null; }
    inf.pre = null;
    const have = new Set(Array.from(inf.gc.children).map(c => cardWorkId(c)).filter(Boolean));
    let added = 0;
    (cards || []).forEach(c => {
      const id = cardWorkId(c);
      if (id && have.has(id)) return;
      if (id) have.add(id);
      c.dataset.hkPage = String(n);
      inf.gc.appendChild(c);
      added++;
    });
    inf.loading = false;
    if (added) {
      inf.page = n;
      loadedPages = n;
      setStatus('');
      document.documentElement.classList.remove('hk-pager-on');
      prefetchNext();
      if (inf.restore && inf.page < inf.restore) setTimeout(loadNext, 0);
      else { inf.restore = 0; kickInfinite(); }
    } else {
      inf.stopped = true;
      inf.restore = 0;
      setStatus(cards ? '마지막 페이지입니다' : '불러오지 못했습니다 · 눌러서 다시 시도');
      document.documentElement.classList.add('hk-pager-on');
    }
  }

  function initInfinite() {
    if (inf || !settings.infinite || IS_WORK_PAGE) return;
    const gc = document.querySelector('.gallery-content');
    if (!gc) return;
    const n = gc.children.length;
    if (!n || n === infCount) return;
    infCount = n;
    clearTimeout(infTimer);
    infTimer = setTimeout(startInfinite, 120);
  }

  function startInfinite() {
    if (inf) return;
    const gc = document.querySelector('.gallery-content');
    if (!gc) return;
    if (gc.children.length !== infCount) { initInfinite(); return; }

    const el = document.createElement('div');
    el.id = 'hk-sentinel';
    el.style.cssText = 'display:block!important;clear:both!important;max-width:' + TOP_W + 'px!important;' +
      'margin:8px auto 0!important;padding:28px 12px!important;text-align:center!important;' +
      'color:#9a9aa5!important;font:500 13px/1.4 -apple-system,"Malgun Gothic",sans-serif!important;';
    gc.insertAdjacentElement('afterend', el);

    inf = { gc, el, page: curPageNo(), perPage: gc.children.length, loading: false, stopped: false, restore: 0, io: null };
    loadedPages = inf.page;
    el.addEventListener('click', () => { if (inf.stopped) loadNext(); });

    if (typeof IntersectionObserver === 'function') {
      inf.io = new IntersectionObserver(es => {
        if (es.some(e => e.isIntersecting)) loadNext();
      }, { rootMargin: '3600px 0px' });
      inf.io.observe(el);
    }

    Array.from(gc.children).forEach(c => { if (!c.dataset.hkPage) c.dataset.hkPage = '1'; });
    prefetchNext();

    let want = 0;
    try { want = +sessionStorage.getItem(SCROLL_KEY + ':p') || 0; } catch (e) {}
    if (scrollTarget != null && want > inf.page) {
      const T = readTops();
      if (T && T.length === want + 1) startSlots(want, T);
      else { inf.restore = want; loadNext(); }
    }
  }

  let slotMode = false;
  const SLOT_CONC = 2;

  function readTops() {
    try {
      const t = JSON.parse(readSaved(':t') || 'null');
      return Array.isArray(t) && t.length >= 2 ? t : null;
    } catch (e) { return null; }
  }

  function startSlots(want, T) {
    const gc = inf.gc;
    const aId = readSaved(':a');
    const aOff = parseFloat(readSaved(':ao'));
    const aPage = +readSaved(':ap') || 0;
    const targetY = scrollTarget;

    let pt = aPage;
    if (!pt) { pt = 1; for (let p = 1; p <= want; p++) if (T[p - 1] <= targetY) pt = p; }
    pt = Math.max(1, Math.min(want, pt));

    const slots = new Map();
    for (let p = inf.page + 1; p <= want; p++) {
      const s = document.createElement('div');
      s.className = 'hk-slot';
      s.dataset.hkSlot = String(p);
      s.style.height = Math.max(0, T[p] - T[p - 1]) + 'px';
      gc.appendChild(s);
      slots.set(p, s);
    }
    window.scrollTo(0, targetY);

    inf.loading = true;
    inf.restore = want;
    slotMode = true;
    hlog('복원: 빈 자리', slots.size, '개, 먼저 받을 페이지', pt);

    let anchorDone = false;
    const tryAnchor = () => {
      if (anchorDone || !aId) return false;
      const c = Array.from(gc.children).find(x => x.dataset && x.dataset.hkPage && cardWorkId(x) === aId);
      if (!c) return false;
      const r = c.getBoundingClientRect();
      if (r.height <= 0) return false;
      anchorDone = true;
      window.scrollTo(0, window.scrollY + r.top - (isNaN(aOff) ? 0 : aOff));
      return true;
    };

    const fill = p => {
      const slot = slots.get(p);
      return fetchCards(pageUrl(p), inf.perPage).then(cards => {
        if (slot && slot.parentNode) {
          const have = new Set(Array.from(gc.children).map(c => cardWorkId(c)).filter(Boolean));
          (cards || []).forEach(c => {
            const id = cardWorkId(c);
            if (id && have.has(id)) return;
            if (id) have.add(id);
            c.dataset.hkPage = String(p);
            gc.insertBefore(c, slot);
          });
          slot.remove();
        }
        if (p === pt && !anchorDone) {
          if (!tryAnchor()) window.scrollTo(0, targetY);
          endRestore();
        }
      });
    };

    const queue = Array.from(slots.keys()).sort((a, b) => Math.abs(a - pt) - Math.abs(b - pt) || a - b);
    let running = 0;
    const pump = () => {
      while (running < SLOT_CONC && queue.length) {
        const p = queue.shift();
        running++;
        fill(p).catch(() => {}).then(() => {
          running--;
          if (!anchorDone && tryAnchor()) endRestore();
          if (queue.length) pump();
          else if (!running) finishSlots(want, targetY);
        });
      }
    };
    pump();
  }

  function finishSlots(want, targetY) {
    inf.loading = false;
    inf.page = want;
    loadedPages = want;
    inf.restore = 0;
    slotMode = false;
    scrollTarget = null;
    endRestore();
    clearSaved();
    kickInfinite();
  }

  function endRestore() {
    try { document.documentElement.classList.remove('hk-restoring'); } catch (e) {}
  }

  function giveUpScroll() {
    if (inf && inf.restore) { setTimeout(giveUpScroll, 3000); return; }
    scrollTarget = null;
    endRestore();
  }

  function hkImageUrl(file) {
    const hash = file && file.hash;
    if (!hash || hash.length < 3) return '';
    const path = hash.replace(/^.*(..)(.)$/, '$2/$1/' + hash);
    const g0 = parseInt(hash.slice(-3, -1), 16);
    const fronts = g0 < 0x30 ? 2 : 3;
    const g = g0 < 0x09 ? 1 : g0;
    const host = 'https://' + String.fromCharCode(97 + (g % fronts)) + 'a.hitomi.la';
    const one = v => v === 1 || v === '1';
    if (one(file.haswebp)) return host + '/webp/' + path + '.webp';
    if (one(file.hasavif)) return host + '/avif/' + path + '.avif';
    const ext = String(file.name || 'image.jpg').split('.').pop();
    return host + '/images/' + path + '.' + ext;
  }

  function gmGet(url) {
    return new Promise((res, rej) => {
      if (typeof GM_xmlhttpRequest !== 'function') { rej(new Error('no gm')); return; }
      GM_xmlhttpRequest({
        method: 'GET', url, timeout: 8000,
        ontimeout: () => rej(new Error('timeout')),
        onload: r => (r.status >= 200 && r.status < 300 ? res(r.responseText) : rej(new Error('HTTP ' + r.status))),
        onerror: () => rej(new Error('network'))
      });
    });
  }

  function fetchT(url, opt, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 10000);
    return fetch(url, Object.assign({}, opt, { signal: ctrl.signal }))
      .finally(() => clearTimeout(t));
  }

  function fetchGalleryFiles(gid) {
    const parse = t => {
      if (!t) return null;
      let arr = null;
      const i = t.indexOf('{');
      if (i >= 0) {
        try {
          const o = JSON.parse(t.slice(i).replace(/;\s*$/, ''));
          if (o && o.date) noteDate(gid, o.date);
          if (o && Array.isArray(o.files)) arr = o.files;
        } catch (e) {}
      }
      if (!arr) {
        const m = t.match(/\[[\s\S]*\]/);
        if (m) { try { arr = JSON.parse(m[0]); } catch (e) {} }
      }
      return Array.isArray(arr) && arr.length ? arr : null;
    };
    const sources = [
      () => gmGet('https://ltn.hitomi.la/galleries/' + gid + '.js'),
      () => fetchT('https://ltn.hitomi.la/galleries/' + gid + '.js', { credentials: 'omit' }, 8000).then(r => (r.ok ? r.text() : '')),
      () => fetchT('/galleries/' + gid + '.js', { credentials: 'same-origin' }, 8000).then(r => (r.ok ? r.text() : ''))
    ];
    const tryAt = i => {
      if (i >= sources.length) { hlog('홈 미리 받기: 작품 정보 실패', gid); return Promise.resolve(null); }
      return sources[i]().then(parse).then(a => a || tryAt(i + 1)).catch(() => tryAt(i + 1));
    };
    return tryAt(0);
  }

  const WARM_LIMIT = 120;
  const warm = { sent: new Set(), queue: [], els: new Map(), active: 0, used: 0, io: null };

  function warmIdOf(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.hkId) return el.dataset.hkId;
    const h = el.querySelector && el.querySelector('.hk-card-host[data-hk-id]');
    return (h && h.dataset.hkId) || cardWorkId(el);
  }

  function warmEnqueue(el) {
    if (!settings.preload) return;
    const id = warmIdOf(el);
    if (!id || warm.sent.has(id) || warm.queue.indexOf(id) >= 0) return;
    if (warm.used + warm.queue.length >= WARM_LIMIT) return;
    warm.queue.push(id);
    warm.els.set(id, el);
    pumpWarm();
  }

  function nextWarmIndex() {
    const mid = (window.innerHeight || 800) / 2;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < warm.queue.length; i++) {
      const el = warm.els.get(warm.queue[i]);
      if (!el || !el.isConnected) continue;
      const r = el.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - mid);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function warmPages() {
    if (!settings.preload) return;
    const gc = document.querySelector('.gallery-content');
    if (!gc || IS_WORK_PAGE) return;

    if (!warm.io) {
      warm.io = new IntersectionObserver(list => {
        list.forEach(e => {
          if (!e.target.isConnected) { warm.io.unobserve(e.target); return; }
          if (e.isIntersecting) warmEnqueue(e.target);
        });
      }, { rootMargin: '1200px 0px' });
    }
    gc.querySelectorAll(':scope > div').forEach(card => {
      if (card.dataset.hkWarm) return;
      if (card.classList.contains('hk-artsoff') || card.classList.contains('hk-hidden') ||
          card.classList.contains('hk-stray') || card.classList.contains('hk-blocked')) return;
      card.dataset.hkWarm = '1';
      warm.io.observe(card);
    });
    pumpWarm();
  }

  function pumpWarm() {
    if (IS_WORK_PAGE) { warm.queue.length = 0; warm.els.clear(); return; }
    while (warm.active < 2 && warm.queue.length) {
      if (warm.used >= WARM_LIMIT) { warm.queue.length = 0; warm.els.clear(); return; }
      const [id] = warm.queue.splice(nextWarmIndex(), 1);
      warm.els.delete(id);
      warm.sent.add(id);
      warm.used++;
      warm.active++;
      warmOne(id).then(() => { warm.active--; setTimeout(pumpWarm, 40); });
    }
  }

  function warmOne(id) {
    return fetchGalleryFiles(id)
      .then(arr => {
        if (!arr || !arr.length || !arr[0]) return null;
        const u = readerImgUrl(id, arr[0]);
        if (!u) { hlog('홈 미리 받기: 이미지 주소 없음', id); return null; }
        warmUrl.set(id, u);
        if (warmUrl.size > 200) warmUrl.delete(warmUrl.keys().next().value);
        return fetchT(u, { cache: 'force-cache' }, 15000)
          .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
          .then(b => new Promise((res, rej) => {
            const bu = URL.createObjectURL(b);
            const im = new Image();
            im.onload = () => { URL.revokeObjectURL(bu); markPgReady(id); res(); };
            im.onerror = () => { URL.revokeObjectURL(bu); rej(new Error('decode')); };
            im.src = bu;
          }))
          .catch(err => { hlog('홈 미리 받기 실패', id, u, String(err && err.message || err)); });
      })
      .catch(() => {});
  }

  function initPreload() {
    if (!settings.preload) return;
    const gid = getCurrentId();
    if (!gid) return;
    const g = pageGI();
    const files = (g && g.files && g.files.length && (!g.id || String(g.id) === String(gid))) ? g.files : null;
    (files ? Promise.resolve(files) : fetchGalleryFiles(gid)).then(list => {
      if (!list || !list.length) return;
      const u = hkImageUrl(list[0]);
      if (u) fetch(u, { cache: 'force-cache' }).catch(() => {});
    });
  }

  // 지금 페이지 앞뒤로 10장씩만 받아 두고, 그 밖의 것은 메모리에서 바로 버린다 (많이 쌓이면 넘길 때 버벅임)
  const PRE_KEEP_BEHIND = 10;
  const PRE_KEEP_AHEAD = 10;
  const preDone = new Set();
  const preBlob = new Map();
  const preBusy = new Map();
  const preFailAt = new Map();
  const preImg = new Map();
  const preSmall = new Map();
  const warmUrl = new Map();
  const pgReady = new Set();
  function markPgReady(id) {
    const key = String(id);
    pgReady.add(key);
    document.querySelectorAll('.hk-card-host').forEach(h => {
      if (h.dataset.hkId !== key || !h.shadowRoot) return;
      const c = h.shadowRoot.querySelector('.card');
      if (c) c.classList.add('ready');
    });
  }

  // 1/N 창용 작은 그림: 창을 열었을 때만, 한 번에 몇 장씩 캔버스에 줄여 그린다
  function smallCanvas(im) {
    try {
      const w = 160, h = Math.max(1, Math.round(160 * im.naturalHeight / (im.naturalWidth || 1)));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, 0, 0, w, h);
      return c;
    } catch (e) { return null; }
  }

  function readerImgUrl(gid, f) {
    const w = W();
    const webp = f.haswebp == 1 || f.haswebp === '1';
    const avif = f.hasavif == 1 || f.hasavif === '1';
    const dir = webp ? 'webp' : (avif ? 'avif' : 'images');
    const ext = webp ? 'webp' : (avif ? 'avif' : String(f.name || 'jpg').split('.').pop());
    try {
      if (typeof w.url_from_url_from_hash === 'function') {
        const u = w.url_from_url_from_hash(gid, f, dir, ext);
        if (typeof u === 'string' && u && u.indexOf('undefined') < 0) return u;
      }
    } catch (e) {}
    return hkImageUrl(f);
  }

  function readerFiles(gid) {
    const g = pageGI();
    if (g && g.files && g.files.length && (!g.id || String(g.id) === String(gid))) return g.files;
    return null;
  }

  function preloadPage(gid, files, idx) {
    if (idx < 0 || idx >= files.length) return;
    if (preDone.has(idx) || preBusy.has(idx)) return;
    const t = preFailAt.get(idx);
    if (t && Date.now() - t < 8000) return;

    const u = readerImgUrl(gid, files[idx]);
    if (!u) return;

    const ctrl = new AbortController();
    preBusy.set(idx, ctrl);
    const finish = ok => {
      preBusy.delete(idx);
      if (ok) { preDone.add(idx); preFailAt.delete(idx); hlog('실제로 받아 보관함', idx + 1); }
      else { preFailAt.set(idx, Date.now()); hlog('미리 받기 실패', idx + 1, u); }
    };

    fetch(u, { signal: ctrl.signal, cache: 'force-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
      .then(b => {
        const blobUrl = URL.createObjectURL(b);
        return new Promise((resolve, reject) => {
          const im = new Image();
          im.onload = () => {
            if (im.decode) im.decode().catch(() => {});
            preBlob.set(idx, blobUrl);
            preImg.set(idx, im);
            resolve();
          };
          im.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('decode')); };
          im.src = blobUrl;
        });
      })
      .then(() => finish(true))
      .catch(err => {
        preBusy.delete(idx);
        if (ctrl.signal.aborted) return;
        hlog('내려받기 실패', idx + 1, String(err));
        finish(false);
      });
  }

  function currentPageReady() {
    const im = findReaderImg();
    return !!(im && im.complete && im.naturalWidth);
  }

  let readerPreOn = false;
  function initReaderPreload() {
    if (!settings.preload || readerPreOn) return;
    const gid = getCurrentId();
    if (!gid) return;
    readerPreOn = true;

    function tick(files) {
      if (!settings.preload) {
        preBusy.forEach(c => { try { c.abort(); } catch (e) {} });
        preBusy.clear();
        return;
      }
      const cur = fxPage() - 1;
      const ok = i => i >= 0 && i < files.length
        && !preDone.has(i) && !preBusy.has(i)
        && !(preFailAt.has(i) && Date.now() - preFailAt.get(i) < 8000);

      if (!currentPageReady()) return;
      const quiet = isQuiet();
      if (preBusy.size < (quiet ? 1 : 2)) {
        let next = -1;
        for (let d = 1; d < files.length && d <= PRE_KEEP_AHEAD && next < 0; d++) {
          if (quiet && d > 1) break;
          if (ok(cur + d)) next = cur + d;
          else if (!quiet && d <= PRE_KEEP_BEHIND && ok(cur - d)) next = cur - d;
        }
        if (next >= 0) preloadPage(gid, files, next);
      }
      preBusy.forEach((c, i) => {
        if (i < cur - PRE_KEEP_BEHIND || i > cur + PRE_KEEP_AHEAD) {
          try { c.abort(); } catch (e) {}
          preBusy.delete(i);
        }
      });
      preBlob.forEach((u, i) => {
        if (i < cur - PRE_KEEP_BEHIND || i > cur + PRE_KEEP_AHEAD) {
          URL.revokeObjectURL(u);
          preBlob.delete(i);
          preImg.delete(i);
          preSmall.delete(i);
          preDone.delete(i);
        }
      });
    }

    let waited = 0;
    const wait = setInterval(() => {
      const files = readerFiles(gid);
      waited += 300;
      if (files) {
        clearInterval(wait);
        hlog('리더 미리 받기 시작 · 총', files.length, '장');
        tick(files);
        window.addEventListener('hashchange', () => tick(files));
        setInterval(() => { tick(files); if (!isQuiet()) prepAround(); }, 500);
      } else if (waited > 15000) {
        clearInterval(wait);
        hlog('리더 미리 받기 실패: galleryinfo 를 찾지 못함');
      }
    }, 300);

    window.addEventListener('pagehide', () => {
      preBusy.forEach(c => { try { c.abort(); } catch (e) {} });
      preBusy.clear();
    });
  }

  function springKeys(from, to, stiff, damp, frames) {
    const out = [];
    let x = from, v = 0;
    const dt = 1 / 60;
    for (let i = 0; i < frames; i++) {
      const a = -stiff * (x - to) - damp * v;
      v += a * dt;
      x += v * dt;
      out.push(x);
    }
    return out;
  }

  const POP_N = 36;
  function popFrames() {
    const sx = springKeys(0.6, 1, 260, 22, POP_N);
    const sy = springKeys(0.25, 1, 190, 19, POP_N);
    return sx.map((x, i) => ({
      transform: i === POP_N - 1 ? 'scale(1, 1)'
        : `scale(${Math.max(0.01, x).toFixed(4)}, ${Math.max(0.01, sy[i]).toFixed(4)})`,
      opacity: Math.min(1, i / 7)
    }));
  }

  function closeFrames() {
    const sx = springKeys(1, 0.86, 340, 26, 30);
    return sx.map(x => ({
      transform: `scale(${Math.max(0.5, x).toFixed(4)})`,
      opacity: Math.max(0, Math.min(1, (x - 0.86) / 0.14)).toFixed(3)
    }));
  }

  function clearAnims(list) {
    list.forEach(x => { if (x && x.getAnimations) x.getAnimations().forEach(a => a.cancel()); });
  }

  function popOpen(e, g) {
    clearTimeout(e._t);
    clearAnims([e, g]);
    e.classList.remove('out');
    e.classList.add('open');
    if (g) {
      const r = e.getBoundingClientRect();
      g.style.left = r.left + 'px';
      g.style.top = r.top + 'px';
      g.style.width = r.width + 'px';
      g.style.height = r.height + 'px';
      g.style.transformOrigin = getComputedStyle(e).transformOrigin;
      g.classList.add('on');
    }
    if (!e.animate) return;
    e.animate(popFrames(), { duration: 600, easing: 'linear' });
    if (g && g.animate) g.animate(popFrames(), { duration: 600, easing: 'linear' });
  }

  function popClose(e, g, after) {
    if (!e.classList.contains('open') || e.classList.contains('out')) return;
    e.classList.add('out');
    clearTimeout(e._t);
    clearAnims([e, g]);
    const finish = () => {
      clearAnims([e, g]);
      if (g) g.classList.remove('on');
      e.classList.remove('open', 'out');
      if (after) after();
    };
    if (!e.animate) { e._t = setTimeout(finish, 230); return; }
    const a = e.animate(closeFrames(), { duration: 500, easing: 'linear', fill: 'forwards' });
    a.onfinish = finish;
  }

  const TAG_IDX = 'https://tagindex.hitomi.la';
  const TAG_TYPES = ['artist', 'group', 'type', 'language', 'series', 'character', 'male', 'female', 'tag'];
  const TY_KR = { female: '♀', male: '♂', artist: '작가', group: '그룹', series: '시리즈', character: '캐릭터', tag: '태그', language: '언어', type: '종류' };
  const tagCache = new Map();

  const isNum = s => /^[0-9]+$/.test(s);
  const nfmt = n => n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n);

  function tagPath(word) {
    let t = String(word || '');
    if (t[0] === '-') t = t.slice(1);
    let type = '', name = t;
    const i = t.indexOf(':');
    if (i > 0 && TAG_TYPES.includes(t.slice(0, i).toLowerCase())) {
      type = t.slice(0, i).toLowerCase();
      name = t.slice(i + 1);
    }
    if (!name || !/^[\x20-\x7e]+$/.test(name)) return '';
    const low = name.toLowerCase();
    let p = '/' + (type || 'global');
    for (let k = 0; k < low.length; k++) {
      const c = low[k];
      if (c === '.') p += '/dot';
      else if (c === '/') p += '/slash';
      else if (c === ' ') p += '/_';
      else if (/[a-z0-9_\-]/.test(c)) p += '/' + c;
      else return '';
    }
    return p + '.json';
  }

  function tagSuggest(word) {
    const path = tagPath(word);
    if (!path) return Promise.resolve([]);
    if (tagCache.has(path)) return Promise.resolve(tagCache.get(path));
    return fetch(TAG_IDX + path)
      .then(r => (r && r.ok ? r.json() : []))
      .then(list => {
        const out = (Array.isArray(list) ? list : [])
          .filter(x => x && typeof x[0] === 'string')
          .slice(0, 10)
          .map(x => ({ t: x[0], c: Number(x[1]) || 0, ty: String(x[2] || '') }));
        if (tagCache.size > 400) tagCache.delete(tagCache.keys().next().value);
        tagCache.set(path, out);
        return out;
      })
      .catch(() => []);
  }

  function localIds(q) {
    const out = [], seen = new Set();
    const push = (id, k, h) => {
      const s = String(id == null ? '' : id).replace(/[^0-9]/g, '');
      if (!s || seen.has(s) || out.length >= 8) return;
      if (q && !s.startsWith(q)) return;
      seen.add(s);
      out.push({ t: s, k, h });
    };
    hist.forEach(id => push(id, '최근', true));
    saved.forEach(s => push(s.id, '일지', false));
    watched.forEach(w => push(w.id, '기록', false));
    return out;
  }

  function localTerms(word) {
    const w = String(word || '').toLowerCase();
    if (!w) return [];
    const out = [];
    for (let i = terms.length - 1; i >= 0 && out.length < 4; i--) {
      const t = terms[i];
      if (!t || t.toLowerCase().indexOf(w) < 0) continue;
      out.push({ t, k: '검색어' });
    }
    return out;
  }

  const SV = (inner, cls) =>
    `<svg ${cls ? `class="${cls}" ` : ''}viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  const ICON = {
    search: SV('<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/>'),
    reset: SV('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    hist:   SV('<circle cx="12" cy="12" r="9"/><path d="M12 7.6V12l3 2"/>'),
    info:   SV('<path d="M4 7h16M4 12h16M4 17h11"/>'),
    pin:    SV('<path d="M6.5 3h11v18l-5.5-4.2L6.5 21z"/>'),
    sort:   SV('<path d="M4 6h16"/><path d="M6.5 12h11"/><path d="M9.5 18h5"/>'),
    gear:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
  };

  ICON.edit = SV('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>');
  ICON.del = SV('<path d="M18 6 6 18M6 6l12 12"/>');
  ICON.life = SV('<path d="' + 'M12 3.6l2.5 5.1 5.6.8-4.1 4 1 5.6L12 16.4l-5 2.7 1-5.6-4.1-4 5.6-.8z' + '"/><path d="M19.5 2.5v3M18 4h3"/>');
  ICON.copy = SV('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>');
  ICON.journal = SV('<path class="jb" d="M6.5 3H18v18H6.5A1.5 1.5 0 0 1 5 19.5v-15A1.5 1.5 0 0 1 6.5 3z"/><path d="M9 3v18"/><path d="M12 8h3.5M12 11.5h3.5"/>');

  const thumbIO = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(es => {
        es.forEach(e => {
          if (!e.isIntersecting) return;
          const im = e.target;
          thumbIO.unobserve(im);
          im.src = im.dataset.src;
        });
      }, { root: null, rootMargin: '150px 0px' })
    : null;

  // 저장된 썸네일이 없을 때: 작품 정보에서 1페이지 주소를 받아 썸네일로 쓴다 (동시에 2개까지)
  const thumbMiss = { q: [], active: 0, wait: new Map() };
  function missThumb(id) {
    id = String(id);
    if (thumbMiss.wait.has(id)) return thumbMiss.wait.get(id);
    const pr = new Promise(res => { thumbMiss.q.push({ id, res }); });
    thumbMiss.wait.set(id, pr);
    pumpMissThumb();
    return pr;
  }
  function pumpMissThumb() {
    while (thumbMiss.active < 2 && thumbMiss.q.length) {
      const { id, res } = thumbMiss.q.shift();
      thumbMiss.active++;
      fetchGalleryFiles(id)
        .then(arr => (arr && arr[0] ? readerImgUrl(id, arr[0]) : ''))
        .catch(() => '')
        .then(u => {
          if (u) { setThumb(id, u); flushThumbs(); }
          else thumbMiss.wait.delete(id);
          res(u || '');
        })
        .then(() => { thumbMiss.active--; pumpMissThumb(); });
    }
  }

  function queueThumb(im, u) {
    if (!thumbIO) { im.src = u; return; }
    im.dataset.src = u;
    thumbIO.observe(im);
  }

  let host = null;

  function buildUI() {
    if (host) return;
    injectFont();

    host = document.createElement('div');
    host.id = 'hk-host';
    host.style.cssText =
      'all:initial!important;position:fixed!important;left:0!important;bottom:0!important;' +
      'width:0!important;height:0!important;z-index:2147483647!important;display:block!important;';
    const sh = host.attachShadow({ mode: 'open' });

    const curId = getCurrentId();
    const curSort = currentSort();

    // 하단 버튼 조각들 (처음 그릴 때와, 이동 중에 다음 화면 모양으로 바꿀 때 같은 모양을 쓴다)
    const curHtml = id => `<button class="cur" type="button" id="curNum" title="품번 복사">${id}</button>` +
      `<div class="pstars" id="pstars" title="별점을 누르면 일지에 남깁니다">${[1, 2, 3, 4, 5].map(i => `<button class="bstar" type="button" data-n="${i}" title="${i}점" aria-label="${i}점">${starSvg(false)}</button>`).join('')}</div>`;
    const tlInner = (reader, work) =>
      (reader ? `<div class="pg" id="pg" title="페이지 이동">- / -</div>` : '') +
      (reader ? `<button class="ib" type="button" id="zoomBtn" title="원래 크기로">${ICON.reset}</button>` : '') +
      (work ? `<button class="ib" type="button" id="infoBtn" title="작품 세부사항 (작가·품번·태그·등록일)">${ICON.info}</button>` : '');
    const filtHtml = sort => `<button class="filt pill" type="button" id="filt" title="정렬 바꾸기">` +
      `${ICON.sort}<span class="fl">${SORT_KR[sort] || ''}</span></button>`;

    sh.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="root" id="root">
        <div class="scrim" id="scrim"></div>
        <div class="glass" id="glass"></div>
        ${IS_WORK_PAGE ? '' : '<div class="fxtop"></div><div class="fxbot"></div>'}
                <div class="wrap" id="wrap">
          <div class="stack">
            <div class="toast pill" id="toast"></div>
            <div class="ask pill" id="ask"></div>
            <div class="panel pill" id="panel"></div>
          </div>
          <div class="tl pill" id="tl">${tlInner(IS_READER, IS_WORK_PAGE)}</div>
          <div class="bottom">
            ${curSort ? filtHtml(curSort) : ''}
            <div class="bar pill" id="bar">
              ${curId ? curHtml(curId) : ''}
              <button class="ib" type="button" id="searchBtn" title="검색">${ICON.search}</button>
              <button class="ib" type="button" id="histBtn" title="최근 / 일지">${ICON.hist}</button>
              <button class="ib gear" type="button" id="setBtn" title="설정">${ICON.gear}</button>
            </div>
            <button class="hfix" type="button" id="homeBtn" title="히토미 홈 또는 직전 화면 선택"><b class="hh">H</b></button>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    const $ = sel => sh.querySelector(sel);
    const root = $('#root');
    { const t = $('#tl'); if (t && !t.querySelector('button, .pg')) t.remove(); }
    let barFrom = null;
    try {
      const v = JSON.parse(sessionStorage.getItem('hk_bar') || 'null');
      sessionStorage.removeItem('hk_bar');
      if (v && Date.now() - v.t < 5000) barFrom = v;
    } catch (e) {}
    if (barFrom) {
      root.classList.add('morph');
      // 앞 화면에서 이미 이 모양으로 바꿔 두었으면 여기서는 아무 애니메이션도 하지 않는다
      if (!barFrom.done) requestAnimationFrame(() => morphBarFrom(barFrom));
    }

    // ----- 이동하기 직전에, 지금 버튼들을 다음 화면의 모양으로 바꾼다 -----
    const GROW = 'cubic-bezier(.22, 1, .36, 1)';
    const ZERO_BOX = { width: '0px', paddingLeft: '0px', paddingRight: '0px', marginLeft: '0px', marginRight: '0px' };
    function boxOf(e) {
      const cs = getComputedStyle(e);
      return { width: e.offsetWidth + 'px', paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight,
        marginLeft: cs.marginLeft, marginRight: cs.marginRight };
    }
    function expandIn(e, dur) {
      if (!e.animate) return;
      const full = boxOf(e);
      e.style.overflow = 'hidden';
      const a = e.animate([Object.assign({ opacity: 0 }, ZERO_BOX), Object.assign({ opacity: 1 }, full)],
        { duration: dur, easing: GROW });
      a.onfinish = a.oncancel = () => { e.style.overflow = ''; };
    }
    // 바꾼 것을 되돌리는 방법을 모아 두었다가, 뒤로가기로 이 화면이 되살아나면 되돌린다
    let morphUndo = [];
    function undoMorph() {
      const ops = morphUndo;
      morphUndo = [];
      ops.reverse().forEach(f => { try { f(); } catch (e) {} });
      ['#filt', '#tl', '#bar'].forEach(sel => {
        const e = $(sel);
        if (e && e.getAnimations) e.getAnimations().forEach(a => a.cancel());
      });
    }
    window.__hkMorphUndo = undoMorph;
    window.addEventListener('pageshow', e => {
      if (!e.persisted) return;
      undoMorph();
      try { sessionStorage.removeItem('hk_bar'); sessionStorage.removeItem('hk_zoom'); } catch (err) {}
    });
    function addedNode(n) { morphUndo.push(() => n.remove()); }
    // 지우지 않고 폭 0 으로 접어 둔다 (되돌릴 때 그대로 펼친다)
    function collapseOut(e, dur) {
      const full = boxOf(e);
      const prev = { o: e.style.overflow, f: e.style.flexShrink, p: e.style.pointerEvents };
      e.style.overflow = 'hidden';
      e.style.flexShrink = '0';
      e.style.pointerEvents = 'none';
      const a = e.animate ? e.animate([Object.assign({ opacity: 1 }, full), Object.assign({ opacity: 0 }, ZERO_BOX)],
        { duration: dur, easing: GROW, fill: 'forwards' }) : null;
      if (!a) e.style.display = 'none';
      morphUndo.push(() => {
        if (a) a.cancel();
        e.style.display = '';
        e.style.overflow = prev.o;
        e.style.flexShrink = prev.f;
        e.style.pointerEvents = prev.p;
      });
    }
    function popPill(e, show, dur) {
      const kf = [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }];
      if (show) {
        if (e.animate) e.animate(kf, { duration: dur, easing: GROW });
        return;
      }
      const prevP = e.style.pointerEvents;
      e.style.pointerEvents = 'none';
      const a = e.animate ? e.animate(kf.slice().reverse(), { duration: dur, easing: GROW, fill: 'forwards' }) : null;
      if (!a) e.style.display = 'none';
      morphUndo.push(() => { if (a) a.cancel(); e.style.display = ''; e.style.pointerEvents = prevP; });
    }
    function setText(n, t) {
      if (!n || n.textContent === t) return;
      const old = n.textContent;
      n.textContent = t;
      morphUndo.push(() => { n.textContent = old; });
    }
    function targetSpec(url) {
      let u;
      try { u = new URL(url, location.href); } catch (e) { return null; }
      if (u.origin !== location.origin) return null;
      const path = u.pathname;
      const work = LIST_PAGE_RE.test(path);
      const reader = /^\/reader\//.test(path);
      const m = path.match(/[-/](\d+)\.html$/);
      let sort = null;
      const pm = path.match(/^\/popular\/(today|week|month|year)-/);
      if (pm) sort = pm[1];
      else if (path === '/' || /^\/index-/.test(path)) sort = 'date';
      return { id: m ? m[1] : null, work, reader, sort };
    }
    function frag(html) {
      const t = document.createElement('template');
      t.innerHTML = html;
      return Array.from(t.content.children);
    }
    window.__hkMorphTo = (url, dur) => {
      const t = targetSpec(url);
      if (!t) return false;
      const D = dur || 420;
      undoMorph();
      root.classList.add('morph');
      if (panelMode) setPanel(null, true);
      if (metaOpen()) closeMeta(true);
      const bar = $('#bar');
      const bottom = sh.querySelector('.bottom');
      // 품번 · 별
      const cn = $('#curNum'), ps = $('#pstars');
      if (t.id) {
        if (cn) setText(cn, t.id);
        else if (bar) {
          const nodes = frag(curHtml(t.id));
          nodes.slice().reverse().forEach(n => bar.insertBefore(n, bar.firstChild));
          nodes.forEach(n => { addedNode(n); expandIn(n, D); });
        }
      } else {
        [cn, ps].forEach(n => { if (n) collapseOut(n, D); });
      }
      // 정렬 버튼
      const ft = $('#filt');
      if (t.sort) {
        if (ft) setText(ft.querySelector('.fl'), SORT_KR[t.sort] || '');
        else if (bottom && bar) {
          const n = frag(filtHtml(t.sort))[0];
          bottom.insertBefore(n, bar);
          addedNode(n);
          expandIn(n, D);
        }
      } else if (ft) collapseOut(ft, D);
      // 위쪽 작은 알약 (페이지 번호 · 확대 복구 · 세부사항)
      const inner = tlInner(t.reader, t.work);
      const tl = $('#tl');
      const idsOf = n => Array.from(n.children).map(c => c.id).join(',');
      const newTl = () => {
        const n = frag(`<div class="tl pill" id="tl">${inner}</div>`)[0];
        $('#wrap').insertBefore(n, bottom);
        addedNode(n);
        return n;
      };
      if (inner && !tl) {
        const n = newTl();
        n.style.transformOrigin = '100% 100%';
        popPill(n, true, D);
      } else if (!inner && tl) {
        tl.style.transformOrigin = '100% 100%';
        popPill(tl, false, D);
      } else if (inner && tl && idsOf(tl) !== idsOf(frag(`<div>${inner}</div>`)[0])) {
        // 들어 있는 버튼이 다를 때만 바꾼다. 원래 알약은 숨겨 두고(되돌릴 수 있게) 새 알약을 같은 자리에 둔다
        const w0 = tl.offsetWidth;
        tl.id = 'tl-old';
        tl.style.display = 'none';
        morphUndo.push(() => { tl.style.display = ''; tl.id = 'tl'; });
        const n = newTl();
        const w1 = n.offsetWidth;
        if (n.animate && w0 !== w1) n.animate([{ width: w0 + 'px' }, { width: w1 + 'px' }], { duration: D, easing: GROW });
      }
      return true;
    };

    // 앞 화면의 알약 폭에서 지금 폭으로 늘어나거나 줄어들고, 새로 생긴 버튼만 커지며 나타난다
    function morphBarFrom(v) {
      const EASE = 'cubic-bezier(.22, 1, .36, 1)';
      const had = new Set(v.ids || []);
      const bar = $('#bar');
      if (bar) {
        const w1 = bar.offsetWidth;
        Array.from(bar.children).forEach(c => {
          if (c.id && had.has(c.id)) return;
          if (c.animate) c.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }],
            { duration: 420, delay: 120, easing: EASE, fill: 'backwards' });
        });
        if (v.w && Math.abs(w1 - v.w) > 1 && bar.animate) {
          bar.style.justifyContent = 'flex-end';
          bar.style.overflow = 'hidden';
          const a = bar.animate([{ width: v.w + 'px' }, { width: w1 + 'px' }], { duration: 520, easing: EASE });
          const done = () => { bar.style.justifyContent = ''; bar.style.overflow = ''; };
          a.onfinish = done;
          a.oncancel = done;
        }
      }
      ['#tl', '#filt'].forEach(sel => {
        const e = $(sel);
        if (!e || had.has(e.id) || !e.animate) return;
        e.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'none' }],
          { duration: 460, delay: 140, easing: EASE, fill: 'backwards' });
      });
    }
    const wrap = $('#wrap');
    const panel = $('#panel');
    const scrim = $('#scrim');
    const glass = $('#glass');

    let panelMode = null;
    let histMode = 'recent';
    let filterText = '';
    let histFilter = '';
    let bmStars = null;
    let bmSetStars = null;
    let sItems = [], sIdx = -1;
    let sInput = null;
    let sgSeq = 0;
    let bmId = null;
    let bmBack = null;

    function syncGlass() {
      if (!glass.classList.contains('on') || panel.getAnimations().length) return;
      const r = panel.getBoundingClientRect();
      glass.style.left = r.left + 'px';
      glass.style.top = r.top + 'px';
      glass.style.width = r.width + 'px';
      glass.style.height = r.height + 'px';
    }
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => syncGlass()).observe(panel);

    const vv = window.visualViewport;
    let kbSig = '';
    function syncKeyboard() {
      const inner = window.innerHeight;
      const vis = vv ? vv.height + vv.offsetTop : inner;
      const kb = Math.max(0, Math.round(inner - vis));
      const topPanel = panel.classList.contains('top');
      const sig = kb + (topPanel ? 't' : 'b');
      if (sig === kbSig) return;
      kbSig = sig;
      wrap.style.transform = (kb > 2 && !topPanel) ? 'translateY(' + -kb + 'px)' : '';
      panel.style.maxHeight = kb > 2 ? Math.max(140, Math.round((vv ? vv.height : inner) - 150)) + 'px' : '';
    }
    if (vv) {
      vv.addEventListener('resize', syncKeyboard);
      vv.addEventListener('scroll', syncKeyboard);
    }
    window.addEventListener('resize', syncKeyboard);
    syncKeyboard();

    function applyPadding() {
      if (!document.body) return;
      document.body.style.paddingBottom = '122px';
    }
    applyPadding();
    window.addEventListener('resize', applyPadding);
    setTimeout(applyPadding, 600);

    function el(tag, cls, text) {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    }
    function btn(label, cls, fn) {
      const b = el('button', 'btn ' + (cls || ''), label);
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    }
    function chipLink(text, href, cls) {
      const a = document.createElement('a');
      a.className = 'chip' + (cls ? ' ' + cls : '');
      a.textContent = text;
      a.href = href;
      return a;
    }
    const enc = s => encodeURIComponent(s).replace(/%3A/gi, ':');

    function thumbEl(id) {
      const box = el('div', 'tb');
      box.title = '클릭: 열기';
      let empty = null;
      const showEmpty = () => {
        if (empty) return;
        empty = el('span', '', '이미지 없음');
        box.insertBefore(empty, box.firstChild);
      };
      const put = (u, retry) => {
        const im = document.createElement('img');
        im.alt = '';
        im.addEventListener('error', () => {
          im.remove();
          if (retry) { delete thumbs[String(id)]; fetchMiss(); } else showEmpty();
        });
        im.addEventListener('load', () => { im.classList.add('ld'); if (empty) { empty.remove(); empty = null; } });
        box.appendChild(im);
        queueThumb(im, u);
      };
      const fetchMiss = () => {
        missThumb(id).then(u => { if (u && box.isConnected) put(u, false); else showEmpty(); });
      };
      const u = thumbs[id];
      if (u) put(u, true);
      else fetchMiss();
      box.addEventListener('click', () => goTo(id, box));
      return box;
    }

    const SWAP_EASE = 'cubic-bezier(.22,1,.36,1)';
    let swapSeq = 0, swapT = 0;

    function resetPanelStyle() {
      panel.style.height = ''; panel.style.width = '';
      panel.style.transition = ''; panel.style.overflow = '';
    }

    // 내용이 이미 바뀐 상태에서, h0 높이부터 새 높이까지 부드럽게 늘이거나 줄인다
    function growFrom(h0, w0) {
      clearTimeout(swapT);
      const my = swapSeq;
      panel.style.transition = '';
      panel.style.height = '';
      if (w0 != null) panel.style.width = '';
      const h1 = panel.offsetHeight, w1 = panel.offsetWidth;
      if (h0 === h1 && (w0 == null || w0 === w1)) { resetPanelStyle(); return; }
      panel.style.overflow = 'hidden';
      panel.style.height = h0 + 'px';
      if (w0 != null) panel.style.width = w0 + 'px';
      void panel.offsetWidth;
      panel.style.transition = `height .36s ${SWAP_EASE}, width .36s ${SWAP_EASE}`;
      panel.style.height = h1 + 'px';
      if (w0 != null) panel.style.width = w1 + 'px';
      swapT = setTimeout(() => { if (my === swapSeq) resetPanelStyle(); }, 400);
    }

    function growRender(fn) {
      const h0 = panel.offsetHeight;
      fn();
      growFrom(h0);
    }

    let toastTimer = 0;
    // act: { label, fn } 를 주면 토스트 오른쪽에 버튼이 붙고 조금 더 오래 떠 있다
    function toast(msg, act) {
      const t = $('#toast');
      t.textContent = '';
      t.appendChild(el('span', 'tmsg', msg));
      if (act) {
        const b = el('button', 'tact', act.label);
        b.type = 'button';
        b.addEventListener('click', e => {
          e.stopPropagation();
          clearTimeout(toastTimer);
          popClose(t, null);
          act.fn();
        });
        t.appendChild(b);
      }
      t.classList.toggle('has-act', !!act);
      popOpen(t, null);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => popClose(t, null), act ? 6000 : 1600);
    }

    function paintPill(n) {
      const ps = $('#pstars');
      if (!ps) return;
      Array.from(ps.children).forEach((b, i) => b.classList.toggle('on', i < n));
    }

    function updateCounts() {
      const ps = $('#pstars');
      if (!ps || !curId) return;
      const it = savedOf(curId);
      paintPill(it ? (+it.stars || 0) : 0);
      ps.classList.toggle('saved', !!it);
      ps.title = it ? '일지에 있음 · 눌러서 별점·별명 수정' : '별점을 누르면 일지에 남깁니다';
    }

    function segCtl(items, cur, onPick, cls) {
      const seg = el('div', 'seg' + (cls ? ' ' + cls : ''));
      const ind = el('span', 'segi');
      seg.appendChild(ind);
      seg._cur = cur;
      const bs = items.map(([k, t]) => {
        const b = el('button', 'segb' + (k === cur ? ' on' : ''), t);
        b.type = 'button';
        b.dataset.k = k;
        b.addEventListener('click', () => {
          if (seg._cur === k) return;
          seg._set(k);
          onPick(k);
        });
        seg.appendChild(b);
        return b;
      });
      const place = anim => {
        const b = bs.find(x => x.dataset.k === seg._cur);
        if (!b || !b.offsetWidth) return false;
        if (!anim) seg.classList.add('noanim');
        ind.style.width = b.offsetWidth + 'px';
        ind.style.transform = 'translateX(' + b.offsetLeft + 'px)';
        if (!anim) { void ind.offsetWidth; seg.classList.remove('noanim'); }
        seg.classList.add('slide');
        return true;
      };
      seg._set = k => {
        seg._cur = k;
        bs.forEach(b => b.classList.toggle('on', b.dataset.k === k));
        place(true);
      };
      const tryPlace = n => { if (!place(false) && n < 30) requestAnimationFrame(() => tryPlace(n + 1)); };
      requestAnimationFrame(() => tryPlace(0));
      return seg;
    }

    host.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') setPanel(null, true);
    });
    ['keyup', 'keypress'].forEach(ev => host.addEventListener(ev, e => e.stopPropagation()));

    scrim.addEventListener('click', () => {
      if (cmenu) { closeCardMenu(); return; }
      setPanel(null, true);
    });
    scrim.addEventListener('mousedown', e => e.preventDefault());

    function paintSgs(items, word, emptyMsg) {
      const list = panel.querySelector('#sgl');
      if (!list) return;
      sItems = items;
      sIdx = -1;
      list.textContent = '';
      if (!items.length) {
        if (emptyMsg) list.appendChild(el('div', 'empty', emptyMsg));
        return;
      }
      const q = String(word || '');
      items.forEach(it => {
        const row = el('div', 'sg');
        const t = el('span', 't');
        const at = q ? it.t.toLowerCase().indexOf(q.toLowerCase()) : -1;
        if (at >= 0) {
          t.append(
            document.createTextNode(it.t.slice(0, at)),
            el('mark', '', it.t.slice(at, at + q.length)),
            document.createTextNode(it.t.slice(at + q.length))
          );
        } else t.textContent = it.t;
        row.appendChild(t);
        if (it.ty) row.appendChild(el('span', 'ty' + (it.ty === 'female' ? ' f' : it.ty === 'male' ? ' m' : ' a'), TY_KR[it.ty] || it.ty));
        row.appendChild(el('span', 'k', it.k || ''));
        if (it.h) {
          const x = el('span', 'x', '✕');
          x.title = '검색 기록 삭제';
          x.addEventListener('click', e => {
            e.stopPropagation();
            hist = hist.filter(h => h !== it.t);
            store.set(KEY.hist, hist);
            renderSgs(sInput ? sInput.value : '');
          });
          row.appendChild(x);
        }
        row.addEventListener('click', () => pick(it));
        list.appendChild(row);
      });
    }

    function renderSgs(raw) {
      if (!panel.querySelector('#sgl')) return;
      const q = String(raw || '').trim();
      const seq = ++sgSeq;

      if (!q) { paintSgs(localIds(''), '', ''); return; }
      if (isNum(q)) { paintSgs(localIds(q), q, '저장된 품번이 없습니다'); return; }

      const word = q.slice(q.lastIndexOf(' ') + 1);
      const local = localTerms(word);
      if (!tagPath(word)) { paintSgs(local, word, ''); return; }

      paintSgs(local, word, '');
      tagSuggest(word).then(tags => {
        if (seq !== sgSeq) return;
        const neg = word[0] === '-' ? '-' : '';
        const items = tags.map(x => ({
          t: x.t,
          ty: x.ty,
          k: x.c ? nfmt(x.c) : '',
          tag: neg + (x.ty && x.ty !== 'tag' ? x.ty + ':' : '') + x.t.replace(/ /g, '_')
        }));
        const all = local.concat(items);
        paintSgs(all, word, all.length ? '' : '자동완성 결과가 없습니다');
      });
    }

    function pick(it) {
      if (it.tag && sInput) {
        const v = sInput.value;
        sInput.value = v.slice(0, v.lastIndexOf(' ') + 1) + it.tag;
        renderSgs(sInput.value);
        return;
      }
      submit(it.t);
    }

    function submit(raw) {
      const s = String(raw || '').trim();
      if (!s) { toast('품번 · 검색어 · 태그를 입력하세요'); return; }
      if (isNum(s)) { pushHist(s); goTo(s); return; }
      let q = s;
      if (!/language:/i.test(q)) q += ' language:korean';
      location.href = '/search.html?query=' + encodeURIComponent(q);
    }

    function moveHl(d) {
      const rows = panel.querySelectorAll('.sg');
      if (!rows.length) return;
      sIdx = (sIdx + d + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('hl', i === sIdx));
      rows[sIdx].scrollIntoView({ block: 'nearest' });
    }

    function renderSearch() {
      panel.textContent = '';
      const r = el('div', 'row');
      const inp = el('input', 'field');
      inp.type = 'text';
      inp.placeholder = '품번 · 검색어 · 태그';
      inp.autocomplete = 'off';
      inp.spellcheck = false;
      inp.enterKeyHint = 'search';
      sInput = inp;
      inp.addEventListener('input', () => renderSgs(inp.value));
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveHl(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveHl(-1); }
        else if (e.key === 'Enter') {
          e.preventDefault();
          if (sIdx >= 0 && sItems[sIdx]) pick(sItems[sIdx]);
          else submit(inp.value);
        }
      });
      r.append(inp, btn('확인', 'primary', () => submit(inp.value)));
      const list = el('div', 'sgl');
      list.id = 'sgl';
      panel.append(r, list);
      renderSgs('');
    }

    let infoSeq = 0;
    async function renderInfo() {
      const id = getCurrentId();
      const my = ++infoSeq;
      panel.textContent = '';
      if (!id) { panel.appendChild(el('div', 'muted', '작품 페이지에서 열 수 있습니다')); return; }
      panel.appendChild(el('div', 'muted', '불러오는 중…'));

      const info = await fxLoadInfo(id);
      if (my !== infoSeq || panelMode !== 'info') return;
      const h0 = panel.offsetHeight;
      panel.textContent = '';

      panel.appendChild(el('div', 'lbl', '제목'));
      panel.appendChild(el('div', 'ttl', info.title || '(제목 없음)'));

      panel.appendChild(el('div', 'lbl', '작가'));
      if (info.artists.length || info.groups.length) {
        const c = el('div', 'chips');
        info.artists.forEach(a => c.appendChild(chipLink(a, `/artist/${enc(a)}-${LANG}.html`, 'a')));
        info.groups.forEach(g => c.appendChild(chipLink(g + ' (그룹)', `/group/${enc(g)}-${LANG}.html`, 'a')));
        panel.appendChild(c);
      } else panel.appendChild(el('div', 'val', '정보 없음'));

      const r = el('div', 'row2');
      const d1 = el('div'), d2 = el('div'), d3 = el('div');
      d1.append(el('div', 'lbl', '품번'));
      const cp = el('div', 'copy', id);
      cp.title = '클릭하면 복사';
      cp.addEventListener('click', () => {
        copyText(id).then(() => { cp.textContent = '복사됨'; setTimeout(() => (cp.textContent = id), 900); });
      });
      d1.append(cp);
      d2.append(el('div', 'lbl', '총 페이지'), el('div', 'val', info.total ? info.total + '페이지' : '알 수 없음'));
      d3.append(el('div', 'lbl', '등록일'), el('div', 'val', dates[id] || '알 수 없음'));
      r.append(d1, d2, d3);
      panel.appendChild(r);

      if (info.series.length) {
        panel.appendChild(el('div', 'lbl', '시리즈'));
        const c = el('div', 'chips');
        info.series.forEach(s => c.appendChild(chipLink(s, `/series/${enc(s)}-${LANG}.html`)));
        panel.appendChild(c);
      }
      if (info.chars.length) {
        panel.appendChild(el('div', 'lbl', '캐릭터'));
        const c = el('div', 'chips');
        info.chars.forEach(s => c.appendChild(chipLink(s, `/character/${enc(s)}-${LANG}.html`)));
        panel.appendChild(c);
      }

      panel.appendChild(el('div', 'lbl', '태그 (' + info.tags.length + ')'));
      if (!info.tags.length) panel.appendChild(el('div', 'val', '태그 없음'));
      [['female', '♀ female', 'f'], ['male', '♂ male', 'm'], ['', '기타', '']].forEach(([ns, name, cls]) => {
        const list = info.tags.filter(t => t.ns === ns);
        if (!list.length) return;
        panel.appendChild(el('div', 'lbl', name));
        const c = el('div', 'chips');
        list.forEach(t => {
          const full = (t.ns ? t.ns + ':' : '') + t.n;
          c.appendChild(chipLink(t.n, `/tag/${enc(full)}-${LANG}.html`, cls));
        });
        panel.appendChild(c);
      });

      const orow = el('div', 'row');
      orow.style.marginTop = '14px';
      const olink = document.createElement('a');
      olink.className = 'btn';
      olink.textContent = '원본 보기';
      olink.title = '히토미 원본 작품 정보 페이지';
      olink.href = '/galleries/' + id + '.html';
      orow.appendChild(olink);
      panel.appendChild(orow);
      growFrom(h0);

      if (!dates[id]) loadDate(id, my);
    }

    async function loadDate(id, my) {
      try {
        const r = await fetch('/galleries/' + id + '.html', { credentials: 'same-origin' });
        const t = await r.text();
        const m = t.match(/(?:date|등록|발매)[^0-9]{0,24}(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/i)
               || t.match(DATE_RE);
        if (!m) return;
        const s = fmtDate(m);
        setDate(id, s);
        if (my !== infoSeq || panelMode !== 'info') return;
        const vals = panel.querySelectorAll('.row2 .val');
        if (vals.length) vals[vals.length - 1].textContent = s;
      } catch (e) {}
    }

    function renderHist() {
      panel.textContent = '';
      const seg = segCtl([['recent', '모두'], ['saved', '일지']], histMode, k => {
        histMode = k;
        switchHist();
      });
      const head = el('div', 'hhead');
      head.append(seg);
      const body = el('div', 'hbody at-top');
      body.addEventListener('scroll', () => body.classList.toggle('at-top', body.scrollTop <= 2), { passive: true });
      panel.append(head, body);
      buildHistBody(body);
    }

    // 모두 ↔ 일지: 지금 목록이 옆으로 빠지며 흐려지고, 새 목록이 반대쪽에서 미끄러져 들어온다 (팝업 높이도 함께)
    let histSwapT = 0;
    function switchHist() {
      const body = panel.querySelector('.hbody');
      if (!body) return renderHist();
      filterText = ''; histFilter = '';
      const dir = histMode === 'saved' ? 1 : -1;
      // 검색창 · 전체복사 줄은 움직이지 않고 그대로 두고, 목록과 아래 막대만 바뀌며 움직인다
      const parts = () => Array.from(panel.querySelectorAll('.jfoot')).concat([body]);
      const my = ++swapSeq;
      clearTimeout(swapT);
      clearTimeout(histSwapT);
      const h0 = panel.offsetHeight;
      panel.style.overflow = 'hidden';
      panel.style.height = h0 + 'px';
      parts().forEach(n => {
        if (!n.animate) return;
        n.getAnimations().forEach(a => a.cancel());
        n.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 18}px)` }],
          { duration: 140, easing: 'ease-in', fill: 'forwards' });
      });
      histSwapT = setTimeout(() => {
        if (my !== swapSeq) return;
        parts().forEach(n => n.getAnimations && n.getAnimations().forEach(a => a.cancel()));
        body.scrollTop = 0;
        body.classList.add('at-top');
        buildHistBody(body);
        growFrom(h0);
        parts().forEach(n => {
          if (!n.animate) return;
          n.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }],
            { duration: 320, easing: SWAP_EASE, fill: 'backwards' });
        });
      }, 140);
    }

    function copyIds(ids) {
      if (!ids.length) { toast('복사할 품번이 없습니다'); return; }
      copyText(ids.join(', ')).then(() => toast(ids.length + '개 품번 복사됨'));
    }

    function buildHistBody(body) {
      closeCardMenu(true);
      body.textContent = '';
      const head = panel.querySelector('.hhead');
      head.querySelectorAll('.hrow').forEach(n => n.remove());
      panel.querySelectorAll('.jfoot').forEach(n => n.remove());
      body.classList.toggle('jpad', histMode === 'saved');
      const r1 = el('div', 'row hrow');
      const search = el('input', 'field');
      if (histMode === 'saved') {
        search.placeholder = '일지 검색';
        search.value = filterText;
        search.addEventListener('input', () => { filterText = search.value.trim().toLowerCase(); renderItems(); });
        r1.append(search, btn('전체복사', 'fit', () => copyIds(saved.map(s => s.id))));
        const list = el('div', 'list');
        list.id = 'items';
        head.append(r1);
        body.append(list);

        // 일지 개수 · 정렬은 팝업 아래쪽에 떠 있게 둔다
        const foot = el('div', 'jfoot');
        const fr = el('div', 'jfr');
        const cnt = el('span', 'jn', '');
        cnt.id = 'jcount';
        const sort = segCtl([['date', '작성일순'], ['stars', '별점순']], settings.jSort === 'stars' ? 'stars' : 'date', k => {
          settings.jSort = k;
          saveSettings();
          body.scrollTop = 0;
          growRender(renderItems);
        }, 'sm');
        fr.append(cnt, sort);
        foot.append(fr);
        panel.append(foot);
        renderItems();
      } else {
        search.placeholder = '기록 검색 (품번)';
        search.value = histFilter;
        search.addEventListener('input', () => { histFilter = search.value.trim().toLowerCase(); renderHistItems(); });
        r1.append(search, btn('전체복사', 'fit', () => copyIds(watched.map(w => w.id))));
        const list = el('div', 'list');
        list.id = 'hitems';
        head.append(r1);
        body.append(list);
        renderHistItems();
      }
    }

    // 지운 일지를 되돌릴 수 있는 토스트
    function undoToast(item, idx) {
      toast('일지를 삭제했습니다', { label: '되돌리기', fn: () => {
        if (isSaved(item.id)) return;
        saved.splice(Math.max(0, Math.min(idx, saved.length)), 0, item);
        saveList();
        updateCounts();
        if (panelMode === 'hist' && histMode === 'saved') reflowList('#items', renderItems, item.id);
      } });
    }

    function renderItems() {
      const box = panel.querySelector('#items');
      if (!box) return;
      box.textContent = '';
      const f = filterText;
      const items = saved.filter(s => !f || s.id.includes(f) ||
        (s.alias || '').toLowerCase().includes(f) || (s.title || '').toLowerCase().includes(f));
      const cnt = panel.querySelector('#jcount');
      if (cnt) cnt.textContent = items.length === saved.length
        ? '일지 ' + saved.length + '개'
        : '일지 ' + items.length + ' / ' + saved.length + '개';
      const byStars = settings.jSort === 'stars';
      const lifeFirst = (a, b) => (b.life ? 1 : 0) - (a.life ? 1 : 0) ||
        (a.life && b.life ? (b.lifeTs || 0) - (a.lifeTs || 0) : 0);
      if (byStars) {
        items.sort((a, b) => lifeFirst(a, b) || (+b.stars || 0) - (+a.stars || 0) || (b.ts || 0) - (a.ts || 0));
      } else {
        items.sort((a, b) => lifeFirst(a, b) || (b.ts || 0) - (a.ts || 0));
      }
      if (!items.length) {
        box.appendChild(el('div', 'empty', saved.length ? '검색 결과가 없습니다' : '작성한 일지가 없습니다'));
        return;
      }
      const per = new Map();
      const grpOf = s => (s.life ? 'life' : (+s.stars || 0));
      if (byStars) items.forEach(s => { const k = grpOf(s); per.set(k, (per.get(k) || 0) + 1); });
      const folded = new Set((settings.jFold || []).map(String));
      let last = null;
      items.forEach(s => {
        const st = grpOf(s);
        if (byStars && st !== last) {
          last = st;
          const key = String(st);
          const isFold = folded.has(key);
          const d = el('div', 'sdiv' + (isFold ? ' fold' : ''));
          d.dataset.sk = key;
          d.title = isFold ? '눌러서 펼치기' : '눌러서 접기';
          const lb = el('span', 'sdl' + (st ? '' : ' none') + (st === 'life' ? ' life' : ''));
          if (st === 'life') { lb.appendChild(starsEl(5, true)); lb.appendChild(el('span', 'sdt', '인생작')); }
          else if (st) lb.appendChild(starsEl(st));
          else lb.textContent = '별점 없음';
          const chev = el('span', 'sdc');
          chev.innerHTML = SV('<path d="M6 9l6 6 6-6"/>');
          d.append(lb, el('span', 'sdn', per.get(st) + '개'), chev);
          // 접기·펼치기는 해당 별점 카드만 숨기거나 보이게 한다 (다른 카드는 다시 만들지 않으므로 썸네일도 다시 불러오지 않음)
          d.addEventListener('click', () => {
            const cur = new Set((settings.jFold || []).map(String));
            const nowFold = !cur.has(key);
            if (nowFold) cur.add(key); else cur.delete(key);
            settings.jFold = Array.from(cur);
            saveSettings();
            d.classList.toggle('fold', nowFold);
            d.title = nowFold ? '눌러서 펼치기' : '눌러서 접기';
            const rows = Array.from(box.querySelectorAll('.item[data-g="' + key + '"]'));
            const apply = () => {
              if (!box.isConnected) return;
              const first = snapRects(box);
              const h0 = panel.offsetHeight;
              rows.forEach(r => r.classList.toggle('jhide', nowFold));
              flipFrom(box, first, '');
              if (!nowFold) rows.forEach(r => r.animate && r.animate(
                [{ opacity: 0, transform: 'scale(.82)' }, { opacity: 1, transform: 'none' }],
                { duration: 320, easing: SWAP_EASE }));
              growFrom(h0);
            };
            if (nowFold && rows.length && rows[0].animate) {
              rows.forEach(r => {
                r.style.pointerEvents = 'none';
                r.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.82)' }],
                  { duration: 180, easing: 'ease-in', fill: 'forwards' });
              });
              setTimeout(() => {
                rows.forEach(r => { r.getAnimations().forEach(a => a.cancel()); r.style.pointerEvents = ''; });
                apply();
              }, 180);
            } else apply();
          });
          box.appendChild(d);
        }
        const row = el('div', 'item' + (s.life ? ' life' : ''));
        row.dataset.id = s.id;
        if (byStars) {
          row.dataset.g = String(st);
          if (folded.has(String(st))) row.classList.add('jhide');
        }
        const info = el('div', 'info');
        info.title = '클릭: 열기';
        const dt = el('div', 'dt');
        const day = new Date(s.ts).toLocaleDateString('ko-KR');
        if (s.life || s.stars) dt.appendChild(starsEl(s.stars, s.life));
        dt.appendChild(el('div', 'dd', day));
        info.append(el('div', 'ttl', s.alias || s.title || dates[s.id] || ''), el('div', 'pid', s.id), dt);
        const foot = el('div', 'foot');
        foot.append(info);
        const tb = thumbEl(s.id);
        info.addEventListener('click', () => goTo(s.id, tb));
        row.append(tb, foot);
        // 꾹 누르면 카드 아래에 인생작 · 복사 · 수정 · 삭제
        longPress(row, () => [
          { label: s.life ? '인생작 해제' : '인생작', icon: ICON.life, gold: true, fn: () => toggleLife(s.id) },
          { label: '복사', icon: ICON.copy, fn: () => copyText(s.id).then(() => toast('품번 복사됨')) },
          { label: '수정', icon: ICON.edit, fn: () => openBm(s.id, 'hist') },
          { label: '삭제', icon: ICON.del, danger: true, fn: () => removeCard(row, () => {
            const idx = saved.findIndex(x => x.id === s.id);
            const item = savedOf(s.id);
            removeSaved(s.id);
            updateCounts();
            renderItems();
            if (item) undoToast(item, idx);
          }) }
        ]);
        box.appendChild(row);
      });
    }

    function toggleLife(id) {
      const it = savedOf(id);
      if (!it) return;
      it.life = !it.life;
      it.lifeTs = it.life ? Date.now() : 0;
      saveList();
      const body = panel.querySelector('.hbody');
      reflowList('#items', renderItems);
      if (it.life) {
        const row = panel.querySelector('#items .item[data-id="' + id + '"]');
        const six = row && row.querySelector('.st .six');
        if (six) six.classList.add('pop');
        if (row && row.animate) row.animate([
          { boxShadow: 'inset 0 0 0 1.5px rgba(255, 213, 74, 0), 0 0 0 rgba(255, 190, 90, 0)' },
          { boxShadow: 'inset 0 0 0 1.5px rgba(255, 213, 74, .9), 0 0 26px rgba(255, 190, 90, .55)', offset: .45 },
          { boxShadow: 'inset 0 0 0 1.5px rgba(255, 213, 74, .55), 0 0 0 rgba(255, 190, 90, 0)' }
        ], { duration: 1100, easing: 'ease-out' });
        if (body) body.scrollTo({ top: 0, behavior: 'smooth' });
        toast('인생작으로 올렸어요');
      } else toast('인생작에서 내렸어요');
    }

    // 카드(data-id)와 별점 구분선(data-sk)을 같은 열쇠로 묶어, 다시 그린 뒤에도 원래 자리에서 미끄러지게 한다
    const flipKey = c => (c && c.dataset) ? (c.dataset.id || (c.dataset.sk != null ? 's' + c.dataset.sk : '')) : '';
    function snapRects(box, skip) {
      const m = new Map();
      Array.from(box.children).forEach(c => {
        if (c === skip || c.classList.contains('jhide')) return;
        const k = flipKey(c);
        if (k) m.set(k, c.getBoundingClientRect());
      });
      return m;
    }
    function flipFrom(box, first, newId) {
      Array.from(box.children).forEach(c => {
        if (!c.animate) return;
        const k = flipKey(c);
        const f = k && first.get(k);
        if (!f) {
          if (k && (newId == null || c.dataset.id === newId || c.dataset.sk != null)) {
            c.animate([{ opacity: 0, transform: 'scale(.82)' }, { opacity: 1, transform: 'none' }],
              { duration: 340, easing: SWAP_EASE });
          }
          return;
        }
        const l = c.getBoundingClientRect();
        const dx = f.left - l.left, dy = f.top - l.top;
        if (dx || dy) c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
          { duration: 420, easing: SWAP_EASE });
      });
    }

    // 목록을 다시 그리면서, 기존 카드는 원래 자리에서 미끄러지고 되돌린 카드는 커지며 나타나게 한다
    function reflowList(sel, render, newId) {
      const box = panel.querySelector(sel);
      if (!box) return;
      const first = snapRects(box);
      render();
      flipFrom(panel.querySelector(sel) || box, first, newId);
    }

    // ----- 카드 꾹 누르기 메뉴 -----
    let cmenu = null;
    let lpJust = false;
    function closeCardMenu(instant) {
      const m = cmenu;
      cmenu = null;
      if (!m) return;
      m.row.classList.remove('menu-on');
      panel.classList.remove('lpfocus');
      root.classList.remove('dim');
      if (instant || !m.el.animate) { m.el.remove(); return; }
      const a = m.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-4px) scale(.9)' }],
        { duration: 150, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = () => m.el.remove();
    }
    function openCardMenu(row, acts) {
      closeCardMenu(true);
      const m = el('div', 'cmenu');
      acts.forEach(a => {
        const b = el('button', 'cmb' + (a.danger ? ' danger' : '') + (a.gold ? ' gold' : ''));
        b.type = 'button';
        b.innerHTML = a.icon;
        b.appendChild(el('span', '', a.label));
        b.addEventListener('click', e => { e.stopPropagation(); closeCardMenu(); a.fn(); });
        m.appendChild(b);
      });
      row.classList.add('menu-on');
      panel.classList.add('lpfocus');
      root.classList.add('dim');
      // 메뉴는 목록 밖(팝업 맨 위 층)에 띄운다. 목록 안에 두면 위아래 막대에 가려질 수 있다
      const body = row.closest('.hbody');
      const ft = panel.querySelector('.jfoot');
      const hd = panel.querySelector('.hhead');
      m.style.top = '0px';
      m.style.left = '0px';
      panel.appendChild(m);
      const mw = m.offsetWidth, mh = m.offsetHeight;
      const pr = panel.getBoundingClientRect();
      const topLimit = (hd ? hd.getBoundingClientRect().bottom : pr.top) + 4;
      const botLimit = (ft ? ft.getBoundingClientRect().top : pr.bottom) - 6;
      let rr = row.getBoundingClientRect();
      // 아래에 자리가 모자라면 먼저 목록을 올려 본다
      if (rr.bottom + 6 + mh > botLimit && body) {
        const need = rr.bottom + 6 + mh - botLimit;
        const room = body.scrollHeight - body.clientHeight - body.scrollTop;
        if (room > 0) { body.scrollTop += Math.min(need, room); rr = row.getBoundingClientRect(); }
      }
      let y, below = true;
      if (rr.bottom + 6 + mh <= botLimit) y = rr.bottom + 6;
      else if (rr.top - 6 - mh >= topLimit) { y = rr.top - 6 - mh; below = false; }
      else { y = Math.max(topLimit, Math.min(botLimit - mh, rr.bottom - mh - 8)); below = false; }
      let x = rr.left + rr.width / 2 - mw / 2;
      x = Math.max(pr.left + 8, Math.min(pr.right - 8 - mw, x));
      m.style.left = (x - pr.left) + 'px';
      m.style.top = (y - pr.top) + 'px';
      m.style.transformOrigin = (rr.left + rr.width / 2 - x) + 'px ' + (below ? '0' : '100%');
      cmenu = { el: m, row, at: performance.now() };
      if (m.animate) m.animate([{ opacity: 0, transform: `translateY(${below ? -6 : 6}px) scale(.8)` }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: SWAP_EASE });
    }
    function longPress(row, getActs) {
      let t = 0, x0 = 0, y0 = 0, fx = null;
      const cancel = () => {
        clearTimeout(t);
        if (fx) { fx.release(); fx = null; }
      };
      row.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest && e.target.closest('.cmenu')) return;
        x0 = e.clientX;
        y0 = e.clientY;
        clearTimeout(t);
        if (fx) fx.release();
        fx = pressFx(row);
        t = setTimeout(() => {
          if (fx) { fx.pop(); fx = null; }
          lpJust = true;
          try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) {}
          openCardMenu(row, getActs());
        }, 420);
      });
      row.addEventListener('pointermove', e => {
        if (Math.abs(e.clientX - x0) > 8 || Math.abs(e.clientY - y0) > 8) cancel();
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => row.addEventListener(ev, cancel));
      row.addEventListener('contextmenu', e => e.preventDefault());
    }
    // 꾹 누른 뒤 손을 뗄 때 생기는 클릭은 무시하고, 메뉴가 떠 있을 때 다른 곳을 누르면 메뉴만 닫는다
    // 새로 손가락을 대면 '꾹 누른 직후' 표시를 지운다 (메뉴 버튼을 누를 때도) → 메뉴 버튼이 한 번에 눌린다
    panel.addEventListener('pointerdown', () => { lpJust = false; }, true);
    panel.addEventListener('click', e => {
      if (lpJust) { lpJust = false; e.preventDefault(); e.stopPropagation(); return; }
      if (!cmenu) return;
      if (e.composedPath().includes(cmenu.el)) return;
      e.preventDefault();
      e.stopPropagation();
      closeCardMenu();
    }, true);
    // 메뉴를 보여 주려고 목록을 올리는 동안의 스크롤은 무시하고, 사용자가 스크롤할 때만 닫는다
    panel.addEventListener('scroll', () => { if (cmenu && performance.now() - cmenu.at > 700) closeCardMenu(); }, true);

    // 카드를 줄이며 지운 뒤, 나머지 카드는 원래 자리에서 새 자리로 미끄러지게 옮긴다
    function removeCard(row, apply) {
      const box = row.parentElement;
      if (!box) { apply(); return; }
      const sel = box.id ? '#' + box.id : null;
      const first = snapRects(box, row);
      const finish = () => {
        const h0 = panel.offsetHeight;
        row.remove();
        apply();
        flipFrom((sel && panel.querySelector(sel)) || box, first, '');
        if (!panel.classList.contains('hist')) growFrom(h0);
      };
      if (!row.animate) { finish(); return; }
      row.style.pointerEvents = 'none';
      const a = row.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.82)' }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' });
      a.onfinish = finish;
    }

    function renderHistItems() {
      const box = panel.querySelector('#hitems');
      if (!box) return;
      box.textContent = '';
      const items = watched.filter(w => !histFilter || w.id.includes(histFilter));
      if (!items.length) {
        box.appendChild(el('div', 'empty', watched.length ? '검색 결과가 없습니다' : '감상 기록이 없습니다'));
        return;
      }
      items.forEach(w => {
        const row = el('div', 'item');
        row.dataset.id = w.id;
        const info = el('div', 'info');
        info.title = '클릭: 열기';
        info.append(
          el('div', 'id', w.id),
          el('div', 'dt', new Date(w.ts).toLocaleString('ko-KR',
            { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
        );
        const tb = thumbEl(w.id);
        info.addEventListener('click', () => goTo(w.id, tb));
        const foot = el('div', 'foot');
        foot.append(info);
        row.append(tb, foot);
        // 꾹 누르면 카드 아래에 복사 · 일지(수정) · 삭제
        longPress(row, () => [
          { label: '복사', icon: ICON.copy, fn: () => copyText(w.id).then(() => toast('품번 복사됨')) },
          { label: isSaved(w.id) ? '수정' : '일지', icon: ICON.edit, fn: () => openBm(w.id, 'hist') },
          { label: '삭제', icon: ICON.del, danger: true, fn: () => removeCard(row, () => {
            const idx = watched.findIndex(x => x.id === w.id);
            const item = idx >= 0 ? watched[idx] : null;
            watched = watched.filter(x => x.id !== w.id);
            saveWatched();
            if (!watched.length) renderHistItems();
            if (!item) return;
            toast('기록을 삭제했습니다', { label: '되돌리기', fn: () => {
              if (watched.some(x => x.id === item.id)) return;
              watched.splice(Math.max(0, Math.min(idx, watched.length)), 0, item);
              saveWatched();
              if (panelMode === 'hist' && histMode === 'recent') reflowList('#hitems', renderHistItems, item.id);
            } });
          }) }
        ]);
        box.appendChild(row);
      });
    }

    function openBm(id, back, stars) {
      if (!id) return;
      bmStars = stars != null ? stars : null;
      if (panelMode === 'bm') {
        const same = bmId === id;
        bmId = id;
        if (same) renderBm();
        else growRender(renderBm);
        return;
      }
      bmId = id;
      bmBack = back || panelMode || null;
      setPanel('bm');
    }

    function backFromBm() {
      const to = bmBack;
      bmId = null;
      bmBack = null;
      bmSetStars = null;
      updateCounts();
      setPanel(to || null, !to);
    }

    function renderBm() {
      panel.textContent = '';
      const it = savedOf(bmId);
      const isCur = bmId === curId;
      let pageT = '';
      if (!it && isCur) {
        pageT = getPageTitle();
        if (/^hitomi/i.test(pageT)) pageT = '';
        if (pageT && settings.koreanTitle) pageT = koreanTitle(pageT);
      }
      const title = (it && it.title) || pageT || dates[bmId] || '';
      const fromPill = bmStars != null;
      let stars = fromPill ? bmStars : ((it && it.stars) || 0);
      bmStars = null;

      panel.appendChild(el('div', 'lbl', it ? '일지 수정' : '별명을 정해 일지에 남기기'));
      panel.appendChild(el('div', 'bmt', bmId + (title ? '  ·  ' + title : '')));

      const r1 = el('div', 'row');
      r1.style.marginTop = '8px';
      const inp = el('input', 'field');
      inp.type = 'text';
      inp.maxLength = 90;
      inp.value = (it && it.alias) || '';
      inp.placeholder = title ? title.slice(0, 36) : '별명 (비우면 제목 그대로)';
      inp.title = '별명을 비우면 작품 제목이 표시됩니다';
      r1.appendChild(inp);
      panel.appendChild(r1);

      panel.appendChild(el('div', 'lbl', '별점'));
      const row = el('div', 'stars');
      const paint = () => {
        Array.from(row.children).forEach((b, i) => b.classList.toggle('on', i < stars));
        row.title = stars ? stars + '점' : '별점 없음 (눌러서 매기기)';
        if (isCur) paintPill(stars);
      };
      for (let i = 1; i <= 5; i++) {
        const b = el('button', 'starb');
        b.innerHTML = starSvg(false);
        b.type = 'button';
        b.addEventListener('click', () => { stars = (stars === i ? 0 : i); paint(); });
        row.appendChild(b);
      }
      paint();
      panel.appendChild(row);
      // 하단 알약의 별을 다시 눌러도 이 창의 별점이 바뀐다
      bmSetStars = isCur ? (n => { stars = (stars === n ? 0 : n); paint(); }) : null;

      const save = () => {
        const alias = inp.value.trim();
        const arts = isCur ? pageArtists(bmId) : null;
        const was = isSaved(bmId);
        if (was) updateSaved(bmId, alias, stars, arts);
        else addSaved(bmId, title, alias, stars, arts);
        updateCounts();
        toast(was ? '일지 수정됨' : (alias ? '일지 작성: ' + alias : '일지에 기록했습니다'));
        backFromBm();
      };
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
      });

      const r2 = el('div', 'row');
      r2.style.marginTop = '10px';
      r2.append(btn('저장', 'primary', save), btn('취소', 'sm', backFromBm));
      if (isSaved(bmId)) {
        r2.appendChild(btn('삭제', 'sm', () => {
          const idx = saved.findIndex(x => x.id === bmId);
          const item = savedOf(bmId);
          removeSaved(bmId);
          updateCounts();
          backFromBm();
          if (item) undoToast(item, idx);
        }));
      }
      panel.appendChild(r2);
      panel.appendChild(el('div', 'hint', '별명을 적으면 제목 대신 그 별명이 보입니다. 저장하면 일지에 남습니다.'));
    }

    function importList() {
      const text = window.prompt('JSON 또는 품번 목록(공백/줄바꿈/쉼표 구분)을 붙여넣으세요:');
      if (!text) return;
      let added = 0;
      let arr = null;
      try { arr = JSON.parse(text); } catch (e) {}
      if (Array.isArray(arr)) {
        arr.forEach(o => {
          const id = String(o && o.id ? o.id : o).replace(/\D/g, '');
          if (id && !isSaved(id)) {
            saved.push({
              id, title: (o && o.title) || '', alias: (o && o.alias) || '',
              life: !!(o && o.life), lifeTs: (o && o.lifeTs) || 0,
              stars: Math.max(0, Math.min(5, Math.round(+(o && o.stars) || 0))),
              arts: Array.isArray(o && o.arts) ? o.arts.slice(0, 16) : [],
              ts: (o && o.ts) || Date.now()
            });
            added++;
          }
        });
      } else {
        (text.match(/\d{4,}/g) || []).forEach(id => {
          if (!isSaved(id)) { saved.push({ id, title: '', ts: Date.now() }); added++; }
        });
      }
      saveList();
      updateCounts();
      renderItems();
      toast(`${added}개 추가됨`);
    }

    function renderSort() {
      panel.textContent = '';
      panel.appendChild(el('div', 'lbl', '정렬'));
      const list = el('div', 'slist');
      const cur = currentSort();
      SORTS.forEach(([key, url]) => {
        const b = el('button', 'srow' + (key === cur ? ' on' : ''), SORT_KR[key] || key);
        b.type = 'button';
        b.addEventListener('click', () => { location.href = url; });
        list.appendChild(b);
      });
      panel.appendChild(list);
    }

    function renderSettings() {
      panel.textContent = '';

      panel.appendChild(el('div', 'lbl', '기능'));
      const grid = el('div', 'tgrid');
      [
        ['preload', 'Pre Load'],
        ['koreanOnly', 'Only Korean'],
        ['infinite', 'Unlimited scroll'],
        ['blockOn', 'Block']
      ].forEach(([key, label]) => {
        const t = el('div', 'tog' + (key in pendingSet ? (pendingSet[key] ? ' on' : '') : (settings[key] ? ' on' : '')), label);
        t.setAttribute('role', 'switch');
        t.dataset.k = key;
        t.addEventListener('click', () => {
          if (['koreanOnly', 'infinite'].includes(key)) {
            // 토글은 바로 바뀌고, 저장된 값과 달라지면 위에 "새로고침할까요?" 팝업이 뜬다
            const next = !t.classList.contains('on');
            t.classList.toggle('on', next);
            if (next === !!settings[key]) delete pendingSet[key];
            else pendingSet[key] = next;
            if (Object.keys(pendingSet).length) showAsk();
            else hideAsk();
            return;
          }
          settings[key] = !settings[key];
          saveSettings();
          t.classList.toggle('on', !!settings[key]);
          if (key === 'blockOn') { applyBlocks(); mergeDuplicates(); }
          if (key === 'preload' && settings.preload) {
            if (IS_READER) initReaderPreload();
            else warmPages();
          }
        });
        grid.appendChild(t);
      });
      panel.appendChild(grid);

      panel.appendChild(el('div', 'lbl', '차단'));
      const kr = el('div', 'row');
      kr.appendChild(btn('차단 목록 (' + (blocks.artists.length + blocks.works.length) + ')', '', () => setPanel('block')));
      panel.appendChild(kr);

      // 일지 내보내기 · 가져오기와 ? 를 한 줄에
      panel.appendChild(el('div', 'lbl', '일지 (' + saved.length + ')'));
      const br = el('div', 'row');
      const hb = el('button', 'helpfab', '?');
      hb.type = 'button';
      hb.title = '기능 설명';
      hb.setAttribute('aria-label', '기능 설명');
      hb.style.marginLeft = 'auto';
      hb.addEventListener('click', () => setPanel('help'));
      br.append(
        btn('내보내기', '', () => copyText(JSON.stringify(saved)).then(() => toast('클립보드에 복사했습니다'))),
        btn('가져오기', '', importList),
        hb
      );
      panel.appendChild(br);
    }

    // ----- 새로고침이 필요한 설정 확인 팝업 -----
    const pendingSet = {};
    function hideAsk() {
      const a = $('#ask');
      if (a && a.classList.contains('open')) popClose(a, null);
    }
    function revertPending() {
      Object.keys(pendingSet).forEach(k => {
        const t = panel.querySelector('.tog[data-k="' + k + '"]');
        if (t) t.classList.toggle('on', !!settings[k]);
        delete pendingSet[k];
      });
      hideAsk();
    }
    function showAsk() {
      const a = $('#ask');
      if (!a) return;
      if (a.classList.contains('open') && !a.classList.contains('out')) return;
      a.textContent = '';
      a.appendChild(el('span', 'amsg', '새로고침해서 적용할까요?'));
      const no = el('button', 'abtn', '취소');
      const yes = el('button', 'abtn yes', '새로고침');
      no.type = yes.type = 'button';
      no.addEventListener('click', e => { e.stopPropagation(); revertPending(); });
      yes.addEventListener('click', e => {
        e.stopPropagation();
        Object.assign(settings, pendingSet);
        saveSettings();
        location.reload();
      });
      a.append(no, yes);
      popOpen(a, null);
    }

    let helpTab = 'list';
    const HI = {
      tap: SV('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8" opacity=".45"/>'),
      hold: SV('<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>'),
      swipe: SV('<path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>'),
      pinch: SV('<path d="M4 4l6 6M20 20l-6-6M4 4v5M4 4h5M20 20v-5M20 20h-5"/>'),
      star: SV('<path d="' + STAR_D + '"/>'),
      block: SV('<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>'),
      grid: SV('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
      undo: SV('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
      frame: SV('<rect x="5" y="3" width="14" height="18" rx="3"/>'),
      down: SV('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
      globe: SV('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
      inf: SV('<path d="M7 9a3 3 0 1 0 0 6c3 0 7-6 10-6a3 3 0 1 1 0 6c-3 0-7-6-10-6z"/>'),
      H: '<b>H</b>'
    };
    const HELP = {
      list: [
        [HI.tap, '이미지 누르기', '작품이 커지면서 1페이지로 열려요.'],
        [ICON.info, '제목 누르기', '태그와 작가를 바로 보여 줘요.'],
        [HI.block, '꾹 누르기', '이 작품이나 작가를 차단해요.'],
        [HI.frame, '테두리 색', '흰색은 1페이지 준비 끝, 파란색은 이미 본 작품이에요.'],
        [HI.grid, '×N 뱃지', '제목이 같은 작품 묶음이에요. 눌러서 펼쳐요.'],
        [ICON.sort, '정렬', '하단 알약 왼쪽의 버튼으로 최신 · 인기 순을 바꿔요.']
      ],
      reader: [
        [HI.tap, '화면 누르기', '왼쪽 절반은 다음, 오른쪽 절반은 이전 페이지예요.'],
        [HI.swipe, '끌기', '손가락을 따라오고, 조금만 밀어도 넘어가요. 키보드 ← → 도 돼요.'],
        [HI.pinch, '두 손가락', '확대하고 이동해요. ↺ 버튼을 누르면 원래 크기로 돌아와요.'],
        [HI.grid, '1 / N', '미리 받은 페이지를 보고 바로 그 페이지로 가요.'],
        [HI.star, '별 5개', '별점을 누르고 별명을 정하면 일지에 남아요.'],
        [HI.H, 'H', '히토미 홈이나 작품을 열기 직전 화면으로 돌아가요.']
      ],
      journal: [
        [ICON.hist, '기록 · 일지', '본 작품은 기록에, 별점 매긴 작품은 일지에 모여요.'],
        [HI.hold, '카드 꾹 누르기', '인생작 · 복사 · 수정 · 삭제 메뉴가 떠요. 인생작은 별이 6개가 되고 항상 맨 위에 있어요.'],
        [ICON.sort, '정렬', '작성일순 · 별점순. 별점순에서는 구분선을 눌러 접어요.'],
        [HI.undo, '되돌리기', '지운 건 아래 알림의 되돌리기로 살려요.']
      ],
      set: [
        [HI.down, 'Pre Load', '지금 페이지 앞뒤 10장과 목록의 1페이지를 미리 받아 둬요.'],
        [HI.globe, 'Only Korean', '한국어 작품만 보여요. 바꾸면 새로고침해서 적용해요.'],
        [HI.inf, 'Unlimited scroll', '목록을 끝없이 이어 붙여요.'],
        [HI.block, 'Block', '차단한 작품 · 작가를 숨겨요. 차단 목록에서 풀 수 있어요.'],
        [ICON.copy, '내보내기 · 가져오기', '일지를 복사해 두거나 다시 불러와요.']
      ]
    };

    function paintHelp(box) {
      box.textContent = '';
      (HELP[helpTab] || []).forEach(([ic, t, d]) => {
        const c = el('div', 'hcard');
        const i = el('div', 'hic');
        i.innerHTML = ic;
        const tx = el('div', 'htx');
        tx.append(el('div', 'hct', t), el('div', 'hcd', d));
        c.append(i, tx);
        box.appendChild(c);
      });
    }

    // 지금 카드 묶음이 옆으로 빠지며 흐려지고, 새 묶음이 반대쪽에서 들어온다 (팝업 높이도 함께)
    let helpSwapT = 0;
    function swapHelp(box, dir) {
      const my = ++swapSeq;
      clearTimeout(swapT);
      clearTimeout(helpSwapT);
      const h0 = panel.offsetHeight;
      panel.style.overflow = 'hidden';
      panel.style.height = h0 + 'px';
      box.getAnimations().forEach(a => a.cancel());
      if (box.animate) box.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: `translateX(${-dir * 18}px)` }],
        { duration: 140, easing: 'ease-in', fill: 'forwards' });
      helpSwapT = setTimeout(() => {
        if (my !== swapSeq) return;
        box.getAnimations().forEach(a => a.cancel());
        paintHelp(box);
        growFrom(h0);
        if (box.animate) box.animate([{ opacity: 0, transform: `translateX(${dir * 18}px)` }, { opacity: 1, transform: 'none' }],
          { duration: 320, easing: SWAP_EASE, fill: 'backwards' });
      }, 140);
    }

    function renderHelp() {
      panel.textContent = '';
      const top = el('div', 'hhd');
      const back = el('button', 'btn hback', '←');
      back.type = 'button';
      back.title = '설정으로';
      back.addEventListener('click', () => setPanel('set'));
      const box = el('div', 'hcards');
      const order = ['list', 'reader', 'journal', 'set'];
      const seg = segCtl([['list', '목록'], ['reader', '리더'], ['journal', '일지'], ['set', '설정']], helpTab, k => {
        const dir = order.indexOf(k) > order.indexOf(helpTab) ? 1 : -1;
        helpTab = k;
        swapHelp(box, dir);
      }, 'sm hseg');
      top.append(back, seg);
      panel.append(top, box);
      paintHelp(box);
    }

    let pvTimer = 0, pvSig = '';

    // 지금 보고 있는 페이지는 미리 받기 목록에 없어도 화면에 떠 있는 이미지로 보여 준다
    function pvCurSrc() {
      if (curLayer && shown && shown.src) return shown.src;
      const im = findReaderImg();
      return im && im.complete && im.naturalWidth ? (im.currentSrc || im.src) : '';
    }

    function pvKey() {
      return [
        pvCurSrc(),
        preSmall.size,
        fxPage(),
        fxTotal(),
        Array.from(preDone).sort((a, b) => a - b).join(','),
        Array.from(preBusy.keys()).sort((a, b) => a - b).join(',')
      ].join('|');
    }

    function pvCell(idx) {
      const c = el('div', 'pvc');
      c.appendChild(el('span', 'pvn', String(idx + 1)));
      c.addEventListener('click', () => {
        setPanel(null, true);
        if (idx + 1 !== fxPage()) turnTo(idx + 1);
      });
      return c;
    }

    function pvPaint() {
      const head = panel.querySelector('#pvHead');
      const grid = panel.querySelector('#pvGrid');
      if (!head || !grid) return false;
      const key = pvKey();
      if (key === pvSig) return true;
      pvSig = key;

      const total = fxTotal();
      const cur = fxPage();
      head.textContent = '미리 받아 둔 페이지 ' + preDone.size + ' / ' + total + '  (현재 ' + cur + 'p)';

      if (grid.children.length !== total) {
        grid.textContent = '';
        for (let i = 0; i < total; i++) grid.appendChild(pvCell(i));
      }
      let budget = 4;
      for (let i = 0; i < total; i++) {
        const c = grid.children[i];
        const isCur = i + 1 === cur;
        let cv = preSmall.get(i) || null;
        if (!cv && budget > 0 && preImg.has(i)) {
          budget--;
          cv = smallCanvas(preImg.get(i));
          if (cv) preSmall.set(i, cv);
        }
        const u = cv ? '' : (isCur ? pvCurSrc() : '');
        const lab = (cv || u) ? '' : (preBusy.has(i) ? '받는 중' : (preImg.has(i) ? '준비 중' : '대기'));
        const k = (cv ? 'c' : u) + '|' + lab + '|' + isCur + '|' + preDone.has(i);
        if (c._k === k && (!cv || cv.parentNode === c)) continue;
        c._k = k;
        c.classList.toggle('ok', !!(preDone.has(i) || cv || u));
        c.classList.toggle('cur', isCur);
        const old = c.querySelector('img, canvas, .pvw');
        let node;
        if (cv) node = cv;
        else if (u) {
          node = old && old.tagName === 'IMG' ? old : document.createElement('img');
          node.alt = '';
          if (node.getAttribute('src') !== u) node.src = u;
        } else {
          node = old && old.classList && old.classList.contains('pvw') ? old : el('span', 'pvw');
          node.textContent = lab;
        }
        if (old !== node) {
          if (old) old.remove();
          c.insertBefore(node, c.firstChild);
        }
      }
      if (budget === 0) pvSig = '';
      return true;
    }

    function renderPreview() {
      panel.textContent = '';
      const head = el('div', 'lbl');
      head.id = 'pvHead';
      const grid = el('div', 'pvgrid');
      grid.id = 'pvGrid';
      const row = el('div', 'row');
      row.style.marginTop = '10px';
      row.append(btn('새로고침', 'sm', () => { pvSig = ''; pvPaint(); }));
      panel.append(head, grid, row);

      pvSig = '';
      pvPaint();
      // 처음 열 때 지금 보는 페이지가 가운데 오게 한다
      requestAnimationFrame(() => {
        const curCell = grid.querySelector('.pvc.cur');
        if (curCell && panelMode === 'preview') panel.scrollTop = Math.max(0, curCell.offsetTop - panel.offsetTop - panel.clientHeight / 2 + curCell.offsetHeight / 2);
      });

      clearInterval(pvTimer);
      pvTimer = setInterval(() => {
        if (panelMode !== 'preview' || !pvPaint()) {
          clearInterval(pvTimer);
          pvTimer = 0;
        }
      }, 250);
    }

    function renderHomeChoice() {
      panel.textContent = '';
      panel.appendChild(el('div', 'lbl', '어디로 갈까요?'));
      const list = el('div', 'slist');

      const siteB = el('button', 'srow', '히토미 홈 (hitomi.la)');
      siteB.type = 'button';
      siteB.addEventListener('click', goSite);
      list.appendChild(siteB);

      let from = null;
      try { from = sessionStorage.getItem('hk_from'); } catch (e) {}
      if (from) {
        const backB = el('button', 'srow', '작품 누르기 직전 화면');
        backB.type = 'button';
        backB.addEventListener('click', goBackToList);
        list.appendChild(backB);
      }
      panel.appendChild(list);
      if (!from) panel.appendChild(el('div', 'hint', '저장된 직전 화면이 없어 홈으로만 갈 수 있습니다.'));
    }

    const btnFor = {
      search: '#searchBtn', hist: '#histBtn', set: '#setBtn',
      info: '#infoBtn', sort: '#filt', bm: '#pstars', preview: '#pg', home: '#homeBtn', help: '#setBtn', block: '#setBtn'
    };
    // ⋯ 상세정보: 팝업을 작품 카드 안에 붙여서, 스크롤해도 카드와 한 몸처럼 움직이게 한다
    let metaCard = null, meta = null;
    const metaOpen = () => !!meta;
    window.__hkMetaOpen = metaOpen;
    let metaSheet = null;
    try { metaSheet = new CSSStyleSheet(); metaSheet.replaceSync(PANEL_CSS); } catch (e) { metaSheet = null; }

    // 꾹 눌러 띄운 팝업: 그 카드와 팝업만 또렷하고 나머지(목록 · 하단 버튼)는 흐려진다. 흐린 곳을 누르면 닫힌다
    let dimEl = null;
    function dimOn(card) {
      const gc = card.parentElement;
      if (!gc) return;
      if (!dimEl) dimEl = document.createElement('hk-dim');
      dimEl.classList.remove('hk-stray');
      gc.appendChild(dimEl);
      void dimEl.offsetWidth;
      dimEl.classList.add('on');
      card.classList.add('hk-lpfocus');
      root.classList.add('dim');
    }
    function dimOff(card) {
      root.classList.remove('dim');
      if (dimEl) {
        const d = dimEl;
        d.classList.remove('on');
        setTimeout(() => { if (!d.classList.contains('on')) d.remove(); }, 260);
      }
      if (card) setTimeout(() => { if (!(meta && meta.card === card && meta.kind === 'block')) card.classList.remove('hk-lpfocus'); }, 260);
    }

    function closeMeta(instant) {
      const m = meta;
      meta = null;
      if (!m) return;
      if (m.kind === 'block') dimOff(m.card);
      const done = () => {
        try { m.host.remove(); } catch (e) {}
        if (!(meta && meta.card === m.card)) m.card.classList.remove('hk-metaon');
      };
      if (instant) { done(); return; }
      popClose(m.pop, null, done);
    }

    // 여는 순간 한 번만 자리를 정한다 (아래 공간이 모자라면 위로). 그 뒤로는 카드와 같이 스크롤된다
    function placeMeta(m) {
      const r = m.card.getBoundingClientRect();
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = Math.min(Math.max(r.width + 40, 280), vw - 24);
      m.pop.style.width = w + 'px';
      const left = Math.max(12, Math.min(vw - w - 12, r.left + r.width / 2 - w / 2));
      const h = m.pop.offsetHeight;
      const below = vh - r.bottom - 12, above = r.top - 12;
      const down = below >= h + 10 || below >= above;
      m.pop.style.left = (left - r.left) + 'px';
      m.pop.style.top = (down ? r.height + 10 : -10 - h) + 'px';
      m.pop.style.transformOrigin = (r.left + r.width / 2 - left) + 'px ' + (down ? '0' : '100%');
    }
    window.addEventListener('resize', () => { if (meta) placeMeta(meta); });

    openCardMeta = (o, hostEl, kind) => {
      kind = kind || 'meta';
      if (meta && metaCard && metaCard.id === o.id && meta.kind === kind) { closeMeta(); return; }
      // 다른 카드의 ⋯ 를 누르면 기존 팝업은 바로 치우고 새 팝업을 띄운다
      if (meta) closeMeta(true);
      if (panelMode) setPanel(null, true);
      const card = hostEl && hostEl.parentElement;
      if (!card) return;
      metaCard = o;
      const h = document.createElement('div');
      h.className = 'hk-meta-host';
      h.style.cssText = 'all:initial!important;position:absolute!important;left:0!important;top:0!important;' +
        'width:0!important;height:0!important;z-index:40!important;display:block!important;';
      const s = h.attachShadow({ mode: 'open' });
      if (metaSheet) s.adoptedStyleSheets = [metaSheet];
      else { const st = document.createElement('style'); st.textContent = PANEL_CSS; s.appendChild(st); }
      const mroot = document.createElement('div');
      mroot.className = 'root';
      const pop = document.createElement('div');
      pop.className = 'cpop panel pill';
      mroot.appendChild(pop);
      s.appendChild(mroot);
      card.classList.add('hk-metaon');
      card.appendChild(h);
      meta = { host: h, pop, card, kind };
      if (kind === 'block') dimOn(card);
      if (kind === 'block') renderBlockPop(pop, o);
      else renderMeta(pop);
      pop.classList.add('open');
      placeMeta(meta);
      popOpen(pop, null);
    };

    document.addEventListener('click', e => {
      if (!meta) return;
      const path = e.composedPath();
      if (path.includes(meta.pop)) return;
      if (path.some(n => n && n.classList && (n.classList.contains('dots') ||
        (n.classList.contains('info') && n.getRootNode && n.getRootNode().host && n.getRootNode().host.classList.contains('hk-card-host'))))) return;
      if (path.includes(host)) { closeMeta(); return; }
      e.preventDefault();
      e.stopImmediatePropagation();
      closeMeta();
    }, true);

    // 꾹 누르기 팝업: 이 작품 · 작가 · 그룹 차단
    function renderBlockPop(box, o) {
      box.textContent = '';
      box.scrollTop = 0;
      const m = o.meta || { artists: [], groups: [] };
      box.appendChild(el('div', 'ttl', settings.koreanTitle ? koreanTitle(o.title || '') : (o.title || '')));
      box.appendChild(el('div', 'lbl', '차단'));
      const list = el('div', 'bkl');
      const mk = (label, sub, fn) => {
        const b = el('button', 'bkb');
        b.type = 'button';
        b.append(el('span', 'bkt', label), el('span', 'bks', sub || ''));
        b.addEventListener('click', e => { e.stopPropagation(); fn(); });
        list.appendChild(b);
      };
      mk('이 작품 차단', 'No. ' + o.id, () => blockThing({ type: 'work', id: o.id, title: o.title }));
      (m.artists || []).forEach(a => mk('작가 차단', a, () => blockThing({ type: 'artist', name: a })));
      (m.groups || []).forEach(g => mk('그룹 차단', g, () => blockThing({ type: 'artist', name: g })));
      box.appendChild(list);
      if (settings.blockOn === false) box.appendChild(el('div', 'hint', '지금은 설정의 Block 이 꺼져 있어서 차단해도 숨겨지지 않아요.'));
    }

    function hideBlockedAnimated() {
      const cards = Array.from(document.querySelectorAll('.gallery-content > div[data-hk-done]:not(.hk-blocked)')).filter(isBlockedCard);
      const done = () => { applyBlocks(); mergeDuplicates(); };
      if (!cards.length) { done(); return; }
      cards.forEach(c => c.animate && c.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.85)' }],
        { duration: 240, easing: 'ease-in', fill: 'forwards' }));
      setTimeout(() => {
        cards.forEach(c => c.getAnimations && c.getAnimations().forEach(a => a.cancel()));
        done();
      }, 240);
    }

    function blockThing(x) {
      closeMeta();
      let undo;
      if (x.type === 'work') {
        if (!blocks.works.some(w => w.id === x.id)) blocks.works.push({ id: x.id, title: x.title || '' });
        undo = () => { blocks.works = blocks.works.filter(w => w.id !== x.id); };
      } else {
        const n = normArtName(x.name);
        if (blocks.artists.indexOf(n) < 0) blocks.artists.push(n);
        undo = () => { blocks.artists = blocks.artists.filter(a => a !== n); };
      }
      saveBlocks();
      hideBlockedAnimated();
      toast(x.type === 'work' ? '작품을 차단했습니다' : x.name + ' 차단', { label: '되돌리기', fn: () => {
        undo();
        saveBlocks();
        applyBlocks();
        mergeDuplicates();
      } });
    }

    // 설정 > 차단 목록
    function renderBlockList() {
      panel.textContent = '';
      panel.appendChild(btn('← 설정', '', () => setPanel('set')));
      const unblock = fn => { fn(); saveBlocks(); applyBlocks(); mergeDuplicates(); growRender(renderBlockList); };

      panel.appendChild(el('div', 'lbl', '작가 · 그룹 (' + blocks.artists.length + ')'));
      const c = el('div', 'chips');
      if (!blocks.artists.length) c.appendChild(el('div', 'hint', '차단한 작가가 없습니다'));
      blocks.artists.forEach(a => {
        const ch = el('span', 'chip bad', a + '  ✕');
        ch.title = '눌러서 차단 풀기';
        ch.addEventListener('click', () => unblock(() => { blocks.artists = blocks.artists.filter(x => x !== a); }));
        c.appendChild(ch);
      });
      panel.appendChild(c);

      panel.appendChild(el('div', 'lbl', '작품 (' + blocks.works.length + ')'));
      const wl = el('div', 'slist');
      if (!blocks.works.length) wl.appendChild(el('div', 'hint', '차단한 작품이 없습니다'));
      blocks.works.forEach(w => {
        const r = el('button', 'srow bwr');
        r.type = 'button';
        r.title = '눌러서 차단 풀기';
        r.append(el('span', 'bwid', w.id), el('span', 'bwt', w.title || ''), el('span', 'bwx', '✕'));
        r.addEventListener('click', () => unblock(() => { blocks.works = blocks.works.filter(x => x.id !== w.id); }));
        wl.appendChild(r);
      });
      panel.appendChild(wl);
      panel.appendChild(el('div', 'hint', '항목을 누르면 차단이 풀려요. 홈에서 작품을 꾹 누르면 차단할 수 있어요.'));
    }

    function renderMeta(box) {
      box.textContent = '';
      box.scrollTop = 0;
      const o = metaCard;
      if (!o) return;
      const m = o.meta || { artists: [], groups: [], tags: [] };
      box.appendChild(el('div', 'ttl', settings.koreanTitle ? koreanTitle(o.title || '') : (o.title || '')));

      box.appendChild(el('div', 'lbl', '작가'));
      if (m.artists.length || m.groups.length) {
        const c = el('div', 'chips');
        m.artists.forEach(a => c.appendChild(chipLink(a, `/artist/${enc(a)}-${LANG}.html`, 'a')));
        m.groups.forEach(g => c.appendChild(chipLink(g + ' (그룹)', `/group/${enc(g)}-${LANG}.html`, 'a')));
        box.appendChild(c);
      } else box.appendChild(el('div', 'val', '정보 없음'));

      box.appendChild(el('div', 'lbl', '태그 (' + m.tags.length + ')'));
      if (!m.tags.length) box.appendChild(el('div', 'val', '태그 없음'));
      const tc = el('div', 'chips');
      m.tags.forEach(t => {
        const i = t.indexOf(':');
        const ns = i > 0 ? t.slice(0, i) : '';
        const name = i > 0 ? t.slice(i + 1) : t;
        const cls = ns === 'female' ? 'f' : ns === 'male' ? 'm' : '';
        const label = (ns === 'female' ? '♀ ' : ns === 'male' ? '♂ ' : '') + name;
        tc.appendChild(chipLink(label, `/tag/${enc(t)}-${LANG}.html`, cls));
      });
      if (m.tags.length) box.appendChild(tc);

      const r = el('div', 'row');
      r.style.marginTop = '12px';
      const cp = btn('품번 ' + o.id, 'sm', () => copyText(o.id).then(() => toast('품번 복사됨')));
      r.append(btn('작품 열기', 'primary sm', () => { closeMeta(); goTo(o.id); }), cp);
      box.appendChild(r);
    }
    const RENDERERS = {
      search: renderSearch, hist: renderHist, set: renderSettings,
      info: renderInfo, sort: renderSort, bm: renderBm,
      preview: renderPreview, home: renderHomeChoice, help: renderHelp, block: renderBlockList
    };

    function setPanel(mode, closeOnly) {
      if (closeOnly) mode = null;
      else if (panelMode === mode) mode = null;
      const prev = panelMode;
      panelMode = mode;
      if (prev === 'bm' && mode !== 'bm') { bmSetStars = null; updateCounts(); }
      if (prev === 'set' && mode !== 'set') revertPending();
      closeCardMenu(true);

      const activeSel = mode ? btnFor[mode] : null;
      Object.values(btnFor).forEach(sel => {
        const b = $(sel);
        if (b) b.classList.toggle('active', sel === activeSel);
      });

      const my = ++swapSeq;
      clearTimeout(swapT);
      if (mode) {
        const wasOpen = panel.classList.contains('open') && !panel.classList.contains('out');
        scrim.classList.add('on');
        if (metaOpen()) closeMeta();
        if (prev && wasOpen) {
          morphPanel(mode, my);
        } else {
          showPanel(mode);
        }
      } else if (prev) {
        // 닫히는 중에는 스크림을 바로 치워서, 그 사이 누른 버튼·카드가 그대로 동작하게 한다
        scrim.classList.remove('on');
        popClose(panel, glass, () => {
          if (my !== swapSeq) return;
          resetPanelStyle();
          if (!panelMode) panel.textContent = '';
          panel.classList.remove('top', 'hist');
          syncKeyboard();
        });
      }
      root.classList.toggle('pop', !!panelMode);
    }

    function paintMode(mode) {
      panel.scrollTop = 0;
      RENDERERS[mode]();
      panel.classList.toggle('mini', mode === 'home');
      panel.classList.toggle('hist', mode === 'hist');
      syncKeyboard();
    }

    function showPanel(mode) {
      resetPanelStyle();
      paintMode(mode);
      popOpen(panel, glass);
    }

    // 열린 팝업 안에서 화면 전환: 기존 요소가 사라지고 → 높이가 바뀌면서 → 새 요소가 바로 나타난다
    function morphPanel(mode, my) {
      panel.getAnimations().forEach(a => a.cancel());
      const h0 = panel.offsetHeight, w0 = panel.offsetWidth;
      panel.style.transition = '';
      panel.style.height = '';
      panel.style.width = '';
      paintMode(mode);
      growFrom(h0, w0);
    }

    const MODE_OF = {
      searchBtn: 'search', histBtn: 'hist', setBtn: 'set', infoBtn: 'info',
      filt: 'sort', star: 'bm', pg: 'preview', homeBtn: 'home'
    };
    sh.querySelectorAll('#bar button, #tl button, #filt, #pg, #homeBtn').forEach(b => {
      b.addEventListener('click', e => {
        if (b.classList.contains('bstar')) return;
        if (!panelMode) return;
        // 다른 팝업 버튼이면 그대로 넘겨서 열린 팝업 안에서 전환한다
        if (MODE_OF[b.id] && !b.classList.contains('active')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setPanel(null, true);
      }, true);
    });

    $('#searchBtn').addEventListener('click', () => setPanel('search'));
    $('#histBtn').addEventListener('click', () => setPanel('hist'));
    $('#setBtn').addEventListener('click', () => setPanel('set'));

    $('#homeBtn').addEventListener('click', () => setPanel('home'));
    const infoBtn = $('#infoBtn');
    if (infoBtn) infoBtn.addEventListener('click', () => setPanel('info'));
    const zoomBtn = $('#zoomBtn');
    if (zoomBtn) zoomBtn.addEventListener('click', () => restoreZoom());
    const filtBtn = $('#filt');
    if (filtBtn) filtBtn.addEventListener('click', () => setPanel('sort'));

    if (IS_READER) {
      const pg = $('#pg');
      if (pg) pg.addEventListener('click', () => setPanel('preview'));
      const updatePage = () => {
        const t = fxTotal();
        const txt = fxPage() + ' / ' + (t || '?');
        if (!pg || pg.textContent === txt) return;
        pg.textContent = txt;
      };
      updatePage();
      window.addEventListener('hashchange', updatePage);
      setInterval(updatePage, 1500);
    }

    const pstars = $('#pstars');
    if (pstars) {
      pstars.querySelectorAll('.bstar').forEach(b => {
        b.addEventListener('click', () => {
          if (!curId) return;
          const n = +b.dataset.n;
          if (panelMode === 'bm' && bmId === curId && bmSetStars) { bmSetStars(n); return; }
          openBm(curId, panelMode === 'hist' ? 'hist' : null, n);
        });
      });
    }

    const curNum = $('#curNum');
    if (curNum) {
      curNum.addEventListener('click', () => {
        copyText(curId).then(() => {
          toast('품번 복사됨');
          curNum.classList.add('done');
          setTimeout(() => curNum.classList.remove('done'), 700);
        });
      });
    }

    document.addEventListener('click', e => {
      if (e.composedPath().includes(host)) return;
      if (!panelMode) return;
      e.preventDefault();
      e.stopPropagation();
      setPanel(null, true);
    }, true);

    document.addEventListener('keydown', e => {
      if (e.composedPath().includes(host)) return;
      if (!panelMode) return;
      const k = e.key;
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' ||
          k === 'PageUp' || k === 'PageDown' || k === 'Home' || k === 'End' || k === ' ') {
        e.stopPropagation();
      }
    }, true);

    const pressS = { p: 0, v: 0, t: 0, raf: 0 };
    function pressStep() {
      const K = 260, D = 22, dt = 1 / 60;
      pressS.v += (-K * (pressS.p - pressS.t) - D * pressS.v) * dt;
      pressS.p += pressS.v * dt;
      pressS.p = Math.max(-0.6, Math.min(1, pressS.p));
      root.style.setProperty('--p', pressS.p.toFixed(4));
      if (Math.abs(pressS.p - pressS.t) < 0.001 && Math.abs(pressS.v) < 0.005) {
        pressS.p = pressS.t;
        pressS.v = 0;
        root.style.setProperty('--p', String(pressS.t));
        pressS.raf = 0;
        return;
      }
      pressS.raf = requestAnimationFrame(pressStep);
    }
    window.__hkPress = (target, kick) => {
      pressS.t = target;
      if (kick) pressS.v += kick;
      if (!pressS.raf) pressS.raf = requestAnimationFrame(pressStep);
    };


    function updateEdges() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      root.classList.toggle('at-top', window.scrollY <= 2);
      root.classList.toggle('at-bottom', max <= 2 || window.scrollY >= max - 2);
    }
    window.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    window.__hkEdges = updateEdges;
    updateEdges();
    updateCounts();

    window.__hkResyncUI = () => {
      updateCounts();
      if (panelMode === 'hist' && !cmenu) {
        if (histMode === 'saved') renderItems();
        else renderHistItems();
      }
    };
  }

  let fxOv = null;
  let fxBusy = false;

  function fxEnsureOv() {
    if (fxOv && fxOv.isConnected) return fxOv;
    fxOv = document.createElement('div');
    fxOv.id = 'hk-fx-ov';
    document.documentElement.appendChild(fxOv);
    return fxOv;
  }

  function takeSession(key) {
    try {
      const v = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      return v;
    } catch (e) { return null; }
  }

  function makeZoomEl(thumb, page, rect, morph) {
    const z = document.createElement('div');
    z.className = 'hk-zoom';
    z.style.cssText = rect
      ? `top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;border-radius:18px;opacity:1;`
      : 'top:0px;left:0px;width:100vw;height:100vh;border-radius:0px;opacity:1;';
    let p = null;
    if (page) {
      p = new Image();
      p.alt = '';
      p.className = 'hk-z-page';
      p.src = page;
      z.appendChild(p);
    }
    const ready = !!(p && p.complete && p.naturalWidth);
    if (thumb && (morph || !ready)) {
      const t = new Image();
      t.alt = '';
      t.className = 'hk-z-thumb';
      t.src = thumb;
      z.insertBefore(t, z.firstChild);
    }
    if (p && !morph) {
      if (ready) {
        p.style.transition = 'none';
        p.classList.add('ok');
        z.style.transition = 'none';
        z.classList.add('pg-on');
        void z.offsetWidth;
        z.style.transition = '';
      } else {
        p.addEventListener('load', () => {
          p.classList.add('ok');
          z.classList.add('pg-on');
          const t = z.querySelector('.hk-z-thumb');
          if (t) t.classList.add('gone');
        }, { once: true });
      }
    }
    return z;
  }

  function fxEarly() {
    const zRaw = takeSession('hk_zoom');
    const blk = takeSession('hk_blk') === '1';
    let zoomEl = null;

    if (zRaw !== null) {
      let o = {};
      try { o = JSON.parse(zRaw) || {}; } catch (e) {}
      // 앞 화면에서 이미 회색까지 바뀌었으므로, 여기서는 섬네일 없이 회색에서 1페이지로만 바뀐다
      zoomEl = makeZoomEl(o.gray ? '' : (o.thumb || ''), o.page || '', null);
      document.documentElement.appendChild(zoomEl);
    } else {
      const ov = fxEnsureOv();
      ov.classList.add('on', 'nt');
      if (blk) ov.style.backgroundColor = '#000';
    }

    let done = false;
    const reveal = () => {
      if (done) return;
      done = true;
      if (zoomEl) {
        const pg = zoomEl.querySelector('.hk-z-page');
        let faded = false;
        const fade = () => {
          if (faded) return;
          faded = true;
          requestAnimationFrame(() => {
            void zoomEl.offsetWidth;
            zoomEl.style.transition = 'opacity .42s ease';
            zoomEl.style.opacity = '0';
            setTimeout(() => zoomEl.remove(), 460);
          });
        };
        if (!pg || (pg.complete && pg.naturalWidth)) fade();
        else {
          pg.addEventListener('load', fade, { once: true });
          pg.addEventListener('error', fade, { once: true });
          setTimeout(fade, 1500);
        }
        return;
      }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const ov = fxEnsureOv();
        ov.classList.remove('nt');
        void ov.offsetWidth;
        ov.classList.remove('on');
        ov.style.backgroundColor = '';
      }));
    };
    if (document.readyState === 'complete') setTimeout(reveal, 60);
    else {
      window.addEventListener('load', () => setTimeout(reveal, 60), { once: true });
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(reveal, 550), { once: true });
      } else setTimeout(reveal, 550);
    }
    setTimeout(reveal, 3000);

    window.addEventListener('pageshow', e => {
      if (!e.persisted) return;
      fxBusy = false;
      document.querySelectorAll('.hk-zoom').forEach(z => z.remove());
      const o = fxEnsureOv();
      o.style.backgroundColor = '';
      o.classList.remove('nt', 'on');
    });
  }

  // 다음 화면이 이어받을 수 있게 하단 알약의 폭과 들어 있던 버튼을 적어 둔다
  // done: 이미 다음 화면 모양으로 바꿔 두었으면 다음 화면은 애니메이션 없이 그대로 보여 준다
  function saveBarState(done) {
    try {
      const h = document.getElementById('hk-host');
      const r = h && h.shadowRoot;
      const bar = r && r.getElementById('bar');
      if (!bar) return;
      const ids = Array.from(bar.children).map(c => c.id).filter(Boolean);
      ['tl', 'filt'].forEach(k => { if (r.getElementById(k)) ids.push(k); });
      sessionStorage.setItem('hk_bar', JSON.stringify({ w: bar.offsetWidth, ids, t: Date.now(), done: !!done }));
      if (done) return;
      // 다음 화면에 없을 정렬 버튼 같은 것은 미리 접어 둔다
      ['filt', 'tl'].forEach(k => {
        const e = r.getElementById(k);
        if (e && e.animate) e.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.6)' }],
          { duration: 260, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
      });
    } catch (e) {}
  }

  function morphUiTo(url, dur) {
    let ok = false;
    try { ok = !!(window.__hkMorphTo && window.__hkMorphTo(url, dur)); } catch (e) {}
    saveBarState(ok);
    return ok;
  }

  function leaveTo(url) {
    const ok = morphUiTo(url, 320);
    setTimeout(() => { location.href = url; }, ok ? 300 : 0);
    setTimeout(() => { if (window.__hkMorphUndo) window.__hkMorphUndo(); }, 4500);
  }

  function fxLeaveUI(url, dur) {
    morphUiTo(url, dur);
  }

  function fxGo(url, opt) {
    if (fxBusy) return;
    fxBusy = true;
    const ov = fxEnsureOv();
    let z = null;
    if (opt && opt.rect) {
      z = makeZoomEl(opt.thumb || '', opt.page || '', opt.rect, true);
      document.documentElement.appendChild(z);
      void z.offsetWidth;
      z.style.top = '0px';
      z.style.left = '0px';
      z.style.width = '100vw';
      z.style.height = '100vh';
      z.style.borderRadius = '0px';
      const zp = z.querySelector('.hk-z-page'), zt = z.querySelector('.hk-z-thumb');
      // 커지는 동안 섬네일이 스르륵 사라지며 회색이 되고, 다 커진 뒤 1페이지가 나타난다
      requestAnimationFrame(() => { if (zt) zt.classList.add('gone'); });
      const zgo = () => { if (zp) zp.classList.add('ok'); z.classList.add('pg-on'); };
      setTimeout(() => {
        if (zp && zp.complete && zp.naturalWidth) zgo();
        else if (zp) zp.addEventListener('load', zgo, { once: true });
      }, 440);
      try {
        sessionStorage.setItem('hk_zoom', JSON.stringify({ thumb: opt.thumb || '', page: opt.page || '', gray: true }));
      } catch (e) {}
    }
    ov.classList.add('on');
    fxLeaveUI(url, z ? 420 : 260);
    const zpImg = z ? z.querySelector('.hk-z-page') : null;
    const navigate = () => { location.href = url; };
    setTimeout(() => {
      if (zpImg && !(zpImg.complete && zpImg.naturalWidth)) {
        zpImg.addEventListener('load', () => setTimeout(navigate, 400), { once: true });
        setTimeout(navigate, 1000);
      } else if (zpImg) setTimeout(navigate, 360);
      else navigate();
    }, z ? 470 : 280);
    setTimeout(() => {
      fxBusy = false;
      if (z) z.remove();
      ov.classList.remove('on');
      if (window.__hkMorphUndo) window.__hkMorphUndo();
      try { sessionStorage.removeItem('hk_zoom'); sessionStorage.removeItem('hk_blk'); } catch (e) {}
    }, 4500);
  }

  // 홈 카드 꾹 누르기 → 카드 아래에 차단 팝업
  // 누르고 있는 동안 카드가 점점 눌리고, 손을 떼면 돌아오고, 꾹 누르기가 되면 톡 튀어 오른다
  function pressFx(el) {
    const none = { release() {}, pop() {} };
    if (!el || !el.animate) return none;
    el.getAnimations().forEach(a => { if (a.id === 'hk-press') a.cancel(); });
    const a = el.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(.965)', offset: .25 },
      { transform: 'scale(.93)' }
    ], { duration: 450, easing: 'ease-out', fill: 'forwards' });
    a.id = 'hk-press';
    let done = false;
    return {
      release() {
        if (done) return;
        done = true;
        try {
          a.updatePlaybackRate(-2.5);
          a.onfinish = () => a.cancel();
        } catch (e) { a.cancel(); }
      },
      pop() {
        if (done) return;
        done = true;
        const k = new DOMMatrixReadOnly(getComputedStyle(el).transform === 'none' ? undefined : getComputedStyle(el).transform).a || 1;
        a.cancel();
        const b = el.animate([
          { transform: `scale(${k})` }, { transform: 'scale(1.03)', offset: .55 }, { transform: 'scale(1)' }
        ], { duration: 340, easing: 'ease-out' });
        b.id = 'hk-press';
      }
    };
  }

  const homeLp = { t: 0, x: 0, y: 0, just: false, fx: null };
  const homeRelease = () => { if (homeLp.fx) { homeLp.fx.release(); homeLp.fx = null; } };
  const cardHostIn = path => path.find(n => n && n.classList && n.classList.contains('hk-card-host'));
  document.addEventListener('pointerdown', e => {
    homeLp.just = false;
    clearTimeout(homeLp.t);
    homeLp.t = 0;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hostEl = cardHostIn(e.composedPath());
    if (!hostEl || !hostEl._hkInfo) return;
    homeLp.x = e.clientX;
    homeLp.y = e.clientY;
    homeRelease();
    homeLp.fx = pressFx(hostEl.parentElement);
    homeLp.t = setTimeout(() => {
      homeLp.t = 0;
      homeLp.just = true;
      if (homeLp.fx) { homeLp.fx.pop(); homeLp.fx = null; }
      try { if (navigator.vibrate) navigator.vibrate(10); } catch (err) {}
      if (openCardMeta) openCardMeta(hostEl._hkInfo, hostEl, 'block');
    }, 450);
  }, true);
  document.addEventListener('pointermove', e => {
    if (!homeLp.t) return;
    if (Math.abs(e.clientX - homeLp.x) > 8 || Math.abs(e.clientY - homeLp.y) > 8) { clearTimeout(homeLp.t); homeLp.t = 0; homeRelease(); }
  }, true);
  ['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(homeLp.t); homeLp.t = 0; homeRelease(); }, true));
  document.addEventListener('contextmenu', e => {
    if (cardHostIn(e.composedPath())) e.preventDefault();
  }, true);
  // 꾹 누른 뒤 손을 뗄 때 생기는 클릭으로 작품이 열리지 않게 한다
  document.addEventListener('click', e => {
    if (!homeLp.just) return;
    homeLp.just = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  document.addEventListener('click', e => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const path = e.composedPath();
    const hostEl = path.find(n => n && n.classList && n.classList.contains('hk-card-host'));
    if (!hostEl || !hostEl.shadowRoot) return;
    if (window.__hkMetaOpen && window.__hkMetaOpen()) return;
    if (path.some(n => n && n.classList && (n.classList.contains('grp') || n.classList.contains('grplist') || n.classList.contains('dots') || n.classList.contains('info')))) return;
    const sh = hostEl.shadowRoot;
    const a = sh.querySelector('.thumb');
    const cardEl = sh.querySelector('.card');
    if (!a || !cardEl) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    saveScroll();
    const thumbImg = sh.querySelector('.thumb img');
    fxGo(a.href, {
      rect: cardEl.getBoundingClientRect(),
      thumb: thumbImg ? (thumbImg.currentSrc || thumbImg.src) : '',
      page: warmUrl.get(hostEl.dataset.hkId) || ''
    });
  }, true);

  document.addEventListener('click', e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.composedPath().find(n => n && n.tagName === 'A' && n.href);
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    let u;
    try { u = new URL(a.href, location.href); } catch (err) { return; }
    if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) return;
    if (u.pathname === location.pathname && u.search === location.search) return;
    e.preventDefault();
    fxGo(u.href);
  });

  function fxPage() {
    const m = location.hash.match(/(\d+)/);
    return m ? +m[1] : 1;
  }

  function fxTotal() {
    try {
      const g = pageGI();
      if (g && g.files) return g.files.length;
    } catch (e) {}
    const sel = document.querySelector('#single-page-select');
    return sel && sel.options.length ? sel.options.length : 0;
  }

  function findReaderImg() {
    const cands = Array.from(document.querySelectorAll('#mobileImages img, #comicImages img, #image-container img'))
      .filter(im => {
        const s = im.getAttribute('src') || '';
        return s && !/\.svg(\?|$)/i.test(s) && !/arrow/i.test(im.className || '');
      });
    if (!cands.length) return null;
    let best = null, area = -1;
    cands.forEach(im => {
      const r = im.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > area) { area = a; best = im; }
    });
    return best || cands[cands.length - 1];
  }

  const Z_MIN = 0.7, Z_MAX = 5;
  let zoom = 1, panX = 0, panY = 0, panMaxX = 0, panMaxY = 0;

  // 확대·이동 값은 문서 전체가 아니라 이미지가 든 상자에만 적고, 손가락이 움직여도 한 프레임에 한 번만 적는다
  // (문서 전체에 적으면 매번 모든 요소의 스타일을 다시 계산해서 끊겨 보인다)
  const zv = { z: 1, px: 0, py: 0 };
  let zvRaf = 0;
  function zoomBoxes() {
    return [document.getElementById('mobileImages'), document.getElementById('comicImages'), turnWrap].filter(Boolean);
  }
  function writeZoomVars(e) {
    // 값이 그대로면 쓰지 않는다 (쓸 때마다 그 안의 스타일을 다시 계산함)
    const sig = zv.z + '|' + zv.px + '|' + zv.py;
    if (e._hkZv === sig) return;
    e._hkZv = sig;
    const st = e.style;
    st.setProperty('--hk-z', String(zv.z));
    st.setProperty('--hk-px', zv.px + 'px');
    st.setProperty('--hk-py', zv.py + 'px');
  }
  function flushZoomVars() {
    zvRaf = 0;
    zoomBoxes().forEach(writeZoomVars);
  }
  function setZoomVars(o, now) {
    if (o.z != null) zv.z = Math.round(o.z * 1000) / 1000;
    if (o.px != null) zv.px = Math.round(o.px);
    if (o.py != null) zv.py = Math.round(o.py);
    if (now) { cancelAnimationFrame(zvRaf); flushZoomVars(); return; }
    if (!zvRaf) zvRaf = requestAnimationFrame(flushZoomVars);
  }

  function measurePan() {
    let w = 0, h = 0;
    document.querySelectorAll('#mobileImages img, #comicImages img, img.hk-pg').forEach(im => {
      w = Math.max(w, im.offsetWidth * zoom);
      h = Math.max(h, im.offsetHeight * zoom);
    });
    panMaxX = Math.max(0, (w - window.innerWidth) / 2);
    panMaxY = Math.max(0, (h - window.innerHeight) / 2);
  }

  function rubber(v, m) {
    if (Math.abs(v) <= m) return v;
    const o = Math.abs(v) - m;
    return Math.sign(v) * (m + o * 0.35);
  }

  function applyPan(soft) {
    if (soft) {
      setZoomVars({ px: rubber(panX, panMaxX), py: rubber(panY, panMaxY) });
      return;
    }
    panX = Math.max(-panMaxX, Math.min(panMaxX, panX));
    panY = Math.max(-panMaxY, Math.min(panMaxY, panY));
    setZoomVars({ px: panX, py: panY });
  }

  function setZoom(z) {
    const nz = Math.max(Z_MIN, Math.min(Z_MAX, z));
    if (Math.abs(nz - zoom) < 0.002) return;
    const k = nz / zoom;
    panX *= k;
    panY *= k;
    zoom = nz;
    setZoomVars({ z: zoom });
    measurePan();
    applyPan(pinch != null);
  }

  function resetZoom() {
    // 이미 원래 크기면 아무것도 하지 않는다 (넘길 때마다 레이아웃을 다시 계산하지 않게)
    if (zoom === 1 && !panX && !panY && zv.z === 1 && !zv.px && !zv.py) return;
    zoom = 1; panX = 0; panY = 0;
    panMaxX = 0; panMaxY = 0;
    setZoomVars({ z: 1, px: 0, py: 0 }, true);
  }

  // 넘김: 넘치지 않고(바운스 없음) 부드럽게 멈추는 감속 곡선
  const TURN_DUR = 420;
  const TURN_EASE = 'cubic-bezier(.22, 1, .36, 1)';
  const TURN_FLIP = false;
  const DRAG_START = 8;
  const DRAG_CUT = 0.12;

  let coverEl = null;
  let turnSeq = 0;
  let shown = null;
  let activeTurns = 0;
  let pendingIn = 0;
  const leaving = new Set();
  const syncActive = () => { activeTurns = leaving.size + pendingIn; };
  let turnWrap = null;
  let curLayer = null;
  let suppressClick = false;
  const ownPages = [];
  const markOwn = n => { ownPages.push(n); if (ownPages.length > 8) ownPages.shift(); };

  // 넘길 때 하단 버튼이 눌리듯 작아지던 효과는 없앴다
  const press = () => {};

  // 미리 받은 이미지 요소가 지금 화면에 쓰이고 있지 않으면 그것을 그대로 쓴다 (이미 해독되어 있음)
  function readyEl(src) {
    for (const im of preImg.values()) {
      if (im.src === src && !im.isConnected && im.complete && im.naturalWidth) return im;
    }
    return null;
  }

  function fitLayer(src, nw, nh) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / (nw || 1), vh / (nh || 1));
    const w = (nw || 1) * s, h = (nh || 1) * s;
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute!important;left:0!important;top:0!important;' +
      'width:100%!important;height:100%!important;transform-origin:50% 50%;will-change:transform,opacity;';
    const reuse = readyEl(src);
    const im = reuse || new Image();
    im.alt = '';
    im.className = 'hk-pg';
    im.decoding = 'async';
    if (im.src !== src) im.src = src;
    im.style.cssText = 'position:absolute!important;display:block!important;margin:0!important;padding:0!important;' +
      'left:' + ((vw - w) / 2) + 'px!important;top:' + ((vh - h) / 2) + 'px!important;' +
      'width:' + w + 'px!important;height:' + h + 'px!important;max-width:none!important;max-height:none!important;';
    layer.appendChild(im);
    layer._fresh = !reuse;
    return layer;
  }

  function coverUp() {
    document.documentElement.classList.add('hk-turning');
    if (coverEl) return;
    coverEl = document.createElement('div');
    coverEl.id = 'hk-cover';
    coverEl.style.cssText = 'position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;' +
      'background:#111111!important;z-index:2147483600!important;pointer-events:none!important;';
    (document.documentElement || document.body).appendChild(coverEl);
  }

  function coverDown() {
    document.documentElement.classList.remove('hk-turning');
    if (coverEl) { try { coverEl.remove(); } catch (e) {} }
    coverEl = null;
  }

  let busyT = 0;
  let quietUntil = 0;
  const isQuiet = () => activeTurns > 0 || drag.mode === 2 || performance.now() < quietUntil;
  function setBusy(on) {
    const h = document.getElementById('hk-host');
    const r = h && h.shadowRoot && h.shadowRoot.getElementById('root');
    if (r) r.classList.toggle('busy', on);
  }
  function busyFor(ms) {
    setBusy(true);
    quietUntil = performance.now() + ms;
    clearTimeout(busyT);
    busyT = setTimeout(() => setBusy(false), ms);
  }

  function ensureWrap() {
    if (!turnWrap) {
      turnWrap = document.createElement('div');
      turnWrap.className = 'hk-wrap';
      turnWrap.style.cssText = 'position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;' +
        'pointer-events:none!important;overflow:hidden!important;z-index:2147483601!important;';
      writeZoomVars(turnWrap);
    }
    (document.documentElement || document.body).appendChild(turnWrap);
    return turnWrap;
  }

  // ----- 다음 · 이전 페이지 준비: 화면 크기 그대로 투명하게 깔아 두고 해독까지 미리 끝낸다 -----
  // (미리 받기만 하고 해독은 안 된 이미지는 움직이는 도중에 뒤늦게 나타난다)
  const prep = new Map();
  function dropPrep(idx) {
    const p = prep.get(idx);
    if (!p) return;
    prep.delete(idx);
    if (p.layer !== curLayer && !leaving.has(p.layer) && p.layer !== holdLayer) { try { p.layer.remove(); } catch (e) {} }
  }
  function prepLayer(idx) {
    if (prep.has(idx)) return;
    const im = pageReady(idx);
    if (!im) return;
    const l = fitLayer(im.src, im.naturalWidth, im.naturalHeight);
    l.style.opacity = '0';
    l.style.transform = 'translate3d(0,0,0)';
    ensureWrap().appendChild(l);
    const img = l.firstChild;
    const p = { layer: l, src: im.src, done: false, ready: null };
    p.ready = (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => { p.done = true; });
    prep.set(idx, p);
  }
  // 지금 페이지 기준 바로 다음 · 이전 장만 준비해 두고 나머지는 치운다
  function prepAround() {
    if (!settings.preload || drag.mode === 2 || zoom > 1.01) return;
    const cur = fxPage() - 1;
    const want = [cur + 1, cur - 1];
    Array.from(prep.keys()).forEach(i => { if (want.indexOf(i) < 0) dropPrep(i); });
    want.forEach(i => { if (i >= 0) prepLayer(i); });
  }
  // 준비해 둔 장면을 꺼낸다 (해독이 끝날 때까지 기다리는 약속도 함께)
  function takePrep(idx, src) {
    const p = prep.get(idx);
    if (!p) return null;
    prep.delete(idx);
    if (p.src !== src || !p.layer.isConnected) { try { p.layer.remove(); } catch (e) {} return null; }
    p.layer.getAnimations().forEach(a => a.cancel());
    return p;
  }

  function endChain() {
    prep.forEach((p, i) => dropPrep(i));
    holdLayer = null;
    clearTimeout(spinT);
    if (turnWrap) { try { turnWrap.remove(); } catch (e) {} }
    turnWrap = null;
    curLayer = null;
    leaving.clear();
    syncActive();
    ownPages.length = 0;
    coverDown();
  }

  function freezeLayer(layer) {
    if (!layer) return null;
    layer.getAnimations().forEach(a => { try { a.commitStyles(); } catch (e) {} a.cancel(); });
    return layer;
  }

  function outgoingLayer() {
    let from = shown;
    if (!from) {
      const real = findReaderImg();
      if (real && real.complete && real.naturalWidth) {
        from = { src: real.currentSrc || real.src, nw: real.naturalWidth, nh: real.naturalHeight };
      }
    }
    if (!from) return null;
    const l = fitLayer(from.src, from.nw, from.nh);
    ensureWrap().appendChild(l);
    return l;
  }

  function poseOf(layer) {
    const cs = getComputedStyle(layer);
    let m = null;
    try { m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform); } catch (e) {}
    return { x: m ? m.m41 : 0, s: m && m.a ? m.a : 1, o: parseFloat(cs.opacity) || 0 };
  }

  // 두 페이지 사이 간격(화면 폭의 배수). 들어오는 페이지가 1.12배로 커져 있어도 나가는 페이지와 닿지 않는 거리다
  const TURN_GAP = 1.1;
  const turnGap = () => window.innerWidth * TURN_GAP;
  const inScale = dir => (dir > 0 ? 1.12 : 0.88);
  const dragLook = (dx, dir) => {
    const p = Math.min(1, Math.abs(dx) / window.innerWidth);
    const s0 = inScale(dir);
    return { sOut: 1 - 0.08 * p, oOut: 1 - 0.6 * p, sIn: s0 + (1 - s0) * p, oIn: p };
  };

  // 나가는 페이지는 줄어들며 흐려지고, 들어오는 페이지는 간격을 둔 채 같이 움직이며 제 크기로 돌아온다
  function leave(layer, side, W) {
    const p = poseOf(layer);
    freezeLayer(layer);
    leaving.add(layer);
    syncActive();
    slide(layer, p.x, side * W, p.s, 0.92, p.o, 0);
    clearTimeout(layer._rmT);
    layer._rmT = setTimeout(() => {
      try { layer.remove(); } catch (e) {}
      leaving.delete(layer);
      syncActive();
    }, TURN_DUR + 40);
  }

  function slide(layer, x0, x1, s0 = 1, s1 = 1, o0 = 1, o1 = 1) {
    // 시작 · 끝 두 장면만 주고 나머지는 브라우저(합성 스레드)가 채운다 → 프레임마다 계산할 일이 없다
    layer.animate([
      { transform: `translate3d(${x0.toFixed(1)}px,0,0) scale(${s0.toFixed(4)})`, opacity: Math.min(1, Math.max(0, o0)) },
      { transform: `translate3d(${x1.toFixed(1)}px,0,0) scale(${s1.toFixed(4)})`, opacity: Math.min(1, Math.max(0, o1)) }
    ], { duration: TURN_DUR, easing: TURN_EASE, fill: 'forwards' });
  }

  // 미리 받은 파일이 먼저 준비되든, 사이트가 띄운 이미지가 먼저 준비되든 빠른 쪽을 쓴다
  function waitPage(gid, files, idx, timeout, attrBefore) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const tryNow = () => {
        const im = preImg.get(idx);
        if (im && im.complete && im.naturalWidth) {
          resolve({ src: im.src, nw: im.naturalWidth, nh: im.naturalHeight });
          return;
        }
        if (attrBefore !== undefined) {
          const r = findReaderImg();
          const a = r ? r.getAttribute('src') : null;
          if (r && a && a !== attrBefore && r.complete && r.naturalWidth) {
            resolve({ src: r.currentSrc || r.src, nw: r.naturalWidth, nh: r.naturalHeight });
            return;
          }
        }
        if (!preBusy.has(idx) && !preDone.has(idx)) preloadPage(gid, files, idx);
        if (performance.now() - t0 > timeout) { reject(new Error('timeout')); return; }
        setTimeout(tryNow, 16);
      };
      tryNow();
    });
  }

  function waitRealImg(attrBefore, timeout) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const tryNow = () => {
        const im = findReaderImg();
        const attr = im ? im.getAttribute('src') : null;
        if (im && attr && attr !== attrBefore && im.complete && im.naturalWidth) {
          resolve({ src: im.currentSrc || im.src, nw: im.naturalWidth, nh: im.naturalHeight });
          return;
        }
        if (performance.now() - t0 > timeout) { reject(new Error('timeout')); return; }
        setTimeout(tryNow, 16);
      };
      tryNow();
    });
  }

  // 다음 페이지가 아직 없을 때 지금 페이지를 붙잡아 두는 레이어 (빈 화면 대신)
  let holdLayer = null;
  let spinT = 0;
  function spinLater(my) {
    clearTimeout(spinT);
    spinT = setTimeout(() => {
      if (my !== turnSeq || !turnWrap || turnWrap.querySelector('.hk-spin')) return;
      const s = document.createElement('div');
      s.className = 'hk-spin';
      turnWrap.appendChild(s);
    }, 180);
  }
  function hideSpin() {
    clearTimeout(spinT);
    if (turnWrap) turnWrap.querySelectorAll('.hk-spin').forEach(n => n.remove());
  }

  function setPx(x) { setZoomVars({ px: x }); }
  let bounceT = 0;
  function snapPx() {
    const root = document.documentElement;
    if (!zv.px) return;
    clearTimeout(bounceT);
    root.classList.add('hk-zanim');
    setPx(0);
    bounceT = setTimeout(() => root.classList.remove('hk-zanim'), 320);
  }
  const rubberX = dx => dx / (1 + Math.abs(dx) / (window.innerWidth * 0.3)) * 0.45;

  // 첫 장·마지막 장에서 더 넘기려 하면 살짝 밀렸다 돌아오기만 한다
  function edgeBounce(dir) {
    if (zoom > 1.01) return;
    const side = TURN_FLIP ? -dir : dir;
    const root = document.documentElement;
    clearTimeout(bounceT);
    root.classList.add('hk-zanim');
    setPx(side * Math.min(56, window.innerWidth * 0.1));
    bounceT = setTimeout(() => {
      setPx(0);
      bounceT = setTimeout(() => root.classList.remove('hk-zanim'), 320);
    }, 140);
    press(0, -4);
  }

  function turn(dir) {
    turnTo(fxPage() + dir, dir);
  }

  // 원하는 페이지로 넘긴다 (미리보기에서 고른 페이지도 같은 애니메이션)
  function turnTo(next, dirHint) {
    const total = fxTotal();
    const cur = fxPage();
    const dir = dirHint || Math.sign(next - cur);
    if (!dir) return;
    busyFor(TURN_DUR + 120);
    if (zoom > 1.01) resetZoom();
    if (next < 1 || (total && next > total)) { edgeBounce(dir); return; }

    const gid = getCurrentId();
    const files = readerFiles(gid);
    const side = TURN_FLIP ? -dir : dir;
    if (files && next < files.length) preloadPage(gid, files, next);

    let out = curLayer || holdLayer;
    curLayer = null;
    holdLayer = null;
    if (!out && !leaving.size) out = outgoingLayer();
    if (!out && !leaving.size && !pendingIn) {
      // 지금 페이지조차 아직 안 떠 있으면 덮개를 씌우지 않고 사이트가 바로 보여주게 둔다
      ++turnSeq;
      endChain();
      location.replace('#' + next);
      hlog('넘김', cur, '→', next, '(현재 페이지 로딩 전 · 애니메이션 생략)');
      return;
    }

    const my = ++turnSeq;
    coverUp();
    ensureWrap();
    const W = turnGap();
    const realBefore = findReaderImg();
    const attrBefore = realBefore ? realBefore.getAttribute('src') : null;
    markOwn(next);
    location.replace('#' + next);
    pendingIn++;
    syncActive();

    const now = files ? pageReady(next - 1) : null;
    // 다음 장이 아직이면 지금 장을 그 자리에 두고(빈 화면 없음) 받는 대로 넘긴다
    if (!now && out) { holdLayer = out; spinLater(my); }
    const readyP = now
      ? Promise.resolve({ src: now.src, nw: now.naturalWidth, nh: now.naturalHeight })
      : (files ? waitPage(gid, files, next - 1, 10000, attrBefore) : waitRealImg(attrBefore, 10000));

    readyP.then(info => {
      pendingIn--;
      syncActive();
      if (my !== turnSeq) return;
      hideSpin();
      if (holdLayer === out) holdLayer = null;
      const pp = takePrep(next - 1, info.src);
      let inL, wait;
      if (pp) {
        inL = pp.layer;
        wait = pp.done ? null : pp.ready;
      } else {
        // 준비된 장면이 없으면 투명하게 먼저 깔고(화면 크기 그대로) 해독을 기다린다
        inL = fitLayer(info.src, info.nw, info.nh);
        inL.style.opacity = '0';
        ensureWrap().appendChild(inL);
        const im = inL.firstChild;
        wait = im.decode ? im.decode().catch(() => {}) : null;
      }
      const go = () => {
        if (my !== turnSeq) { if (inL !== curLayer) { try { inL.remove(); } catch (e) {} } return; }
        let ox = 0;
        if (out && out.isConnected) { ox = poseOf(out).x; leave(out, side, W); }
        if (!inL.isConnected) ensureWrap().appendChild(inL);
        shown = info;
        slide(inL, ox - side * W, 0, inScale(dir), 1, 0, 1);
        curLayer = inL;
        setTimeout(prepAround, TURN_DUR + 60);
      };
      if (wait) {
        if (out && out.isConnected && !holdLayer) holdLayer = out;
        let done = false;
        const once = () => {
          if (done) return;
          done = true;
          if (holdLayer === out) holdLayer = null;
          go();
        };
        wait.then(once, once);
        setTimeout(once, 300);
      } else go();
    }).catch(() => {
      pendingIn--;
      syncActive();
      if (my !== turnSeq) return;
      hlog('넘김 실패: 새 페이지 대기 시간 초과');
      endChain();
    });
    hlog('넘김', cur, '→', next, now ? '(미리 받은 파일 사용)' : '(받는 중 · 현재 페이지를 붙잡아 둠)');
  }

  const drag = { id: null, x0: 0, y0: 0, px0: 0, py0: 0, mode: 0, dir: 0, dx: 0, ox: 0, lastX: 0, lastT: 0, v: 0, orig: 1, tapDir: 0,
    outL: null, inL: null, info: null, next: 0, files: null, edge: false };
  const pts = new Map();
  let pinch = null;

  function pageReady(idx) {
    const im = preImg.get(idx);
    return im && im.complete && im.naturalWidth ? im : null;
  }

  function dragAddIn() {
    if (drag.inL || !drag.files) return;
    const im = pageReady(drag.next - 1);
    if (!im) return;
    drag.info = { src: im.src, nw: im.naturalWidth, nh: im.naturalHeight };
    const pp = takePrep(drag.next - 1, drag.info.src);
    drag.inL = pp ? pp.layer : fitLayer(drag.info.src, drag.info.nw, drag.info.nh);
    setPx(0);
    coverUp();
    if (!drag.inL.isConnected) ensureWrap().appendChild(drag.inL);
  }

  function dragBegin(dir) {
    const total = fxTotal();
    const next = fxPage() + dir;
    drag.dir = dir;
    drag.next = next;
    drag.edge = next < 1 || !!(total && next > total);
    drag.outL = null;
    drag.inL = null;
    drag.info = null;
    drag.files = null;
    drag.ox = 0;
    if (drag.edge) return;

    const gid = getCurrentId();
    const files = readerFiles(gid);
    ++turnSeq;
    hideSpin();
    const base = curLayer || holdLayer;
    curLayer = null;
    holdLayer = null;
    if (base) { drag.ox = poseOf(base).x; drag.outL = freezeLayer(base); }
    else if (!leaving.size) drag.outL = outgoingLayer();
    if (drag.outL) coverUp();
    drag.files = files || null;
    if (files && next < files.length) preloadPage(gid, files, next);
    dragAddIn();
  }

  // 손가락을 1:1로 따라가고, 들어오는 페이지는 화면 폭만큼 떨어진 바로 옆에 붙어 있다
  function dragMove(dx) {
    const W = turnGap();
    busyFor(160);
    if (drag.edge) { setPx(rubberX(dx)); return; }
    dragAddIn();
    const x = drag.ox + dx;
    const k = dragLook(dx, drag.dir);
    if (drag.outL) {
      drag.outL.style.transform = `translate3d(${x.toFixed(1)}px,0,0) scale(${k.sOut.toFixed(4)})`;
      drag.outL.style.opacity = k.oOut.toFixed(3);
    }
    if (drag.inL) {
      drag.inL.style.transform = `translate3d(${(x - drag.dir * W).toFixed(1)}px,0,0) scale(${k.sIn.toFixed(4)})`;
      drag.inL.style.opacity = k.oIn.toFixed(3);
    }
    if (!drag.outL && !drag.inL) setPx(rubberX(dx));
  }

  function dragSnap() {
    busyFor(TURN_DUR + 120);
    snapPx();
    if (drag.edge) return;
    const W = turnGap(), d = drag.dir, my = turnSeq;
    const ol = drag.outL, il = drag.inL;
    drag.outL = null;
    drag.inL = null;
    if (ol) {
      const p = poseOf(ol);
      slide(ol, p.x, 0, p.s, 1, p.o, 1);
      curLayer = ol;
    }
    if (il) {
      const p = poseOf(il);
      slide(il, p.x, -d * W, p.s, inScale(d), p.o, 0);
      setTimeout(() => { try { il.remove(); } catch (e) {} }, TURN_DUR + 40);
    }
    if (!ol) {
      setTimeout(() => {
        if (my === turnSeq && !curLayer && !holdLayer && !leaving.size && !pendingIn) endChain();
      }, TURN_DUR + 60);
    }
  }

  function dragCommit() {
    busyFor(TURN_DUR + 120);
    const W = turnGap(), d = drag.dir;
    const ol = drag.outL, il = drag.inL;
    drag.outL = null;
    drag.inL = null;
    markOwn(drag.next);
    location.replace('#' + drag.next);
    const pi = poseOf(il);
    if (ol) {
      const po = poseOf(ol);
      leaving.add(ol);
      syncActive();
      slide(ol, po.x, d * W, po.s, 0.92, po.o, 0);
      setTimeout(() => {
        try { ol.remove(); } catch (e) {}
        leaving.delete(ol);
        syncActive();
      }, TURN_DUR + 40);
    }
    slide(il, pi.x, 0, pi.s, 1, pi.o, 1);
    shown = drag.info;
    curLayer = il;
    setTimeout(prepAround, TURN_DUR + 60);
    press(0, 10);
  }

  function dragEnd(dx, v) {
    const W = window.innerWidth, d = drag.dir;
    if (drag.edge) { dragSnap(); press(0, -4); return; }
    const progress = dx * d;
    const flick = v * d > 0.2 && progress > 4;
    const want = progress > W * DRAG_CUT || flick;
    if (!want) { dragSnap(); press(0, -4); return; }
    if (!drag.inL) { dragSnap(); turn(d); return; }
    dragCommit();
  }

  function settleZoom() {
    if (zoom < 0.999 || (zoom <= 1.01 && (panX || panY))) { restoreZoom(); return; }
    if (zoom <= 1.01) return;
    measurePan();
    if (Math.abs(panX) <= panMaxX && Math.abs(panY) <= panMaxY) return;
    const root = document.documentElement;
    root.classList.add('hk-zanim');
    applyPan();
    setTimeout(() => root.classList.remove('hk-zanim'), 320);
  }

  function restoreZoom() {
    if (Math.abs(zoom - 1) < 0.002 && !panX && !panY) return;
    const root = document.documentElement;
    root.classList.add('hk-zanim');
    resetZoom();
    setTimeout(() => root.classList.remove('hk-zanim'), 320);
  }

  const isOurUI = e => e.composedPath().some(n => n && n.id === 'hk-host');
  const isInteractive = path => path.some(n => n && n.tagName &&
    (/^(BUTTON|INPUT|SELECT|TEXTAREA|LABEL|OPTION)$/.test(n.tagName) ||
      (n.tagName === 'A' && n.getAttribute('href'))));
  const isImagePath = path => path.some(n => n && (n.tagName === 'IMG' || n.id === 'comicImages' || n.id === 'mobileImages'));

  function initReaderInput() {
    let wheelT = 0;
    window.addEventListener('pointerdown', e => {
      if (isOurUI(e)) return;
      e.stopPropagation();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      suppressClick = false;
      if (pts.size === 2) {
        if (drag.mode === 2) dragSnap(drag.dx);
        drag.mode = 0;
        const [a, b] = [...pts.values()];
        pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, px0: panX, py0: panY };
        suppressClick = true;
        return;
      }
      if (pts.size === 1) {
        drag.id = e.pointerId;
        drag.x0 = e.clientX;
        drag.y0 = e.clientY;
        drag.lastX = e.clientX;
        drag.lastT = performance.now();
        drag.v = 0;
        drag.dx = 0;
        drag.px0 = panX;
        drag.py0 = panY;
        drag.mode = 0;
      }
    }, { capture: true, passive: true });

    window.addEventListener('pointermove', e => {
      if (!isOurUI(e)) e.stopPropagation();
      const p = pts.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (pinch && pts.size === 2) {
        const [a, b] = [...pts.values()];
        setZoom(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0);
        panX = pinch.px0 + ((a.x + b.x) / 2 - pinch.mx);
        panY = pinch.py0 + ((a.y + b.y) / 2 - pinch.my);
        applyPan(true);
        return;
      }
      if (pts.size !== 1 || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (drag.mode === 0) {
        if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return;
        suppressClick = true;
        if (zoom > 1.01) drag.mode = 1;
        else if (Math.abs(dx) > Math.abs(dy) * 1.2) { drag.mode = 2; dragBegin(dx > 0 ? 1 : -1); }
        else { drag.mode = 3; return; }
      }
      if (drag.mode === 1) {
        panX = drag.px0 + dx;
        panY = drag.py0 + dy;
        applyPan(true);
        return;
      }
      if (drag.mode === 2) {
        const now = performance.now();
        drag.v = (e.clientX - drag.lastX) / Math.max(1, now - drag.lastT);
        drag.lastX = e.clientX;
        drag.lastT = now;
        drag.dx = dx;
        dragMove(dx);
        press(Math.min(1, Math.abs(dx) / (window.innerWidth * 0.3)) * 0.8, 0);
      }
    }, { capture: true, passive: true });

    const release = (e, cancel) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size >= 1) {
        if (pinch) {
          pinch = null;
          const [rid, rp] = [...pts.entries()][0];
          drag.id = rid; drag.x0 = rp.x; drag.y0 = rp.y; drag.px0 = panX; drag.py0 = panY;
          drag.mode = zoom > 1.01 ? 1 : 3;
          suppressClick = true;
        }
        return;
      }
      pinch = null;
      settleZoom();
      if (e.pointerId !== drag.id) return;
      const m = drag.mode;
      if (Math.abs(e.clientX - drag.x0) > 6 || Math.abs(e.clientY - drag.y0) > 6) suppressClick = true;
      drag.id = null;
      drag.mode = 0;
      if (m === 2) {
        if (cancel) dragSnap(drag.dx);
        else dragEnd(e.clientX - drag.x0, performance.now() - drag.lastT > 80 ? 0 : drag.v);
        press(0, -2);
      }
    };
    window.addEventListener('pointerup', e => { if (!isOurUI(e)) e.stopPropagation(); release(e, false); }, { capture: true, passive: true });
    const dropPointers = () => {
      if (!pts.size && drag.mode !== 2) return;
      pts.clear();
      pinch = null;
      if (drag.mode === 2) dragSnap(drag.dx);
      drag.id = null;
      drag.mode = 0;
      settleZoom();
    };
    window.addEventListener('blur', dropPointers);
    document.addEventListener('visibilitychange', () => { if (document.hidden) dropPointers(); });
    window.addEventListener('pointercancel', e => { if (!isOurUI(e)) e.stopPropagation(); release(e, true); }, { capture: true, passive: true });
    ['touchstart', 'touchend'].forEach(t => window.addEventListener(t, e => { if (!isOurUI(e)) e.stopPropagation(); }, { capture: true, passive: true }));

    window.addEventListener('click', e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (isOurUI(e)) return;
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      const path = e.composedPath();
      if (!isImagePath(path) && isInteractive(path)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (zoom > 1.01) return;
      turn(e.clientX < window.innerWidth / 2 ? 1 : -1);
    }, true);

    window.addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (isOurUI(e)) return;
      const path = e.composedPath();
      if (path.some(n => n && n.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName))) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      turn(e.key === 'ArrowLeft' ? 1 : -1);
    }, true);

    document.addEventListener('touchmove', e => {
      if (isOurUI(e)) return;
      e.preventDefault();
    }, { passive: false, capture: true });

    document.addEventListener('wheel', e => {
      if (isOurUI(e)) return;
      e.preventDefault();
      if (e.ctrlKey) {
        setZoom(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
        clearTimeout(wheelT);
        wheelT = setTimeout(settleZoom, 200);
        return;
      }
      if (zoom <= 1.01) return;
      panX -= e.deltaX;
      panY -= e.deltaY;
      applyPan(true);
      clearTimeout(wheelT);
      wheelT = setTimeout(settleZoom, 200);
    }, { passive: false, capture: true });

    document.addEventListener('dragstart', e => e.preventDefault(), true);
    document.addEventListener('selectstart', e => { if (!isOurUI(e)) e.preventDefault(); }, true);
    document.addEventListener('contextmenu', e => {
      if (e.target && e.target.tagName === 'IMG') e.preventDefault();
    }, true);

    document.addEventListener('load', e => {
      const t = e.target;
      if (!t || t.tagName !== 'IMG' || !t.closest('#mobileImages, #comicImages')) return;
      if (zoom <= 1.01) return;
      measurePan();
      applyPan();
    }, true);

    window.addEventListener('hashchange', e => {
      resetZoom();
      const m = ((e && e.newURL) || '').match(/#(\d+)/);
      const n = m ? +m[1] : fxPage();
      const i = ownPages.indexOf(n);
      if (i >= 0) ownPages.splice(0, i + 1);
      else { ownPages.length = 0; endChain(); }
    });
    window.addEventListener('resize', () => { if (zoom > 1.01) { measurePan(); applyPan(); } });
  }

  function initReaderViewport() {
    const root = document.documentElement;
    function fxViewport() {
      root.style.setProperty('--hk-vw', Math.round(window.innerWidth) + 'px');
      root.style.setProperty('--hk-vh', Math.round(window.innerHeight) + 'px');
    }
    fxViewport();
    window.addEventListener('resize', fxViewport);
    window.addEventListener('orientationchange', () => setTimeout(fxViewport, 200));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', fxViewport);
  }

  let fxInfo = null;

  async function fxLoadInfo(id) {
    if (fxInfo && fxInfo.id === id) return fxInfo;
    let info = null, failed = false;
    try {
      const g = pageGI();
      if (g && String(g.id) === String(id)) {
        info = {
          id,
          title: g.title || g.japanese_title || '',
          artists: (g.artists || []).map(a => a.artist),
          groups: (g.groups || []).map(a => a.group),
          series: (g.parodys || []).map(a => a.parody),
          chars: (g.characters || []).map(a => a.character),
          total: (g.files || []).length,
          tags: (g.tags || []).map(t => ({
            n: t.tag,
            ns: (t.female == 1 || t.female === '1') ? 'female' : ((t.male == 1 || t.male === '1') ? 'male' : '')
          }))
        };
      }
    } catch (e) {}
    if (!info) {
      try {
        const r = await fetch('/galleries/' + id + '.html', { credentials: 'same-origin' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = new DOMParser().parseFromString(await r.text(), 'text/html');
        const pick = type => {
          const out = [];
          d.querySelectorAll(`a[href^="/${type}/"]`).forEach(a => {
            if (a.closest('.gallery-content')) return;
            const m = (a.getAttribute('href') || '').match(/^\/[a-z]+\/(.+)-[a-z]+\.html/i);
            if (!m) return;
            let v = m[1];
            try { v = decodeURIComponent(v); } catch (e) {}
            if (out.indexOf(v) < 0) out.push(v);
          });
          return out;
        };
        const h1 = d.querySelector('#gallery-brand h1, h1');
        info = {
          id,
          title: h1 ? h1.textContent.trim() : getPageTitle(),
          artists: pick('artist'), groups: pick('group'), series: pick('series'), chars: pick('character'),
          total: 0,
          tags: pick('tag').map(v => {
            const i = v.indexOf(':');
            return i > 0 ? { ns: v.slice(0, i), n: v.slice(i + 1) } : { ns: '', n: v };
          })
        };
      } catch (e) {
        failed = true;
        info = { id, title: getPageTitle(), artists: [], groups: [], series: [], chars: [], total: 0, tags: [] };
      }
    }
    if (!info.total) info.total = fxTotal();
    if (settings.koreanTitle && info.title) info.title = koreanTitle(info.title);
    if (!failed) fxInfo = info;
    return info;
  }

  function fxHideTop() {
    if (!document.body) return;
    document.querySelectorAll('a, span, div, li, h1, h2, h3, p, button, td').forEach(el => {
      if (el.childElementCount > 2) return;
      if (el.closest('.hk-fx-hide, #hk-host')) return;
      if (!/^gallery\s*info$/i.test((el.textContent || '').trim())) return;
      let n = el;
      while (n.parentElement && n.parentElement !== document.body && n.parentElement !== document.documentElement) {
        const p = n.parentElement;
        let r;
        try { r = p.getBoundingClientRect(); } catch (e) { break; }
        if (r.height > 160 || p.querySelector('img, canvas, #comicImages, #mobileImages')) break;
        n = p;
      }
      n.classList.add('hk-fx-hide');
    });
  }

  function fxStart() {
    if (!IS_READER) return;
    fxHideTop();
    let n = 0;
    const t = setInterval(() => { fxHideTop(); if (++n >= 4) clearInterval(t); }, 1000);
    let mt = 0;
    const mo = new MutationObserver(() => {
      if (mt) return;
      mt = setTimeout(() => { mt = 0; fxHideTop(); }, 500);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => mo.disconnect(), 8000);
  }

  // 첫 정리(run)가 끝날 때까지 원래 히토미 화면을 숨겨 둔 것(맨 위 hk-boot)을 걷는다
  function endBoot() { try { document.documentElement.classList.remove('hk-boot'); } catch (e) {} }
  injectSiteCss();
  injectFxCss();
  if (IS_READER) initReaderInput();
  onRoot(() => {
    if (IS_READER) initReaderViewport();
    fxEarly();
  });

  let nativeReady = false;
  let nativeDirty = true;
  let runT = 0;

  function run() {
    if (!nativeReady || nativeDirty) {
      nativeReady = true;
      nativeDirty = false;
      paintListBg();
      hideNative();
      pruneNative();
    }
    rewriteLinks(document);
    filterGalleries(document);
    if (settings.cardStyle) restyleCards(document);
    applyBlocks();
    if (settings.mergeTitles) mergeDuplicates();
    initInfinite();
    warmPages();
    flushTerms();
    flushThumbs();
    restoreScroll();
    if (window.__hkEdges) window.__hkEdges();
  }

  const OURS_SEL = '#hk-host, #hk-fx-ov, #hk-cover, #hk-sentinel, #hk-bg, #hk-empty, .hk-zoom, .hk-wrap, .hk-card-host, .hk-meta-host';
  const isOursNode = n => !!(n && n.nodeType === 1 && n.closest && n.closest(OURS_SEL));
  const observer = new MutationObserver(muts => {
    if (runT) return;
    // 이 스크립트가 만든 노드(카드 껍데기, 상태 문구 등)만 바뀐 경우는 다시 돌지 않는다
    const ours = (n, m) => isOursNode(n) || (n.nodeType !== 1 && isOursNode(m.target));
    if (muts.every(m => [...m.addedNodes, ...m.removedNodes].every(n => ours(n, m)))) return;
    if (muts.some(m => !isOursNode(m.target) && !(m.target.closest && m.target.closest('.gallery-content')))) nativeDirty = true;
    runT = setTimeout(() => {
      runT = 0;
      run();
      if (host && !host.isConnected) document.documentElement.appendChild(host);
    }, 150);
  });

  function showEmptyResult() {
    if (document.getElementById('hk-empty')) return;
    document.documentElement.style.setProperty('background-color', '#111111', 'important');
    if (document.body) {
      document.body.style.setProperty('background-color', '#111111', 'important');
      Array.from(document.body.children).forEach(ch => {
        if (!(ch.id && ch.id.indexOf('hk-') === 0)) ch.classList.add('hk-vanish');
      });
    }
    const q = (new URLSearchParams(location.search).get('query') || '')
      .replace(/\s*language:korean/i, '').trim();
    const box = document.createElement('div');
    box.id = 'hk-empty';
    box.style.cssText =
      'position:fixed!important;top:0!important;right:0!important;bottom:0!important;left:0!important;' +
      'display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;' +
      'gap:10px!important;background:#111111!important;color:#c9c9d1!important;z-index:1!important;' +
      'font:500 15px/1.5 -apple-system,"Malgun Gothic",sans-serif!important;text-align:center!important;padding:24px!important;';
    const t = document.createElement('div');
    t.style.cssText = 'font-weight:700!important;color:#f2f2f5!important;font-size:16px!important;';
    t.textContent = (q ? '"' + q + '"' : '검색어') + ' 에 대한 작품이 없습니다';
    const s = document.createElement('div');
    s.style.cssText = 'font-size:12.5px!important;color:#8a8a95!important;';
    s.textContent = '오른쪽 아래 H 버튼으로 히토미 홈이나 이전 목록으로 갈 수 있습니다.';
    box.append(t, s);
    document.documentElement.appendChild(box);
  }

  function checkEmptySearch() {
    if (!IS_SEARCH || document.getElementById('hk-empty')) return;
    const gc = document.querySelector('.gallery-content');
    const has = gc && Array.from(gc.children).some(c => c.querySelector('a[href]'));
    if (!has) showEmptyResult();
  }

  function start() {
    hlog('시작 · v' + VERSION + ' · ' + location.pathname);
    if (IS_READER) fxStart();
    run();
    [1200, 3000].forEach(ms => setTimeout(checkEmptySearch, ms));
    buildUI();
    requestAnimationFrame(() => requestAnimationFrame(endBoot));
    if (IS_READER) initReaderPreload();
    else initPreload();
    recordWatch(false);
    setTimeout(() => recordWatch(true), 1500);
    setTimeout(giveUpScroll, 5000);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  paintListBg();
  document.addEventListener('DOMContentLoaded', paintListBg, { once: true });
})();
