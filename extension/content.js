// ==UserScript==
// @name         Catnap Theater Mode for Suno
// @namespace    https://catnap.radio/
// @version      0.6.10
// @description  Suno-native Theater Mode with full-resolution artwork, Up Next preview, and AI:Underground branding.
// @author       Catnap Radio
// @match        https://suno.com/*
// @match        https://www.suno.com/*
// @run-at       document-idle
// @grant        none
// @noframes
// ==/UserScript==

/*
 * CATNAP THEATRE · v0.6.10 development
 * Change: canonical native lyric panels preserve raw text line breaks.
 *
 * Ordinary mode delegates playback/queue/repeat/shuffle to Suno. Optional
 * managed mode uses a source-bound guard and the separate show coordinator.
 * No Suno API calls, audio downloads or login access.
 *
 * Toggle: small "Catnap Theater" button on Suno playlist/song pages.
 * While active: Esc exits, Space plays/pauses, Left/Right seeks 5 seconds,
 * Shift+Left/Right skips tracks. Alt+Shift+T toggles theater mode anywhere.
 */
(() => {
  'use strict';

  const SCRIPT_VERSION = '0.6.10';
  const DOC = document;
  const INSTALL_MARKER = 'catnapTheaterInstalled';
  if (DOC.documentElement.dataset[INSTALL_MARKER] === 'yes') return;
  DOC.documentElement.dataset[INSTALL_MARKER] = 'yes';

  const CSS_ID = 'catnap-theater-styles';
  const ROOT_ID = 'catnap-theater-root';
  const LAUNCH_ID = 'catnap-theater-launch';
  const STORAGE_KEY = 'catnap-theater-active-v1';
  const TRACK_RE = /\/song\/([0-9a-f-]{24,})/i;
  const LABELS = {
    title: 'a[aria-label^="Playbar: Title for "]',
    artist: 'a[aria-label^="Playbar: Artist for "]',
    play: 'button[aria-label="Playbar: Play button"]',
    pause: 'button[aria-label="Playbar: Pause button"]',
    next: 'button[aria-label="Playbar: Next Song button"]',
    prev: 'button[aria-label="Playbar: Previous Song button"]',
    progress: 'input[aria-label="Playback progress"]',
    captionEdit: 'button[aria-label="Edit caption"]',
    lyricsCopy: 'button[aria-label="Copy lyrics to clipboard"]',
    songDetails: 'button[aria-label="Playbar: Toggle song details panel"]',
  };

  const ICONS = {
    cat: '<svg viewBox="0 0 36 36" aria-hidden="true"><path d="M6 17 6 5l8 6a17 17 0 0 1 8 0l8-6v12c3 7-1 14-12 14S3 24 6 17Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 21h.1m9.8 0h.1" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/></svg>',
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M19 5l-12 7 12 7V5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" fill="none"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5v14M5 5l12 7-12 7V5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" fill="none"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5 19 12 8 18.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
  };

  const state = {
    open: false,
    root: null,
    launch: null,
    ui: {},
    songId: '',
    coverSource: '',
    coverScore: -1,
    originalArt: '',
    caption: '',
    lyrics: '',
    didExpandLyrics: '',
    didExpandCaption: '',
    lyricPreparation: null,
    timerFast: null,
    timerSlow: null,
    lyricRetries: 0,
    enteredAt: 0,
    nextText: '',
    nextLabel: '',
  };

  const query = (selector, scope = DOC) => scope.querySelector(selector);
  const queryAll = (selector, scope = DOC) => Array.from(scope.querySelectorAll(selector));
  const trim = (value) => String(value || '').replace(/\u00a0/g, ' ').trim();
  const normalized = (value) => trim(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const isOnSongPage = () => /^\/(?:playlist|song)\//.test(location.pathname);

  function rememberedOpen() {
    try { return sessionStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
  }
  function remember(open) {
    try { sessionStorage.setItem(STORAGE_KEY, open ? '1' : '0'); } catch { /* storage disabled */ }
  }

  function installCss() {
    if (DOC.getElementById(CSS_ID)) return;
    const style = DOC.createElement('style');
    style.id = CSS_ID;
    style.textContent = `
#${LAUNCH_ID} {
  all: initial !important; display: inline-flex !important; align-items: center !important; gap: 9px !important;
  box-sizing: border-box !important; position: fixed !important; z-index: 2147483640 !important;
  right: 25px !important; bottom: 104px !important; padding: 10px 14px !important;
  border: 1px solid rgba(195,148,244,.38) !important; border-radius: 999px !important;
  background: rgba(17,14,29,.94) !important; backdrop-filter: blur(16px) !important;
  color: #f4eafa !important; font: 600 13px/1.2 system-ui,sans-serif !important;
  letter-spacing: .025em !important; box-shadow: 0 8px 24px rgba(0,0,0,.45) !important;
  cursor: pointer !important; transition: transform .15s ease, border-color .15s ease !important;
}
#${LAUNCH_ID}:hover { transform: translateY(-2px) !important; border-color: #d1a2fa !important; }
#${LAUNCH_ID}:focus-visible { outline: 3px solid #b6a6ff !important; outline-offset: 3px !important; }
#${LAUNCH_ID} svg { width: 19px; height: 19px; color: #dda8ff; }
#${ROOT_ID}, #${ROOT_ID} * { box-sizing: border-box; }
#${ROOT_ID} {
  --ct-white: #f3f0fb; --ct-muted: #aaa9bd; --ct-border: rgba(174,158,207,.18);
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
  height: 100dvh !important; isolation: isolate !important; z-index: 2147483645 !important;
  display: flex !important; flex-direction: column !important; overflow: hidden !important;
  padding: 0 !important; margin: 0 !important;
  background: #070911 !important; color: var(--ct-white) !important;
  font: 400 16px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
  -webkit-font-smoothing: antialiased !important; text-align: left !important;
}
#${ROOT_ID}::before {
  content: ''; position: absolute; inset: -20%; z-index: -1; pointer-events: none;
  background: radial-gradient(ellipse 32% 42% at 28% 39%, rgba(111,48,156,.21), transparent 80%),
              radial-gradient(ellipse 38% 52% at 83% 90%, rgba(21,60,105,.12), transparent 80%),
              linear-gradient(135deg,#0c0b16 0%,#080912 40%,#05090f 100%);
}
#${ROOT_ID} button, #${ROOT_ID} input { font: inherit; }
#${ROOT_ID} button { appearance: none; -webkit-appearance: none; background: none; color: inherit; border: 0; cursor: pointer; }
#${ROOT_ID} button:focus-visible, #${ROOT_ID} input:focus-visible { outline: 2px solid #c69cff; outline-offset: 4px; }
#${ROOT_ID} .ct-header {
  flex: none; height: 64px; padding: 8px clamp(20px,2.5vw,45px);
  display: flex; align-items: center; gap: clamp(10px,1.5vw,24px);
}
#${ROOT_ID} .ct-header-actions {display:flex;align-items:center;gap:8px;flex:none;margin-left:auto}
#${ROOT_ID} .ct-header-actions .ct-header-action {display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 11px;border:1px solid #77618c;border-radius:8px;background:rgba(34,27,48,.7);color:#eadff5;font:600 12px/1.2 system-ui;white-space:nowrap}
#${ROOT_ID} .ct-header-actions .ct-header-action:hover {background:#3b2b4d;border-color:#b69acb}
#${ROOT_ID} .ct-header-actions .ct-close {width:34px;padding:0;font-size:21px}
#${ROOT_ID} .ct-brand { display: flex; align-items: center; gap: 11px; opacity: .92; flex: 0 0 auto; }
#${ROOT_ID} .ct-brand svg { height: 34px; width: 34px; flex: none; color: #d7caec; }
#${ROOT_ID} .ct-brand-main { letter-spacing: .13em; font-size: 13px; font-weight: 650; line-height: 1.3; }
#${ROOT_ID} .ct-brand-sub { color: #8c8ca1; letter-spacing: .27em; font-size: 8px; margin-top: 2px; }
#${ROOT_ID} .ct-up-next { min-width: 0; flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; gap: 1px; text-align: center; overflow: hidden; }
#${ROOT_ID} .ct-up-next-label { color: #a88bbf; font-size: 9px; font-weight: 700; letter-spacing: .2em; white-space: nowrap; }
#${ROOT_ID} .ct-up-next-title { color: #ddd8e6; font-size: clamp(12px,1.1vw,16px); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${ROOT_ID} .ct-aiu { flex: 0 0 clamp(108px,12.5vw,170px); max-width: 170px; height: 49px; display: flex; align-items: center; justify-content: flex-end; overflow: hidden; }
#${ROOT_ID} .ct-aiu-logo { max-width: 100%; max-height: 47px; width: auto; height: auto; object-fit: contain; display: block; }
#${ROOT_ID} .ct-aiu-fallback { display: none; text-align: right; font-size: 12px; font-weight: 850; color: #f7f4ff; letter-spacing: -.035em; line-height: 1; }
#${ROOT_ID} .ct-aiu-fallback small { display: block; font-size: 9px; font-weight: 550; letter-spacing: .23em; margin-top: 4px; }
#${ROOT_ID} .ct-main {
  flex: 1 1 auto; min-height: 0; width: 100%;
  display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(300px, .88fr);
  gap: clamp(22px, 3vw, 58px); padding: 0 clamp(20px, 2.5vw, 45px) 14px;
}
#${ROOT_ID} .ct-showcase { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
#${ROOT_ID} .ct-art-wrap { flex: 1 1 auto; min-height: 0; min-width: 0; display:flex; justify-content:center; align-items:center; }
#${ROOT_ID} .ct-art-frame {
  position: relative; width: auto; height: 100%; max-height: 100%; max-width: 100%;
  aspect-ratio: 1 / 1; overflow: hidden; flex: 0 1 auto;
  border-radius: clamp(12px,1.1vw,20px); background: linear-gradient(135deg,#22132d,#101b30 70%,#181020);
  box-shadow: 0 23px 60px rgba(0,0,0,.48),0 0 0 1px rgba(222,170,250,.38),0 0 40px rgba(128,54,172,.08);
}
#${ROOT_ID} .ct-art-frame::before { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, rgba(151,104,180,.13), transparent 52%); pointer-events: none; }
#${ROOT_ID} .ct-art { width: 100%; height: 100%; object-fit: contain; display: block; }
#${ROOT_ID} .ct-no-art .ct-art { display: none; }
#${ROOT_ID} .ct-no-art::after { content: '♪'; position: absolute; inset: 0; display: grid; place-items: center; color: #9f8eaf; font-size: min(14vw, 160px); font-weight: 200; }
#${ROOT_ID} .ct-meta { flex: 0 0 auto; min-height: 0; padding: 17px 0 2px; width: min(100%, calc(100dvh - 290px)); max-width: 920px; align-self: center; }
#${ROOT_ID} .ct-song-title { font-size: clamp(23px, 2.35vw, 41px); font-weight: 730; letter-spacing: -.035em; line-height: 1.14; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
#${ROOT_ID} .ct-artist { font-size: clamp(16px,1.45vw,23px); font-weight: 400; color: #b9b2c8; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${ROOT_ID} .ct-desc { font-size: clamp(13px,.96vw,16px); line-height: 1.48; color: #aba7b7; margin-top: 12px; white-space: pre-line; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
#${ROOT_ID} .ct-desc:empty { display: none; }
#${ROOT_ID} .ct-lyrics-panel {
  border: 1px solid var(--ct-border); border-radius: 16px; min-width: 0; min-height: 0; overflow: hidden;
  background: linear-gradient(135deg, rgba(10,17,28,.88), rgba(10,16,26,.64));
  display: flex; flex-direction: column; box-shadow: inset 0 1px 0 rgba(255,255,255,.024);
}
#${ROOT_ID} .ct-lyrics-heading { flex: none; font-size: 12px; font-weight: 600; letter-spacing: .27em; color: #e4deef; padding: 21px clamp(22px,2.1vw,36px) 13px; }
#${ROOT_ID} .ct-heading-rule { display: block; width: 100%; height: 1px; background: linear-gradient(90deg,rgba(198,167,233,.26),rgba(198,167,233,.06)); margin-top: 15px; }
#${ROOT_ID} .ct-lyrics-scroller { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 4px clamp(22px,2.1vw,36px) 28px; scrollbar-width: thin; scrollbar-color: #3c3655 transparent; }
#${ROOT_ID} .ct-lyrics-scroller::-webkit-scrollbar { width: 6px; }
#${ROOT_ID} .ct-lyrics-scroller::-webkit-scrollbar-thumb { background:#403c54; border-radius: 9px; }
#${ROOT_ID} .ct-lyrics-content { color: #d2ceda; font-size: clamp(16px,1.2vw,21px); line-height: 1.57; letter-spacing: .004em; overflow-wrap: anywhere; }
#${ROOT_ID} .ct-lyric-line { min-height: 1.4em; white-space: pre-wrap; }
#${ROOT_ID} .ct-lyric-cue { white-space: pre-wrap; color:#a18ebc; font-size:.79em; margin: 9px 0 4px; font-weight: 550; }
#${ROOT_ID} .ct-lyric-gap { height: .9em; }
#${ROOT_ID} .ct-lyrics-empty { color:#8b8b9d; font-size: clamp(14px,1vw,17px); line-height:1.6; padding: 12px 0; }
#${ROOT_ID} .ct-bottom {
  flex: none; min-height: 78px; padding: 13px clamp(20px,2.5vw,45px) 14px;
  border-top: 1px solid rgba(168,146,207,.13); background: rgba(5,8,15,.84);
  display: flex; align-items: center; gap: clamp(13px,1.4vw,24px);
}
#${ROOT_ID} .ct-player-buttons { flex: none; display: flex; align-items: center; gap: clamp(3px,.6vw,11px); }
#${ROOT_ID} .ct-player-buttons button { padding: 7px; display: grid; place-items:center; width: 36px; height: 40px; opacity: .83; transition: opacity .16s, transform .16s; }
#${ROOT_ID} .ct-player-buttons button:hover { opacity: 1; transform: scale(1.08); }
#${ROOT_ID} .ct-player-buttons button svg { width: 22px; height: 22px; }
#${ROOT_ID} .ct-player-buttons .ct-toggle { background: linear-gradient(135deg,#cf9bf5,#9d9de5); color: #100b1c; border-radius: 50%; width: 43px; height:43px; opacity: 1; box-shadow: 0 1px 14px rgba(194,141,245,.17); }
#${ROOT_ID} .ct-toggle svg { width: 22px; height: 22px; }
#${ROOT_ID} .ct-progress-layout { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
#${ROOT_ID} .ct-clock { font-size: clamp(12px,.92vw,15px); color: #b3adc4; letter-spacing: .04em; font-variant-numeric: tabular-nums; flex: none; min-width: 43px; text-align: center; }
#${ROOT_ID} .ct-progress {
  flex: 1; width: 100%; min-width: 45px; display: block; height: 5px; border-radius: 6px;
  appearance: none; -webkit-appearance: none; outline-offset: 8px;
  background: linear-gradient(90deg, #c668f2 0%, #8bafff var(--ct-progress, 0%), #434652 var(--ct-progress, 0%), #434652 100%);
  cursor: pointer; touch-action: none;
}
#${ROOT_ID} .ct-progress::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: #ebd4ff; border: 2px solid #ad7cdd; box-shadow: 0 0 8px rgba(210,154,255,.35); opacity: .8; }
#${ROOT_ID} .ct-progress::-moz-range-thumb { width: 9px; height: 9px; border: 2px solid #ad7cdd; border-radius: 50%; background: #ebd4ff; }
#${ROOT_ID} .ct-progress:hover::-webkit-slider-thumb, #${ROOT_ID} .ct-progress:focus-visible::-webkit-slider-thumb { opacity: 1; }
@media (max-width: 840px) {
  #${ROOT_ID} .ct-header { height: 52px; padding: 6px 18px; gap: 10px; }
  #${ROOT_ID} .ct-brand svg { height:26px; width:26px; }
  #${ROOT_ID} .ct-brand-main { font-size: 11px; }
  #${ROOT_ID} .ct-aiu { flex-basis: 114px; height: 42px; }
  #${ROOT_ID} .ct-aiu-logo { max-height: 40px; }
  #${ROOT_ID} .ct-up-next-label { font-size: 8px; }
  #${ROOT_ID} .ct-up-next-title { font-size: 12px; }
  #${ROOT_ID} .ct-main { gap: 14px; padding: 0 16px 12px; grid-template-columns: minmax(0, 1.12fr) minmax(250px, .88fr); }
  #${ROOT_ID} .ct-meta { padding: 12px 3px 0; }
  #${ROOT_ID} .ct-desc { -webkit-line-clamp: 2; }
  #${ROOT_ID} .ct-lyrics-heading { padding: 13px 16px 9px; }
  #${ROOT_ID} .ct-lyrics-scroller { padding: 4px 16px 18px; }
  #${ROOT_ID} .ct-bottom { padding: 10px 15px; min-height: 63px; }
}
@media (max-width: 610px) {
  #${ROOT_ID} .ct-header {height:auto;min-height:96px;flex-wrap:wrap;gap:6px 12px}
  #${ROOT_ID} .ct-header-actions {flex-basis:100%;justify-content:flex-end}
  #${ROOT_ID} .ct-aiu {margin-left:auto}
  #${ROOT_ID} .ct-brand-sub { display:none; }
  #${ROOT_ID} .ct-brand { gap:4px; }
  #${ROOT_ID} .ct-brand-main { max-width: 68px; font-size: 10px; line-height:1.2; }
  #${ROOT_ID} .ct-up-next-label { letter-spacing: .04em; }
  #${ROOT_ID} .ct-aiu { flex-basis: 85px; }
  #${ROOT_ID} .ct-main { display:flex; flex-direction: column; gap: 13px; }
  #${ROOT_ID} .ct-showcase { flex: 0 0 49%; flex-direction: row; align-items:center; gap: 12px; }
  #${ROOT_ID} .ct-art-wrap { flex: 0 0 43%; height:100%; }
  #${ROOT_ID} .ct-meta { flex:1; min-width: 0; }
  #${ROOT_ID} .ct-desc { display: none; }
  #${ROOT_ID} .ct-lyrics-panel { flex: 1; }
  #${ROOT_ID} .ct-player-buttons button { width: 28px; }
  #${ROOT_ID} .ct-progress-layout { gap: 5px; }
  #${ROOT_ID} .ct-clock { min-width:34px; font-size:11px; }
}
@media (prefers-reduced-motion: reduce) {
  #${ROOT_ID} button, #${LAUNCH_ID} { transition:none !important; }
}
`;
    DOC.documentElement.appendChild(style);
  }

  function showLauncher() {
    if (!state.launch) {
      const button = DOC.createElement('button');
      button.id = LAUNCH_ID;
      button.type = 'button';
      button.setAttribute('aria-label', 'Open Catnap Theater Mode');
      button.innerHTML = ICONS.cat + '<span>Catnap Theater</span>';
      button.addEventListener('click', () => toggle());
      DOC.documentElement.appendChild(button);
      state.launch = button;
    }
    state.launch.style.display = (!state.open && isOnSongPage()) ? 'inline-flex' : 'none';
    // Important: #launch CSS uses !important for display, so use setProperty.
    state.launch.style.setProperty('display', (!state.open && isOnSongPage()) ? 'inline-flex' : 'none', 'important');
  }

  function createRoot() {
    const root = DOC.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'Catnap Radio Theater Mode');
    root.innerHTML = `
      <header class="ct-header">
        <div class="ct-brand">${ICONS.cat}<div><div class="ct-brand-main">CATNAP RADIO</div><div class="ct-brand-sub">Created by Catnap Radio</div></div></div>
        <div class="ct-up-next" aria-live="off" title="Preview based on the playlist currently visible to Suno, not its internal playback queue">
          <span class="ct-up-next-label">UP NEXT · LIST ORDER</span>
          <span class="ct-up-next-title">Waiting for playlist…</span>
        </div>
        <div class="ct-aiu" title="AI:Underground">
          <img class="ct-aiu-logo" src="${chrome.runtime.getURL('assets/aiu-logo.png')}" alt="AI:Underground" />
          <span class="ct-aiu-fallback" aria-hidden="true">AI:<small>UNDERGROUND</small></span>
        </div>
        <div class="ct-header-actions" role="group" aria-label="Theatre control windows"></div>
      </header>
      <main class="ct-main">
        <section class="ct-showcase" aria-label="Now playing">
          <div class="ct-art-wrap"><div class="ct-art-frame ct-no-art"><img class="ct-art" alt="Current song artwork" /></div></div>
          <div class="ct-meta">
            <div class="ct-song-title" aria-live="polite">Ready for your next track</div>
            <div class="ct-artist">Suno playlist playback</div>
            <div class="ct-desc"></div>
          </div>
        </section>
        <aside class="ct-lyrics-panel" aria-label="Song lyrics">
          <div class="ct-lyrics-heading">LYRICS<span class="ct-heading-rule"></span></div>
          <div class="ct-lyrics-scroller" tabindex="0"><div class="ct-lyrics-content"><div class="ct-lyrics-empty">Press Play below to start the playlist and show its lyrics here.</div></div></div>
        </aside>
      </main>
      <footer class="ct-bottom" aria-label="Playback controls">
        <div class="ct-player-buttons">
          <button type="button" class="ct-prev" title="Previous track (Shift+Left)" aria-label="Previous track">${ICONS.prev}</button>
          <button type="button" class="ct-toggle" title="Play or pause (Space)" aria-label="Play">${ICONS.play}</button>
          <button type="button" class="ct-next" title="Next track (Shift+Right)" aria-label="Next track">${ICONS.next}</button>
        </div>
        <div class="ct-progress-layout">
          <span class="ct-clock ct-elapsed">0:00</span>
          <input type="range" class="ct-progress" min="0" max="1000" step="1" value="0" aria-label="Seek song position" />
          <span class="ct-clock ct-duration">--:--</span>
        </div>
      </footer>`;
    DOC.documentElement.appendChild(root);
    state.root = root;
    state.ui = {
      title: query('.ct-song-title', root),
      artist: query('.ct-artist', root),
      desc: query('.ct-desc', root),
      art: query('.ct-art', root),
      frame: query('.ct-art-frame', root),
      lyrics: query('.ct-lyrics-content', root),
      scroller: query('.ct-lyrics-scroller', root),
      previous: query('.ct-prev', root),
      play: query('.ct-toggle', root),
      next: query('.ct-next', root),
      progress: query('.ct-progress', root),
      elapsed: query('.ct-elapsed', root),
      duration: query('.ct-duration', root),
      nextLabel: query('.ct-up-next-label', root),
      nextTitle: query('.ct-up-next-title', root),
    };
    const aiuLogo = query('.ct-aiu-logo', root);
    aiuLogo.addEventListener('error', () => {
      aiuLogo.style.display = 'none';
      query('.ct-aiu-fallback', root).style.display = 'block';
    });
    state.ui.previous.addEventListener('click', () => theatreStep('previous'));
    state.ui.next.addEventListener('click', () => theatreStep('next'));
    state.ui.play.addEventListener('click', () => toggleNativePlayback());
    state.ui.progress.addEventListener('input', (event) => {
      const ratio = Number(event.target.value) / 1000;
      if(globalThis.CatnapManagedShow?.active){globalThis.CatnapManagedShow.seek(ratio);return;}
      setNativeSeek(ratio);
      const duration = secondsFromNative().duration;
      if (duration > 0) state.ui.elapsed.textContent = clock(duration * ratio);
      state.ui.progress.style.setProperty('--ct-progress', (ratio * 100).toFixed(2) + '%');
    });
    state.ui.art.addEventListener('error', () => {
      if (state.originalArt && state.ui.art.src !== state.originalArt) {
        state.ui.art.src = state.originalArt;
      } else {
        state.ui.frame.classList.add('ct-no-art');
      }
    });
    state.ui.art.addEventListener('load', () => state.ui.frame.classList.remove('ct-no-art'));
    return root;
  }

  function toggle(force) {
    const open = typeof force === 'boolean' ? force : !state.open;
    if (open === state.open) return;
    if (open) {
      state.open = true;
      state.enteredAt = Date.now();
      state.songId = '';
      state.coverSource = '';
      state.coverScore = -1;
      state.lyricRetries = 0;
      state.nextText = '';
      state.nextLabel = '';
      createRoot();
      showLauncher();
      syncSong(true);
      syncProgress();
    } else {
      globalThis.CatnapManagedShow?.closed();
      cancelNativeLyrics();
      state.open = false;
      if (state.root) state.root.remove();
      state.root = null;
      state.ui = {};
      showLauncher();
    }
    remember(state.open);
  }

  function clickNative(selector) {
    const button = query(selector);
    if (!button) return false;
    button.click();
    return true;
  }

  // Suno renders a Playbar Play button even when the queue is empty. Clicking
  // that idle button does not start a playlist, so don't treat its presence
  // alone as evidence that a song is loaded.
  function hasQueuedSong() {
    return Boolean(readSong()) || secondsFromNative().duration > 0;
  }

  function startPlaylist() {
    // The playlist button is a native Suno action, preserving its real queue,
    // shuffle and repeat behavior rather than fetching or playing audio here.
    if (!/^\/playlist\//.test(location.pathname)) return false;
    const buttons = queryAll('button[aria-label="Play playlist"], button[aria-label="Play Playlist"]')
      .filter(button => button.isConnected && !button.disabled && !state.root?.contains(button));
    // The prominent "Play" action is preferable to the small icon button.
    const button = buttons.find(el => trim(el.textContent).toLowerCase() === 'play') || buttons[0];
    if (!button) return false;
    button.click();
    return true;
  }

  async function requestShowIntent(action){
    if(!globalThis.CatnapManagedShow||!globalThis.chrome?.runtime?.sendMessage)return false;
    const result=await chrome.runtime.sendMessage({target:'catnap-show-intent',action});
    if(result?.ok===false)throw Error(result.error||'The show could not reconnect.');
    return result?.handled===true;
  }
  async function theatreStep(action){
    try{
      if(globalThis.CatnapManagedShow?.active){managedCommand(action);return;}
      if(globalThis.CatnapManagedShow&&await requestShowIntent(action))return;
      clickNative(action==='previous'?LABELS.prev:LABELS.next);
    }catch(error){if(state.ui.desc)state.ui.desc.textContent=error.message;}
  }
  async function toggleNativePlayback() {
    if(globalThis.CatnapManagedShow?.active){managedCommand('toggle');return;}
    // A visible native Pause remains Pause. Recover a show only for an
    // explicit start, never turn pausing an ordinary song into Play entry zero.
    if (clickNative(LABELS.pause)) return;
    try{if(globalThis.CatnapManagedShow&&await requestShowIntent('toggle'))return;}catch(error){if(state.ui.desc)state.ui.desc.textContent=error.message;return;}
    // If Suno is already playing, always use its own Pause button.
    if (clickNative(LABELS.pause)) return;
    // Cold start: playlist Play must take priority over the idle Playbar Play.
    if (!hasQueuedSong() && startPlaylist()) return;
    // A loaded, paused song resumes using Suno's ordinary Playbar control.
    if (clickNative(LABELS.play)) return;
    // Fallback for Suno versions that hide their idle Playbar button.
    startPlaylist();
  }

  function audioElement() {
    const audios = queryAll('audio').filter(el => !state.root?.contains(el));
    return audios.find(el => Number.isFinite(el.duration) && el.duration > 0 && !el.paused)
      || audios.find(el => Number.isFinite(el.duration) && el.duration > 0)
      || null;
  }

  function clock(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
    const n = Math.floor(seconds);
    const hours = Math.floor(n / 3600);
    const minutes = Math.floor(n / 60) % 60;
    const secs = String(n % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
  }

  function parseClock(str) {
    if (!/^\d{1,2}:\d{2}(?::\d{2})?$/.test(str || '')) return NaN;
    return str.split(':').map(Number).reduce((acc, item) => acc * 60 + item, 0);
  }

  function sliderTimes(slider) {
    if (!slider) return null;
    let el = slider.parentElement;
    for (let level = 0; el && level < 6; el = el.parentElement, level++) {
      // Most Suno builds put elapsed and total duration adjacent to Playback progress.
      const txt = trim(el.innerText || el.textContent);
      if (txt.length > 350) continue;
      const matches = txt.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) || [];
      if (matches.length >= 2) {
        const elapsed = parseClock(matches[0]);
        const duration = parseClock(matches[matches.length - 1]);
        if (Number.isFinite(elapsed) && duration > 0 && elapsed <= duration + 3) {
          return { elapsed, duration };
        }
      }
    }
    return null;
  }

  function secondsFromNative() {
    const slider = query(LABELS.progress);
    const labels = sliderTimes(slider);
    const audio = audioElement();
    if (labels) return labels;
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      return { elapsed: audio.currentTime, duration: audio.duration };
    }
    return { elapsed: 0, duration: 0 };
  }

  function setNativeSeek(ratio) {
    const safeRatio = Math.max(0, Math.min(1, ratio));
    const slider = query(LABELS.progress);
    if (slider) {
      const min = Number(slider.min) || 0;
      const max = Number(slider.max) || 100;
      const next = String(min + (max - min) * safeRatio);
      // React-controlled native input: call the underlying property setter.
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (descriptor?.set) descriptor.set.call(slider, next);
      else slider.value = next;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const audio = audioElement();
    if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      try { audio.currentTime = Math.min(audio.duration, Math.max(0, audio.duration * safeRatio)); } catch { /* stream may not seek */ }
    }
  }

  function seekBy(seconds) {
    if(globalThis.CatnapManagedShow?.active){const info=globalThis.CatnapManagedShow.progress();if(info?.duration)globalThis.CatnapManagedShow.seek((info.elapsed+seconds)/info.duration);return;}
    const info = secondsFromNative();
    if (info.duration > 0) setNativeSeek((info.elapsed + seconds) / info.duration);
  }

  function syncProgress() {
    if (!state.open || !state.root) return;
    const ui = state.ui;
    const managed=globalThis.CatnapManagedShow?.active?globalThis.CatnapManagedShow.progress():null;
    if(managed){
      const ratio=managed.duration?Math.max(0,Math.min(1,managed.elapsed/managed.duration)):0;
      ui.progress.value=String(Math.round(ratio*1000));ui.progress.style.setProperty('--ct-progress',(ratio*100).toFixed(2)+'%');
      ui.elapsed.textContent=clock(managed.elapsed||0);ui.duration.textContent=managed.duration?clock(managed.duration):'--:--';
      ui.play.innerHTML=managed.paused?ICONS.play:ICONS.pause;ui.play.setAttribute('aria-label',managed.paused?'Play loaded song':'Pause');ui.play.title=managed.paused?'Play loaded song (Space)':'Pause (Space)';return;
    }
    const info = secondsFromNative();
    const slider = query(LABELS.progress);
    const audio = audioElement();
    let ratio = 0;
    if (info.duration > 0) ratio = info.elapsed / info.duration;
    if (slider) {
      const min = Number(slider.min) || 0;
      const max = Number(slider.max) || 100;
      const nativeRatio = (Number(slider.value) - min) / (max - min || 1);
      if (Number.isFinite(nativeRatio) && nativeRatio >= 0 && nativeRatio <= 1 &&
        (info.duration === 0 || Math.abs(nativeRatio - ratio) < .04)) ratio = nativeRatio;
    }
    // Prefer HTMLMediaElement for sub-second granularity when synced to the native labels.
    if (audio && info.duration > 0 && Math.abs(audio.duration - info.duration) < 3) {
      if (Math.abs(audio.currentTime - info.elapsed) < 3) ratio = audio.currentTime / audio.duration;
    }
    ratio = Math.max(0, Math.min(1, ratio));
    if (!ui.progress.matches(':active')) ui.progress.value = String(Math.round(ratio * 1000));
    ui.progress.style.setProperty('--ct-progress', (ratio * 100).toFixed(2) + '%');
    ui.elapsed.textContent = info.duration ? clock(info.elapsed) : '0:00';
    ui.duration.textContent = info.duration ? clock(info.duration) : '--:--';
    const paused = !!query(LABELS.play);
    ui.play.innerHTML = paused ? ICONS.play : ICONS.pause;
    ui.play.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    ui.play.title = paused ? 'Play (Space)' : 'Pause (Space)';
  }

  function readSong() {
    const links = queryAll(LABELS.title);
    const nameLink = links.find(link => trim(link.textContent)) || links[0];
    if (!nameLink) return null;
    const href = nameLink.href || '';
    const match = href.match(TRACK_RE);
    const ariaName = trim(nameLink.getAttribute('aria-label')).replace(/^Playbar:\s*Title for\s*/i, '');
    const title = trim(nameLink.textContent) || ariaName;
    if (!title) return null;
    const artistLink = query(LABELS.artist);
    const artist = trim(artistLink?.textContent) || 'Suno artist';
    return { id: match?.[1] || href || title, title, artist, href };
  }

  function sourceUrl(image) {
    if (!image) return '';
    const url = image.currentSrc || image.src || '';
    if (/^(https?:|data:image\/|blob:)/i.test(url)) return url;
    return '';
  }

  function panelImageMatches(song) {
    const images = queryAll('img[alt^="Image for "]');
    if (!images.length) return null; // panel image absent (or older Suno markup)
    return images.some(img => normalized(img.alt.replace(/^Image for\s*/i, '')) === normalized(song.title));
  }

  function canonicalSongId(value) {
    try {const url=new URL(value,location.href);return ['suno.com','www.suno.com'].includes(url.hostname)?/^\/song\/([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12})\/?$/i.exec(url.pathname)?.[1]?.toLowerCase()||'':'';}catch{return '';}
  }

  function lyricsPanelWithoutCopy(song) {
    // Some current panels expose plain lyrics without a Copy lyrics control.
    // An exact song heading and native Styles control keep this scan bounded.
    const headings=queryAll('h3').filter(h=>!state.root?.contains(h)&&queryAll('a[href]',h).some(a=>canonicalSongId(a.href)===song.id));
    for(const heading of headings){
      let panel=heading.parentElement;
      for(let depth=0;panel&&depth<3;depth++,panel=panel.parentElement){
        if(panel===DOC.body||panel===DOC.documentElement||panel.contains(state.root))break;
        const styles=query('button[aria-label="Copy styles to clipboard"]',panel);
        const ids=new Set(queryAll('h3 a[href]',panel).map(a=>canonicalSongId(a.href)).filter(Boolean));
        if(styles&&ids.size===1&&ids.has(song.id))return {panel,styles};
      }
    }
    return null;
  }

  function panelIdentityMatches(song) {
    // An exact song link within the bounded native Styles panel is stronger
    // evidence than unrelated artwork or Copy controls elsewhere on the page.
    if(lyricsPanelWithoutCopy(song))return true;
    const imageMatch=panelImageMatches(song);if(imageMatch===false)return false;
    const copy=query(LABELS.lyricsCopy);
    // Prefer a canonical identity when this panel exposes one. Equal titles
    // alone must not defeat an explicitly different song link in a stale panel.
    let panel=copy?.parentElement;
    for(let depth=0;panel&&depth<6;depth++,panel=panel.parentElement){
      if(panel===DOC.body||panel===DOC.documentElement||panel.contains(state.root))break;
      const ids=new Set(queryAll('h3 a[href]',panel).map(a=>canonicalSongId(a.href)).filter(Boolean));
      if(ids.size)return ids.size===1&&ids.has(song.id);
    }
    return imageMatch;
  }

  function cancelNativeLyrics() {
    const preparation=state.lyricPreparation;
    if(preparation?.timer!==null&&preparation?.timer!==undefined)clearTimeout(preparation.timer);
    state.lyricPreparation=null;
  }

  function prepareNativeLyrics(song,{reload=false,key=song?.id,isCurrent=()=>true}={}) {
    const current=()=>state.open&&isCurrent()&&canonicalSongId(song?.href)===song?.id&&readSong()?.id===song.id;
    if(!current())return '';
    if(reload||state.lyricPreparation?.songId!==song.id||state.lyricPreparation?.key!==key){
      cancelNativeLyrics();state.lyricPreparation={songId:song.id,key,timer:null,opened:false,openRetried:false,refreshed:false,refreshing:false,unknownPanelHeld:false};
      state.didExpandLyrics='';state.didExpandCaption='';
    }
    const preparation=state.lyricPreparation,valid=()=>state.lyricPreparation===preparation&&current();
    if(preparation.refreshing)return '';
    const identity=panelIdentityMatches(song),hasCopy=!!query(LABELS.lyricsCopy),hasPanel=hasCopy||!!lyricsPanelWithoutCopy(song)||queryAll('img[alt^="Image for "]').length>0;
    const refresh=reload&&hasPanel||identity===false||identity===null&&hasCopy;
    if(refresh&&!preparation.refreshed){
      const button=query(LABELS.songDetails);
      if(button){
        preparation.refreshed=true;preparation.opened=true;preparation.refreshing=true;preparation.unknownPanelHeld=identity===null;
        button.click();
        const observedClosed=!query(LABELS.lyricsCopy)&&!lyricsPanelWithoutCopy(song);
        preparation.timer=setTimeout(()=>{
          preparation.timer=null;preparation.refreshing=false;if(!valid())return;
          const closedAtRetry=!query(LABELS.lyricsCopy)&&!lyricsPanelWithoutCopy(song);
          if(closedAtRetry||panelIdentityMatches(song)===false)query(LABELS.songDetails)?.click();
          // With no identity markers, seeing the old panel actually close is
          // the minimum proof that a deliberate reopen replaced its contents.
          // React may finish that close after click() returns. A positively
          // identified current plain panel is also safe and must remain open.
          if(observedClosed||closedAtRetry||panelIdentityMatches(song)===true)preparation.unknownPanelHeld=false;
        },250);
        return '';
      }
    }
    if(!preparation.opened&&!hasCopy&&!lyricsPanelWithoutCopy(song)){
      const button=query(LABELS.songDetails);if(button){
        preparation.opened=true;button.click();
        // A native toggle issued before a managed handoff may still commit
        // after our own open, leaving the panel closed. Retry once after the
        // native UI settles; every callback retains song + generation identity.
        preparation.timer=setTimeout(()=>{
          preparation.timer=null;if(!valid()||preparation.openRetried)return;
          if(!query(LABELS.lyricsCopy)&&!lyricsPanelWithoutCopy(song)){
            preparation.openRetried=true;query(LABELS.songDetails)?.click();
          }
        },1000);
      }
    }
    if(!valid()||panelIdentityMatches(song)===false||preparation.unknownPanelHeld)return '';
    expandNativeText(song);
    return getLyrics(song);
  }

  function findCover(song) {
    const options = [];
    const matchTitle = normalized(song.title);
    for (const img of queryAll('img[alt]')) {
      if (state.root?.contains(img)) continue;
      const alt = normalized((img.alt || '').replace(/^Image for\s*/i, '').replace(/\s*artwork$/i, ''));
      if (alt !== matchTitle) continue;
      const src = sourceUrl(img);
      if (!src) continue;
      const isDetail = /^Image for\s/i.test(img.alt);
      options.push({ src, score: (isDetail ? 50 : 35) + Math.min(img.naturalWidth || 0, 2048) / 100 });
    }
    for (const titleLink of queryAll(LABELS.title)) {
      const img = query('img', titleLink);
      const src = sourceUrl(img);
      if (src) options.push({ src, score: 8 });
    }
    options.sort((a, b) => b.score - a.score);
    return options[0] || null;
  }

  function highResArtwork(url) {
    // Suno commonly serves a thumbnail via ?width=360. Remove image-sizing
    // query parameters on Suno CDN only; keep all other parameters untouched.
    // For older /image_<id> assets, retain the previous image_large fallback.
    try {
      const u = new URL(url);
      if (!/(^|\.)suno\.ai$/i.test(u.hostname)) return url;
      u.searchParams.delete('width');
      u.searchParams.delete('height');
      if (/\/image_[\w-]+\.(png|jpe?g|webp)$/i.test(u.pathname)) {
        u.pathname = u.pathname.replace(/\/image_/, '/image_large_');
      }
      return u.href;
    } catch { return url; }
  }

  function setArtwork(cover) {
    if (!cover || !cover.src || cover.score < state.coverScore) return;
    if (cover.src === state.coverSource) return;
    state.coverSource = cover.src;
    state.coverScore = cover.score;
    state.originalArt = cover.src;
    state.ui.art.src = highResArtwork(cover.src);
    state.ui.frame.classList.remove('ct-no-art');
  }

  function textOf(el) {
    return trim(el?.innerText || el?.textContent || '');
  }

  function getDescription(song) {
    if (panelImageMatches(song) === false) return '';
    const edit = query(LABELS.captionEdit);
    const anchors = [];
    if (edit) anchors.push({ element: edit, bonus: 30 });
    const panelImg = queryAll('img[alt^="Image for "]').find(img =>
      normalized(img.alt.replace(/^Image for\s*/i, '')) === normalized(song.title));
    const copy = query(LABELS.lyricsCopy);
    // Other artists' tracks usually lack an Edit caption button. Look for the
    // same native “... More” caption expander, when present.
    for (const b of queryAll('button')) {
      if (!/^(?:\.{3}|…)\s*More$/i.test(textOf(b))) continue;
      const afterArt = !panelImg || !!(panelImg.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const beforeLyrics = !copy || !!(b.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING);
      if (afterArt && beforeLyrics) anchors.push({ element: b, bonus: 20 });
    }
    // For a short caption that needs no “More” button, Suno may position its
    // paragraph before the “Styles” heading. Try its nearby preceding blocks.
    if (!anchors.length && panelImg) {
      const headings = queryAll('h2,h3,h4,div,span').filter(el =>
        el.childElementCount === 0 && textOf(el) === 'Styles');
      for (const heading of headings.slice(0, 4)) {
        let branch = heading;
        for (let depth = 0; branch && depth < 4; branch = branch.parentElement, depth++) {
          let sibling = branch.previousElementSibling;
          for (let j = 0; sibling && j < 4; j++, sibling = sibling.previousElementSibling) {
            if (!sibling.contains(panelImg) && textOf(sibling).length < 1500) {
              anchors.push({ element: sibling, bonus: 1 });
            }
          }
        }
      }
    }
    let best = { text: '', score: -999 };
    for (const anchor of anchors) {
      let el = anchor.element;
      for (let i = 0; el && i < 5; i++, el = el.parentElement) {
        const s = textOf(el).replace(/(?:\.{3}|…)\s*More\b/gi, '')
          .replace(/\bEdit caption\b/g, '').trim();
        if (s.length < 12 || s.length > 1600) continue;
        if (/\b(Weirdness|Style Influence|Audio Influence|Copy lyrics|Styles|Remix\/Edit)\b/i.test(s)) continue;
        if (normalized(s) === normalized(song.title)) continue;
        const score = anchor.bonus - i * 3 - Math.abs(s.length - 110) / 180;
        if (score > best.score) best = { text: s, score };
      }
    }
    return best.text.replace(/^\s*Caption\s*\n/i, '').trim();
  }

  function expandNativeText(song) {
    if (panelImageMatches(song) === false) return;
    if (state.didExpandCaption !== song.id) {
      const edit = query(LABELS.captionEdit);
      if (edit) {
        // Suno's caption "... More" button is immediately before Edit caption.
        const nearby = queryAll('button').filter(b => /^(?:\.{3}|…)\s*More$/i.test(textOf(b)) &&
          !!(b.compareDocumentPosition(edit) & Node.DOCUMENT_POSITION_FOLLOWING));
        const btn = nearby[nearby.length - 1];
        if (btn) btn.click();
        state.didExpandCaption = song.id;
      }
    }
    if (state.didExpandLyrics !== song.id) {
      const copy = query(LABELS.lyricsCopy);
      if (copy) {
        const nearby = queryAll('button').filter(b => /^Show more$/i.test(textOf(b)) &&
          !!(b.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING));
        const btn = nearby[nearby.length - 1];
        if (btn) btn.click();
        state.didExpandLyrics = song.id;
      }
    }
  }

  function normalizeLyricText(raw) {
    let txt = String(raw || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').trim();
    if (!txt) return '';
    // If an ancestor also included song styles/caption, drop the prefix once
    // recognizable lyric cues begin. Keep real spoken text and lyric tags.
    const start = /^\s*\[(?:Intro|Verse|Chorus|Pre-Chorus|Post-Chorus|Bridge|Outro|Hook|Instrumental|Break|Drop|Build|Final|Refrain|Interlude)\b/im.exec(txt);
    const prefix = start ? txt.slice(0, start.index) : '';
    const hasExtraneousHeader = /\b(Weirdness|Style Influence|Copy styles|Audio Influence|Remix\/Edit)\b/i.test(prefix);
    const hasPromptHeader = /^\s*\[(?:Title|Tempo|Time Signature|Key|Genre|Vocal|Arrangement|Structure|Theme|Vocal Arc|Mix)\s*:/im.test(prefix);
    if (start && (hasExtraneousHeader || hasPromptHeader)) txt = txt.slice(start.index);
    txt = txt.replace(/\n\s*(?:Copy lyrics to clipboard|Copy lyrics|Show less|Show more)\s*$/gi, '');
    txt = txt.replace(/\n{4,}/g, '\n\n\n').trim();
    return txt;
  }

  function getLyrics(song) {
    if (panelIdentityMatches(song) === false) return '';
    const found=lyricsPanelWithoutCopy(song);
    const copy = found?query(LABELS.lyricsCopy,found.panel):query(LABELS.lyricsCopy);
    if (!copy) {
      if(!found)return '';
      const candidates=queryAll('div,p',found.panel).filter(el=>!el.children.length&&
        !(found.styles.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_PRECEDING)&&
        !el.closest('button,[role="button"],nav,[role="status"],[role="alert"]')&&
        (el.textContent||'').trim().split('\n').filter(line=>line.trim()).length>=2);
      // Native CSS may collapse rendered innerText to one line. The ordinary
      // fallback reads raw textContent; retain those actual lyric line breaks.
      return (candidates.sort((a,b)=>(b.textContent||'').length-(a.textContent||'').length)[0]?.textContent||'').trim().slice(0,42000);
    }
    const isControl = node => node.matches('button,[role="button"],input,select,textarea,[aria-hidden="true"]');
    function boundedText(node) {
      if (!node || node === DOC.body || node === DOC.documentElement || node === state.root || node.contains(state.root)) return null;
      // A lyric block cannot contain the playlist, player chrome or song header.
      if (node.matches('script,style,nav,[role="status"],[role="alert"],[role="list"],[role="group"]') ||
          node.querySelector('script,style,nav,[role="status"],[role="alert"],[role="list"],[role="group"],a[href*="/song/"],h1,h2,h3,img')) return null;
      const controls = Array.from(node.querySelectorAll('button,[role="button"],input,select,textarea'));
      if (controls.some(el => el !== copy && !/^(?:Show more|Show less)$/i.test(textOf(el)))) return null;
      const clean = node.cloneNode(true);
      clean.querySelectorAll('button,[role="button"],input,select,textarea,[aria-hidden="true"]').forEach(el=>el.remove());
      clean.querySelectorAll('br').forEach(el=>el.replaceWith(DOC.createTextNode('\n')));
      clean.querySelectorAll('p,div').forEach(el=>el.appendChild(DOC.createTextNode('\n')));
      const raw = controls.length ? textOf(clean) : textOf(node);
      if (/^(?:Styles|Lyrics|Copy lyrics(?: to clipboard)?)$/i.test(raw)) return null;
      return normalizeLyricText(raw).slice(0, 42000);
    }
    // Inspect only the text adjacent to the native copy control. Short prose and
    // instrumental labels are valid; they must not lose to a larger page block.
    let branch = copy;
    for (let depth = 0; branch && depth < 3; depth++, branch = branch.parentElement) {
      let sibling = branch.previousElementSibling;
      while (sibling && isControl(sibling)) sibling = sibling.previousElementSibling;
      if (sibling) {
        const lyrics = boundedText(sibling);
        if (lyrics === null) return '';
        if (lyrics) return lyrics;
      }
      const parent = branch.parentElement;
      const own = boundedText(parent);
      if (own === null) return '';
      if (own) return own;
    }
    return '';
  }

  function writeLyrics(content, empty) {
    if (!state.open || !state.ui.lyrics) return;
    const target = state.ui.lyrics;
    if (!content) {
      const div = DOC.createElement('div');
      div.className = 'ct-lyrics-empty';
      div.textContent = empty || 'Lyrics not available for this track.';
      target.replaceChildren(div);
      return;
    }
    const fragment = DOC.createDocumentFragment();
    for (const line of content.split('\n')) {
      const div = DOC.createElement('div');
      div.className = !trim(line) ? 'ct-lyric-gap' : /^\s*\[[^\]]{1,160}\]\s*$/.test(line) ? 'ct-lyric-cue' : 'ct-lyric-line';
      div.textContent = line || '\u00a0';
      fragment.appendChild(div);
    }
    target.replaceChildren(fragment);
  }

  function playlistTracksInDom() {
    if (!/^\/playlist\//.test(location.pathname)) return [];
    // Only songs already rendered on this playlist page. Do not assume that
    // the visible list is Suno's loaded audio queue (it may be stale).
    const seen = new Set();
    const result = [];
    for (const anchor of queryAll('a[href*="/song/"]')) {
      if (state.root?.contains(anchor) || anchor.matches(LABELS.title)) continue;
      let id;
      try {
        const parsed = new URL(anchor.href, location.href);
        if (!/(^|\.)suno\.com$/i.test(parsed.hostname)) continue;
        id = parsed.pathname.match(/^\/song\/([0-9a-f-]{24,})/i)?.[1] || '';
      } catch { continue; }
      const title = trim(anchor.textContent).replace(/\s+/g, ' ');
      if (!id || !title || seen.has(id)) continue;
      seen.add(id);
      result.push({ id, title });
    }
    return result;
  }

  function shuffleIsActive() {
    const buttons = queryAll('button[aria-label*="Toggle shuffle"],button[aria-label*="Shuffle playlist"]');
    return buttons.some(button =>
      button.getAttribute('aria-pressed') === 'true' ||
      button.getAttribute('data-state') === 'on' ||
      button.getAttribute('data-state') === 'checked');
  }

  function syncUpNext(song) {
    if (!state.open || !state.ui.nextTitle) return;
    let label = 'UP NEXT · LIST ORDER';
    let title = 'Not available';
    if (!/^\/playlist\//.test(location.pathname)) {
      title = 'Open a playlist for queue preview';
    } else if (shuffleIsActive()) {
      label = 'UP NEXT · SHUFFLE';
      title = 'Suno chooses the next song';
    } else {
      const tracks = playlistTracksInDom();
      if (!song && tracks.length) {
        label = 'FIRST UP · LIST ORDER';
        title = tracks[0].title;
      } else if (song) {
        const index = tracks.findIndex(item => item.id === song.id);
        if (index >= 0 && tracks[index + 1]) title = tracks[index + 1].title;
        else if (index >= 0) title = 'End of visible playlist';
        else title = 'Current track not in visible list';
      } else title = 'Waiting for playlist…';
    }
    // Don't trigger needless DOM changes on every 1.2-second polling tick.
    if (state.nextLabel !== label) {
      state.nextLabel = label;
      state.ui.nextLabel.textContent = label;
    }
    if (state.nextText !== title) {
      state.nextText = title;
      state.ui.nextTitle.textContent = title;
      state.ui.nextTitle.title = title;
    }
  }

  function syncSong(firstRun = false) {
    if (!state.open || !state.root) return;
    if(globalThis.CatnapManagedShow?.active){globalThis.CatnapManagedShow.render();return;}
    const song = readSong();
    syncUpNext(song);
    if (!song) {
      state.ui.title.textContent = 'Ready for your next track';
      state.ui.artist.textContent = 'Press Play below to start your playlist';
      state.ui.desc.textContent = '';
      writeLyrics('', 'Press Play below; Suno will load the playlist and your artwork and lyrics will appear automatically.');
      return;
    }
    const changed = state.songId !== song.id;
    if (changed) {
      state.songId = song.id;
      state.coverSource = '';
      state.coverScore = -1;
      state.originalArt = '';
      state.caption = '';
      state.lyrics = '';
      state.lyricRetries = 0;
      state.ui.title.textContent = song.title;
      state.ui.artist.textContent = song.artist;
      state.ui.desc.textContent = '';
      state.ui.art.removeAttribute('src');
      state.ui.frame.classList.add('ct-no-art');
      state.ui.scroller.scrollTop = 0;
      writeLyrics('', 'Loading lyrics from the Suno song panel…');
    } else {
      if (state.ui.title.textContent !== song.title) state.ui.title.textContent = song.title;
      if (state.ui.artist.textContent !== song.artist) state.ui.artist.textContent = song.artist;
    }
    setArtwork(findCover(song));

    const lyrics = prepareNativeLyrics(song);
    const desc = getDescription(song);
    if (desc !== state.caption) {
      state.caption = desc;
      state.ui.desc.textContent = desc;
    }
    if (lyrics && lyrics !== state.lyrics) {
      state.lyrics = lyrics;
      writeLyrics(lyrics);
    } else if (!lyrics && !state.lyrics) {
      state.lyricRetries += 1;
      if (state.lyricRetries >= 8 || (firstRun && !query(LABELS.lyricsCopy))) {
        writeLyrics('', 'No lyrics exposed by Suno for this song. If lyrics exist, press Esc, open its song details, and re-enter Theater.');
      }
    }
  }

  function onKeyDown(event) {
    const toggleHotkey = event.altKey && event.shiftKey && event.code === 'KeyT';
    if (toggleHotkey) {
      event.preventDefault();
      event.stopPropagation();
      if (isOnSongPage() || state.open) toggle();
      return;
    }
    if (!state.open) return;
    if (event.code === 'Escape') {
      event.preventDefault(); event.stopPropagation(); toggle(false);
      return;
    }
    const target = event.target;
    if (target?.closest?.('button,input,textarea,[contenteditable="true"],select,summary,a')) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.code === 'Space') {
      event.preventDefault(); event.stopPropagation(); toggleNativePlayback();
    } else if (event.code === 'ArrowLeft' && event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); theatreStep('previous');
    } else if (event.code === 'ArrowRight' && event.shiftKey) {
      event.preventDefault(); event.stopPropagation(); theatreStep('next');
    } else if (event.code === 'ArrowLeft') {
      event.preventDefault(); event.stopPropagation(); seekBy(-5);
    } else if (event.code === 'ArrowRight') {
      event.preventDefault(); event.stopPropagation(); seekBy(5);
    }
  }

  function managedCommand(action){Promise.resolve(globalThis.CatnapManagedShow.command(action)).catch(error=>{if(state.ui.desc)state.ui.desc.textContent=error.message;});}
  // An isolated-world adapter for the optional managed queue. It exposes no
  // credentials/page internals and leaves ordinary Theatre unchanged when off.
  globalThis.CatnapTheatreView={open:toggle,nativeSong:readSong,nativeInfo:secondsFromNative,nativeCover:findCover,nativeLyrics:getLyrics,prepareNativeLyrics,cancelNativeLyrics,writeLyrics,nativeSeek:setNativeSeek};

  function init() {
    installCss();
    showLauncher();
    DOC.addEventListener('keydown', onKeyDown, true);
    if (rememberedOpen() && isOnSongPage()) toggle(true);
    state.timerFast = setInterval(() => { if (state.open) syncProgress(); }, 300);
    state.timerSlow = setInterval(() => {
      // Handles Suno's single-page navigation, delayed song details, and next tracks.
      if (state.open && !isOnSongPage()) toggle(false);
      showLauncher();
      if (state.open) syncSong();
    }, 1200);
  }

  if (DOC.readyState === 'loading') DOC.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
