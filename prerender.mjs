// 7summits Camera — build-time pre-renderer
// Fetches all CMS + booking data, injects static HTML into templates,
// writes everything to dist/ for Vercel to deploy.
//
// Run via: npm run build  (Vercel auto-runs this)

import fs from 'node:fs/promises';
import path from 'node:path';

// ============================================================================
// CONFIG
// ============================================================================
const CMS = {
  url: 'https://mchsqiujfhvzbxzdqeeb.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHNxaXVqZmh2emJ4emRxZWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTAyMDIsImV4cCI6MjA5Mzg4NjIwMn0.HUIpHZWHfBx_IwyA-ODxgVilK7y5DMt5o2rxfnDYlXM'
};
const BOOKING = {
  url: 'https://yxcssruutgpzkgcsqrit.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4Y3NzcnV1dGdwemtnY3Nxcml0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5OTAzMTYsImV4cCI6MjA5MTU2NjMxNn0.NMZqMuEUR2c-V3CnbW-bJNn1bjlS6vHLPUQSD7nArM0'
};

const SITE_URL = 'https://sewakamerabandung.id';
const BOOKING_URL = 'https://booking.sewakamerabandung.id';
const SRC = '.';
const OUT = 'dist';

const COPY_FILES = [
  'design-system.css','article.css','area.css','auth.css',
  'components.js','cart.js','branding-loader.js','auth.js',
  'logo-7summits.png','logo-7summits-mark.png','vercel.json',
  'robots.txt','sitemap.xml','migrations.sql','auth-migration.sql','deploy-hook-migration.sql',
  'locations-amenities-migration.sql','faq-categories-migration.sql','stats-brands-migration.sql',
  'brand-slider-settings-migration.sql','packages-migration.sql','reviews-migration.sql'
];
const COPY_HTML_AS_IS = [
  'admin.html','panduan.html','promo.html','syarat.html','privasi.html','tentang.html',
  'glosarium.html','sewa-vs-beli.html','404.html','login.html'
  // faq, lokasi, sriwijaya, cisaranten get prerendered separately
];
const COPY_DIRS = ['panduan','area','layanan','vs'];

// ============================================================================
// HELPERS
// ============================================================================
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Normalize image URL — auto-convert Google Drive viewer URLs ke direct image URL.
function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return url || '';
  url = url.trim();
  const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=[^&]+&)?id=|thumbnail\?id=)([A-Za-z0-9_-]{20,})/);
  if (m && m[1]) return `https://lh3.googleusercontent.com/d/${m[1]}=w2000`;
  return url;
}
const fmtRp = (n) => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

const BRANDS = {
  sony: 'Sony', canon: 'Canon', fujifilm: 'Fujifilm', fujinon: 'Fujinon',
  nikon: 'Nikon', dji: 'DJI', godox: 'Godox', aputure: 'Aputure',
  yongnuo: 'Yongnuo', sigma: 'Sigma', tamron: 'Tamron', hollyland: 'Hollyland',
  saramonic: 'Saramonic', tilta: 'Tilta', zhiyun: 'Zhiyun', gopro: 'GoPro',
  insta360: 'Insta360', viltrox: 'Viltrox', blackmagic: 'Blackmagic',
  feelworld: 'Feelworld', feiyu: 'Feiyu', rode: 'Rode', boya: 'Boya',
  manfrotto: 'Manfrotto', nanlite: 'Nanlite', ulanzi: 'Ulanzi',
  smallrig: 'SmallRig', kingma: 'Kingma', mavic: 'DJI', phantom: 'DJI',
  osmo: 'DJI', ronin: 'DJI', lark: 'Hollyland', amaran: 'Aputure'
};
function detectBrand(name) {
  const n = (name || '').toLowerCase();
  let best = null;
  for (const k in BRANDS) if (n.includes(k) && (!best || k.length > best.length)) best = k;
  return best ? BRANDS[best] : null;
}

const CAT_ICON = { KAMERA: '📷', LENSA: '🔭', LIGHTING: '💡', 'VIDEO SUPPORT': '🎥', 'AUDIO SUPPORT': '🎙', LAINNYA: '🔧' };
const getIcon = (c) => CAT_ICON[(c || '').toUpperCase()] || '📦';

function cleanModel(name) {
  return String(name || '')
    .replace(/\s*\(\s*tidak\s+dipakai\s*\)\s*/gi, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s*[-|]\s*(CSR|SRW|HQ|AL|ZN)\s*\d*\s*$/gi, '')
    .replace(/\s+/g, ' ').trim();
}

