import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = 'https://sign.yao.care';
const read = (name) => readFileSync(resolve(process.cwd(), name), 'utf8');
const html = read('index.html');

/** 取 <meta name="..."> 或 <meta property="..."> 的 content。 */
const meta = (key) => {
  const re = new RegExp(
    `<meta\\s+(?:name|property)=["']${key.replace(/[:.]/g, '\\$&')}["']\\s+content=["']([^"']*)["']`,
    'i',
  );
  return html.match(re)?.[1];
};

describe('index.html 基本 meta', () => {
  it('description 存在且 ≤155 字', () => {
    const d = meta('description');
    expect(d).toBeTruthy();
    expect(d.length).toBeLessThanOrEqual(155);
  });

  it('canonical 指向本站首頁', () => {
    expect(html).toMatch(
      new RegExp(`<link\\s+rel=["']canonical["']\\s+href=["']${ORIGIN}/["']`, 'i'),
    );
  });

  it('宣告最後更新日期為合法 ISO 日期', () => {
    const t = html.match(/<time\s+datetime=["'](\d{4}-\d{2}-\d{2})["']/i);
    expect(t).toBeTruthy();
    expect(Number.isNaN(Date.parse(t[1]))).toBe(false);
  });
});

describe('Open Graph', () => {
  it('og:type 為 website —— 本頁是應用程式入口而非文章', () => {
    expect(meta('og:type')).toBe('website');
  });

  it('必要的 og 標籤都存在', () => {
    for (const k of ['og:title', 'og:description', 'og:image', 'og:url', 'og:site_name']) {
      expect(meta(k), `缺少 ${k}`).toBeTruthy();
    }
  });

  it('og:url 為本站絕對網址', () => {
    expect(meta('og:url')).toBe(`${ORIGIN}/`);
  });

  it('og:image 為絕對網址且檔案實際存在', () => {
    const img = meta('og:image');
    expect(img.startsWith(`${ORIGIN}/`)).toBe(true);
    const rel = img.slice(`${ORIGIN}/`.length);
    expect(existsSync(resolve(process.cwd(), rel)), `${rel} 不存在`).toBe(true);
  });

  it('og:image 宣告的尺寸與實際 PNG 像素相符，且符合 1200x630', () => {
    const buf = readFileSync(resolve(process.cwd(), 'icons/og-image.png'));
    // PNG signature(8 bytes) + IHDR length/type(8 bytes)，width/height 各為 4-byte big-endian
    expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
    expect(meta('og:image:width')).toBe(String(width));
    expect(meta('og:image:height')).toBe(String(height));
  });
});

describe('Twitter card', () => {
  it('使用 summary_large_image', () => {
    expect(meta('twitter:card')).toBe('summary_large_image');
  });

  it('title/description/image 都存在', () => {
    for (const k of ['twitter:title', 'twitter:description', 'twitter:image']) {
      expect(meta(k), `缺少 ${k}`).toBeTruthy();
    }
  });
});

describe('JSON-LD 結構化資料', () => {
  const raw = html.match(
    /<script\s+type=["']application\/ld\+json["']\s*>([\s\S]*?)<\/script>/i,
  )?.[1];

  it('存在且為合法 JSON', () => {
    expect(raw).toBeTruthy();
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('型別為 WebApplication，非 Article', () => {
    const ld = JSON.parse(raw);
    expect(ld['@context']).toBe('https://schema.org');
    expect(ld['@type']).toBe('WebApplication');
  });

  it('publisher 為 Organization 且 sameAs 指向真實 repo', () => {
    const ld = JSON.parse(raw);
    expect(ld.publisher['@type']).toBe('Organization');
    expect(ld.publisher.sameAs.length).toBeGreaterThanOrEqual(1);
    for (const u of ld.publisher.sameAs) expect(u.startsWith('https://')).toBe(true);
  });

  it('url 與 image 與 meta 標籤一致，不自相矛盾', () => {
    const ld = JSON.parse(raw);
    expect(ld.url).toBe(meta('og:url'));
    expect(ld.image).toBe(meta('og:image'));
  });

  it('dateModified 與頁面顯示的更新日期一致', () => {
    const ld = JSON.parse(raw);
    const shown = html.match(/<time\s+datetime=["'](\d{4}-\d{2}-\d{2})["']/i)[1];
    expect(ld.dateModified).toBe(shown);
  });
});

describe('權威來源連結', () => {
  it('法律段落附上至少 2 個官方法規出處', () => {
    const authoritative = [
      'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021', // 個人資料保護法
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj', // GDPR
    ];
    for (const u of authoritative) expect(html).toContain(u);
  });
});
