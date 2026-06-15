import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = 'https://sign.yao.care';
const read = (name) => readFileSync(resolve(process.cwd(), name), 'utf8');

describe('robots.txt', () => {
  const robots = read('robots.txt');

  it('指向正確網域的 sitemap', () => {
    expect(robots).toMatch(new RegExp(`^Sitemap:\\s*${ORIGIN}/sitemap\\.xml$`, 'm'));
  });

  it('擋掉內部管理與 demo 頁', () => {
    for (const path of ['/admin.html', '/example-checkin.html', '/example-alert.html']) {
      expect(robots).toMatch(new RegExp(`^Disallow:\\s*${path.replace('.', '\\.')}$`, 'm'));
    }
  });

  it('不擋公開首頁', () => {
    expect(robots).not.toMatch(/^Disallow:\s*\/index\.html$/m);
    expect(robots).not.toMatch(/^Disallow:\s*\/\$?$/m);
  });
});

describe('sitemap.xml', () => {
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  it('宣告 XML 與 sitemap namespace', () => {
    expect(sitemap).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(sitemap).toContain('http://www.sitemaps.org/schemas/sitemap/0.9');
  });

  it('收錄首頁', () => {
    expect(locs).toContain(`${ORIGIN}/`);
  });

  it('所有 <loc> 都是本站絕對網址', () => {
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) expect(loc.startsWith(`${ORIGIN}/`)).toBe(true);
  });

  it('不收錄被 robots 擋掉的頁面', () => {
    for (const blocked of ['admin.html', 'example-checkin.html', 'example-alert.html']) {
      expect(sitemap).not.toContain(blocked);
    }
  });

  it('lastmod 為合法 YYYY-MM-DD 日期', () => {
    for (const m of sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
      expect(m[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(m[1]))).toBe(false);
    }
  });
});
