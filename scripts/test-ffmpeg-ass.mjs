import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const testAss = path.resolve('storage/test_sub.ass');
fs.writeFileSync(testAss, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,60,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,3,0,2,20,20,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:02.00,Default,,0,0,0,,Hello World
`);

const p = testAss.split(path.sep).join('/'); // C:/Users/...

console.log('Original Windows path:', testAss);
console.log('Forward slash path:', p);

// Method 1: relative path
const rel = path.relative(process.cwd(), testAss).split(path.sep).join('/');
console.log('Testing Method 1 (relative path):', rel);
let r1 = spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:d=1', '-filter_complex', `[0:v]ass='${rel}'[v_out]`, '-map', '[v_out]', '-f', 'null', '-'], { encoding: 'utf8' });
console.log('Method 1 status:', r1.status);
if (r1.status !== 0) console.log('Method 1 error:', r1.stderr.slice(-300));

// Method 2: absolute with filename='...'
// In FFmpeg, filename option syntax:
// ass=filename='C\\:/...'
const escColon = p.replace(':', '\\\\:');
console.log('Testing Method 2 (filename option):', escColon);
let r2 = spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:d=1', '-filter_complex', `[0:v]ass=filename='${escColon}'[v_out]`, '-map', '[v_out]', '-f', 'null', '-'], { encoding: 'utf8' });
console.log('Method 2 status:', r2.status);
if (r2.status !== 0) console.log('Method 2 error:', r2.stderr.slice(-300));

// Method 3: subtitles filter with filename='...'
let r3 = spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:d=1', '-filter_complex', `[0:v]subtitles=filename='${escColon}'[v_out]`, '-map', '[v_out]', '-f', 'null', '-'], { encoding: 'utf8' });
console.log('Method 3 status:', r3.status);
if (r3.status !== 0) console.log('Method 3 error:', r3.stderr.slice(-300));

// Method 4: subtitles with relative path
let r4 = spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:d=1', '-filter_complex', `[0:v]subtitles='${rel}'[v_out]`, '-map', '[v_out]', '-f', 'null', '-'], { encoding: 'utf8' });
console.log('Method 4 status:', r4.status);
if (r4.status !== 0) console.log('Method 4 error:', r4.stderr.slice(-300));

// Method 5: full absolute path with quadruple slash on colon or double quotes:
// In ffmpeg: ass='C\:/Users/...' vs ass=C\:/Users/...
let r5 = spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:d=1', '-filter_complex', `[0:v]ass='${p.replace(':', '\\:')}'[v_out]`, '-map', '[v_out]', '-f', 'null', '-'], { encoding: 'utf8' });
console.log('Method 5 status:', r5.status);
if (r5.status !== 0) console.log('Method 5 error:', r5.stderr.slice(-300));

// Method 6: Escape colon without single quotes:
// If no quotes: ass=C\:/Users/Gopala\ Krishna/...
const noQuotes = p.replace(':', '\\:').replace(/ /g, '\\ ');
let r6 = spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'color=c=blue:s=1080x1920:d=1', '-filter_complex', `[0:v]ass=${noQuotes}[v_out]`, '-map', '[v_out]', '-f', 'null', '-'], { encoding: 'utf8' });
console.log('Method 6 status:', r6.status);
if (r6.status !== 0) console.log('Method 6 error:', r6.stderr.slice(-300));

fs.unlinkSync(testAss);
