// Génération des commandes FFmpeg du pipeline de montage (testées unitairement).
export interface ProbeInfo { width: number; height: number; rotation: number; hasAudio: boolean; duration: number; hdr?: boolean }

const W = 1920, H = 1080;

/** Vidéo HDR de l'iPhone (HLG / PQ, BT.2020) → SDR BT.709 : sans cela, couleurs délavées et image terne */
const TONEMAP = 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p';
/** Débruitage léger (grain des salles peu éclairées), appliqué après réduction en 1080p */
const DENOISE = 'hqdn3d=1.5:1.5:4:4';

/** Normalise une vidéo en 1080p30 H.264/AAC ; vidéos verticales sur fond flou ; silence si pas d'audio.
 *  4K et plus : réduction de qualité (lanczos) ; HDR converti en SDR ; débruitage léger. Fichier intermédiaire de haute
 *  qualité (CRF 16) : la qualité finale se joue à l'encodage des segments. */
export function normalizeArgs(input: string, output: string, p: ProbeInfo): string[] {
  const rotated = Math.abs(p.rotation) % 180 === 90;
  const w = rotated ? p.height : p.width, h = rotated ? p.width : p.height;
  const vertical = h > w;
  // Grandes vidéos (4K, 8K…) : réduites d'abord à 1920 px sur le plus grand côté (lanczos, net) ; le reste du traitement
  // (conversion HDR, débruitage) porte ainsi sur 4 fois moins de pixels → bien plus rapide, même rendu
  const k = Math.min(1, W / Math.max(w, h)), tw = Math.round((w * k) / 2) * 2, th = Math.round((h * k) / 2) * 2;
  const pre = (k < 1 ? `scale=${tw}:${th}:flags=lanczos,` : '') + (p.hdr ? `${TONEMAP},` : '');
  const sc = 'flags=lanczos';
  const vf = vertical
    ? `[0:v]${pre}split=2[bg][fg];[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=30:2,eq=brightness=-0.12[b];` +
      `[fg]scale=${W}:${H}:force_original_aspect_ratio=decrease:${sc},${DENOISE}[f];[b][f]overlay=(W-w)/2:(H-h)/2,fps=30,format=yuv420p,setsar=1[v]`
    : `[0:v]${pre}scale=${W}:${H}:force_original_aspect_ratio=decrease:${sc},${DENOISE},pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[v]`;
  const args = ['-y', '-i', input];
  if (!p.hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  args.push('-filter_complex', vf, '-map', '[v]', '-map', p.hasAudio ? '0:a:0' : '1:a:0');
  if (!p.hasAudio) args.push('-shortest');
  args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', output);
  return args;
}

/** Clip de planche à partir d'une séquence d'images PNG (30 i/s), avec piste silencieuse. */
export function framesToClipArgs(pattern: string, output: string, duration: number): string[] {
  return ['-y', '-framerate', '30', '-i', pattern, '-f', 'lavfi', '-t', String(duration), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-shortest', output];
}

/** Clip photo (Ken Burns léger) pour un quart sans vidéo. */
export function photoClipArgs(input: string, output: string, duration = 3): string[] {
  const frames = Math.round(duration * 30);
  return ['-y', '-loop', '1', '-i', input, '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-t', String(duration),
    '-filter_complex', `[0:v]scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},zoompan=z='min(zoom+0.0008,1.08)':d=${frames}:s=${W}x${H}:fps=30,format=yuv420p,setsar=1[v]`,
    '-map', '[v]', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-shortest', output];
}

/** Fondu enchaîné vidéo ↔ vidéo (0,25 s) + fondu audio, sur une liste de clips normalisés. */
export function xfadeChainArgs(inputs: { path: string; duration: number }[], output: string, fade = 0.25): string[] {
  if (inputs.length === 1) return ['-y', '-i', inputs[0].path, '-c', 'copy', output];
  const args = ['-y'];
  inputs.forEach((i) => args.push('-i', i.path));
  const parts: string[] = [];
  let vPrev = '[0:v]', aPrev = '[0:a]', offset = 0;
  for (let k = 1; k < inputs.length; k++) {
    offset += inputs[k - 1].duration - fade;
    const v = k === inputs.length - 1 ? '[v]' : `[v${k}]`, a = k === inputs.length - 1 ? '[a]' : `[a${k}]`;
    parts.push(`${vPrev}[${k}:v]xfade=transition=fade:duration=${fade}:offset=${offset.toFixed(3)}${v}`);
    parts.push(`${aPrev}[${k}:a]acrossfade=d=${fade}${a}`);
    vPrev = v; aPrev = a;
  }
  args.push('-filter_complex', parts.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', output);
  return args;
}

/**
 * Jonction planche ↔ vidéo avec la « vague » : coupe sèche à `cut` (milieu de la vague),
 * la séquence PNG transparente (0,6 s) est superposée centrée sur la coupe, whoosh mixé, fondu audio 0,2 s.
 */
export function wipeJoinArgs(a: string, aDur: number, b: string, wipePattern: string, output: string, whoosh?: string, wipeDur = 0.6): string[] {
  const start = Math.max(0, aDur - wipeDur / 2);
  const args = ['-y', '-i', a, '-i', b, '-framerate', '30', '-i', wipePattern];
  if (whoosh) args.push('-i', whoosh);
  const f = [
    `[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[cv][ca0]`,
    `[2:v]setpts=PTS-STARTPTS+${start.toFixed(3)}/TB[w]`,
    `[cv][w]overlay=0:0:eof_action=pass,format=yuv420p[v]`,
    `[ca0]afade=t=out:st=${(aDur - 0.2).toFixed(3)}:d=0.2,afade=t=in:st=${aDur.toFixed(3)}:d=0.2[ca]`,
  ];
  if (whoosh) f.push(`[3:a]adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)},volume=0.6[wh]`, `[ca][wh]amix=inputs=2:duration=first:normalize=0[a]`);
  else f[3] = f[3].replace('[ca]', '[a]');
  args.push('-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', output);
  return args;
}

/** Concaténation sans réencodage (liste concat). */
export function concatListArgs(listFile: string, output: string): string[] {
  return ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', output];
}

/** HLS : 1080p recopié sans réencodage (GOP de 2 s déjà fixé) + 720p réencodé, segments de 6 s, master.m3u8. */
export function hlsArgs(input: string, outDir: string): string[] {
  return ['-y', '-i', input,
    '-map', '0:v', '-map', '0:a', '-map', '0:v', '-map', '0:a',
    '-c:v:0', 'copy', '-filter:v:1', 'scale=-2:720', '-c:v:1', 'libx264', '-preset', 'veryfast', '-profile:v:1', 'high',
    '-b:v:1', '2500k', '-maxrate:v:1', '2800k', '-bufsize:v:1', '5000k', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
    '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_flags', 'independent_segments',
    '-hls_segment_filename', `${outDir}/%v/seg_%04d.ts`, '-master_pl_name', 'master.m3u8',
    '-var_stream_map', 'v:0,a:0,name:1080p v:1,a:1,name:720p', `${outDir}/%v/index.m3u8`];
}

/** Encodage final du 1080p (segments) : qualité constante (CRF 20, préréglage « medium », bien plus fin que « veryfast »),
 *  plafonnée à 8 Mb/s pour rester fluide en streaming (débit conseillé par YouTube pour du 1080p30). */
export const ENC_1080 = ['-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-crf', '20', '-maxrate', '8000k', '-bufsize', '16000k',
  '-g', '60', '-keyint_min', '60', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2'];

export interface SegmentOpts { fade?: number; head?: string; tail?: string; whoosh?: string; wipeHalf?: number; bug?: string }
/** Logo BeHoop (piste transparente d'une minute, en boucle) : coin haut droit, animation 0,8 s après le début de la séquence. */
export const BUG_DELAY = 0.8;
const BUG_POS = 'W-w-36:20';
/**
 * Encode un segment du film en une seule passe : fondus enchaînés vidéo↔vidéo (0,25 s) + fondu audio,
 * moitié « sortie » de la vague au début (head) et moitié « entrée » à la fin (tail), whoosh sur la vague.
 * Tous les segments ont les mêmes paramètres → concaténation finale sans réencodage.
 */
export function segmentArgs(inputs: { path: string; duration: number }[], output: string, o: SegmentOpts = {}): { args: string[]; duration: number } {
  const fade = o.fade ?? 0.25, half = o.wipeHalf ?? 10 / 30;
  const n = inputs.length;
  const args = ['-y'];
  inputs.forEach((i) => args.push('-i', i.path));
  let k = n;
  const hi = o.head ? (args.push('-framerate', '30', '-i', o.head), k++) : -1;
  const ti = o.tail ? (args.push('-framerate', '30', '-i', o.tail), k++) : -1;
  const wi = o.whoosh && o.tail ? (args.push('-i', o.whoosh), k++) : -1;
  const bi = o.bug ? (args.push('-stream_loop', '-1', '-i', o.bug), k++) : -1;
  const f: string[] = [];
  let v = '[0:v]', a = '[0:a]', off = 0;
  for (let i = 1; i < n; i++) {
    off += inputs[i - 1].duration - fade;
    f.push(`${v}[${i}:v]xfade=transition=fade:duration=${fade}:offset=${off.toFixed(3)}[x${i}]`, `${a}[${i}:a]acrossfade=d=${fade}[y${i}]`);
    v = `[x${i}]`; a = `[y${i}]`;
  }
  const T = inputs.reduce((s, i) => s + i.duration, 0) - fade * (n - 1);
  // Logo sous les vagues de transition (posé avant elles)
  if (bi >= 0) { f.push(`[${bi}:v]setpts=PTS-STARTPTS+${BUG_DELAY}/TB[bug]`, `${v}[bug]overlay=${BUG_POS}:shortest=1[vl]`); v = '[vl]'; }
  if (hi >= 0) { f.push(`${v}[${hi}:v]overlay=0:0:eof_action=pass[vh]`); v = '[vh]'; }
  if (ti >= 0) { f.push(`[${ti}:v]setpts=PTS-STARTPTS+${(T - half).toFixed(3)}/TB[tw]`, `${v}[tw]overlay=0:0:eof_action=pass[vt]`); v = '[vt]'; }
  f.push(`${v}format=yuv420p,setsar=1[v]`);
  const af = [o.head ? 'afade=t=in:d=0.2' : '', o.tail ? `afade=t=out:st=${Math.max(0, T - 0.2).toFixed(3)}:d=0.2` : ''].filter(Boolean).join(',') || 'anull';
  f.push(`${a}${af}[a0]`);
  if (wi >= 0) {
    const ms = Math.round(Math.max(0, T - half) * 1000);
    f.push(`[${wi}:a]adelay=${ms}|${ms},volume=0.7[wh]`, `[a0][wh]amix=inputs=2:duration=first:normalize=0[a]`);
  } else f[f.length - 1] = f[f.length - 1].replace('[a0]', '[a]');
  args.push('-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-t', T.toFixed(3), ...ENC_1080, output);
  return { args, duration: T };
}

export function posterArgs(input: string, output: string, at = 3): string[] {
  return ['-y', '-ss', String(at), '-i', input, '-frames:v', '1', '-q:v', '3', output];
}

/** Cadrage d'un Moment : « full » = recadré plein écran (pos : 0 gauche → 1 droite), « fit » = image entière sur fond flou */
export type MomentLayout = 'full' | 'fit';
/** Un passage d'un Moment, mis au format vertical 1080×1920 (encodage intermédiaire de haute qualité). */
/** Point de cadrage : à t secondes du début du passage, cadre à la position pos (0 gauche → 1 droite) */
export interface CropKey { t: number; pos: number }
/** Position du cadre au fil du temps (expression FFmpeg) : glissement doux (smoothstep) d'un point de cadrage au suivant */
export function cropPosExpr(keys: CropKey[]): string {
  const k = [...keys].filter((x) => Number.isFinite(x.t) && Number.isFinite(x.pos)).sort((a, b) => a.t - b.t).map((x) => ({ t: Math.max(0, x.t), pos: Math.min(1, Math.max(0, x.pos)) }));
  if (!k.length) return '0.500';
  let e = k[k.length - 1].pos.toFixed(3);
  for (let i = k.length - 2; i >= 0; i--) {
    const a = k[i], b = k[i + 1], d = Math.max(0.05, b.t - a.t);
    const s = `((t-${a.t.toFixed(2)})/${d.toFixed(2)})`;
    e = `if(lt(t\\,${b.t.toFixed(2)})\\,${a.pos.toFixed(3)}+(${(b.pos - a.pos).toFixed(3)})*${s}*${s}*(3-2*${s})\\,${e})`;
  }
  return `if(lt(t\\,${k[0].t.toFixed(2)})\\,${k[0].pos.toFixed(3)}\\,${e})`;
}
export function momentClipArgs(input: string, start: number, end: number, layout: MomentLayout, pos: number | CropKey[], output: string): string[] {
  const keys = typeof pos === 'number' ? [{ t: 0, pos }] : pos;
  const v = layout === 'full'
    ? `[0:v]scale=-2:1920:flags=lanczos,setpts=PTS-STARTPTS,crop=1080:1920:(iw-1080)*(${cropPosExpr(keys)}):0,setsar=1,fps=30,format=yuv420p[v]`
    : '[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=40:2,eq=brightness=-0.15[b];' +
      '[fg]scale=1080:-2:flags=lanczos[f];[b][f]overlay=0:(H-h)/2,setsar=1,fps=30,format=yuv420p[v]';
  // Début + durée (et non « -to ») : même résultat quelle que soit la version de FFmpeg
  return ['-y', '-ss', String(start), '-i', input, '-t', (end - start).toFixed(3), '-filter_complex', v, '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-g', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', output];
}

export interface MomentJoin { clips: { path: string; duration: number }[]; banner: string; output: string; bug?: string; wave?: string; waveCut?: number; whoosh?: string;
  /** Bande son du catalogue : elle REMPLACE le son du match (pas de mélange), à partir de `start` s dans le morceau */
  music?: { path: string; start: number } }
/**
 * Assemblage d'un Moment : passages bout à bout, vague par-dessus chaque coupure (elle couvre l'écran à l'instant de la
 * coupure), bandeau du score en haut, logo BeHoop animé juste sous le bandeau (hors des commandes des lecteurs, YouTube Shorts compris).
 */
export function momentJoinArgs(o: MomentJoin): { args: string[]; duration: number } {
  const n = o.clips.length, args = ['-y'];
  o.clips.forEach((c) => args.push('-i', c.path));
  let k = n;
  const bi = (args.push('-i', o.banner), k++);
  const gi = o.bug ? (args.push('-stream_loop', '-1', '-i', o.bug), k++) : -1;
  const cuts: number[] = []; let acc = 0;
  for (let i = 0; i < n - 1; i++) { acc += o.clips[i].duration; cuts.push(acc); }
  const T = acc + o.clips[n - 1].duration;
  const wi = o.wave ? cuts.map(() => (args.push('-framerate', '30', '-i', o.wave!), k++)) : [];
  const hi = o.whoosh && cuts.length ? (args.push('-i', o.whoosh), k++) : -1;
  const mi = o.music ? (args.push('-ss', Math.max(0, o.music.start).toFixed(2), '-i', o.music.path), k++) : -1;
  const f: string[] = [];
  if (mi >= 0) {
    // Son du match retiré : seule la musique (fondu d'entrée très court, fondu de sortie sur la dernière seconde et demie)
    f.push(`${o.clips.map((_, i) => `[${i}:v]`).join('')}concat=n=${n}:v=1:a=0[v0]`);
    f.push(`[${mi}:a]atrim=0:${T.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,afade=t=in:d=0.15,afade=t=out:st=${Math.max(0, T - 1.5).toFixed(3)}:d=1.5,apad[a0]`);
  } else f.push(`${o.clips.map((_, i) => `[${i}:v][${i}:a]`).join('')}concat=n=${n}:v=1:a=1[v0][a0]`);
  let v = '[v0]';
  wi.forEach((w, i) => { f.push(`[${w}:v]setpts=PTS-STARTPTS+${(cuts[i] - (o.waveCut ?? 0.35)).toFixed(3)}/TB[w${i}]`, `${v}[w${i}]overlay=0:0:eof_action=pass[vw${i}]`); v = `[vw${i}]`; });
  f.push(`${v}[${bi}:v]overlay=0:0[vb]`); v = '[vb]';
  if (gi >= 0) { f.push(`[${gi}:v]setpts=PTS-STARTPTS+0.6/TB[bug]`, `${v}[bug]overlay=W-w-24:300:shortest=1[vl]`); v = '[vl]'; }
  f.push(`${v}format=yuv420p[v]`);
  if (hi >= 0) {
    f.push(`[${hi}:a]asplit=${cuts.length}${cuts.map((_, i) => `[h${i}]`).join('')}`);
    cuts.forEach((c, i) => { const ms = Math.max(0, Math.round((c - 0.3) * 1000)); f.push(`[h${i}]adelay=${ms}|${ms},volume=0.6[hd${i}]`); });
    f.push(`[a0]${cuts.map((_, i) => `[hd${i}]`).join('')}amix=inputs=${cuts.length + 1}:duration=first:normalize=0[a]`);
  } else f.push('[a0]anull[a]');
  args.push('-filter_complex', f.join(';'), '-map', '[v]', '-map', '[a]', '-t', T.toFixed(3),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-maxrate', '8000k', '-bufsize', '16000k', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', o.output);
  return { args, duration: T };
}
