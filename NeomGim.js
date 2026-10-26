// ==UserScript==
// @name         NeomGim
// @namespace    neomgim
// @version      1.0.0
// @description  이제 편하게 넘김.
// @match        https://hitomi.la/*
// @run-at       document-start
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '1.0.0';
  const LANG = 'korean';
  const KOREAN_LINK = `/index-${LANG}.html`;
  const TOP_W = 760;
  const ID_RE = /-(\d+)\.html/;
  const DATE_RE = /(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/;
  const WORK_HREF_RE = /\d{5,}\.html(?:$|[?#])/i;
  const LIST_PAGE_RE = /^\/(reader|galleries|doujinshi|manga|artistcg|gamecg|imageset|anime|cg)\//;
  const IS_WORK_PAGE = LIST_PAGE_RE.test(location.pathname);
  const IS_READER = /^\/reader\//.test(location.pathname);

  const W = () => (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window);

  const KEY = {
    saved: 'hk_saved',
    settings: 'hk_settings',
    watched: 'hk_watch',
    blocked: 'hk_block',
    thumbs: 'hk_thumbs',
    hist: 'hk_hist',
    terms: 'hk_terms',
    dates: 'hk_dates',
  };

  const hkLog = [];
  function hlog(...args) {
    const t = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    hkLog.push(t + '  ' + args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
    if (hkLog.length > 200) hkLog.shift();
  }

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
    blockTags: true,
    preload: true,
    mergeTitles: true,
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
        button:hover { opacity: 1; }
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

  let blocked = store.get(KEY.blocked, []);
  const saveBlocked = () => store.set(KEY.blocked, blocked);

  let thumbs = store.get(KEY.thumbs, {});
  let thumbsDirty = false;
  function setThumb(id, url) {
    if (!id || !url || /^data:/.test(url)) return;
    if (url.indexOf('//') === 0) url = 'https:' + url;
    if (thumbs[id] === url) return;
    thumbs[id] = url;
    thumbsDirty = true;
    const keys = Object.keys(thumbs);
    if (keys.length > 1500) delete thumbs[keys[0]];
  }
  function flushThumbs() {
    if (!thumbsDirty) return;
    thumbsDirty = false;
    store.set(KEY.thumbs, thumbs);
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
  function flushTerms() {
    if (!termsDirty) return;
    termsDirty = false;
    store.set(KEY.terms, terms);
  }

  let hist = store.get(KEY.hist, []);
  function pushHist(q) {
    hist = [q].concat(hist.filter(h => h !== q)).slice(0, 30);
    store.set(KEY.hist, hist);
  }

  const dates = store.get(KEY.dates, {});
  let dateTimer = 0;
  function setDate(id, d) {
    if (!id || !d || dates[id] === d) return;
    dates[id] = d;
    const keys = Object.keys(dates);
    if (keys.length > 1500) delete dates[keys[0]];
    clearTimeout(dateTimer);
    dateTimer = setTimeout(() => store.set(KEY.dates, dates), 800);
  }

  const LIST_BG_CSS = IS_WORK_PAGE ? '' : 'html, body { background-color: #111111 !important; }';

  const SITE_CSS = `
    ${LIST_BG_CSS}
    .hk-banner, .hk-native { display: none !important; }
    #search-button, button#search, .search-button, input[type="submit"][value="Search" i] { display: none !important; }
    .search-content, #search-content, #search-form, .search-bar, #search-box,
    .search-box, #query-input, #search-options { display: none !important; }
    .gallery-content > div.hk-hidden, .gallery-content > div.hk-blocked, .gallery-content > div.hk-merged { display: none !important; }
    .gallery-content > .hk-stray { display: none !important; }
    .hk-vanish { display: none !important; }
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
    .gallery-content > div[data-hk-done] {
      border-radius: 18px; overflow: hidden;
      background: transparent; border: 1px solid transparent;
      transition: transform .4s cubic-bezier(.22, 1, .36, 1), box-shadow .4s cubic-bezier(.22, 1, .36, 1), border-color .3s ease, background .3s ease;
    }
    .gallery-content > div[data-hk-done].hk-img-ok {
      background: #1e1e22; border-color: rgba(255, 255, 255, 0.1);
    }
    .gallery-content > div[data-hk-done].hk-img-ok:hover {
      transform: translateY(-3px); border-color: rgba(255, 255, 255, 0.25);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
    }
    .gallery-content > div[data-hk-done].hk-img-ok:active { transform: scale(.985); transition-duration: .12s; }
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
    .thumb img {
      display: block !important; width: 100% !important; height: 100% !important;
      max-width: none !important; max-height: none !important; margin: 0 !important;
      object-fit: cover !important; border: 0 !important;
      transition: transform .7s cubic-bezier(.22, 1, .36, 1), opacity .4s ease !important;
    }
    .card:hover .thumb img { transform: scale(1.05); }
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
    .grp:hover { background: rgba(40, 40, 52, 0.8); }
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
    .grplist a:hover { background: rgba(255, 255, 255, 0.12); }
    .grplist .d { color: rgba(255, 255, 255, 0.6); font-size: 10.5px; }
    .info {
      position: absolute; left: 0; right: 0; bottom: 0;
      padding: 38px 12px 12px; cursor: pointer;
      border-radius: 0 0 17px 17px;
      background: linear-gradient(to top, rgba(255, 255, 255, 0.96) 0%, rgba(255, 255, 255, 0.85) 45%, rgba(255, 255, 255, 0) 100%);
      transition: padding .3s ease;
    }
    .title a {
      display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      color: #000; text-decoration: none;
      font-size: 13px; font-weight: 600; line-height: 1.35; letter-spacing: -0.01em;
      transition: color .25s ease;
    }
    .title a:hover { color: #1f4fbf; }
    .card.viewed .info {
      background: linear-gradient(to top, rgba(110, 160, 255, 0.96) 0%, rgba(110, 160, 255, 0.85) 45%, rgba(110, 160, 255, 0) 100%);
    }
    @keyframes seenIn { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }
    @media (min-width: 521px) {
      .info { padding: 42px 14px 14px; }
      .title a { font-size: 14.5px; }
    }
  `;

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

    #root.busy .pill, #root.busy .glass { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
    .pill {
      background: rgba(24, 24, 28, 0.44);
      -webkit-backdrop-filter: blur(26px) saturate(110%);
      backdrop-filter: blur(26px) saturate(110%);
      border: 1px solid rgba(255, 255, 255, 0.12);
      box-shadow: 0 18px 44px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }
    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      .pill { background: rgba(28, 28, 32, 0.94); }
    }
    @media (hover: none), (pointer: coarse) {
      .pill { background: rgba(24, 24, 28, 0.5); }
    }

    @keyframes hkBarIn {
      from { opacity: 0; transform: translateY(24px) scale(0.98); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes hkBump {
      from { transform: scale(.9); opacity: .6; }
      to   { transform: none; opacity: 1; }
    }
    @keyframes hkSwap {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: none; }
    }
    @keyframes seenIn { from { opacity: 0; transform: scale(.7); } to { opacity: 1; transform: none; } }

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
    }
    .tl .pg.bump { animation: hkBump .34s var(--ease); }
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
    .ib.active { background: rgba(255, 255, 255, 0.20); color: #fff; }
    .ib.gear:active svg { transform: rotate(60deg); }
    .ib.pin.on { color: #ffd54a; }
    .ib.pin.on svg path { fill: currentColor; }

    .bar {
      display: flex; align-items: center; gap: 2px;
      height: calc(52px - 16px * var(--c, 0)); padding: 0 6px; border-radius: 999px;
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
      -webkit-appearance: none; appearance: none; border: 0; flex: none; cursor: pointer;
      display: inline-flex; align-items: center; gap: 7px;
      height: calc(44px - 8px * var(--c, 0)); padding: 0 15px 0 13px; border-radius: 999px;
      color: var(--text); font: inherit; font-size: 12.5px; font-weight: 700;
      animation: hkBarIn .7s var(--ease) .12s backwards;
      transition: color .2s var(--ease);
    }
    .filt svg { display: block; width: 16px; height: 16px; opacity: .85; }
    .filt .fl { white-space: nowrap; }
    .filt.active { color: #fff; }
    .hk-ch { display: inline-block; animation: hkCh .55s cubic-bezier(.22, 1, .36, 1) backwards; }
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
      background: rgba(24, 24, 28, 0.92) !important;
      transform-origin: 100% 100%; will-change: transform, opacity;
    }
    .panel.open, .toast.open { display: block; }
    .panel.open.out, .toast.open.out { pointer-events: none; }
    .toast {
      transform-origin: 100% 100%;
      padding: 9px 16px; border-radius: 999px; color: #fff; white-space: nowrap;
      background: rgba(24, 24, 28, 0.92) !important;
    }
    .panel.mini { width: auto; min-width: 220px; padding: 14px 16px; }
    .panel.mini .val { margin-bottom: 10px; }

    .panel.hist { display: flex; flex-direction: column; overflow: hidden; }
    .panel.hist > .seg { flex: none; }
    .panel.hist > .hbody {
      flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain;
      padding-bottom: 2px; scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, .28) transparent;
    }
    .panel.top {
      position: fixed; top: 12px; right: 16px; bottom: auto;
      width: min(440px, calc(100vw - 32px));
      max-height: min(64vh, 540px);
      transform-origin: 100% 0;
    }
    .glass {
      position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 1;
      border-radius: 26px; pointer-events: none;
      background: rgba(0, 0, 0, 0);
      -webkit-backdrop-filter: blur(22px) saturate(120%);
      backdrop-filter: blur(22px) saturate(120%);
      visibility: hidden; opacity: 0;
    }
    .glass.on { visibility: visible; opacity: 1; }

    .tgrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .tog {
      display: flex; align-items: center; justify-content: center; min-height: 46px;
      padding: 10px 8px; border-radius: 14px; text-align: center;
      background: rgba(255, 255, 255, 0.08); color: var(--sub);
      font-size: 12.5px; font-weight: 600; cursor: pointer; user-select: none;
      transition: background .25s var(--ease), color .25s var(--ease), transform .2s var(--ease);
    }
    .tog:active { transform: scale(.96); }
    .tog.on {
      background: rgba(255, 255, 255, 0.22); color: #fff;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
    }

    .sgl { margin-top: 8px; }
    .sgl:empty { margin-top: 0; }
    .hbody.hin { animation: hkSwap .32s var(--ease); }
    .sg {
      display: flex; align-items: center; gap: 8px;
      padding: 11px 14px; border-radius: 14px; cursor: pointer; font-size: 14px;
      transition: background .2s var(--ease);
    }
    .sg:hover, .sg.hl { background: rgba(255, 255, 255, 0.13); }
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
      line-height: 24px; color: var(--sub); transition: background .2s, color .2s;
    }
    .sg .x:hover { color: #fff; background: rgba(255, 255, 255, 0.14); }

    .slist { display: flex; flex-direction: column; gap: 4px; }
    .srow {
      -webkit-appearance: none; appearance: none; border: 0; background: none; flex: none;
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 12px 15px; border-radius: 14px; color: var(--text);
      font: inherit; font-size: 13.5px; font-weight: 500; text-align: left; cursor: pointer;
      transition: background .2s var(--ease), color .2s var(--ease);
    }
    .srow:hover { background: rgba(255, 255, 255, 0.13); }
    .srow.on { background: rgba(255, 255, 255, 0.20); color: #fff; font-weight: 700; }
    .srow.on::after { content: '✓'; font-size: 12px; }

    .btn {
      -webkit-appearance: none; appearance: none;
      display: inline-flex; align-items: center; justify-content: center; flex: none;
      height: 34px; padding: 0 14px; border-radius: 999px;
      border: 1px solid var(--border); background: rgba(255, 255, 255, 0.10);
      color: var(--text); font-weight: 500; white-space: nowrap; cursor: pointer; text-decoration: none;
      transition: background .25s var(--ease), border-color .25s var(--ease), color .25s var(--ease), transform .25s var(--ease);
    }
    .btn:hover { background: rgba(255, 255, 255, 0.18); transform: translateY(-1px); }
    .btn:active { transform: scale(.95); transition-duration: .1s; }
    .btn.sm { height: 28px; padding: 0 12px; font-size: 12px; }
    .btn.primary { background: rgba(255, 255, 255, 0.92); border-color: transparent; color: #14161a; font-weight: 700; }
    .btn.primary:hover { background: #fff; }
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
    .segb:hover { color: #fff; }
    .segb.on { background: rgba(255, 255, 255, 0.20); color: #fff; }

    .row { display: flex; align-items: center; gap: 6px; }
    .row + .row, .row + .list, .lbl + .row, .row + .lbl, .hint + .lbl { margin-top: 8px; }
    .row.wrap-row { flex-wrap: wrap; }
    .list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
    .acts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 0 2px 2px; }
    .acts .btn { width: 100%; height: 28px; padding: 0 2px; font-size: 11.5px; }
    .item {
      display: flex; flex-direction: column; gap: 6px; min-width: 0;
      padding: 6px; border-radius: 16px; background: rgba(255, 255, 255, 0.08);
      transition: background .3s var(--ease), transform .3s var(--ease);
    }
    .item:hover { background: rgba(255, 255, 255, 0.14); transform: translateY(-2px); }
    .tb {
      width: 100%; aspect-ratio: 3 / 4; border-radius: 11px; overflow: hidden;
      background: rgba(0, 0, 0, 0.28); cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      text-align: center; color: var(--sub); font-size: 11px; line-height: 1.2;
    }
    .tb img { display: block; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .45s ease, transform .6s var(--ease); }
    .tb img.ld { opacity: 1; }
    .item:hover .tb img { transform: scale(1.05); }
    .foot { display: flex; align-items: center; gap: 2px; padding: 0 0 2px 4px; min-width: 0; }
    .info { flex: 1 1 0; min-width: 0; cursor: pointer; }
    .info .id { font-weight: 700; color: #fff; }
    .info .ttl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #eee; font-size: 12px; }
    .info .dt { color: var(--sub); font-size: 10.5px; }
    .info .st { color: #ffd54a; letter-spacing: .06em; }
    .empty { color: var(--sub); padding: 18px 4px; text-align: center; grid-column: 1 / -1; }

    .stars { display: flex; gap: 0; margin: 2px 0 2px -6px; }
    .starb {
      -webkit-appearance: none; appearance: none; border: 0; background: none; cursor: pointer;
      padding: 2px 5px; font-size: 25px; line-height: 1; color: rgba(255, 255, 255, 0.24);
      transition: color .18s var(--ease), transform .18s var(--ease);
    }
    .starb.on { color: #ffd54a; }
    .starb:active { transform: scale(.84); }
    .bmt { margin: 2px 2px 0; color: #fff; font-weight: 700; font-size: 13.5px; line-height: 1.45; word-break: break-word; }
    .ico {
      -webkit-appearance: none; appearance: none; border: 0; background: none; flex: none;
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%; color: var(--sub); font-size: 14px; cursor: pointer;
      transition: color .2s, background .2s, transform .2s var(--ease);
    }
    .ico:hover { color: #fff; background: rgba(255, 255, 255, 0.12); }
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
    .chip:hover { background: rgba(255, 255, 255, 0.18); transform: translateY(-1px); }
    .chip:active { transform: scale(.95); }
    .chip.bad { background: rgba(255, 90, 90, 0.18); border-color: rgba(255, 120, 120, 0.45); }
    .chip.f { background: rgba(255, 110, 150, 0.22); border-color: rgba(255, 130, 165, 0.45); }
    .chip.m { background: rgba(100, 160, 255, 0.22); border-color: rgba(120, 170, 255, 0.45); }
    .chip.a { background: rgba(160, 130, 255, 0.22); border-color: rgba(175, 150, 255, 0.45); }

    .ttl { font-size: 15.5px; font-weight: 700; line-height: 1.4; word-break: break-word; }
    .val { font-size: 13.5px; color: #fff; word-break: break-word; }
    .row2 { display: flex; gap: 8px; }
    .row2 > div { flex: 1 1 0; min-width: 0; }
    .copy { cursor: pointer; color: #fff; font-weight: 700; font-variant-numeric: tabular-nums; text-decoration: underline; text-underline-offset: 3px; }
    .copy:hover { color: #d8e6ff; }
    .muted { color: var(--sub); padding: 6px 2px; }


    .pvgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 6px; }
    .pvc {
      position: relative; aspect-ratio: 3 / 4; border-radius: 10px; overflow: hidden;
      background: rgba(255, 255, 255, 0.08); color: var(--sub); font-size: 11px;
      display: flex; align-items: center; justify-content: center; cursor: pointer;
    }
    .pvc img { display: block; width: 100%; height: 100%; object-fit: cover; }
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
      .bar { height: calc(48px - 12px * var(--c, 0)); }
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
    .hk-zoom img { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; pointer-events: none; }
    .hk-zoom img.hk-z-thumb { object-fit: cover; transition: opacity .35s ease; }
    .hk-zoom img.hk-z-page { object-fit: contain; opacity: 0; transition: opacity .35s ease; }
    .hk-zoom img.hk-z-page.ok { opacity: 1; }
    .hk-pg { transform: translate(var(--hk-px, 0px), var(--hk-py, 0px)) scale(var(--hk-z, 1)); transform-origin: 50% 50%; }
    html.hk-zanim .hk-pg { transition: transform .3s cubic-bezier(.22, 1, .36, 1); }
    .hk-zoom {
      position: fixed; z-index: 2147483646; pointer-events: none; overflow: hidden;
      background-color: #000;
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
      transition: opacity .25s ease, top .46s cubic-bezier(.5, 0, .15, 1), left .46s cubic-bezier(.5, 0, .15, 1),
        width .46s cubic-bezier(.5, 0, .15, 1), height .46s cubic-bezier(.5, 0, .15, 1),
        border-radius .46s cubic-bezier(.5, 0, .15, 1), box-shadow .46s ease;
    }
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
      transform: translate(calc(var(--hk-dx, 0px) + var(--hk-px, 0px)),
                           calc(var(--hk-dy, 0px) + var(--hk-py, 0px)))
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

  function goTo(id) {
    location.href = `/${settings.reader ? 'reader' : 'galleries'}/${id}.html`;
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
    const p = n => String(n).padStart(2, '0');
    let s = `${m[1]}.${p(m[2])}.${p(m[3])}`;
    if (m[4] != null) s += ` ${+m[4]}:${m[5]}`;
    return s;
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
  const starStr = n => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);

  function addSaved(id, title, alias, stars) {
    if (isSaved(id)) return false;
    saved.unshift({
      id, title: title || '', alias: alias || '',
      stars: Math.max(0, Math.min(5, Math.round(+stars || 0))),
      ts: Date.now()
    });
    saveList();
    return true;
  }

  function updateSaved(id, alias, stars) {
    const it = savedOf(id);
    if (!it) return false;
    it.alias = alias || '';
    it.stars = Math.max(0, Math.min(5, Math.round(+stars || 0)));
    saveList();
    return true;
  }

  function removeSaved(id) {
    saved = saved.filter(s => s.id !== id);
    saveList();
  }

  function recordWatch(titleOnly) {
    const id = getCurrentId();
    if (!id || !IS_WORK_PAGE) return;
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

  function goHome() {
    let from = null;
    try {
      from = sessionStorage.getItem('hk_from');
      sessionStorage.setItem('hk_home', '1');
    } catch (e) {}
    location.href = from || KOREAN_LINK;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => window.prompt('복사하세요:', text));
    }
    window.prompt('복사하세요:', text);
    return Promise.resolve();
  }

  const SORTS = [
    ['date', 'Date Published', `/index-${LANG}.html`],
    ['today', 'Popular: Today', `/popular/today-${LANG}.html`],
    ['week', 'Popular: Week', `/popular/week-${LANG}.html`],
    ['month', 'Popular: Month', `/popular/month-${LANG}.html`],
    ['year', 'Popular: Year', `/popular/year-${LANG}.html`]
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
  }

  (function readScrollTarget() {
    try {
      const nav = performance.getEntriesByType('navigation')[0];
      const v = sessionStorage.getItem(SCROLL_KEY);
      const home = sessionStorage.getItem('hk_home') === '1';
      if (home) sessionStorage.removeItem('hk_home');
      if (v && ((nav && nav.type === 'back_forward') || home)) scrollTarget = +v;
      history.scrollRestoration = 'manual';
    } catch (e) {}
  })();

  function restoreScroll() {
    if (scrollTarget == null) return;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    if (maxY >= scrollTarget - 5) {
      window.scrollTo(0, scrollTarget);
      scrollTarget = null;
      try { sessionStorage.removeItem(SCROLL_KEY); sessionStorage.removeItem(SCROLL_KEY + ':p'); } catch (e) {}
    }
  }

  function rewriteLinks(root) {
    root.querySelectorAll('a[href]').forEach(a => {
      if (a.closest('.gallery-content')) return;
      const href = a.getAttribute('href');
      if (href === '/' || href === '/index-all.html') {
        a.setAttribute('href', KOREAN_LINK);
      } else if (/-all\.html$/.test(href)) {
        a.setAttribute('href', href.replace(/-all\.html$/, `-${LANG}.html`));
      }
    });
  }

  function filterGalleries(root) {
    if (!settings.koreanOnly) return;
    root.querySelectorAll('.gallery-content > div').forEach(item => {
      if (item.dataset.krChecked) return;
      if (!item.querySelector('a')) return;
      item.dataset.krChecked = '1';
      if (!item.querySelector(`a[href^="${KOREAN_LINK}"]`)) item.classList.add('hk-hidden');
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
    const KEEP_ID = new Set(['hk-host', 'hk-fx-ov', 'hk-sentinel', 'hk-off', 'hk-cover', 'hk-bg']);
    const KEEP_CLS = new Set(['hk-zoom', 'page-container']);
    const keep = el => KEEP_ID.has(el.id) || el.className.split(' ').some(c => KEEP_CLS.has(c));
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
      const links = el.querySelectorAll('a[href]');
      for (let i = 0; i < links.length; i++) {
        if (WORK_HREF_RE.test(links[i].getAttribute('href') || '')) return;
      }
      el.classList.add('hk-stray');
    });
  }

  function buildCardHost(media, readerUrl, title, id, seenIds) {
    const cardHost = document.createElement('div');
    cardHost.className = 'hk-card-host';
    cardHost.style.cssText = 'display:block;';
    const sh = cardHost.attachShadow({ mode: 'open' });
    sh.innerHTML = `
      <style>${CARD_CSS}</style>
      <div class="card">
        <a class="thumb"></a>
        <button class="grp" type="button" style="display:none"></button>
        <div class="grplist" style="display:none"></div>
        <div class="info">
          <div class="title"><a></a></div>
        </div>
      </div>`;

    const thumbA = sh.querySelector('.thumb');
    thumbA.href = readerUrl;
    thumbA.appendChild(media);

    const titleA = sh.querySelector('.title a');
    titleA.href = readerUrl;
    titleA.textContent = settings.koreanTitle ? koreanTitle(title) : title;
    titleA.title = title;

    cardHost.dataset.hkId = id;
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
    sh.querySelector('.info').addEventListener('click', e => {
      if (e.target.closest('a')) return;
      location.href = readerUrl;
    });

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

    const { cardHost, sh } = buildCardHost(media, readerUrl, title, id, seenIds);

    const cardEl = sh.querySelector('.card');
    const reveal = () => { cardEl.classList.add('hk-on'); card.classList.add('hk-img-ok'); };
    if (img.complete && img.naturalWidth) reveal();
    else {
      img.addEventListener('load', reveal, { once: true });
      img.addEventListener('error', () => cardEl.classList.add('hk-on'), { once: true });
    }

    Array.from(card.children).forEach(c => c.classList.add('hk-hide'));
    card.appendChild(cardHost);
  }

  function restyleCards(root) {
    const seenIds = new Set(watched.map(w => w.id));
    root.querySelectorAll('.gallery-content > div').forEach(card => restyleOneCard(card, seenIds));
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
      if (settings.mergeTitles && key && !card.classList.contains('hk-hidden') && !card.classList.contains('hk-blocked')) {
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

  window.addEventListener('pageshow', e => {
    if (!e.persisted) return;
    watched = store.get(KEY.watched, []);
    saved = store.get(KEY.saved, []);
    blocked = store.get(KEY.blocked, []);
    refreshViewed();
    applyBlock(true);
  });

  const TAXO_RE = /^\/(tag|artist|group|series|character)\/(.+)-[a-z]+\.html/i;
  const CARD_INFO = new WeakMap();

  function normBlock(s) {
    return (s || '').toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/^tag:/, '');
  }

  function getCardInfo(card) {
    let info = CARD_INFO.get(card);
    if (info) return info;
    const links = card.querySelectorAll('a[href]');
    if (!links.length) return null;
    const keys = new Set(), tags = [];
    links.forEach(a => {
      const m = (a.pathname || '').match(TAXO_RE);
      if (!m) return;
      let name = m[2];
      try { name = decodeURIComponent(name); } catch (e) {}
      name = normBlock(name);
      if (!name) return;
      const type = m[1].toLowerCase();
      if (type === 'tag') {
        keys.add(name);
        const i = name.indexOf(':');
        if (i > 0) keys.add(name.slice(i + 1));
        if (tags.indexOf(name) < 0) tags.push(name);
      } else {
        const k = type + ':' + name;
        keys.add(k);
        if (tags.indexOf(k) < 0) tags.push(k);
      }
    });
    info = { keys, tags };
    CARD_INFO.set(card, info);
    return info;
  }

  function applyBlock(all) {
    const set = (settings.blockTags && blocked.length) ? new Set(blocked) : null;
    document.querySelectorAll('.gallery-content > div').forEach(card => {
      if (!all && card.dataset.hkBlk) return;
      const info = getCardInfo(card);
      if (!info) return;
      card.dataset.hkBlk = '1';
      let hit = false;
      if (set) for (const k of info.keys) { if (set.has(k)) { hit = true; break; } }
      card.classList.toggle('hk-blocked', hit);
    });
    if (all) mergeDuplicates();
  }

  function addBlock(raw) {
    const e = normBlock(raw);
    if (!e || blocked.indexOf(e) >= 0) return false;
    blocked.unshift(e);
    saveBlocked();
    applyBlock(true);
    kickInfinite();
    return true;
  }

  function removeBlock(e) {
    blocked = blocked.filter(x => x !== e);
    saveBlocked();
    applyBlock(true);
    kickInfinite();
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

  function fetchCards(url, expect) {
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
      }, 250);
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
    }, 500);
  }

  async function loadNext() {
    if (!inf || inf.loading) return;
    inf.loading = true;
    inf.stopped = false;
    setStatus('불러오는 중…');
    const n = inf.page + 1;
    let cards = null;
    try { cards = await fetchCards(pageUrl(n), inf.perPage); } catch (e) { cards = null; }
    const have = new Set(Array.from(inf.gc.children).map(c => cardWorkId(c)).filter(Boolean));
    let added = 0;
    (cards || []).forEach(c => {
      const id = cardWorkId(c);
      if (id && have.has(id)) return;
      if (id) have.add(id);
      inf.gc.appendChild(c);
      added++;
    });
    inf.loading = false;
    if (added) {
      inf.page = n;
      loadedPages = n;
      setStatus('');
      document.documentElement.classList.remove('hk-pager-on');
      if (inf.restore && inf.page < inf.restore) setTimeout(loadNext, 200);
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
    infTimer = setTimeout(startInfinite, 1000);
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
      }, { rootMargin: '1400px 0px' });
      inf.io.observe(el);
    }

    let want = 0;
    try { want = +sessionStorage.getItem(SCROLL_KEY + ':p') || 0; } catch (e) {}
    if (scrollTarget != null && want > inf.page) { inf.restore = want; loadNext(); }
  }

  function giveUpScroll() {
    if (inf && inf.restore) { setTimeout(giveUpScroll, 3000); return; }
    scrollTarget = null;
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

  function fetchGalleryFiles(gid) {
    const urls = [
      'https://ltn.hitomi.la/galleries/' + gid + '.js',
      '/galleries/' + gid + '.js'
    ];
    const tryAt = i => {
      if (i >= urls.length) { hlog('홈 미리 받기: 작품 정보 실패', gid); return Promise.resolve(null); }
      return fetch(urls[i], { credentials: i ? 'same-origin' : 'omit' })
        .then(r => (r && r.ok ? r.text() : ''))
        .then(t => {
          const m = t && t.match(/\[[\s\S]*\]/);
          let arr = null;
          if (m) { try { arr = JSON.parse(m[0]); } catch (e) {} }
          return Array.isArray(arr) && arr.length ? arr : tryAt(i + 1);
        })
        .catch(() => tryAt(i + 1));
    };
    return tryAt(0);
  }

  const WARM_LIMIT = 120;
  const warm = { sent: new Set(), queue: [], active: 0, used: 0, io: null };

  function warmIdOf(el) {
    if (!el) return null;
    if (el.dataset && el.dataset.hkId) return el.dataset.hkId;
    const h = el.querySelector && el.querySelector('.hk-card-host[data-hk-id]');
    return (h && h.dataset.hkId) || cardWorkId(el);
  }

  function warmEnqueue(el) {
    const id = warmIdOf(el);
    if (!id || warm.sent.has(id) || warm.queue.indexOf(id) >= 0) return;
    if (warm.used + warm.queue.length >= WARM_LIMIT) return;
    warm.queue.push(id);
    pumpWarm();
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
      if (card.classList.contains('hk-blocked') || card.classList.contains('hk-hidden') ||
          card.classList.contains('hk-stray')) return;
      card.dataset.hkWarm = '1';
      warm.io.observe(card);
    });
    pumpWarm();
  }

  function pumpWarm() {
    if (IS_WORK_PAGE) { warm.queue.length = 0; return; }
    while (warm.active < 2 && warm.queue.length) {
      if (warm.used >= WARM_LIMIT) { warm.queue.length = 0; return; }
      const id = warm.queue.shift();
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
        return fetch(u, { cache: 'force-cache' })
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
    const g = W().galleryinfo;
    const files = (g && g.files && g.files.length && (!g.id || String(g.id) === String(gid))) ? g.files : null;
    (files ? Promise.resolve(files) : fetchGalleryFiles(gid)).then(list => {
      if (!list || !list.length) return;
      const u = hkImageUrl(list[0]);
      if (u) fetch(u, { cache: 'force-cache' }).catch(() => {});
    });
  }

  const PRE_KEEP_BEHIND = 30;
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

  function smallOf(im) {
    try {
      const w = 360, h = Math.max(1, Math.round(360 * im.naturalHeight / (im.naturalWidth || 1)));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(im, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.9);
    } catch (e) { return ''; }
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
    const g = W().galleryinfo;
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
            preSmall.set(idx, smallOf(im));
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

  function initReaderPreload() {
    if (!settings.preload) return;
    const gid = getCurrentId();
    if (!gid) return;

    function tick(files) {
      const cur = fxPage() - 1;
      const ok = i => i >= 0 && i < files.length
        && !preDone.has(i) && !preBusy.has(i)
        && !(preFailAt.has(i) && Date.now() - preFailAt.get(i) < 8000);

      if (preBusy.size < 2) {
        let next = -1;
        for (let d = 1; d < files.length && next < 0; d++) {
          if (ok(cur + d)) next = cur + d;
          else if (d <= PRE_KEEP_BEHIND && ok(cur - d)) next = cur - d;
        }
        if (next >= 0) preloadPage(gid, files, next);
      }
      preBlob.forEach((u, i) => {
        if (i < cur - PRE_KEEP_BEHIND) {
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
        setInterval(() => tick(files), 300);
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
  const POP_CLOSE = [
    { transform: 'scale(1, 1)', opacity: 1, offset: 0 },
    { transform: 'scale(0.96, 0.9)', opacity: 0.5, offset: 0.5 },
    { transform: 'scale(0.92, 0.8)', opacity: 0, offset: 1 }
  ];

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
    if (!e.classList.contains('open')) return;
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
    const a = e.animate(POP_CLOSE, { duration: 280, easing: 'ease-out', fill: 'forwards' });
    if (g && g.animate) g.animate(POP_CLOSE, { duration: 280, easing: 'ease-out', fill: 'forwards' });
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
    saved.forEach(s => push(s.id, '북마크', false));
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
    const showTop = IS_WORK_PAGE;
    const curSort = currentSort();

    sh.innerHTML = `
      <style>${PANEL_CSS}</style>
      <div class="root" id="root">
        <div class="scrim" id="scrim"></div>
        <div class="glass" id="glass"></div>
        <div class="wrap" id="wrap">
          <div class="stack">
            <div class="toast pill" id="toast"></div>
            <div class="panel pill" id="panel"></div>
          </div>
          ${showTop ? `
          <div class="tl pill" id="tl">
            ${IS_READER ? `<div class="pg" id="pg" title="페이지 이동">- / -</div>` : ''}
            ${IS_READER ? `<button class="ib" type="button" id="zoomBtn" title="원래 크기로">${ICON.reset}</button>` : ''}
            <button class="ib" type="button" id="infoBtn" title="작품 세부사항 (작가·품번·태그·등록일)">${ICON.info}</button>
            <button class="ib" type="button" id="homeBtn" title="작품 누르기 직전 화면으로 (스크롤 위치 유지)"><b class="hh">H</b></button>
          </div>` : ''}
          <div class="bottom">
            ${curSort ? `
            <button class="filt pill" type="button" id="filt" title="정렬 바꾸기">
              ${ICON.sort}<span class="fl">${SORT_KR[curSort] || ''}</span>
            </button>` : ''}
            <div class="bar pill" id="bar">
              ${curId ? `
              <button class="cur" type="button" id="curNum" title="품번 복사">${curId}</button>
              <button class="ib pin" type="button" id="star" title="즐겨찾기에 추가">${ICON.pin}</button>` : ''}
              <button class="ib" type="button" id="searchBtn" title="검색">${ICON.search}</button>
              <button class="ib" type="button" id="histBtn" title="최근 / 북마크">${ICON.hist}</button>
              <button class="ib gear" type="button" id="setBtn" title="설정">${ICON.gear}</button>
            </div>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);

    const $ = sel => sh.querySelector(sel);
    const root = $('#root');
    const wrap = $('#wrap');
    const panel = $('#panel');
    const scrim = $('#scrim');
    const glass = $('#glass');

    let panelMode = null;
    let histMode = 'recent';
    let filterText = '';
    let histFilter = '';
    let sItems = [], sIdx = -1;
    let sInput = null;
    let sgSeq = 0;
    let bmId = null;
    let bmBack = null;
    let blockDraft = '';
    let confirmCb = null;

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
    function syncKeyboard() {
      const inner = window.innerHeight;
      const vis = vv ? vv.height + vv.offsetTop : inner;
      const kb = Math.max(0, Math.round(inner - vis));
      const topPanel = panel.classList.contains('top');
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
      document.body.style.paddingBottom = (showTop ? 122 : 88) + 'px';
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
    function ico(txt, title, fn, cls) {
      const b = el('button', 'ico' + (cls ? ' ' + cls : ''), txt);
      b.type = 'button';
      b.title = title;
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
      const showEmpty = () => { box.textContent = '이미지 없음'; };
      const u = thumbs[id];
      if (u) {
        const im = document.createElement('img');
        im.alt = '';
        im.loading = 'lazy';
        im.addEventListener('error', () => { im.remove(); showEmpty(); });
        im.addEventListener('load', () => im.classList.add('ld'));
        im.src = u;
        box.appendChild(im);
      } else showEmpty();
      box.addEventListener('click', () => goTo(id));
      return box;
    }

    function animHeight(apply) {
      const h0 = panel.offsetHeight;
      apply();
      const h1 = panel.offsetHeight;
      if (h0 === h1) return;
      panel.style.overflow = 'hidden';
      panel.style.height = h0 + 'px';
      requestAnimationFrame(() => {
        panel.style.transition = 'height .34s cubic-bezier(.22,1,.36,1)';
        panel.style.height = h1 + 'px';
        setTimeout(() => { panel.style.height = ''; panel.style.transition = ''; panel.style.overflow = ''; }, 380);
      });
    }

    let toastTimer = 0;
    function setChars(node, text) {
      node.textContent = '';
      Array.from(text).forEach((ch, i) => {
        const s = document.createElement('span');
        s.className = 'hk-ch';
        s.style.animationDelay = Math.min(i, 40) * 18 + 'ms';
        s.textContent = ch === ' ' ? '\u00a0' : ch;
        node.appendChild(s);
      });
    }

    function toast(msg) {
      const t = $('#toast');
      setChars(t, msg);
      popOpen(t, null);
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => popClose(t, null), 1600);
    }

    function updateCounts() {
      const st = $('#star');
      if (st && curId) {
        const on = isSaved(curId);
        st.classList.toggle('on', on);
        st.title = on ? '즐겨찾기 해제' : '북마크 추가 (별명·별점)';
      }
    }

    host.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Escape') setPanel(null, true);
    });
    ['keyup', 'keypress'].forEach(ev => host.addEventListener(ev, e => e.stopPropagation()));

    scrim.addEventListener('click', () => setPanel(null, true));
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

      if (!dates[id]) loadDate(id, my);
    }

    async function loadDate(id, my) {
      try {
        const r = await fetch('/galleries/' + id + '.html', { credentials: 'same-origin' });
        const t = await r.text();
        const m = t.match(/(?:date|등록|발매)[^0-9]{0,24}(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/i)
               || t.match(DATE_RE);
        if (!m) return;
        const p = n => String(n).padStart(2, '0');
        const s = `${m[1]}.${p(m[2])}.${p(m[3])}` + (m[4] != null ? ` ${+m[4]}:${m[5]}` : '');
        setDate(id, s);
        if (my !== infoSeq || panelMode !== 'info') return;
        const vals = panel.querySelectorAll('.row2 .val');
        if (vals.length) vals[vals.length - 1].textContent = s;
      } catch (e) {}
    }

    function renderHist() {
      panel.textContent = '';
      const seg = el('div', 'seg');
      [['recent', '모두'], ['saved', '북마크']].forEach(([k, t]) => {
        const b = el('button', 'segb' + (histMode === k ? ' on' : ''), t);
        b.type = 'button';
        b.addEventListener('click', () => {
          if (histMode === k) return;
          histMode = k;
          switchHist();
        });
        seg.appendChild(b);
      });
      const body = el('div', 'hbody');
      panel.append(seg, body);
      buildHistBody(body);
    }

    function switchHist() {
      const body = panel.querySelector('.hbody');
      if (!body) return renderHist();
      panel.querySelectorAll('.segb').forEach((b, i) => {
        b.classList.toggle('on', (i === 0 ? 'recent' : 'saved') === histMode);
      });
      filterText = ''; histFilter = '';
      animHeight(() => {
        body.textContent = '';
        buildHistBody(body);
        body.classList.remove('hin');
        void body.offsetWidth;
        body.classList.add('hin');
        setTimeout(() => body.classList.remove('hin'), 340);
      });
    }

    function copyIds(ids) {
      if (!ids.length) { toast('복사할 품번이 없습니다'); return; }
      copyText(ids.join(', ')).then(() => toast(ids.length + '개 품번 복사됨'));
    }

    function buildHistBody(body) {
      body.textContent = '';
      const r1 = el('div', 'row');
      const search = el('input', 'field');
      if (histMode === 'saved') {
        search.placeholder = '북마크 검색';
        search.value = filterText;
        search.addEventListener('input', () => { filterText = search.value.trim().toLowerCase(); renderItems(); });
        r1.append(search, btn('전체복사', 'sm', () => copyIds(saved.map(s => s.id))));
        const list = el('div', 'list');
        list.id = 'items';
        body.append(r1, list);
        renderItems();
      } else {
        search.placeholder = '기록 검색 (품번)';
        search.value = histFilter;
        search.addEventListener('input', () => { histFilter = search.value.trim().toLowerCase(); renderHistItems(); });
        r1.append(search, btn('전체복사', 'sm', () => copyIds(watched.map(w => w.id))));
        const list = el('div', 'list');
        list.id = 'hitems';
        body.append(r1, list);
        renderHistItems();
      }
    }

    function renderItems() {
      const box = panel.querySelector('#items');
      if (!box) return;
      box.textContent = '';
      const f = filterText;
      const items = saved.filter(s => !f || s.id.includes(f) ||
        (s.alias || '').toLowerCase().includes(f) || (s.title || '').toLowerCase().includes(f));
      if (!items.length) {
        box.appendChild(el('div', 'empty', saved.length ? '검색 결과가 없습니다' : '저장된 품번이 없습니다'));
        return;
      }
      items.forEach(s => {
        const row = el('div', 'item');
        const info = el('div', 'info');
        info.title = '클릭: 열기';
        const dt = el('div', 'dt');
        const day = new Date(s.ts).toLocaleDateString('ko-KR');
        if (s.stars) dt.append(el('span', 'st', starStr(s.stars)), '  ' + day);
        else dt.textContent = day;
        info.append(el('div', 'id', s.id), el('div', 'ttl', s.alias || s.title || dates[s.id] || ''), dt);
        info.addEventListener('click', () => goTo(s.id));

        const foot = el('div', 'foot');
        foot.append(info);
        const acts = el('div', 'acts');
        acts.append(
          btn('수정', 'sm', () => openBm(s.id, 'hist')),
          btn('복사', 'sm', () => copyText(s.id).then(() => toast('복사됨'))),
          btn('삭제', 'sm', () => { removeSaved(s.id); updateCounts(); renderItems(); })
        );
        row.append(thumbEl(s.id), foot, acts);
        box.appendChild(row);
      });
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
        const info = el('div', 'info');
        info.title = '클릭: 열기';
        info.append(
          el('div', 'id', w.id),
          el('div', 'ttl', w.title || dates[w.id] || ''),
          el('div', 'dt', new Date(w.ts).toLocaleString('ko-KR',
            { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))
        );
        info.addEventListener('click', () => goTo(w.id));

        const fav = ico(isSaved(w.id) ? '★' : '☆', '북마크', () => {
          if (isSaved(w.id)) removeSaved(w.id); else addSaved(w.id, w.title);
          updateCounts();
          renderHistItems();
        }, isSaved(w.id) ? 'on' : '');

        const foot = el('div', 'foot');
        foot.append(info, fav, ico('✕', '기록 삭제', () => {
          watched = watched.filter(x => x.id !== w.id);
          saveWatched();
          renderHistItems();
        }));
        row.append(thumbEl(w.id), foot);
        box.appendChild(row);
      });
    }

    function openBm(id, back) {
      if (!id) return;
      const same = panelMode === 'bm' && bmId === id;
      bmId = id;
      if (same) { renderBm(); return; }
      bmBack = back || (panelMode && panelMode !== 'bm' ? panelMode : null);
      setPanel('bm');
    }

    function backFromBm() {
      const to = bmBack;
      bmId = null;
      bmBack = null;
      setPanel(to || null, !to);
    }

    function renderBm() {
      panel.textContent = '';
      const it = savedOf(bmId);
      const title = (it && it.title) || dates[bmId] || '';
      let stars = (it && it.stars) || 0;

      panel.appendChild(el('div', 'lbl', '북마크'));
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
      };
      for (let i = 1; i <= 5; i++) {
        const b = el('button', 'starb', '★');
        b.type = 'button';
        b.addEventListener('click', () => { stars = (stars === i ? 0 : i); paint(); });
        row.appendChild(b);
      }
      paint();
      panel.appendChild(row);

      const save = () => {
        const alias = inp.value.trim();
        if (isSaved(bmId)) updateSaved(bmId, alias, stars);
        else addSaved(bmId, title, alias, stars);
        updateCounts();
        toast(alias ? '북마크 저장: ' + alias : '즐겨찾기에 추가');
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
          removeSaved(bmId);
          updateCounts();
          toast('즐겨찾기 해제');
          backFromBm();
        }));
      }
      panel.appendChild(r2);
      panel.appendChild(el('div', 'hint', '별명을 적으면 제목 대신 그 별명이 보입니다. 별점은 목록에 ★로 표시됩니다.'));
    }

    function importList() {
      const text = window.prompt('JSON 또는 품번 목록(공백/줄바꿈/쉼표 구분)을 붙여넣으세요:');
      if (!text) return;
      let added = 0;
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) {
          arr.forEach(o => {
            const id = String(o && o.id ? o.id : o).replace(/\D/g, '');
            if (id && !isSaved(id)) {
              saved.push({ id, title: (o && o.title) || '', ts: (o && o.ts) || Date.now() });
              added++;
            }
          });
        }
      } catch (e) {
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
      SORTS.forEach(([key, , url]) => {
        const b = el('button', 'srow' + (key === cur ? ' on' : ''), SORT_KR[key] || key);
        b.type = 'button';
        b.addEventListener('click', () => { location.href = url; });
        list.appendChild(b);
      });
      panel.appendChild(list);
    }

    function renderSettings() {
      panel.textContent = '';
      const helpRow = el('div', 'row');
      helpRow.append(btn('? 기능 설명', '', () => setPanel('help')));
      panel.appendChild(helpRow);

      const cur = currentSort();
      if (cur) {
        panel.appendChild(el('div', 'lbl', '정렬'));
        const c = el('div', 'chips');
        SORTS.forEach(([key, , url]) => {
          const a = el('span', 'chip' + (cur === key ? ' on' : ''), SORT_KR[key] || key);
          a.addEventListener('click', () => { location.href = url; });
          c.appendChild(a);
        });
        panel.appendChild(c);
      }

      panel.appendChild(el('div', 'lbl', '기능'));
      const grid = el('div', 'tgrid');
      [
        ['preload', 'Pre Load'],
        ['koreanOnly', 'Only Korean'],
        ['infinite', 'Unlimited scroll']
      ].forEach(([key, label]) => {
        const t = el('div', 'tog' + (settings[key] ? ' on' : ''), label);
        t.setAttribute('role', 'switch');
        t.addEventListener('click', () => {
          const next = !settings[key];
          if (['koreanOnly', 'infinite'].includes(key)) {
            askConfirm('새로고침해서 적용할까요?', () => {
              settings[key] = next;
              saveSettings();
              location.reload();
            }, () => setPanel('set'));
            return;
          }
          settings[key] = next;
          saveSettings();
          t.classList.toggle('on', !!settings[key]);
        });
        grid.appendChild(t);
      });
      panel.appendChild(grid);

      panel.appendChild(el('div', 'lbl', '북마크 (' + saved.length + ')'));
      const br = el('div', 'row wrap-row');
      br.append(
        btn('내보내기', '', () => copyText(JSON.stringify(saved)).then(() => toast('클립보드에 복사했습니다'))),
        btn('가져오기', '', importList)
      );
      panel.appendChild(br);

      panel.appendChild(el('div', 'lbl', '차단 (' + blocked.length + ')'));
      const cb2 = el('div', 'row');
      cb2.append(
        btn('차단 목록 관리', '', () => setPanel('block')),
        btn('진단 로그 보기', '', () => setPanel('log'))
      );
      panel.appendChild(cb2);
    }

    function renderHelp() {
      panel.textContent = '';
      panel.appendChild(btn('← 설정', '', () => setPanel('set')));
      const sections = [
        ['목록', [
          ['카드 누르기', '작품이 커지면서 1페이지로 바뀌어 열립니다. 1페이지가 미리 받아진 카드에는 흰 테두리가 생깁니다.'],
          ['파란 테두리와 그라데이션', '이미 본 작품입니다.'],
          ['×N 뱃지', '제목이 같은 작품이 여러 개 묶여 있다는 뜻입니다. 누르면 목록이 펼쳐집니다.'],
          ['정렬 필터', '목록 정렬 방식을 바꿉니다.'],
          ['하단 알약', '품번 복사, 북마크(☆), 검색, 최근·북마크 목록, 설정을 엽니다.']
        ]],
        ['리더', [
          ['왼쪽 탭 · ←', '다음 페이지로 넘어갑니다.'],
          ['오른쪽 탭 · →', '이전 페이지로 넘어갑니다.'],
          ['드래그', '손가락을 따라 페이지가 움직입니다. 오른쪽으로 끌면 다음, 왼쪽으로 끌면 이전입니다. 절반 이상 끌거나 빠르게 밀면 넘어갑니다.'],
          ['두 손가락', '벌려서 확대하고 모아서 줄입니다. 확대한 채로 두 손가락을 움직이면 이동도 함께 됩니다.'],
          ['확대 상태', '한 손가락으로 끌면 이동합니다. 확대 중에는 탭으로 넘어가지 않습니다.'],
          ['복구 버튼', '누르면 가운데 정렬된 1배로 돌아옵니다. 1배보다 작게 줄인 뒤 손을 떼도 1배로 돌아옵니다.'],
          ['Ctrl + 휠', '확대와 축소를 합니다.'],
          ['0 / N', '누르면 페이지 미리보기가 열립니다.'],
          ['H', '작품을 누르기 직전의 목록으로 돌아갑니다 (스크롤 위치 유지).']
        ]],
        ['설정', [
          ['Pre Load', '다음 페이지를 미리 받습니다. 목록에서는 화면에 보이는 작품의 1페이지를 미리 받습니다.'],
          ['Only Korean', '한국어 작품만 보여줍니다. 바꾸면 새로고침합니다.'],
          ['Unlimited scroll', '목록을 끝없이 이어 붙입니다. 바꾸면 새로고침합니다.'],
          ['차단 목록 관리', '태그와 작가 차단을 관리합니다.'],
          ['북마크 내보내기·가져오기', '북마크를 JSON으로 복사하거나 붙여넣습니다.'],
          ['진단 로그 보기', '미리 받기 실패 같은 문제를 확인합니다.']
        ]]
      ];
      sections.forEach(([title, items]) => {
        panel.appendChild(el('div', 'lbl', title));
        const box = el('div', 'hlp');
        items.forEach(([k, d]) => {
          box.appendChild(el('div', 'hlk', k));
          box.appendChild(el('div', 'hld', d));
        });
        panel.appendChild(box);
      });
    }

    function renderBlock() {
      const keepScroll = panel.scrollTop;
      panel.textContent = '';

      const r1 = el('div', 'row');
      const inp = el('input', 'field');
      inp.type = 'text';
      inp.placeholder = '예) female:ntr · artist:이름';
      inp.autocomplete = 'off';
      inp.value = blockDraft;
      inp.addEventListener('input', () => { blockDraft = inp.value; });
      const doAdd = () => {
        if (!normBlock(inp.value)) { toast('차단할 태그를 입력하세요'); return; }
        toast(addBlock(inp.value) ? '차단 목록에 추가' : '이미 있는 항목입니다');
        blockDraft = '';
        renderBlock();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
      r1.append(inp, btn('추가', 'primary', doAdd));
      panel.appendChild(r1);

      panel.appendChild(el('div', 'hint',
        '태그는 그대로(female:ntr), 작가·그룹은 artist:이름 / group:이름 으로 입력합니다. ' +
        '태그 이름만 쓰면(ntr) female/male 구분 없이 모두 차단됩니다.'));
      if (!settings.blockTags) panel.appendChild(el('div', 'hint', '※ 지금은 차단 기능이 꺼져 있습니다 (설정에서 켜기)'));

      const hidden = document.querySelectorAll('.gallery-content > div.hk-blocked').length;
      panel.appendChild(el('div', 'lbl', '차단 목록 (' + blocked.length + ')' + (hidden ? ' · 이 페이지에서 ' + hidden + '개 숨김' : '')));
      const bc = el('div', 'chips');
      if (!blocked.length) bc.appendChild(el('div', 'hint', '차단한 항목이 없습니다'));
      blocked.forEach(b => {
        const c = el('span', 'chip bad', b + '  ✕');
        c.title = '눌러서 차단 해제';
        c.addEventListener('click', () => { removeBlock(b); renderBlock(); });
        bc.appendChild(c);
      });
      panel.appendChild(bc);

      const cnt = new Map();
      document.querySelectorAll('.gallery-content > div').forEach(card => {
        const info = getCardInfo(card);
        if (!info) return;
        info.tags.forEach(t => { if (blocked.indexOf(t) < 0) cnt.set(t, (cnt.get(t) || 0) + 1); });
      });
      const top = Array.from(cnt.entries()).sort((a, b) => b[1] - a[1]).slice(0, 40);
      panel.appendChild(el('div', 'lbl', '이 페이지의 태그/작가 (눌러서 차단)'));
      const pc = el('div', 'chips');
      if (!top.length) pc.appendChild(el('div', 'hint', '작품 목록 페이지에서 열면 표시됩니다'));
      top.forEach(([t, n]) => {
        const c = el('span', 'chip', t + '  ' + n);
        c.addEventListener('click', () => { addBlock(t); renderBlock(); });
        pc.appendChild(c);
      });
      panel.appendChild(pc);
      panel.scrollTop = keepScroll;
    }

    function renderLog() {
      panel.textContent = '';
      panel.appendChild(el('div', 'lbl', '진단 정보'));
      let txt;
      try { txt = diagText(); } catch (e) { txt = '진단 정보를 만드는 중 오류: ' + (e && e.message ? e.message : e); }
      panel.appendChild(el('pre', 'diag', txt));
      const row = el('div', 'row');
      row.style.marginTop = '10px';
      row.append(
        btn('새로고침', 'sm', renderLog),
        btn('복사', 'primary', () => copyText(diagText()).then(() => toast('복사됨')))
      );
      panel.appendChild(row);
    }

    let pvTimer = 0, pvSig = '';

    function pvKey() {
      return [
        fxPage(),
        fxTotal(),
        Array.from(preDone).sort((a, b) => a - b).join(','),
        Array.from(preBusy.keys()).sort((a, b) => a - b).join(',')
      ].join('|');
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

      grid.textContent = '';
      for (let i = 0; i < total; i++) {
        const idx = i;
        const c = el('div', 'pvc' + (preDone.has(idx) ? ' ok' : '') + (idx + 1 === cur ? ' cur' : ''));
        const u = preSmall.get(idx);
        if (u) {
          const im = document.createElement('img');
          im.alt = '';
          im.src = u;
          c.appendChild(im);
        } else {
          c.appendChild(el('span', 'pvw', preBusy.has(idx) ? '받는 중' : '대기'));
        }
        c.appendChild(el('span', 'pvn', String(idx + 1)));
        c.addEventListener('click', () => {
          setPanel(null, true);
          if (idx + 1 !== fxPage()) location.hash = '#' + (idx + 1);
        });
        grid.appendChild(c);
      }
      return true;
    }

    function renderPreview() {
      panel.textContent = '';
      const head = el('div', 'lbl');
      head.id = 'pvHead';
      const hint = el('div', 'hint', '메모리에 두는 것은 현재 페이지 근처만입니다. 눌러서 해당 페이지로 이동.');
      const grid = el('div', 'pvgrid');
      grid.id = 'pvGrid';
      const row = el('div', 'row');
      row.style.marginTop = '10px';
      row.append(btn('새로고침', 'sm', () => { pvSig = ''; pvPaint(); }));
      panel.append(head, hint, grid, row);

      pvSig = '';
      pvPaint();

      clearInterval(pvTimer);
      pvTimer = setInterval(() => {
        if (panelMode !== 'preview' || !pvPaint()) {
          clearInterval(pvTimer);
          pvTimer = 0;
        }
      }, 250);
    }

    function askConfirm(msg, ok, cancel) {
      confirmCb = { msg, ok, cancel };
      setPanel('confirm');
    }

    function renderConfirm() {
      panel.textContent = '';
      const c = confirmCb || {};
      panel.appendChild(el('div', 'val', c.msg || '계속할까요?'));
      const row = el('div', 'row');
      row.append(
        btn('취소', 'sm', () => {
          const f = c.cancel;
          confirmCb = null;
          if (f) f(); else setPanel(null, true);
        }),
        btn('확인', 'primary sm', () => {
          const f = c.ok;
          confirmCb = null;
          if (f) f();
        })
      );
      panel.appendChild(row);
    }

    function renderHomeConfirm() {
      panel.textContent = '';
      panel.appendChild(el('div', 'val', '홈으로 이동할까요?'));
      const row = el('div', 'row');
      row.append(
        btn('취소', 'sm', () => setPanel(null, true)),
        btn('확인', 'primary sm', () => goHome())
      );
      panel.appendChild(row);
    }

    const btnFor = {
      search: '#searchBtn', hist: '#histBtn', set: '#setBtn', block: '#setBtn', log: '#setBtn',
      info: '#infoBtn', sort: '#filt', bm: '#star', preview: '#pg', home: '#homeBtn', confirm: '#setBtn', help: '#setBtn'
    };
    const RENDERERS = {
      search: renderSearch, hist: renderHist, set: renderSettings, block: renderBlock,
      log: renderLog, info: renderInfo, sort: renderSort, bm: renderBm,
      preview: renderPreview, home: renderHomeConfirm, confirm: renderConfirm, help: renderHelp
    };

    function setPanel(mode, closeOnly) {
      if (closeOnly) mode = null;
      else if (panelMode === mode) mode = null;
      const prev = panelMode;
      panelMode = mode;

      const activeSel = mode ? btnFor[mode] : null;
      Object.values(btnFor).forEach(sel => {
        const b = $(sel);
        if (b) b.classList.toggle('active', sel === activeSel);
      });

      if (mode) {
        const wasOpen = panel.classList.contains('open') && !panel.classList.contains('out');
        panel.scrollTop = 0;
        panel.style.height = ''; panel.style.transition = ''; panel.style.overflow = '';
        RENDERERS[mode]();
        panel.querySelectorAll('.lbl, .hlk, .hld').forEach(n => setChars(n, n.textContent));
        panel.classList.toggle('mini', mode === 'home' || mode === 'confirm');
        panel.classList.toggle('top', mode === 'search');
        panel.classList.toggle('hist', mode === 'hist');
        syncKeyboard();
        scrim.classList.add('on');
        if (prev && wasOpen) {
          panel.classList.remove('out');
          panel.classList.add('open');
          if (panel.animate) panel.animate(
            [{ opacity: 0.35, transform: 'translateY(8px) scale(.985)' }, { opacity: 1, transform: 'none' }],
            { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)' });
        } else {
          popOpen(panel, glass);
        }
      } else {
        popClose(panel, glass, () => {
          if (!panelMode) panel.textContent = '';
          panel.classList.remove('top', 'hist');
          scrim.classList.remove('on');
          syncKeyboard();
        });
      }
      root.classList.toggle('pop', !!panelMode);
    }

    sh.querySelectorAll('#bar button, #tl button, #filt, #pg').forEach(b => {
      b.addEventListener('click', e => {
        if (!panelMode) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        setPanel(null, true);
      }, true);
    });

    $('#searchBtn').addEventListener('click', () => setPanel('search'));
    $('#histBtn').addEventListener('click', () => setPanel('hist'));
    $('#setBtn').addEventListener('click', () => setPanel('set'));

    const homeBtn = $('#homeBtn');
    if (homeBtn) homeBtn.addEventListener('click', () => setPanel('home'));
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
        const first = pg.textContent === '- / -';
        pg.textContent = txt;
        if (!first) { pg.classList.remove('bump'); void pg.offsetWidth; pg.classList.add('bump'); }
      };
      updatePage();
      window.addEventListener('hashchange', updatePage);
      setInterval(updatePage, 600);
    }

    const star = $('#star');
    if (star) {
      star.title = '북마크 추가 (별명·별점)';
      star.addEventListener('click', () => {
        if (!curId) return;
        if (isSaved(curId)) {
          removeSaved(curId);
          updateCounts();
          toast('즐겨찾기 해제');
          if (panelMode === 'hist') (histMode === 'saved' ? renderItems : renderHistItems)();
        } else {
          openBm(curId, panelMode === 'hist' ? 'hist' : null);
        }
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

    const barS = { c: 0, v: 0, target: 0, raf: 0 };
    function barStep() {
      const K = 150, D = 14, dt = 1 / 60;
      barS.v += (-K * (barS.c - barS.target) - D * barS.v) * dt;
      barS.c += barS.v * dt;
      barS.c = Math.max(-0.3, Math.min(1.3, barS.c));
      root.style.setProperty('--c', barS.c.toFixed(4));
      if (Math.abs(barS.c - barS.target) < 0.001 && Math.abs(barS.v) < 0.005) {
        barS.c = barS.target;
        barS.v = 0;
        root.style.setProperty('--c', String(barS.c));
        barS.raf = 0;
        return;
      }
      barS.raf = requestAnimationFrame(barStep);
    }
    function barWake() { if (!barS.raf) barS.raf = requestAnimationFrame(barStep); }
    function barKick(v) { barS.v += v; barWake(); }
    function barTo(t) { barS.target = t; barWake(); }

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

    let barLastY = window.scrollY, barIdle = 0;
    window.addEventListener('scroll', () => {
      const y = window.scrollY, d = y - barLastY;
      barLastY = y;
      if (Math.abs(d) < 1) return;
      const amt = Math.min(1, Math.abs(d) / 36);
      barKick(Math.max(-2, Math.min(2, d * 0.04)));
      barTo(d > 0 ? amt : -amt * 0.4);
      clearTimeout(barIdle);
      barIdle = setTimeout(() => barTo(0), 220);
    }, { passive: true });

    updateCounts();
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
      } else {
        p.addEventListener('load', () => {
          p.classList.add('ok');
          const t = z.querySelector('.hk-z-thumb');
          if (t) t.style.opacity = '0';
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
      zoomEl = makeZoomEl(o.thumb || '', o.page || '', null);
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
      const zgo = () => { if (zp) zp.classList.add('ok'); if (zt) zt.style.opacity = '0'; };
      if (zp && zp.complete && zp.naturalWidth) zgo();
      else if (zp) zp.addEventListener('load', zgo, { once: true });
      try {
        sessionStorage.setItem('hk_zoom', JSON.stringify({ thumb: opt.thumb || '', page: opt.page || '' }));
      } catch (e) {}
    }
    ov.classList.add('on');
    setTimeout(() => { location.href = url; }, z ? 470 : 300);
    setTimeout(() => {
      fxBusy = false;
      if (z) z.remove();
      ov.classList.remove('on');
      try { sessionStorage.removeItem('hk_zoom'); sessionStorage.removeItem('hk_blk'); } catch (e) {}
    }, 4500);
  }

  document.addEventListener('click', e => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const path = e.composedPath();
    const hostEl = path.find(n => n && n.classList && n.classList.contains('hk-card-host'));
    if (!hostEl || !hostEl.shadowRoot) return;
    if (path.some(n => n && n.classList && (n.classList.contains('grp') || n.classList.contains('grplist')))) return;
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
      const g = W().galleryinfo;
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
    const rs = document.documentElement.style;
    if (soft) {
      rs.setProperty('--hk-px', Math.round(rubber(panX, panMaxX)) + 'px');
      rs.setProperty('--hk-py', Math.round(rubber(panY, panMaxY)) + 'px');
      return;
    }
    panX = Math.max(-panMaxX, Math.min(panMaxX, panX));
    panY = Math.max(-panMaxY, Math.min(panMaxY, panY));
    rs.setProperty('--hk-px', Math.round(panX) + 'px');
    rs.setProperty('--hk-py', Math.round(panY) + 'px');
  }

  function setZoom(z) {
    const nz = Math.max(Z_MIN, Math.min(Z_MAX, z));
    if (Math.abs(nz - zoom) < 0.002) return;
    const k = nz / zoom;
    panX *= k;
    panY *= k;
    zoom = nz;
    document.documentElement.style.setProperty('--hk-z', String(Math.round(zoom * 1000) / 1000));
    measurePan();
    applyPan();
  }

  function resetZoom() {
    zoom = 1; panX = 0; panY = 0;
    const rs = document.documentElement.style;
    rs.setProperty('--hk-z', '1');
    rs.setProperty('--hk-px', '0px');
    rs.setProperty('--hk-py', '0px');
    measurePan();
  }

  const TURN_DUR = 340;
  const TURN_N = 20;
  const TURN_DIST = 0.42;
  const TURN_FLIP = false;
  const DRAG_START = 8;
  const DRAG_CUT = 0.22;

  let coverEl = null;
  let turnSeq = 0;
  let shown = null;
  let activeTurns = 0;
  let turnWrap = null;
  let curLayer = null;
  let suppressClick = false;
  let ownPage = null;

  const press = (t, kick) => { if (window.__hkPress) window.__hkPress(t, kick); };

  function fitLayer(src, nw, nh) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / (nw || 1), vh / (nh || 1));
    const w = (nw || 1) * s, h = (nh || 1) * s;
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute!important;left:0!important;top:0!important;' +
      'width:100%!important;height:100%!important;transform-origin:50% 50%;will-change:transform,opacity;';
    const im = new Image();
    im.alt = '';
    im.className = 'hk-pg';
    im.src = src;
    im.style.cssText = 'position:absolute!important;display:block!important;margin:0!important;padding:0!important;' +
      'left:' + ((vw - w) / 2) + 'px!important;top:' + ((vh - h) / 2) + 'px!important;' +
      'width:' + w + 'px!important;height:' + h + 'px!important;max-width:none!important;max-height:none!important;';
    layer.appendChild(im);
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
  function setBusy(on) {
    const h = document.getElementById('hk-host');
    const r = h && h.shadowRoot && h.shadowRoot.getElementById('root');
    if (r) r.classList.toggle('busy', on);
  }
  function busyFor(ms) {
    setBusy(true);
    clearTimeout(busyT);
    busyT = setTimeout(() => setBusy(false), ms);
  }

  function ensureWrap() {
    if (!turnWrap) {
      turnWrap = document.createElement('div');
      turnWrap.className = 'hk-wrap';
      turnWrap.style.cssText = 'position:fixed!important;left:0!important;top:0!important;right:0!important;bottom:0!important;' +
        'pointer-events:none!important;overflow:hidden!important;z-index:2147483601!important;';
    }
    (document.documentElement || document.body).appendChild(turnWrap);
    return turnWrap;
  }

  function endChain() {
    if (turnWrap) { try { turnWrap.remove(); } catch (e) {} }
    turnWrap = null;
    curLayer = null;
    activeTurns = 0;
    coverDown();
  }

  function freezeLayer(layer) {
    if (!layer) return null;
    layer.getAnimations().forEach(a => { try { a.commitStyles(); } catch (e) {} a.cancel(); });
    return layer;
  }

  function outgoingLayer() {
    const f = freezeLayer(curLayer);
    if (f) return f;
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

  function slide(layer, x0, x1, s0 = 1, s1 = 1, o0 = 1, o1 = 1) {
    const p = springKeys(0, 1, 175, 21, TURN_N);
    p[p.length - 1] = 1;
    layer.animate(p.map(t => ({
      transform: `translate3d(${(x0 + (x1 - x0) * t).toFixed(1)}px,0,0) scale(${(s0 + (s1 - s0) * t).toFixed(4)})`,
      opacity: Math.min(1, Math.max(0, o0 + (o1 - o0) * t))
    })), { duration: TURN_DUR, easing: 'linear', fill: 'forwards' });
  }

  function waitPage(gid, files, idx, timeout) {
    return new Promise((resolve, reject) => {
      const t0 = performance.now();
      const tryNow = () => {
        const im = preImg.get(idx);
        if (im && im.complete && im.naturalWidth) { resolve(im); return; }
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

  function turn(dir) {
    busyFor(TURN_DUR + 120);
    if (zoom > 1.01) resetZoom();
    const total = fxTotal();
    const cur = fxPage();
    const next = cur + dir;
    if (next < 1 || (total && next > total)) return;

    const gid = getCurrentId();
    const files = readerFiles(gid);
    const side = TURN_FLIP ? -dir : dir;
    if (files && next < files.length) preloadPage(gid, files, next);

    const my = ++turnSeq;
    coverUp();
    activeTurns = 1;
    const wrap = ensureWrap();
    const outL = outgoingLayer();
    const D = window.innerWidth * TURN_DIST;

    const realBefore = findReaderImg();
    const attrBefore = realBefore ? realBefore.getAttribute('src') : null;
    ownPage = next;
    location.hash = '#' + next;

    const readyP = files
      ? waitPage(gid, files, next - 1, 10000).then(im => ({ src: im.src, nw: im.naturalWidth, nh: im.naturalHeight }))
      : waitRealImg(attrBefore, 10000);

    readyP.then(info => {
      if (my !== turnSeq) return;
      const inL = fitLayer(info.src, info.nw, info.nh);
      wrap.appendChild(inL);
      shown = info;
      if (outL) {
        slide(outL, 0, side * D, 1, 0.92, 1, 0);
        setTimeout(() => { if (outL !== curLayer) { try { outL.remove(); } catch (e) {} } }, TURN_DUR + 40);
      }
      slide(inL, -side * D, 0, dir > 0 ? 1.12 : 0.88, 1, 0, 1);
      curLayer = inL;
      press(0, 10);
    }).catch(() => {
      if (my !== turnSeq) return;
      hlog('넘김 실패: 새 페이지 대기 시간 초과');
      endChain();
    });
    hlog('넘김', cur, '→', next, preDone.has(next - 1) ? '(미리 받은 파일 사용)' : '(미리 받지 않음 · 사이트 로딩 대기)');
  }

  const drag = { id: null, x0: 0, y0: 0, px0: 0, py0: 0, mode: 0, dir: 0, dx: 0, lastX: 0, lastT: 0, v: 0,
    outL: null, inL: null, info: null, next: 0, my: 0 };
  const pts = new Map();
  let pinch = null;

  function pageReady(idx) {
    const im = preImg.get(idx);
    return im && im.complete && im.naturalWidth ? im : null;
  }

  function dragBegin(dir) {
    const total = fxTotal();
    const cur = fxPage();
    const next = cur + dir;
    const valid = !(next < 1 || (total && next > total));
    const gid = getCurrentId();
    const files = readerFiles(gid);

    drag.dir = dir;
    drag.next = next;
    drag.my = ++turnSeq;
    coverUp();
    activeTurns = 1;
    ensureWrap();
    drag.outL = outgoingLayer();
    drag.inL = null;
    drag.info = null;
    drag.files = valid && files ? files : null;
    if (valid && files) {
      if (next < files.length) preloadPage(gid, files, next);
      const im = pageReady(next - 1);
      if (im) {
        drag.info = { src: im.src, nw: im.naturalWidth, nh: im.naturalHeight };
        drag.inL = fitLayer(drag.info.src, drag.info.nw, drag.info.nh);
        ensureWrap().appendChild(drag.inL);
      }
    }
  }

  function dragLook(dx) {
    const p = Math.min(1, Math.abs(dx) / window.innerWidth);
    const s0 = drag.dir > 0 ? 1.12 : 0.88;
    return { sOut: 1 - 0.08 * p, oOut: 1 - 0.6 * p, sIn: s0 + (1 - s0) * p, oIn: p };
  }

  function dragMove(dx) {
    const W = window.innerWidth;
    busyFor(160);
    if (!drag.inL && drag.files) {
      const im = pageReady(drag.next - 1);
      if (im) {
        drag.info = { src: im.src, nw: im.naturalWidth, nh: im.naturalHeight };
        drag.inL = fitLayer(drag.info.src, drag.info.nw, drag.info.nh);
        ensureWrap().appendChild(drag.inL);
      }
    }
    const k = dragLook(dx);
    if (drag.inL) {
      if (drag.outL) {
        drag.outL.style.transform = `translate3d(${dx.toFixed(1)}px,0,0) scale(${k.sOut.toFixed(4)})`;
        drag.outL.style.opacity = k.oOut.toFixed(3);
      }
      drag.inL.style.transform = `translate3d(${(dx - drag.dir * W).toFixed(1)}px,0,0) scale(${k.sIn.toFixed(4)})`;
      drag.inL.style.opacity = k.oIn.toFixed(3);
    } else if (drag.outL) {
      drag.outL.style.transform = `translate3d(${(dx * 0.35).toFixed(1)}px,0,0)`;
    }
  }

  function dragSnap(dx) {
    busyFor(TURN_DUR + 120);
    const W = window.innerWidth, d = drag.dir;
    const k = dragLook(dx);
    if (drag.outL) {
      slide(drag.outL, dx, 0, k.sOut, 1, k.oOut, 1);
      curLayer = drag.outL;
    }
    if (drag.inL) {
      const s0 = d > 0 ? 1.12 : 0.88;
      slide(drag.inL, dx - d * W, -d * W, k.sIn, s0, k.oIn, 0);
      const il = drag.inL;
      setTimeout(() => { try { il.remove(); } catch (e) {} }, TURN_DUR + 40);
    }
    activeTurns = 0;
  }

  function dragCommit(dx) {
    busyFor(TURN_DUR + 120);
    const W = window.innerWidth, d = drag.dir;
    const k = dragLook(dx);
    ownPage = drag.next;
    location.hash = '#' + drag.next;
    if (drag.outL) {
      slide(drag.outL, dx, d * W, k.sOut, 0.92, k.oOut, 0);
      const ol = drag.outL;
      setTimeout(() => { try { ol.remove(); } catch (e) {} }, TURN_DUR + 40);
    }
    slide(drag.inL, dx - d * W, 0, k.sIn, 1, k.oIn, 1);
    shown = drag.info;
    curLayer = drag.inL;
    press(0, 10);
  }

  function dragEnd(dx, v) {
    const W = window.innerWidth, d = drag.dir;
    const progress = dx * d;
    const flick = v * d > 0.5 && progress > 12;
    const want = progress > W * DRAG_CUT || flick;
    if (!want) { dragSnap(dx); press(0, -4); return; }
    if (!drag.inL) { dragSnap(dx); turn(d); return; }
    dragCommit(dx);
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
        else dragEnd(e.clientX - drag.x0, drag.v);
        press(0, -2);
      }
    };
    window.addEventListener('pointerup', e => { if (!isOurUI(e)) e.stopPropagation(); release(e, false); }, { capture: true, passive: true });
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
      measurePan();
      applyPan();
    }, true);

    window.addEventListener('hashchange', () => {
      resetZoom();
      if (fxPage() === ownPage) ownPage = null;
      else endChain();
    });
    window.addEventListener('resize', () => { measurePan(); applyPan(); });
    setTimeout(() => { measurePan(); applyPan(); }, 700);
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
    setInterval(fxViewport, 500);
  }

  let fxInfo = null;

  async function fxLoadInfo(id) {
    if (fxInfo && fxInfo.id === id) return fxInfo;
    let info = null;
    try {
      const g = W().galleryinfo;
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
        info = { id, title: getPageTitle(), artists: [], groups: [], series: [], chars: [], total: 0, tags: [] };
      }
    }
    if (!info.total) info.total = fxTotal();
    if (settings.koreanTitle && info.title) info.title = koreanTitle(info.title);
    fxInfo = info;
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
    const t = setInterval(() => { fxHideTop(); if (++n > 24) clearInterval(t); }, 500);
    let mt = 0;
    new MutationObserver(() => {
      if (mt) return;
      mt = setTimeout(() => { mt = 0; fxHideTop(); }, 250);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function diagText() {
    const w = W();
    const g = w.galleryinfo;
    const im = findReaderImg();
    const lines = [
      '버전: ' + VERSION,
      '페이지: ' + location.pathname + location.hash,
      '리더: ' + (IS_READER ? '예' : '아니오'),
      'galleryinfo: ' + (g ? '있음 (id ' + g.id + ', ' + ((g.files && g.files.length) || 0) + '장)' : '없음'),
      'url_from_url_from_hash: ' + typeof w.url_from_url_from_hash,
      '실제로 받아 둔 페이지: ' + (Array.from(preDone).map(i => i + 1).sort((a, b) => a - b).join(', ') || '없음'),
      '받는 중: ' + (Array.from(preBusy.keys()).map(i => i + 1).join(', ') || '없음'),
      '현재 리더 이미지 주소: ' + (im ? (im.getAttribute('src') || '(src 없음)') : '없음'),
      '진행 중 넘김: ' + activeTurns,
      ''
    ];
    return lines.join('\n') + '\n' + structDump() + '\n\n[로그]\n' +
      (hkLog.length ? hkLog.join('\n') : '(기록 없음)');
  }

  function structDump() {
    const cls = e => (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
    const desc = e => e.tagName + (e.id ? '#' + e.id : '') + cls(e);
    const out = ['[구조]'];
    out.push('body 자식: ' + Array.from(document.body ? document.body.children : []).slice(0, 15).map(desc).join(' | '));
    const bodyBg = document.body ? getComputedStyle(document.body).backgroundColor : '';
    const htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    out.push('배경색 computed: html=' + htmlBg + ' body=' + bodyBg);
    const gc = document.querySelector('.gallery-content');
    if (gc) {
      out.push('gallery-content 칸 수: ' + gc.children.length);
      if (gc.children[0]) out.push('첫 칸 HTML: ' + gc.children[0].outerHTML.slice(0, 500));
      const chain = [];
      for (let n = gc.parentElement; n && n !== document.documentElement && chain.length < 8; n = n.parentElement) {
        chain.push(desc(n) + '[bg=' + getComputedStyle(n).backgroundColor + ']');
      }
      out.push('gallery-content 조상: ' + chain.join(' < '));
    }
    const imgs = Array.from(document.images).slice(0, 12).map(i =>
      desc(i) + ' src=' + (i.getAttribute('src') || '').slice(0, 90) +
      ' loaded=' + i.complete + ' w=' + i.naturalWidth);
    out.push('img (최대 12):');
    return out.concat(imgs).join('\n');
  }

  injectSiteCss();
  injectFxCss();
  if (IS_READER) initReaderInput();
  onRoot(() => {
    if (IS_READER) initReaderViewport();
    fxEarly();
  });

  function run() {
    paintListBg();
    hideNative();
    pruneNative();
    rewriteLinks(document);
    filterGalleries(document);
    applyBlock(false);
    if (settings.cardStyle) restyleCards(document);
    if (settings.mergeTitles) mergeDuplicates();
    initInfinite();
    warmPages();
    flushTerms();
    flushThumbs();
    restoreScroll();
  }

  let rafId = 0;
  const isOursNode = n => !!(n && n.nodeType === 1 && n.closest && n.closest('#hk-host, #hk-fx-ov, #hk-cover, .hk-zoom, .hk-wrap'));
  const observer = new MutationObserver(muts => {
    if (rafId) return;
    if (muts.every(m => isOursNode(m.target) && [...m.addedNodes, ...m.removedNodes].every(isOursNode))) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      run();
      if (host && !host.isConnected) document.documentElement.appendChild(host);
    });
  });

  function start() {
    hlog('시작 · v' + VERSION + ' · ' + location.pathname);
    if (IS_READER) fxStart();
    run();
    buildUI();
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
