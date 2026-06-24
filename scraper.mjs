import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, 'data.json');
const RESULTS_DIR = join(__dirname, 'results');
const SEEN_FILE = join(__dirname, '.seen.json');

const QUERIES = [
  { q: 'claude code tutorial 2026', src: 'claude' },
  { q: 'claude AI agent tutorial 2026', src: 'claude' },
  { q: 'claude sonnet 4 coding', src: 'claude' },
  { q: 'opencode AI tutorial 2026', src: 'opencode' },
  { q: 'opencode cli tutorial 2026', src: 'opencode' },
  { q: 'opencode agent setup guide', src: 'opencode' },
  { q: 'hermes AI model tutorial 2026', src: 'hermes' },
  { q: 'hermes reflection model guide', src: 'hermes' },
  { q: 'hermes coding assistant tutorial', src: 'hermes' },
];

function loadJSON(path, fallback) {
  try { return JSON.parse(readFileSync(path, 'utf-8')); } catch { return fallback; }
}

function saveJSON(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return Math.abs(h).toString(36);
}

function fetchWithTimeout(url, timeout = 12000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeout);
  return fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' } })
    .then(r => { clearTimeout(id); return r; })
    .catch(e => { clearTimeout(id); throw e; });
}

function cleanTitle(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#x27;/g,"'").trim();
}

async function searchYouTube(query, source) {
  const results = [];
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + ' tutorial')}&hl=en`;
    const r = await fetchWithTimeout(url);
    const html = await r.text();

    // Extract initial data from YouTube's embedded JSON
    const match = html.match(/var ytInitialData\s*=\s*({.+?});/);
    if (!match) return results;
    const data = JSON.parse(match[1]);
    const sections = data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
    for (const section of sections) {
      const items = section?.itemSectionRenderer?.contents || [];
      for (const item of items) {
        const v = item?.videoRenderer;
        if (!v) continue;
        const id = v.videoId;
        const title = v.title?.runs?.[0]?.text || '';
        const channel = v.ownerText?.runs?.[0]?.text || '';
        const published = v.publishedTimeText?.simpleText || '';
        const dur = v.lengthText?.simpleText || '';
        if (!id || !title) continue;
        results.push({
          id: 'yt-' + id,
          title: cleanTitle(title),
          url: `https://youtu.be/${id}`,
          thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
          date: parseYouTubeTime(published),
          source,
          site: 'YouTube',
          type: 'video',
          channel,
          duration: dur
        });
      }
    }
  } catch (e) {}
  return results;
}

function parseYouTubeTime(str) {
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

async function searchWebDDG(query, source) {
  const results = [];
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' tutorial 2026')}`;
    const r = await fetchWithTimeout(url);
    const html = await r.text();
    const re = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const href = m[1].replace(/\/\/duckduckgo\.com\/l\/\?uddg=/, '').replace(/&rut=.*$/, '');
      const title = m[2].replace(/<[^>]+>/g, '').trim();
      let urlStr;
      try { urlStr = decodeURIComponent(href); } catch { urlStr = href; }
      if (!urlStr || !title || title.length < 10) continue;
      if (urlStr.startsWith('http')) {
        const host = new URL(urlStr).hostname.replace('www.', '');
        results.push({
          id: 'web-' + simpleHash(urlStr),
          title: cleanTitle(title),
          url: urlStr,
          thumbnail: null,
          date: new Date().toISOString(),
          source,
          site: host,
          type: 'article'
        });
      }
    }
  } catch {}
  return results;
}

async function main() {
  console.log('[⋆] Liquid Watch — scraping cycle at', new Date().toISOString());
  const seen = loadJSON(SEEN_FILE, { ids: [] });
  const data = loadJSON(DATA_FILE, { items: [], lastChecked: null });
  const existingIds = new Set(data.items.map(i => i.id));
  const seenIds = new Set(seen.ids);
  const allNew = [];

  for (const q of QUERIES) {
    const yt = await searchYouTube(q.q, q.src);
    for (const item of yt) {
      if (!existingIds.has(item.id)) {
        allNew.push(item);
        existingIds.add(item.id);
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }

  for (const q of QUERIES.slice(0, 5)) {
    const web = await searchWebDDG(q.q, q.src);
    for (const item of web) {
      if (!existingIds.has(item.id)) {
        allNew.push(item);
        existingIds.add(item.id);
      }
    }
    await new Promise(r => setTimeout(r, 600));
  }

  if (allNew.length > 0) {
    data.items = [...allNew, ...data.items];
  }
  data.lastChecked = new Date().toISOString();

  saveJSON(DATA_FILE, data);
  saveJSON(SEEN_FILE, { ids: [...data.items.map(i => i.id)] });

  const bySrc = {};
  for (const i of data.items) { bySrc[i.source] = (bySrc[i.source] || 0) + 1; }

  console.log(`[⋆] +${allNew.length} new · ${data.items.length} total · ${JSON.stringify(bySrc)}`);
  return { newCount: allNew.length, total: data.items.length, bySource: bySrc };
}

main().catch(e => { console.error('[!] scraper error:', e.message); process.exit(1); });
