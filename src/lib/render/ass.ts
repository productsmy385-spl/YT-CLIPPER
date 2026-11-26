import { cuesOnOutput, outputSize, type EditDoc, type CaptionStyle } from './edit-doc.ts';

/** Build an ASS subtitle script (captions + text overlays) for an edit document, on the OUTPUT timeline. */

function assColor(hex: string, alpha = 0): string {
  const h = (hex || '#FFFFFF').replace('#', '').padEnd(6, 'F');
  const r = h.slice(0, 2), g = h.slice(2, 4), b = h.slice(4, 6);
  return `&H${alpha.toString(16).padStart(2, '0').toUpperCase()}${b}${g}${r}`.toUpperCase();
}

function ts(sec: number): string {
  const t = Math.max(0, sec);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const cs = Math.min(99, Math.round((t - Math.floor(t)) * 100));
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function esc(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/[{}]/g, '').replace(/\r?\n/g, '\\N');
}

function fontSpec(font: string): { name: string; bold: number } {
  if (font === 'Poppins ExtraBold') return { name: 'Poppins ExtraBold', bold: 0 };
  if (font === 'Poppins' || font.startsWith('Noto Sans')) return { name: font, bold: -1 };
  return { name: font, bold: 0 };
}

function captionStyleLine(style: CaptionStyle, height: number): string {
  const f = fontSpec(style.font);
  const alignment = style.position === 'top' ? 8 : style.position === 'middle' ? 5 : 2;
  const marginV = style.position === 'middle' ? 0 : Math.round(height * (style.position === 'bottom' ? 0.2 : 0.12));
  const box = style.background === 'box';
  const borderStyle = box ? 3 : 1;
  const outline = box ? Math.round(style.size * 0.18) : Math.max(3, Math.round(style.size * 0.08));
  const shadow = style.background === 'shadow' ? 3 : 0;
  const back = box ? assColor('#000000', 0x60) : assColor('#000000', 0x70);
  const outlineCol = box ? assColor('#000000', 0x60) : assColor(style.outlineColor);
  return `Style: Caption,${f.name},${style.size},${assColor(style.color)},${assColor(style.highlightColor)},${outlineCol},${back},${f.bold},0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},70,70,${marginV},1`;
}

export function buildAss(doc: EditDoc): string {
  const { width, height } = outputSize(doc.aspect);
  const style = doc.captions.style;
  const lines: string[] = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    'YCbCr Matrix: TV.709',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    captionStyleLine(style, height),
    `Style: Overlay,Poppins ExtraBold,64,${assColor('#FFFFFF')},${assColor('#FFFFFF')},${assColor('#000000')},${assColor('#000000', 0x50)},0,0,0,0,100,100,0,0,1,4,2,5,0,0,0,1`,
    `Style: OverlayBox,Poppins ExtraBold,64,${assColor('#FFFFFF')},${assColor('#FFFFFF')},${assColor('#000000', 0x40)},${assColor('#000000', 0x40)},0,0,0,0,100,100,0,0,3,14,0,5,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  if (doc.captions.enabled) {
    const hl = `{\\c${assColor(style.highlightColor)}}`;
    const normal = `{\\c${assColor(style.color)}}`;
    const word = (w: string) => (style.uppercase ? w.toUpperCase() : w);
    for (const cue of cuesOnOutput(doc)) {
      const words = cue.words.length ? cue.words : [{ start: cue.outStart, end: cue.outEnd, text: cue.text, highlight: false }];
      if (style.animation === 'karaoke') {
        // One event per word interval; the word being spoken is coloured.
        for (let i = 0; i < words.length; i++) {
          const s = i === 0 ? cue.outStart : words[i].start;
          const e = i === words.length - 1 ? cue.outEnd : words[i + 1].start;
          if (e - s < 0.02) continue;
          const text = words.map((w, j) => (j === i ? `${hl}${esc(word(w.text))}${normal}` : esc(word(w.text)))).join(' ');
          lines.push(`Dialogue: 0,${ts(s)},${ts(e)},Caption,,0,0,0,,${text}`);
        }
        continue;
      }
      const text = words.map((w) => (w.highlight ? `${hl}${esc(word(w.text))}${normal}` : esc(word(w.text)))).join(' ');
      const anim =
        style.animation === 'pop' ? '{\\fscx70\\fscy70\\t(0,110,\\fscx108\\fscy108)\\t(110,190,\\fscx100\\fscy100)}'
        : style.animation === 'fade' ? '{\\fad(120,100)}'
        : '';
      lines.push(`Dialogue: 0,${ts(cue.outStart)},${ts(cue.outEnd)},Caption,,0,0,0,,${anim}${text}`);
    }
  }

  for (const t of doc.texts || []) {
    const f = fontSpec(t.font || 'Poppins ExtraBold');
    const x = Math.round(Math.max(0, Math.min(1, t.x)) * width);
    const y = Math.round(Math.max(0, Math.min(1, t.y)) * height);
    const tags = `{\\an5\\pos(${x},${y})\\fn${f.name}\\fs${Math.round(t.size || 64)}\\c${assColor(t.color || '#FFFFFF')}}`;
    lines.push(`Dialogue: 1,${ts(t.start)},${ts(t.end)},${t.box ? 'OverlayBox' : 'Overlay'},,0,0,0,,${tags}${esc(t.text)}`);
  }
  return lines.join('\n') + '\n';
}
