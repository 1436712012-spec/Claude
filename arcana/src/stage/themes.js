// Two visual worlds for the same circles.
//   night     gold ink and aquamarine mana on a star chart
//   talisman  ink and cinnabar on ochre talisman paper (符纸)

export const THEMES = {
  night: {
    id: 'night',
    label: '星夜',
    bg0: '#141d3c', bg1: '#05060d',
    line: '#e2bd6b',
    thin: 'rgba(226,189,107,0.6)',
    faint: 'rgba(226,189,107,0.24)',
    rune: '#f4dc9e',
    flow: 'rgba(118,232,220,0.42)',
    shade: '#0a0f21',
    mana: '#7ff3e4',
    manaRGB: [127, 243, 228],
    gold: '#ffd889',
    goldRGB: [255, 216, 137],
    value: '#fff6dc',
    valueBg: 'rgba(8,12,28,0.78)',
    error: '#ff5a6a',
    errorRGB: [255, 90, 106],
    caption: 'rgba(244,220,158,0.92)',
    captionDim: 'rgba(244,220,158,0.5)',
    link: 'rgba(226,189,107,0.32)',
    glow: true,
    blend: 'lighter',
    spentAlpha: 0.36,
    dimAlpha: 0.5,
  },
  talisman: {
    id: 'talisman',
    label: '符纸',
    bg0: '#f1dc9f', bg1: '#d2ad5c',
    line: '#2a170c',
    thin: 'rgba(42,23,12,0.62)',
    faint: 'rgba(42,23,12,0.24)',
    rune: '#3a2010',
    flow: 'rgba(170,30,20,0.5)',
    shade: '#ecd492',
    mana: '#b3231a',
    manaRGB: [179, 35, 26],
    gold: '#8a1d10',
    goldRGB: [138, 29, 16],
    value: '#6e0f08',
    valueBg: 'rgba(244,226,170,0.9)',
    error: '#4b1d86',
    errorRGB: [75, 29, 134],
    caption: 'rgba(42,23,12,0.88)',
    captionDim: 'rgba(42,23,12,0.5)',
    link: 'rgba(42,23,12,0.3)',
    glow: false,
    blend: 'multiply',
    spentAlpha: 0.42,
    dimAlpha: 0.55,
  },
};

export function roleColor(theme, role) {
  return theme[role] || theme.line;
}

/** A stable hue per spell name, used on the timeline and frame captions. */
export function spellTint(theme, index) {
  const night = ['#7ff3e4', '#ffd889', '#f59fd0', '#a9b8ff', '#9ef59a', '#ffb37a'];
  const paper = ['#b3231a', '#1d4f8a', '#2f6b2a', '#7a2f86', '#8a5a10', '#0f6c6a'];
  const list = theme.id === 'night' ? night : paper;
  return list[index % list.length];
}
