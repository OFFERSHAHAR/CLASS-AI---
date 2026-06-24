import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'data.json');
const SEEN_FILE = join(__dirname, '.seen.json');

const QUERIES = [
  { q: 'claude code tutorial 2026', src: 'claude' },
  { q: 'claude AI agent tutorial 2026', src: 'claude' },
  { q: 'claude sonnet 4 coding', src: 'claude' },
  { q: 'opencode AI tutorial 2026', src: 'opencode' },
  { q: 'opencode cli tutorial 2026', src: 'opencode' },
  { q: 'opencode agent setup guide', src: 'opencode' },
  { q: 'Hermes AI tutorial 2026', src: 'hermes' },
  { q: 'Hermes agent setup guide', src: 'hermes' },
  { q: 'Hermes coding assistant', src: 'hermes' },
];

const BLOCK_WORDS = [
  'bag','bags','scarf','scarves','birkin','kelly','constance',
  'handbag','purse','leather','silk','stamp','typewriter','ribbon',
  'label','printer','haul','reps','engagement','ring','rings',
  'jewelry','bracelet','watch','boots','outfit','framing','reflective'
];

function loadJSON(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return fallback; }
}
function saveJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

async function fetchHTML(url) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' } });
    clearTimeout(id);
    return await r.text();
  } catch { clearTimeout(id); return null; }
}

function isBlocked(title, channel) {
  const t = title.toLowerCase();
  const c = (channel || '').toLowerCase();
  for (const w of BLOCK_WORDS) {
    if (t.includes(w) || c.includes(w)) return true;
  }
  return false;
}

function parseYTDate(str) {
  if (!str) return new Date().toISOString();
  const n = parseInt(str) || 0;
  const now = Date.now();
  if (str.includes('minute')) return new Date(now - n * 60000).toISOString();
  if (str.includes('hour')) return new Date(now - n * 3600000).toISOString();
  if (str.includes('day')) return new Date(now - n * 86400000).toISOString();
  if (str.includes('week')) return new Date(now - n * 604800000).toISOString();
  if (str.includes('month')) return new Date(now - n * 2592000000).toISOString();
  if (str.includes('year')) return new Date(now - n * 31536000000).toISOString();
  return new Date().toISOString();
}

function extractJSON(html, key) {
  const idx = html.indexOf(key);
  if (idx === -1) return null;
  const start = html.indexOf('{', idx);
  if (start === -1) return null;
  let depth = 0, i = start;
  for (; i < html.length; i++) {
    const c = html[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) return null;
  try { return JSON.parse(html.slice(start, i + 1)); } catch { return null; }
}

function walk(obj, path) {
  for (const k of path) {
    if (!obj || typeof obj !== 'object') return null;
    obj = obj[k];
  }
  return obj;
}

async function searchYouTube(query, source) {
  const results = [];
  const html = await fetchHTML(`https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' tutorial')}&hl=en`);
  if (!html) return results;

  const data = extractJSON(html, 'ytInitialData');
  if (!data) return results;

  const sections = walk(data, ['contents','twoColumnSearchResultsRenderer','primaryContents','sectionListRenderer','contents']) || [];
  for (const section of sections) {
    const items = walk(section, ['itemSectionRenderer','contents']) || [];
    for (const item of items) {
      const v = item?.videoRenderer;
      if (!v) continue;
      const id = v.videoId;
      const title = v.title?.runs?.[0]?.text;
      const channel = v.ownerText?.runs?.[0]?.text || '';
      const published = v.publishedTimeText?.simpleText || '';
      const dur = v.lengthText?.simpleText || '';
      if (!id || !title) continue;
      if (isBlocked(title, channel)) continue;
      results.push({
        id: 'yt-' + id,
        title: title.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"),
        url: `https://youtu.be/${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
        date: parseYTDate(published),
        source,
        site: 'YouTube',
        type: 'video',
        channel,
        duration: dur
      });
    }
  }
  return results;
}

async function main() {
  console.log('[⋆] scraping cycle at', new Date().toISOString());
  const data = loadJSON(DATA_FILE, { items: [], lastChecked: null });
  const existingIds = new Set(data.items.map(i => i.id));
  const allNew = [];

  for (const q of QUERIES) {
    const yt = await searchYouTube(q.q, q.src);
    let added = 0;
    for (const item of yt) {
      if (!existingIds.has(item.id)) {
        allNew.push(item);
        existingIds.add(item.id);
        added++;
      }
    }
    console.log(`  [${q.src}] "${q.q}" → ${yt.length} found, ${added} new`);
    await new Promise(r => setTimeout(r, 1000));
  }

  if (allNew.length > 0) {
    data.items = [...allNew, ...data.items];
  }
  data.lastChecked = new Date().toISOString();
  saveJSON(DATA_FILE, data);
  saveJSON(SEEN_FILE, { ids: [...data.items.map(i => i.id)] });

  const bySrc = {};
  for (const i of data.items) bySrc[i.source] = (bySrc[i.source] || 0) + 1;
  console.log(`[⋆] +${allNew.length} new · ${data.items.length} total · ${JSON.stringify(bySrc)}`);
}

main().catch(e => { console.error('[!]', e.message); process.exit(1); });