// ============================================================================
// SUPABASE FETCH
// ============================================================================
async function sbFetch(creds, table, query = '') {
  const r = await fetch(`${creds.url}/rest/v1/${table}?${query}`, {
    headers: { apikey: creds.key, Authorization: `Bearer ${creds.key}`, Accept: 'application/json' }
  });
  if (!r.ok) throw new Error(`${table}: HTTP ${r.status} — ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function tryFetch(creds, table, query, fallback = []) {
  try { return await sbFetch(creds, table, query); }
  catch (e) { console.warn(`⚠ ${table} failed: ${e.message}`); return fallback; }
}

// ============================================================================
// HTML INJECTORS — replace content between marker comments
// ============================================================================
function injectAt(html, marker, replacement) {
  const re = new RegExp(`<!-- PRERENDER:${marker}:START -->[\\s\\S]*?<!-- PRERENDER:${marker}:END -->`);
  if (!re.test(html)) return html;
  return html.replace(re, `<!-- PRERENDER:${marker}:START -->${replacement}<!-- PRERENDER:${marker}:END -->`);
}

function injectIntoElement(html, id, innerHtml) {
  // Replace innerHTML of <div|section|main id="X">...</div> dengan balanced
  // tag matching (handle nested elements). Lazy regex would corrupt jika ada
  // child element dengan tag yang sama.
  const openRe = new RegExp(`<(div|section|main)[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  const m = html.match(openRe);
  if (!m) return html;
  const tag = m[1].toLowerCase();
  const start = m.index + m[0].length;
  const openTok = new RegExp(`<${tag}\\b`, 'gi');
  const closeTok = new RegExp(`</${tag}\\s*>`, 'gi');
  // Walk forward, count opens vs closes, find matching close
  openTok.lastIndex = start;
  closeTok.lastIndex = start;
  let depth = 1;
  let pos = start;
  while (depth > 0) {
    openTok.lastIndex = pos;
    closeTok.lastIndex = pos;
    const o = openTok.exec(html);
    const c = closeTok.exec(html);
    if (!c) return html; // malformed
    if (o && o.index < c.index) {
      depth++;
      pos = o.index + o[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(0, start) + innerHtml + html.slice(c.index);
      }
      pos = c.index + c[0].length;
    }
  }
  return html;
}

function setMeta(html, attrName, attrVal, content) {
  const re = new RegExp(`(<meta[^>]*${attrName}=["']${attrVal}["'][^>]*content=["'])[^"']*(["'])`);
  if (re.test(html)) return html.replace(re, `$1${escHtml(content)}$2`);
  // try inverted attribute order
  const re2 = new RegExp(`(<meta[^>]*content=["'])[^"']*(["'][^>]*${attrName}=["']${attrVal}["'])`);
  return html.replace(re2, `$1${escHtml(content)}$2`);
}
function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escHtml(title)}</title>`);
}

function injectBeforeClose(html, tag, content) {
  return html.replace(new RegExp(`</${tag}>`), `${content}\n</${tag}>`);
}

// ============================================================================
// RENDERERS
// ============================================================================
function renderProductCard(p, enrich) {
  const e = enrich || {};
  const harga = p.harga_sewa_per_hari || 0;
  const nama = p.nama_produk || '-';
  const kat = p.kategori_produk || '';
  const stok = (p.stok_total || 0) - (p.stok_dalam_perbaikan || 0);
  const avail = stok > 0;
  const imgUrl = e.image_url || '';
  const specs = e.specs || '';
  const specArr = specs ? specs.split('·').map((s) => s.trim()).filter(Boolean).slice(0, 3) : [];
  const kel = e.includes || p.kelengkapan || '';
  const kelShort = kel.length > 80 ? kel.substring(0, 80) + '...' : kel;
  const slug = slugify(nama);
  const catDisplay = kat ? kat.charAt(0) + kat.slice(1).toLowerCase() : '';
  const brand = detectBrand(nama) || (kat ? catDisplay : 'Gear');
  const cartPayload = JSON.stringify({ id: p.id, slug, name: nama, kategori: kat, harga, image: imgUrl }).replace(/"/g, '&quot;');

  const imgHtml = imgUrl
    ? `<img src="${escHtml(imgUrl)}" alt="${escHtml(nama)}" loading="lazy">`
    : `<div class="prod-ph"><div class="prod-ph-ico">${getIcon(kat)}</div><div class="prod-ph-brand">${escHtml(brand)}</div><div class="prod-ph-model">${escHtml(cleanModel(nama))}</div></div>`;

  const specsHtml = specArr.length ? `<div class="prod-specs">${specArr.map((s) => `<span class="prod-spec">${escHtml(s)}</span>`).join('')}</div>` : '';
  const kelHtml = kelShort ? `<div class="prod-includes">${escHtml(kelShort)}</div>` : '';

  return `<a href="/product/${slug}" class="prod-card" itemscope itemtype="https://schema.org/Product">
    <meta itemprop="name" content="${escHtml(nama)}">
    <meta itemprop="category" content="${escHtml(kat)}">
    <div class="prod-img-wrap">${imgHtml}
      <div class="prod-badge-wrap"><span class="prod-badge prod-badge-cat">${escHtml(catDisplay)}</span></div>
      <div class="prod-avail"><div class="avail-dot ${avail ? 'on' : 'off'}"></div><span>${avail ? 'Tersedia' : 'Habis'}</span></div>
    </div>
    <div class="prod-body">
      <div class="prod-cat-tag">${escHtml(kat)}</div>
      <div class="prod-name" itemprop="name">${escHtml(nama)}</div>
      ${specsHtml}${kelHtml}
      <div class="prod-footer">
        <div class="prod-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
          <meta itemprop="priceCurrency" content="IDR"><meta itemprop="price" content="${harga}">
          <meta itemprop="availability" content="${avail ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'}">
          ${fmtRp(harga)} <small>/ hari</small>
        </div>
        <div class="prod-actions">
          <button class="btn-cart" title="Tambah ke daftar inquiry" onclick="event.stopPropagation();event.preventDefault();quickAddCart(this,${cartPayload})">+</button>
          <button class="btn-rent" onclick="event.stopPropagation();event.preventDefault();window.open('${BOOKING_URL}','_blank')">Booking →</button>
        </div>
      </div>
    </div></a>`;
}

function renderFaqItem(f, idx) {
  return `<div class="faq-item${idx === 0 ? ' open' : ''}" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
    <div class="faq-q" onclick="this.closest('.faq-item').classList.toggle('open')">
      <span itemprop="name">${escHtml(f.question)}</span>
      <div class="faq-q-icon">+</div>
    </div>
    <div class="faq-a" itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
      <div class="faq-a-inner" itemprop="text">${f.answer || ''}</div>
    </div>
  </div>`;
}

function renderLocationCard(loc, idx) {
  const tagPrefix = loc.tagline || `Lokasi ${idx + 1}`;
  const days = loc.days_label || 'Senin – Minggu';
  const open = loc.open_time || '09.00';
  const close = loc.close_time || '20.00';
  const amenities = Array.isArray(loc.amenities) && loc.amenities.length
    ? loc.amenities
    : [
        { icon: '🛵', text: 'Tersedia antar via ojek online' },
        { icon: '🅿', text: 'Parkir tersedia' },
      ];
  const amenitiesHtml = amenities
    .map((a) => `      <div class="loc-row"><div class="loc-ico">${escHtml(a.icon || '·')}</div>${escHtml(a.text || '')}</div>`)
    .join('\n');
  return `<div class="loc-card" itemscope itemtype="https://schema.org/LocalBusiness">
    <span class="loc-tag">${escHtml(tagPrefix)}</span>
    <div class="loc-name" itemprop="name">${escHtml(loc.branch_name)}</div>
    <div class="loc-addr" itemprop="address" itemscope itemtype="https://schema.org/PostalAddress">
      <span itemprop="streetAddress">${formatMultiline(loc.address || '')}</span>
    </div>
    <div class="loc-rows">
      <div class="loc-row"><div class="loc-ico">🕘</div>${escHtml(days)} · ${escHtml(open)} – ${escHtml(close)} WIB</div>
${amenitiesHtml}
    </div>
    <div class="loc-acts">
      <a href="${escHtml(loc.whatsapp_url || '#')}"><button class="btn btn-wa" style="width:100%">WhatsApp</button></a>
      <a href="${escHtml(loc.maps_url || '#')}" target="_blank" rel="noopener"><button class="btn btn-maps" style="width:100%">Google Maps</button></a>
    </div>
  </div>`;
}

// Render multi-line text safely: escape HTML, lalu allow user-typed
// <br>, newlines, atau koma sebagai pemisah baris.
function formatMultiline(s) {
  return escHtml(s)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/\r?\n/g, '<br>');
}

// ============================================================================
// PAGE PRERENDERERS
// ============================================================================
async function prerenderIndex(html, { produk, enrichMap, faqs, locations, settings }) {
  // 1. Featured products: top 6 from enriched featured set, or top by price
  const featuredEnriched = Object.values(enrichMap).filter((e) => e.is_featured).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const featuredIds = new Set(featuredEnriched.map((e) => e.booking_product_id));
  let featured = produk.filter((p) => featuredIds.has(p.id));
  if (featured.length < 6) {
    const extras = produk.filter((p) => !featuredIds.has(p.id)).sort((a, b) => (b.harga_sewa_per_hari || 0) - (a.harga_sewa_per_hari || 0));
    featured = [...featured, ...extras].slice(0, 6);
  } else {
    featured = featured.slice(0, 6);
  }
  const productsHtml = featured.map((p) => renderProductCard(p, enrichMap[p.id])).join('') || '<div class="prod-empty">Belum ada produk featured.</div>';
  html = injectIntoElement(html, 'prod-grid', productsHtml);

  // 2. FAQ — top 6 active
  if (faqs.length) {
    const faqHtml = faqs.slice(0, 6).map((f, i) => renderFaqItem(f, i)).join('');
    html = injectIntoElement(html, 'faq-grid', faqHtml);
  }

  // 3. Locations
  if (locations.length) {
    const locHtml = locations.map((l, i) => renderLocationCard(l, i)).join('');
    html = injectIntoElement(html, 'loc-grid', locHtml);
  }

  // 4. Site settings overrides
  if (settings) {
    // 4a. Stats grid
    if (Array.isArray(settings.stats) && settings.stats.length) {
      const statsHtml = settings.stats
        .filter((s) => s && (s.number || s.label))
        .map((s) => {
          const num = escHtml(s.number || '');
          const suf = s.suffix ? `<span class="acc">${escHtml(s.suffix)}</span>` : '';
          const lbl = escHtml(s.label || '');
          return `      <div class="stat-blk"><div class="stat-num">${num}${suf}</div><div class="stat-lbl">${lbl}</div></div>`;
        })
        .join('\n');
      if (statsHtml) html = injectIntoElement(html, 'stats-grid', statsHtml);
    }

    // 4b. Brand slider — convert ticker text → logo strip
    if (Array.isArray(settings.brands) && settings.brands.length) {
      const brands = settings.brands.filter((b) => b && b.name);
      if (brands.length) {
        // Duplicate untuk seamless loop animation
        const renderItem = (b) => {
          const logo = b.logo_url ? normalizeImageUrl(b.logo_url) : '';
          if (logo) {
            return `<div class="ticker-item brand-only"><img class="brand-logo" src="${escHtml(logo)}" alt="${escHtml(b.name)}" loading="lazy" onerror="this.outerHTML='<span style=&quot;font-size:12px;font-weight:600;color:var(--ink-3)&quot;>${escHtml(b.name)}</span>'"></div>`;
          }
          return `<div class="ticker-item"><span class="tick-dot"></span>${escHtml(b.name)}</div>`;
        };
        const tickerHtml = brands.map(renderItem).join('') + brands.map(renderItem).join('');
        html = injectIntoElement(html, 'ticker-inner', tickerHtml);
      }
    }

    // 4c. Brand slider visual settings — inject inline CSS overrides
    {
      const h    = parseInt(settings.brand_logo_height)    || 32;
      const maxw = parseInt(settings.brand_logo_max_width) || 120;
      const gap  = parseInt(settings.brand_gap)            || 56;
      const dur  = parseInt(settings.brand_anim_duration)  || 38;
      const op   = parseFloat(settings.brand_logo_opacity) || 0.78;
      const grayscale = settings.brand_logo_style !== 'color';
      const filterRule = grayscale
        ? `filter:grayscale(100%) brightness(.45);opacity:${op}`
        : `filter:none;opacity:${op}`;
      const overrideCss = `<style id="brand-slider-overrides">
.ticker-inner{animation-duration:${dur}s}
.ticker-item{padding:0 ${Math.round(gap / 2)}px}
.ticker-item.brand-only{padding:0 ${Math.round(gap / 2)}px}
.ticker-item img.brand-logo{height:${h}px;max-width:${maxw}px;${filterRule}}
.ticker-item:hover img.brand-logo{filter:none;opacity:1}
</style>`;
      html = injectBeforeClose(html, 'head', overrideCss);
    }

    // 4d. Reviews / testimonials (compact, no photo)
    if (Array.isArray(settings.reviews) && settings.reviews.length) {
      const accentBg = (a) => {
        switch (a) {
          case 'orange':     return 'linear-gradient(135deg,#F06824,#D55A1A)';
          case 'green':      return 'linear-gradient(135deg,#8EC64E,#4F7B39)';
          case 'silver':     return 'linear-gradient(135deg,#a8b5b5,#6b7676)';
          case 'green-deep': default: return 'linear-gradient(135deg,#4F7B39,#2d4a23)';
        }
      };
      const initials = (name) => String(name || '').trim().split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
      const reviewCards = settings.reviews
        .filter((r) => r && (r.name || r.text))
        .map((r) => {
          const stars = '★'.repeat(Math.max(0, Math.min(5, r.rating || 5)));
          const date = r.date ? `${escHtml(r.date)} · ${escHtml(r.source || 'Google Review')}` : escHtml(r.source || 'Google Review');
          return `<article class="rev-card">
          <div class="rev-stars" aria-label="${r.rating || 5} dari 5 bintang">${stars}</div>
          <p class="rev-txt">"${escHtml(r.text || '')}"</p>
          <div class="rev-author">
            <div class="rev-ava" style="background:${accentBg(r.accent)}" aria-hidden="true">${escHtml(initials(r.name))}</div>
            <div class="rev-meta-wrap">
              <div class="rev-name">${escHtml(r.name || '')}</div>
              <div class="rev-src">${date}</div>
            </div>
          </div>
        </article>`;
        }).join('');
      const googleUrl = settings.reviews_google_url || 'https://maps.google.com/?q=7SUMMITS+CAMERA+Bandung';
      const ctaHtml = `<a href="${escHtml(googleUrl)}" target="_blank" rel="noopener" class="rev-more">
          <span>Lihat semua review di Google Maps →</span>
        </a>`;
      html = injectIntoElement(html, 'reviews-container', reviewCards + '\n        ' + ctaHtml);

      // Review schema (aggregateRating + Review array) for SEO
      const ratings = settings.reviews.map((r) => r.rating || 5);
      const avg = ratings.length ? (ratings.reduce((s, n) => s + n, 0) / ratings.length).toFixed(1) : '5';
      const reviewLd = {
        '@context': 'https://schema.org',
        '@type': 'LocalBusiness',
        '@id': `${SITE_URL}#business`,
        name: '7summits Camera Bandung',
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: avg,
          reviewCount: ratings.length,
          bestRating: '5',
          worstRating: '1',
        },
        review: settings.reviews.slice(0, 10).map((r) => ({
          '@type': 'Review',
          author: { '@type': 'Person', name: r.name || 'Anonymous' },
          reviewRating: { '@type': 'Rating', ratingValue: r.rating || 5, bestRating: '5' },
          reviewBody: r.text || '',
          datePublished: r.date || '',
        })),
      };
      html = injectBeforeClose(html, 'head', `<script type="application/ld+json">${JSON.stringify(reviewLd)}</script>`);
    }

    if (settings.hero_image_url) {
      html = html.replace(
        /url\('https:\/\/images\.unsplash\.com\/[^']+'\)/,
        `url('${normalizeImageUrl(settings.hero_image_url)}')`
      );
    }
    if (settings.hero_headline) {
      const parts = settings.hero_headline.split(/\s*\|\s*/);
      const heroH1 = parts.length > 1 ? `${escHtml(parts[0])}<br><em>${escHtml(parts.slice(1).join(' '))}</em>` : escHtml(settings.hero_headline);
      html = html.replace(/(<h1 class="hero-h1">)[\s\S]*?(<\/h1>)/, `$1${heroH1}$2`);
    }
    if (settings.hero_subheadline) {
      html = html.replace(/(<p class="hero-sub">)[\s\S]*?(<\/p>)/, `$1${escHtml(settings.hero_subheadline)}$2`);
    }
  }

  // 5. ItemList JSON-LD with featured products
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: featured.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/product/${slugify(p.nama_produk)}`,
      name: p.nama_produk
    }))
  };
  html = injectBeforeClose(html, 'head', `<script type="application/ld+json">${JSON.stringify(itemListLd)}</script>`);

  return html;
}

async function prerenderKatalog(html, { produk, enrichMap }) {
  // Pre-render the first page (24 cards by default sort = featured + price desc)
  // matching what JS would render for `?page=1` with no filter.
  // Client-side JS detects pre-rendered grid and skips initial fetch render.
  const sorted = [...produk].sort((a, b) => {
    const fa = enrichMap[a.id]?.is_featured ? 1 : 0;
    const fb = enrichMap[b.id]?.is_featured ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return (b.harga_sewa_per_hari || 0) - (a.harga_sewa_per_hari || 0);
  });
  const firstPage = sorted.slice(0, 24);
  const cardsHtml = firstPage.map((p) => renderKatalogCard(p, enrichMap[p.id])).join('');
  html = injectIntoElement(html, 'kat-grid', cardsHtml);
  // Update count display
  html = html.replace(/(<strong id="kat-count">)[^<]*(<\/strong>)/, `$1${produk.length.toLocaleString('id-ID')}$2`);

  // CollectionPage / ItemList schema
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Katalog Sewa Kamera Bandung — 7summits Camera',
    description: `${produk.length} unit gear sewa profesional di Bandung — Sony, Canon, DJI, Godox, dan lainnya.`,
    url: `${SITE_URL}/katalog`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: sorted.length,
      itemListElement: sorted.slice(0, 50).map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/product/${slugify(p.nama_produk)}`,
        name: p.nama_produk
      }))
    }
  };
  html = injectBeforeClose(html, 'head', `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);

  return html;
}

function renderKatalogCard(p, enrich) {
  const e = enrich || {};
  const stok = (p.stok_total || 0) - (p.stok_dalam_perbaikan || 0);
  const avail = stok > 0;
  const slug = slugify(p.nama_produk);
  const img = e.image_url || '';
  const brand = detectBrand(p.nama_produk) || 'Gear';
  const harga = p.harga_sewa_per_hari || 0;
  const harga3 = harga * 2;
  const cartPayload = JSON.stringify({ id: p.id, slug, name: p.nama_produk, kategori: p.kategori_produk, harga, image: img }).replace(/"/g, '&quot;');
  const imgHtml = img
    ? `<img src="${escHtml(img)}" alt="${escHtml(p.nama_produk)}" loading="lazy">`
    : `<div class="kcard-img-ph"><div class="kcard-img-ph-ico">${getIcon(p.kategori_produk)}</div><div>${escHtml(brand)}</div></div>`;
  return `<a href="/product/${slug}" class="kcard" itemscope itemtype="https://schema.org/Product">
    <meta itemprop="name" content="${escHtml(p.nama_produk)}">
    <meta itemprop="category" content="${escHtml(p.kategori_produk || '')}">
    <div class="kcard-img">${imgHtml}
      ${e.is_featured ? '<div class="kcard-feat">⭐ Featured</div>' : ''}
      ${!avail ? '<div class="kcard-out">Stok habis</div>' : ''}
      <div class="kcard-actions">
        <button class="kcard-icon" title="Tambah ke daftar inquiry" onclick="event.stopPropagation();event.preventDefault();katAddCart(this,${cartPayload})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="kcard-icon" title="Lihat detail" onclick="event.stopPropagation();event.preventDefault();location.href='/product/${slug}'">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
    </div>
    <div class="kcard-body">
      <div class="kcard-cat">${escHtml(p.kategori_produk || '')}</div>
      <div class="kcard-name">${escHtml(p.nama_produk)}</div>
      <div class="kcard-price" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <meta itemprop="priceCurrency" content="IDR"><meta itemprop="price" content="${harga}">
        <meta itemprop="availability" content="${avail ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock'}">
        ${fmtRp(harga)} <small>/ hari</small>
      </div>
      <div class="kcard-price-3d"><strong>${fmtRp(harga3)}</strong> / 3 hari</div>
    </div>
  </a>`;
}

// Category labels untuk public FAQ page tabs.
// Slug → display label. Order = order tampil sebagai tabs.
const FAQ_CATEGORIES = [
  { slug: 'harga',  label: 'Harga & Paket' },
  { slug: 'lokasi', label: 'Lokasi & Operasional' },
  { slug: 'syarat', label: 'Syarat & Ketentuan' },
  { slug: 'produk', label: 'Produk & Gear' },
  { slug: 'proses', label: 'Proses Booking' },
  { slug: 'umum',   label: 'Umum' },
];

async function prerenderFaqPage(html, faqs) {
  if (!faqs.length) return html;

  // Group FAQs by category (active only)
  const active = faqs.filter((f) => f.is_active !== false);
  const byCat = {};
  active.forEach((f) => {
    const c = f.category || 'umum';
    (byCat[c] = byCat[c] || []).push(f);
  });

  // Sort each category by sort_order
  Object.keys(byCat).forEach((c) => {
    byCat[c].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  });

  // Build category tabs — only show categories that have active FAQs
  const visibleCats = FAQ_CATEGORIES.filter((cat) => (byCat[cat.slug] || []).length > 0);
  const tabsHtml = [
    `<button class="faq-cat-btn active" onclick="filterFaq('all',this)">Semua</button>`,
    ...visibleCats.map((cat) =>
      `<button class="faq-cat-btn" onclick="filterFaq('${cat.slug}',this)">${escHtml(cat.label)}</button>`
    ),
  ].join('\n      ');
  html = injectIntoElement(html, 'faq-cats', tabsHtml);

  // Build groups
  const groupsHtml = visibleCats.map((cat) => {
    const items = byCat[cat.slug] || [];
    const itemsHtml = items
      .map((f) =>
        `        <div class="faq-item"><div class="faq-q" onclick="toggleFaq(this)">${escHtml(f.question)}<div class="faq-q-icon">+</div></div><div class="faq-a"><div class="faq-a-inner">${f.answer || ''}</div></div></div>`
      )
      .join('\n');
    return `    <div class="faq-group" data-cat="${escHtml(cat.slug)}">
      <div class="faq-group-title">${escHtml(cat.label)}</div>
      <div class="faq-list">
${itemsHtml}
      </div>
    </div>`;
  }).join('\n');
  html = injectIntoElement(html, 'faq-groups', groupsHtml);

  // FAQPage JSON-LD
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: active.map((f) => ({
      '@type': 'Question',
      name: f.question,
      acceptedAnswer: { '@type': 'Answer', text: (f.answer || '').replace(/<[^>]+>/g, '') },
    })),
  };
  return injectBeforeClose(html, 'head', `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`);
}

function renderLocationBigCard(loc, idx) {
  const tagPrefix = loc.tagline || `Lokasi ${idx + 1}`;
  const days = loc.days_label || 'Senin – Minggu';
  const open = loc.open_time || '09.00';
  const close = loc.close_time || '20.00';
  const amenities = Array.isArray(loc.amenities) && loc.amenities.length
    ? loc.amenities
    : [
        { icon: '🛵', text: 'Tersedia antar via ojek online' },
        { icon: '🅿', text: 'Parkir tersedia' },
      ];
  const amenitiesHtml = amenities
    .map((a) => `        <div class="loc-row"><div class="loc-ico">${escHtml(a.icon || '·')}</div>${escHtml(a.text || '')}</div>`)
    .join('\n');
  const slug = loc.slug || '';
  const detailLink = slug ? `<a href="/lokasi/${escHtml(slug)}.html" class="btn-detail">Detail →</a>` : '';
  return `<div class="loc-big-card">
      <div class="loc-big-header">
        <span class="loc-tag">${escHtml(tagPrefix)}</span>
        <div class="loc-big-name">${escHtml(loc.branch_name || '')}</div>
        <div class="loc-big-addr">${formatMultiline(loc.address || '')}</div>
        <div class="loc-rows">
          <div class="loc-row"><div class="loc-ico">🕘</div>${escHtml(days)} · ${escHtml(open)} – ${escHtml(close)} WIB</div>
${amenitiesHtml}
        </div>
      </div>
      <div class="loc-big-footer">
        <a href="${escHtml(loc.whatsapp_url || '#')}" class="btn-wa">WhatsApp</a>
        <a href="${escHtml(loc.maps_url || '#')}" target="_blank" rel="noopener" class="btn-maps">Maps</a>
        ${detailLink}
      </div>
    </div>`;
}

async function prerenderPaketPage(html, packages) {
  if (!packages.length) return html;
  const active = packages.filter((p) => p.is_active !== false);
  // Group by category preserving original order from data
  const byCat = new Map();
  active.forEach((p) => {
    const slug = p.category || 'other';
    if (!byCat.has(slug)) byCat.set(slug, { slug, label: p.category_label || slug, items: [] });
    byCat.get(slug).items.push(p);
  });
  // Sort items within each category by sort_order
  byCat.forEach((cat) => cat.items.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

  const cats = [...byCat.values()];
  const tabsHtml = [
    `<button class="pkg-tab active" onclick="switchPkg('all',this)">Semua Paket</button>`,
    ...cats.map((c) => `<button class="pkg-tab" onclick="switchPkg('${escHtml(c.slug)}',this)">${escHtml(c.label)}</button>`),
  ].join('\n      ');
  html = injectIntoElement(html, 'pkg-tabs', tabsHtml);

  const sectionsHtml = cats.map((cat) => {
    const cardsHtml = cat.items.map((p, i) => {
      const isFeat = i === 0 && cat.items.length > 1;
      const itemsLi = (p.items || []).map((it) => `<li>${escHtml(it)}</li>`).join('');
      const taglineHtml = p.description ? `<div class="pkg-tagline">${escHtml(p.description)}</div>` : '';
      const popBadge = isFeat ? '<div class="pkg-pop">Paling Populer</div>' : '';
      const btnClass = isFeat ? 'btn-pkg feat' : 'btn-pkg';
      const cardClass = isFeat ? 'pkg-card featured' : 'pkg-card';
      const waMsg = encodeURIComponent(`Halo, saya mau tanya tentang ${p.name} (Rp ${Number(p.price).toLocaleString('id-ID')}/hari)`);
      return `<div class="${cardClass}">
          ${popBadge}
          <div class="pkg-name">${escHtml(p.name)}</div>
          ${taglineHtml}
          <ul class="pkg-items">${itemsLi}</ul>
          <div class="pkg-price">Rp ${Number(p.price).toLocaleString('id-ID')} <small>/ hari</small></div>
          <a href="https://wa.me/6281121114410?text=${waMsg}"><button class="${btnClass}">Booking Paket Ini →</button></a>
        </div>`;
    }).join('\n');
    return `<div class="pkg-section" data-cat="${escHtml(cat.slug)}">
      <div class="sec-lbl">${escHtml(cat.label)}</div>
      <h2 class="sec-h2" style="font-size:clamp(20px,2.5vw,32px);margin-bottom:32px">Paket ${escHtml(cat.label)}</h2>
      <div class="pkg-grid">${cardsHtml}</div>
    </div>`;
  }).join('\n');
  html = injectIntoElement(html, 'pkg-sections', sectionsHtml);

  // ItemList schema for SEO
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Paket Sewa Kamera 7summits',
    numberOfItems: active.length,
    itemListElement: active.map((p, i) => ({
      '@type': 'Product',
      position: i + 1,
      name: p.name,
      description: p.description || `${p.category_label} bundling — ${(p.items || []).length} item`,
      offers: {
        '@type': 'Offer',
        price: p.price,
        priceCurrency: 'IDR',
        priceSpecification: { '@type': 'UnitPriceSpecification', price: p.price, priceCurrency: 'IDR', unitText: 'per hari' },
        availability: 'https://schema.org/InStock',
      },
    })),
  };
  html = injectBeforeClose(html, 'head', `<script type="application/ld+json">${JSON.stringify(ld)}</script>`);
  return html;
}

async function prerenderLokasiPage(html, locations) {
  if (!locations.length) return html;
  // Inject LocalBusiness array schema
  const businessLd = locations.map((l) => ({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: l.branch_name,
    image: `${SITE_URL}/logo-7summits-mark.png`,
    address: { '@type': 'PostalAddress', streetAddress: l.address || '', addressLocality: 'Bandung', addressRegion: 'Jawa Barat', addressCountry: 'ID' },
    telephone: l.phone || '+6281121114410',
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], opens: l.open_time || '09:00', closes: l.close_time || '20:00' }],
    priceRange: 'Rp75.000 - Rp1.000.000'
  }));
  html = injectBeforeClose(html, 'head', businessLd.map((ld) => `<script type="application/ld+json">${JSON.stringify(ld)}</script>`).join('\n'));
  // Replace loc-overview-grid with dynamic cards
  const cardsHtml = locations.map((l, i) => renderLocationBigCard(l, i)).join('\n');
  html = injectIntoElement(html, 'loc-overview-grid', cardsHtml);
  return html;
}

// Category-aware product FAQ generator. Picks 6-7 questions most relevant to
// the gear category, plus universal rental questions. Each answer is concise
// and AEO-optimized (direct, includes price, location, brand where useful).
function buildProductFaqs({ cleaned, kat, harga, brand, name, cabang, available }) {
  const k = (kat || '').toUpperCase();
  const lower = (name || '').toLowerCase();
  const harga3 = harga * 2;
  const fmt = (n) => Number(n || 0).toLocaleString('id-ID');
  const brandStr = brand ? brand : (cleaned.split(' ')[0] || 'gear');

  // Universal questions — appear on every PDP
  const universal = [
    { q: `Berapa harga sewa ${cleaned} di Bandung?`, a: `Sewa ${cleaned} di <strong>7summits Camera Bandung</strong> adalah <strong>Rp ${fmt(harga)}/hari</strong>. Dengan promo 3 hari bayar 2 hari, total 3 hari hanya <strong>Rp ${fmt(harga3)}</strong> — hemat ~33% vs sewa harian biasa.` },
    { q: `Apa saja syarat sewa ${cleaned}?`, a: `Cukup <strong>KTP aktif + KTP penjamin</strong> (kerabat dekat) + foto selfie dengan KTP. Tidak perlu rekening bank, tidak perlu deposit besar. Untuk gear premium di atas Rp 500rb/hari, deposit menyesuaikan harga unit.` },
    { q: `Bisakah ${cleaned} diantar ke lokasi shoot?`, a: `Bisa. Tersedia antar-jemput via ojek online di area Bandung Kota (ongkos sesuai jarak). Pickup mandiri di lokasi <strong>Cisaranten</strong> atau <strong>Sriwijaya</strong> gratis. Hubungi WhatsApp untuk koordinasi antar.` },
    { q: `Bagaimana cara booking ${cleaned}?`, a: `Tiga cara: (1) Booking online di <a href="https://booking.sewakamerabandung.id">booking.sewakamerabandung.id</a> — pilih tanggal, langsung konfirm. (2) Tambah ke <strong>Daftar Inquiry</strong> dan submit via WhatsApp untuk konsultasi dulu. (3) Walk-in ke lokasi (jam buka 09:00–20:00 WIB, 7 hari/minggu). Tim respon < 30 menit di jam kerja.` }
  ];

  // Category-specific questions
  const byCategory = {
    KAMERA: [
      { q: `Apakah ${cleaned} tersedia hari ini?`, a: available ? `Saat ini ${cleaned} <strong>tersedia</strong> dan siap booking. Tetap cek tanggal di sistem booking untuk memastikan availability di periode shoot kamu.` : `Stok ${cleaned} sedang penuh saat ini. Tetap cek tanggal lain di sistem booking, atau chat admin untuk rekomendasi alternatif sejenis.` },
      { q: `Apakah ${cleaned} bisa shooting video 4K?`, a: /a7s|a7iv|fx3|fx30|r5|r6|r7|x-?h\d|x-?t4|s5/i.test(name) ? `Ya, ${cleaned} mendukung 4K (mayoritas hingga 4K 60p atau lebih, beberapa model sampai 120p slow-motion). Cek detail di section Spesifikasi di atas.` : (lower.includes('4k') || /a6\d|x-?[ts]\d|m50|r10|r50|z6|z7/i.test(name) ? `Ya, ${cleaned} mendukung perekaman 4K. Cek detail framerate dan codec di section Spesifikasi.` : `${cleaned} mendukung perekaman video sesuai spesifikasi pabrik. Cek section Spesifikasi di atas untuk resolusi & framerate maksimum.`) },
      { q: `Termasuk lensa atau body only?`, a: `Default: <strong>body only</strong> + baterai + charger + memory card slot ready. Lensa disewa terpisah agar kamu bisa pilih sesuai project (24-70mm, 50mm prime, 70-200mm tele, dll). Lihat <a href="/katalog?cat=LENSA">katalog lensa kompatibel</a>.` },
      { q: `Bagaimana kalau gear rusak saat dipinjam?`, a: `Kerusakan ringan akibat penggunaan normal di-cover. Untuk accidental damage (jatuh, tetes air ringan), tersedia <strong>Damage Waiver Protection</strong> Rp 50rb/transaksi yang cover kerusakan hingga Rp 5jt. Detail di section "Damage Waiver" di homepage.` }
    ],
    LENSA: [
      { q: `Apakah lensa ${cleaned} kompatibel dengan body Sony?`, a: /for sony|fe |e-mount/i.test(name) ? `Ya — lensa ini mount Sony E (Full-Frame / APS-C). Kompatibel dengan Sony A7 series, FX3/FX30, A6400, A7CII, dst. Cek detail mount di Spesifikasi.` : (/canon|ef-?m|rf/i.test(name) ? `Tidak, ini mount Canon. Tapi kami juga menyediakan lensa Sony E-mount terpisah — lihat <a href="/katalog?cat=LENSA&brand=Sony">katalog lensa Sony</a>.` : `Cek mount lensa di section Spesifikasi. Tim juga bantu rekomendasi via WhatsApp kalau kamu sebut body kamera yang dipakai.`) },
      { q: `Termasuk lens cap, hood, dan filter?`, a: `<strong>Standar termasuk</strong>: lens cap (depan & belakang) + lens hood (bawaan pabrik). UV/ND filter disediakan terpisah sebagai add-on, tinggal request saat booking.` },
      { q: `Apakah lensa ini ada image stabilization?`, a: lower.includes('oss') || lower.includes('vr') || lower.includes('is ') || lower.includes('os ') ? `Ya, lensa ini punya optical stabilization built-in — sangat membantu untuk handheld + low-light + telephoto.` : `Cek detail "Stabilization" di section Spesifikasi. Untuk gerak cinematic + footage smooth, kombinasikan dengan <a href="/katalog?cat=VIDEO%20SUPPORT">gimbal stabilizer</a>.` }
    ],
    LIGHTING: [
      { q: `Apakah ${cleaned} bisa dipakai untuk video?`, a: lower.includes('led') || lower.includes('continuous') ? `Ya — ${cleaned} adalah continuous light (LED), cocok untuk video. CRI tinggi, output stabil, tidak ada flicker di shutter speed standar video.` : (lower.includes('flash') || lower.includes('strobe') || lower.includes('tt') || lower.includes('ad6') ? `Tidak — ${cleaned} adalah strobe/flash, untuk fotografi (single-burst). Untuk video kamu butuh continuous LED — lihat <a href="/katalog?cat=LIGHTING">opsi LED</a>.` : `Cek tipe lighting di section Spesifikasi. Continuous = video friendly, Strobe/Flash = foto saja.`) },
      { q: `Termasuk light stand & softbox?`, a: `Stand + softbox disewa terpisah biar kamu bisa kombinasikan sesuai project. Tim sering paketkan saat booking — chat WhatsApp untuk request "${cleaned} + stand + softbox" dengan harga bundle.` },
      { q: `Apakah perlu power outlet AC?`, a: lower.includes('battery') || lower.includes('v-mount') || /\bvb\b|\bb700\b/i.test(name) ? `${cleaned} bisa pakai battery (V-mount / built-in) untuk shoot outdoor. Tetap bawa power supply AC sebagai backup untuk shoot panjang.` : `Mayoritas continuous LED butuh AC outlet. Untuk shoot outdoor, kami sediakan <a href="/katalog?cat=VIDEO%20SUPPORT">V-mount battery + adapter</a>.` }
    ],
    'VIDEO SUPPORT': [
      { q: `${cleaned} support kamera apa saja?`, a: lower.includes('gimbal') || lower.includes('crane') || lower.includes('weebill') || lower.includes('ronin') || lower.includes('rs') ? `Cek max payload di Spesifikasi. Sebagian besar gimbal modern support mirrorless full-frame + lensa standar (Sony A7, Canon R6, FX3 dengan lensa < 2kg). Untuk setup berat (rig + matte box), pakai gimbal pro RS4 Pro.` : (lower.includes('tripod') ? `Tripod ini support hampir semua kamera DSLR/mirrorless. Cek max load capacity di Spesifikasi untuk memastikan stabilitas dengan setup kamu.` : `Cek payload/compatibility di section Spesifikasi. Tim bisa rekomendasikan setup spesifik via WhatsApp.`) },
      { q: `Berapa lama battery life ${cleaned}?`, a: lower.includes('gimbal') || lower.includes('crane') || lower.includes('rs ') ? `Mayoritas gimbal modern: 8-12 jam continuous use. Cek detail battery life per model di Spesifikasi.` : `Cek detail di Spesifikasi. Tim sertakan baterai cadangan untuk sewa > 1 hari.` },
      { q: `Termasuk handle, plate, atau accessories?`, a: `Default termasuk komponen utama (gimbal/tripod/rig + handle bawaan + plate kamera standar). Mounting accessories tambahan (focus motor, expansion arm, top handle) disewa terpisah — tinggal request saat booking.` }
    ],
    'AUDIO SUPPORT': [
      { q: `${cleaned} kompatibel dengan kamera mana?`, a: /lark|wireless|w-?\d|blink/i.test(name) ? `Wireless mic ini connect via 3.5mm TRS — kompatibel dengan semua kamera yang punya mic-in (Sony, Canon, Fuji, Nikon, smartphone via adapter). Untuk XLR (cinema camera) butuh adapter terpisah.` : (/shotgun|ntg/i.test(name) ? `Shotgun mic mount di hot-shoe kamera, output 3.5mm TRS. Kompatibel dengan mayoritas mirrorless/DSLR yang punya mic input.` : `Output 3.5mm TRS standar — kompatibel dengan semua kamera mirrorless/DSLR yang punya mic input. Untuk smartphone butuh adapter TRRS.`) },
      { q: `Berapa lama battery wireless ${cleaned}?`, a: /lark m1|blink/i.test(name) ? `~7-8 jam per charge.` : (/lark m2/i.test(name) ? `~10 jam per charge, hingga 30 jam dengan charging case.` : `Cek detail battery life di Spesifikasi. Sertakan charging cable, dan tim biasa kasih cadangan untuk shoot panjang.`) },
      { q: `Boleh dipakai untuk live event / wedding?`, a: `Cocok banget — wireless mic ini banyak dipakai untuk wedding, podcast, vlogging, live event di Bandung. Range 100-300m line-of-sight, low-latency, audio 24-bit. Cek tipe & range exact di Spesifikasi.` }
    ],
    LAINNYA: [
      { q: `Apa saja yang termasuk dalam sewa ${cleaned}?`, a: `Cek section "Yang termasuk dalam sewa" di atas — list lengkap kelengkapan sudah disertakan. Kalau ada item spesifik yang kamu butuhkan tapi belum tertera, chat WhatsApp untuk konfirmasi.` },
      { q: `Bisakah ${cleaned} dipaketkan dengan gear lain?`, a: `Bisa banget. Kami punya <a href="/#bundles">paket bundling</a> untuk kebutuhan umum (Wedding, Vlogger, Sineas, Wisuda) atau custom — tinggal chat admin via WhatsApp untuk diskusi setup yang pas.` }
    ]
  };

  const cat = byCategory[k] || byCategory.LAINNYA;
  // Combine: first 2 universal + 2-3 category + remaining universal
  const combined = [
    universal[0],            // price
    universal[1],            // syarat
    ...cat.slice(0, 3),      // category-specific
    universal[2],            // antar-jemput
    universal[3]             // booking
  ];
  return combined;
}

async function prerenderPdp(template, p, enrich, allProduk, enrichMap) {
  const e = enrich || {};
  const nama = p.nama_produk;
  const kat = p.kategori_produk || '';
  const harga = p.harga_sewa_per_hari || 0;
  const stok = (p.stok_total || 0) - (p.stok_dalam_perbaikan || 0);
  const avail = stok > 0;
  const imgUrl = e.image_url || '';
  const allImages = [e.image_url, e.image_url_2, e.image_url_3, e.image_url_4, e.image_url_5, e.image_url_6].filter(Boolean);
  const desc = e.description || `Sewa ${cleanModel(nama)} di Bandung di 7summits Camera. Harga sewa Rp ${Number(harga).toLocaleString('id-ID')}/hari. Promo 3 hari bayar 2 hari. Lokasi: ${p.cabang_id || 'Bandung'}.`;
  const slug = slugify(nama);
  const cabang = p.cabang_id || '-';
  const brand = detectBrand(nama);
  const cleaned = cleanModel(nama);

  // Build the static product content (matches the runtime renderProduct shape, simpler)
  const kelArr = (e.includes || p.kelengkapan || '').split(/[,;·]+/).map((s) => s.trim()).filter(Boolean);
  const kelHtml = kelArr.length
    ? kelArr.map((k) => `<div class="kel-item"><div class="kel-check">✓</div><div class="kel-name">${escHtml(k)}</div></div>`).join('')
    : '<div style="grid-column:1/-1;text-align:center;color:var(--ink-4);padding:40px;font-size:13px">Kelengkapan standar — hubungi tim untuk daftar lengkap.</div>';

  const heroImgHtml = imgUrl
    ? `<img src="${escHtml(imgUrl)}" alt="${escHtml(nama)}" loading="eager">`
    : `<div class="prod-ph"><div class="prod-ph-ico">${getIcon(kat)}</div><div class="prod-ph-brand">${escHtml(brand || 'Gear')}</div><div class="prod-ph-model">${escHtml(cleaned)}</div></div>`;

  const thumbs = allImages.length
    ? allImages.map((src, i) => `<div class="hero-thumb${i === 0 ? ' active' : ''}" onclick="pdpSwapImg('${escHtml(src)}',this)"><img src="${escHtml(src)}" alt="thumb ${i + 1}" loading="lazy"></div>`).join('')
    : `<div class="hero-thumb active"><div class="hero-thumb-empty">—</div></div>`;

  // Related (same category, exclude self, top 8)
  const related = allProduk.filter((x) => x.id !== p.id && x.kategori_produk === kat).slice(0, 8);
  const relatedHtml = related.length
    ? related.map((r) => {
        const rE = enrichMap[r.id] || {};
        const rImg = rE.image_url || '';
        const rSlug = slugify(r.nama_produk);
        return `<a href="/product/${rSlug}" class="rel-card">
          <div class="rel-img">${rImg ? `<img src="${escHtml(rImg)}" alt="${escHtml(r.nama_produk)}" loading="lazy">` : '<div class="prod-ph"><div class="prod-ph-ico">' + getIcon(r.kategori_produk) + '</div></div>'}</div>
          <div class="rel-body">
            <div class="rel-cat">${escHtml(r.kategori_produk || '')}</div>
            <div class="rel-name">${escHtml(cleanModel(r.nama_produk))}</div>
            <div class="rel-price">${fmtRp(r.harga_sewa_per_hari)} <small>/ hari</small></div>
          </div></a>`;
      }).join('')
    : '<div style="grid-column:1/-1;color:var(--ink-4);text-align:center;padding:30px">Tidak ada produk serupa.</div>';

  // Category-aware FAQ — picks 6-7 most relevant Q&A per product
  const productFaqs = buildProductFaqs({ cleaned, kat, harga, brand, name: nama, cabang, available: avail });
  const faqHtml = productFaqs.map((f) => `<div class="faq-item" onclick="this.closest('.faq-item').classList.toggle('open')">
    <div class="faq-q">${escHtml(f.q)}<div class="faq-q-icon">+</div></div>
    <div class="faq-a"><div class="faq-a-inner">${f.a}</div></div>
  </div>`).join('');

  const productHtml = `<section class="hero-grid">
    <div class="hero-gallery">
      <div class="hero-img-main" id="pdp-main-img">${heroImgHtml}</div>
      <div class="hero-thumbs">${thumbs}</div>
    </div>
    <div class="hero-info">
      <div class="hero-info-cat">${getIcon(kat)} ${escHtml(kat)}</div>
      <h1 class="hero-info-name">${escHtml(cleaned)}</h1>
      <p class="hero-info-tagline">${escHtml(desc)}</p>
      <div class="hero-stats">
        <div class="hero-stat"><div class="hero-stat-lbl">Status</div><div class="hero-stat-val ${avail ? 'green' : 'orange'}">${avail ? '● Tersedia' : '● Stok Habis'}</div></div>
        <div class="hero-stat"><div class="hero-stat-lbl">Stok</div><div class="hero-stat-val">${Math.max(0, stok)} unit</div></div>
        <div class="hero-stat"><div class="hero-stat-lbl">Lokasi</div><div class="hero-stat-val" style="text-transform:capitalize">${escHtml(cabang)}</div></div>
      </div>
      <div class="hero-price-block">
        <div class="hero-price-row">
          <div class="hero-price">${fmtRp(harga)} <small>/ hari</small></div>
          <div class="hero-price-disc">3 hari = bayar 2 hari</div>
        </div>
        <div class="hero-promo">💡 <strong>Hemat 33%</strong> untuk sewa 3+ hari berturut. Berlaku semua produk tanpa minimum order.</div>
      </div>
      <div class="hero-cta-row">
        <button id="cta-add" class="hero-cta-add" onclick="addThisToCart()">＋ Tambah ke Daftar Inquiry</button>
        <a class="hero-cta-book" href="${BOOKING_URL}" target="_blank" rel="noopener">📅 Booking Langsung</a>
      </div>
      <div class="hero-trust">
        <div class="hero-trust-item"><div class="hero-trust-ico">✓</div>Unit ter-quality control</div>
        <div class="hero-trust-item"><div class="hero-trust-ico">✓</div>Antar-jemput area Bandung</div>
        <div class="hero-trust-item"><div class="hero-trust-ico">✓</div>Quick onboarding gear</div>
        <div class="hero-trust-item"><div class="hero-trust-ico">✓</div>Promo 3 bayar 2 aktif</div>
      </div>
    </div>
  </section>
  <section class="pdp-sec" id="kelengkapan">
    <div class="pdp-sec-hdr"><span class="pdp-sec-lbl">Kelengkapan</span><h2 class="pdp-sec-h2">Yang termasuk dalam sewa</h2></div>
    <div class="kel-grid">${kelHtml}</div>
  </section>
  <section class="pdp-sec" id="related">
    <div class="pdp-sec-hdr"><span class="pdp-sec-lbl">Lihat Juga</span><h2 class="pdp-sec-h2">Produk serupa di kategori ${escHtml(kat)}</h2></div>
    <div class="rel-grid">${relatedHtml}</div>
  </section>
  <section class="pdp-sec" id="faq">
    <div class="pdp-sec-hdr"><span class="pdp-sec-lbl">FAQ</span><h2 class="pdp-sec-h2">Pertanyaan yang sering ditanya</h2></div>
    <div class="faq-list">${faqHtml}</div>
  </section>`;

  let html = template;
  html = setTitle(html, `Sewa ${cleaned} di Bandung — Rp ${Number(harga).toLocaleString('id-ID')}/hari · 7summits Camera`);
  html = setMeta(html, 'name', 'description', `Sewa ${cleaned} di 7summits Camera Bandung — Rp ${Number(harga).toLocaleString('id-ID')}/hari. Promo 3 hari bayar 2. ${cleaned} ${avail ? 'tersedia siap booking' : 'stok terbatas'}.`);
  if (imgUrl) {
    if (/<meta property="og:image"/.test(html)) html = setMeta(html, 'property', 'og:image', imgUrl);
    else html = injectBeforeClose(html, 'head', `<meta property="og:image" content="${escHtml(imgUrl)}">`);
  }
  // Inject canonical
  const canonical = `${SITE_URL}/product/${slug}`;
  if (/<link rel="canonical"/.test(html)) html = html.replace(/(<link rel="canonical"[^>]*href=["'])[^"']*(["'])/, `$1${canonical}$2`);
  else html = injectBeforeClose(html, 'head', `<link rel="canonical" href="${canonical}">`);

  // Update breadcrumb
  html = html.replace(/<span id="bcrumb-name">[^<]*<\/span>/, `<span id="bcrumb-name">${escHtml(cleaned)}</span>`);

  // Replace product content
  html = html.replace(/(<div id="product-content"[^>]*>)[\s\S]*?(<\/div>\s*<\/main>)/, `$1${productHtml}</div></main>`);

  // Inject Product JSON-LD
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: cleaned,
    description: desc.substring(0, 500),
    image: imgUrl ? [imgUrl, ...allImages.slice(1)] : undefined,
    category: kat,
    brand: brand ? { '@type': 'Brand', name: brand } : undefined,
    sku: String(p.id),
    offers: {
      '@type': 'Offer',
      priceCurrency: 'IDR',
      price: harga,
      availability: avail ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: canonical,
      seller: { '@type': 'LocalBusiness', name: '7summits Camera Bandung' }
    }
  };
  html = injectBeforeClose(html, 'head', `<script type="application/ld+json">${JSON.stringify(productLd)}</script>`);

  // Inject FAQPage JSON-LD (same Q&A as the rendered FAQ list)
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: productFaqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a.replace(/<[^>]+>/g, '') }
    }))
  };
  html = injectBeforeClose(html, 'head', `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>`);

  // Inject BreadcrumbList JSON-LD
  const crumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Katalog', item: `${SITE_URL}/katalog` },
      { '@type': 'ListItem', position: 3, name: cleaned, item: canonical }
    ]
  };
  html = injectBeforeClose(html, 'head', `<script type="application/ld+json">${JSON.stringify(crumbLd)}</script>`);

  return html;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('▶ 7summits prerender starting...');
  const t0 = Date.now();

  // 1. Wipe + recreate dist
  await fs.rm(OUT, { recursive: true, force: true });
  await fs.mkdir(OUT, { recursive: true });

  // 2. Copy static assets
  for (const f of COPY_FILES) {
    try { await fs.copyFile(path.join(SRC, f), path.join(OUT, f)); }
    catch (e) { console.warn(`⚠ skip copy ${f}: ${e.message}`); }
  }
  for (const f of COPY_HTML_AS_IS) {
    try { await fs.copyFile(path.join(SRC, f), path.join(OUT, f)); }
    catch (e) { console.warn(`⚠ skip copy ${f}: ${e.message}`); }
  }
  for (const d of COPY_DIRS) {
    try { await fs.cp(path.join(SRC, d), path.join(OUT, d), { recursive: true }); }
    catch (e) { console.warn(`⚠ skip copy dir ${d}: ${e.message}`); }
  }

  // 3. Fetch all data in parallel
  console.log('  ↳ fetching Supabase...');
  const [produk, enrichAll, faqs, locations, settingsArr, packages] = await Promise.all([
    tryFetch(BOOKING, 'produk', 'select=id,nama_produk,kategori_produk,harga_sewa_per_hari,kelengkapan,stok_total,stok_dalam_perbaikan,cabang_id&is_deleted=eq.false&status=eq.active&stok_total=gt.0&limit=2000'),
    tryFetch(CMS, 'product_enrichments', 'select=*&limit=2000'),
    tryFetch(CMS, 'faqs', 'select=*&is_active=eq.true&order=sort_order.asc&limit=200'),
    tryFetch(CMS, 'locations', 'select=*&is_active=eq.true&order=sort_order.asc&limit=20'),
    tryFetch(CMS, 'site_settings', 'select=*&id=eq.1&limit=1'),
    tryFetch(CMS, 'packages', 'select=*&is_active=eq.true&order=sort_order.asc&limit=200')
  ]);
  const settings = Array.isArray(settingsArr) && settingsArr[0] ? settingsArr[0] : null;
  const enrichMap = {};
  enrichAll.forEach((e) => { enrichMap[e.booking_product_id] = e; });
  console.log(`  ↳ produk=${produk.length} enrich=${enrichAll.length} faqs=${faqs.length} locations=${locations.length} packages=${packages.length} settings=${settings ? '✓' : '✗'}`);

  // 4. Read templates
  const indexTpl = await fs.readFile(path.join(SRC, 'index.html'), 'utf8');
  const katalogTpl = await fs.readFile(path.join(SRC, 'katalog.html'), 'utf8').catch(() => null);
  const pdpTpl = await fs.readFile(path.join(SRC, 'pdp.html'), 'utf8');
  const faqTpl = await fs.readFile(path.join(SRC, 'faq.html'), 'utf8').catch(() => null);
  const lokasiTpl = await fs.readFile(path.join(SRC, 'lokasi.html'), 'utf8').catch(() => null);
  const paketTpl = await fs.readFile(path.join(SRC, 'paket.html'), 'utf8').catch(() => null);
  const sriwijayaTpl = await fs.readFile(path.join(SRC, 'sriwijaya.html'), 'utf8').catch(() => null);
  const cisarantenTpl = await fs.readFile(path.join(SRC, 'cisaranten.html'), 'utf8').catch(() => null);

  // 5. Pre-render index.html
  const indexHtml = await prerenderIndex(indexTpl, { produk, enrichMap, faqs, locations, settings });
  await fs.writeFile(path.join(OUT, 'index.html'), indexHtml);
  console.log(`  ↳ wrote index.html (${(indexHtml.length / 1024).toFixed(1)} kb)`);

  // 6. Pre-render katalog.html
  if (katalogTpl) {
    const katalogHtml = await prerenderKatalog(katalogTpl, { produk, enrichMap });
    await fs.writeFile(path.join(OUT, 'katalog.html'), katalogHtml);
    console.log(`  ↳ wrote katalog.html (${(katalogHtml.length / 1024).toFixed(1)} kb, ${produk.length} cards)`);
  }

  // 7. Pre-render faq + lokasi pages with schema
  if (faqTpl) {
    const out = await prerenderFaqPage(faqTpl, faqs);
    await fs.writeFile(path.join(OUT, 'faq.html'), out);
    console.log(`  ↳ wrote faq.html with FAQPage schema (${faqs.length} items)`);
  }
  if (lokasiTpl) {
    const out = await prerenderLokasiPage(lokasiTpl, locations);
    await fs.writeFile(path.join(OUT, 'lokasi.html'), out);
    console.log(`  ↳ wrote lokasi.html with LocalBusiness schema`);
  }
  if (paketTpl) {
    const out = await prerenderPaketPage(paketTpl, packages);
    await fs.writeFile(path.join(OUT, 'paket.html'), out);
    console.log(`  ↳ wrote paket.html (${packages.length} packages)`);
  }
  if (sriwijayaTpl) await fs.writeFile(path.join(OUT, 'sriwijaya.html'), await prerenderLokasiPage(sriwijayaTpl, locations.filter((l) => /sriwij/i.test(l.branch_name || ''))));
  if (cisarantenTpl) await fs.writeFile(path.join(OUT, 'cisaranten.html'), await prerenderLokasiPage(cisarantenTpl, locations.filter((l) => /cisar/i.test(l.branch_name || ''))));

  // 8. Pre-render pdp.html template (fallback for products without static file)
  await fs.writeFile(path.join(OUT, 'pdp.html'), pdpTpl);

  // 9. Generate one static file per product (deduplicate by slug)
  await fs.mkdir(path.join(OUT, 'product'), { recursive: true });
  const seenSlugs = new Set();
  let count = 0, dupCount = 0;
  for (const p of produk) {
    const slug = slugify(p.nama_produk);
    if (!slug) continue;
    if (seenSlugs.has(slug)) { dupCount++; continue; }
    seenSlugs.add(slug);
    const html = await prerenderPdp(pdpTpl, p, enrichMap[p.id], produk, enrichMap);
    await fs.writeFile(path.join(OUT, 'product', `${slug}.html`), html);
    count++;
  }
  if (dupCount > 0) console.warn(`  ⚠ skipped ${dupCount} produk dengan slug duplikat`);
  console.log(`  ↳ wrote ${count} product/<slug>.html files (dari ${produk.length} produk aktif)`);

  // 10. Update sitemap.xml with all product URLs (deduplicated)
  try {
    let sitemap = await fs.readFile(path.join(SRC, 'sitemap.xml'), 'utf8');
    const productUrls = [...seenSlugs].map((slug) => `  <url>
    <loc>${SITE_URL}/product/${slug}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');
    sitemap = sitemap.replace('</urlset>', `${productUrls}\n</urlset>`);
    await fs.writeFile(path.join(OUT, 'sitemap.xml'), sitemap);
    console.log(`  ↳ updated sitemap.xml with ${seenSlugs.size} product URLs`);
  } catch (e) { console.warn(`⚠ sitemap update skipped: ${e.message}`); }

  console.log(`✓ Prerender done in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
}

main().catch((e) => {
  console.error('✗ Prerender failed:', e);
  process.exit(1);
});
