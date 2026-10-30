const svg = (body: string) =>
  `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  home: svg('<path d="M8 22 24 8l16 14"/><path d="M13 19v20h22V19"/><path d="M21 39V28h6v11"/>'),
  back: svg('<path d="M30 10 16 24l14 14"/>'),
  up: svg('<path d="M10 30 24 16l14 14"/>'),
  down: svg('<path d="M10 18l14 14 14-14"/>'),
  left: svg('<path d="M30 10 16 24l14 14"/>'),
  right: svg('<path d="M18 10l14 14-14 14"/>'),
  refresh: svg('<path d="M38 24a14 14 0 1 1-4.1-9.9"/><path d="M36 6v9h-9"/>'),
  photo: svg('<rect x="6" y="11" width="36" height="28" rx="4"/><circle cx="17" cy="21" r="3.5"/><path d="m8 36 11-10 7 6 6-5 9 8"/>'),
  picture: svg('<rect x="6" y="9" width="36" height="30" rx="3"/><path d="m6 33 11-11 9 9 5-5 11 10"/><circle cx="33" cy="18" r="3"/>'),
  guide: svg('<rect x="6" y="9" width="36" height="30" rx="3" stroke-dasharray="4 4"/><path d="m11 33 8-8 6 6 4-4 8 6" opacity=".55"/>'),
  edges: svg('<rect x="7" y="7" width="34" height="34" rx="2"/><path d="M7 18h34M7 30h34M18 7v34M30 7v34" stroke-width="2" opacity=".4"/>'),
  soundOn: svg('<path d="M8 18h7l10-8v28l-10-8H8z"/><path d="M32 17a9 9 0 0 1 0 14"/><path d="M37 11a17 17 0 0 1 0 26"/>'),
  soundOff: svg('<path d="M8 18h7l10-8v28l-10-8H8z"/><path d="m32 19 10 10M42 19 32 29"/>'),
  minus: svg('<path d="M12 24h24"/>'),
  plus: svg('<path d="M12 24h24M24 12v24"/>'),
  fullscreen: svg('<path d="M8 18V8h10M30 8h10v10M40 30v10H30M18 40H8V30"/>'),
  exitFullscreen: svg('<path d="M18 8v10H8M40 18H30V8M30 40V30h10M8 30h10v10"/>'),
  install: svg('<path d="M24 6v24M14 20l10 10 10-10"/><path d="M8 32v8h32v-8"/>'),
  share: svg('<path d="M24 6v24M15 15l9-9 9 9"/><path d="M16 22h-6v20h28V22h-6"/>'),
  addBox: svg('<rect x="7" y="7" width="34" height="34" rx="6"/><path d="M24 15v18M15 24h18"/>'),
  close: svg('<path d="M13 13l22 22M35 13 13 35"/>'),
  play: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M16 10v28l22-14z" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
};
