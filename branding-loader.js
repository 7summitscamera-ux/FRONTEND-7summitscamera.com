// 7summits Camera — Branding loader
// Fetches site_settings from Supabase and applies them as CSS custom-properties
// + dynamic font import + logo replacement. Runs on every page that loads it.

// TEMPORARY: domain sewakamerabandung.id berstatus serverHold di PANDI (sejak
// 20 Okt 2026), sehingga app./booking. di domain itu NXDOMAIN. Link lama yang
// masih tersisa (mis. dari site_settings / konten DB) dialihkan ke portal
// customer di app.7summitscamera.com. Hapus blok ini setelah domain pulih.
(function () {
  const OLD_BOOKING_RE = /^(\s*<?\s*)(https?:)?\/\/(app|booking)\.sewakamerabandung\.id/i;
  const NEW_BOOKING = 'https://app.7summitscamera.com';

  function migrate(url) {
    return url.replace(OLD_BOOKING_RE, (_, lead) => lead + NEW_BOOKING);
  }

  function rewriteLinks(root) {
    (root || document).querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href');
      if (OLD_BOOKING_RE.test(href)) a.setAttribute('href', migrate(href));
    });
  }

  // Tombol yang memakai window.open(<link domain lama>) di onclick
  const origOpen = window.open;
  window.open = function (url, ...rest) {
    if (typeof url === 'string' && OLD_BOOKING_RE.test(url)) url = migrate(url);
    return origOpen.call(window, url, ...rest);
  };

  // Jaring pengaman untuk link yang dirender dinamis setelah halaman dimuat
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (a && OLD_BOOKING_RE.test(a.getAttribute('href'))) rewriteLinks(a.parentNode);
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => rewriteLinks());
  } else {
    rewriteLinks();
  }
  new MutationObserver(() => rewriteLinks()).observe(document.documentElement, { childList: true, subtree: true });
})();

(function () {
  const SB_URL = 'https://mchsqiujfhvzbxzdqeeb.supabase.co';
  const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jaHNxaXVqZmh2emJ4emRxZWViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzMTAyMDIsImV4cCI6MjA5Mzg4NjIwMn0.HUIpHZWHfBx_IwyA-ODxgVilK7y5DMt5o2rxfnDYlXM';

  // Normalize image URL — auto-convert Google Drive viewer URLs ke direct image URL.
  function normalizeImageUrl(url) {
    if (!url || typeof url !== 'string') return url || '';
    url = url.trim();
    const m = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=[^&]+&)?id=|thumbnail\?id=)([A-Za-z0-9_-]{20,})/);
    if (m && m[1]) return 'https://lh3.googleusercontent.com/d/' + m[1] + '=w2000';
    return url;
  }

  function initHeroCarousel(heroImg, images, duration, transition) {
    let currentIndex = 0;
    const normalizedImages = images.map(u => normalizeImageUrl(u));

    // Add carousel CSS styles
    if (!document.querySelector('#hero-carousel-styles')) {
      const style = document.createElement('style');
      style.id = 'hero-carousel-styles';
      style.textContent = `
        .hero-img {
          transition: all ${transition === 'fade' ? '1s ease-in-out' : transition === 'slide' ? '1s ease-in-out' : '0.8s cubic-bezier(0.4,0,0.2,1)'} !important;
        }
        .hero-img.carousel-fade { opacity: 1; }
        .hero-img.carousel-fade.next { opacity: 0; }
        .hero-img.carousel-zoom { transform: scale(1); }
        .hero-img.carousel-zoom.next { transform: scale(1.05); }
        .hero-img.carousel-slide { transform: translateX(0); }
        .hero-img.carousel-slide.next { transform: translateX(100%); }
      `;
      document.head.appendChild(style);
    }

    function setImage(index) {
      if (normalizedImages.length === 0) return;
      const url = normalizedImages[index % normalizedImages.length];
      const gradient = `linear-gradient(180deg,rgba(14,18,23,.55) 0%,rgba(14,18,23,.30) 40%,rgba(14,18,23,.85) 100%)`;

      if (transition === 'fade') {
        heroImg.classList.remove('carousel-fade', 'next');
        heroImg.offsetHeight; // Trigger reflow
        heroImg.classList.add('carousel-fade');
        heroImg.style.backgroundImage = `${gradient},url('${url}')`;
      } else if (transition === 'slide') {
        heroImg.classList.remove('carousel-slide', 'next');
        heroImg.offsetHeight; // Trigger reflow
        heroImg.style.backgroundImage = `${gradient},url('${url}')`;
        heroImg.classList.add('carousel-slide');
      } else if (transition === 'zoom') {
        heroImg.classList.remove('carousel-zoom', 'next');
        heroImg.offsetHeight; // Trigger reflow
        heroImg.style.backgroundImage = `${gradient},url('${url}')`;
        heroImg.classList.add('carousel-zoom');
      }
    }

    // Set initial image
    setImage(0);

    // Rotate images
    setInterval(() => {
      currentIndex++;
      setImage(currentIndex);
    }, duration);
  }

  function applySettings(s) {
    if (!s) return;
    const r = document.documentElement.style;
    if (s.brand_orange)     { r.setProperty('--orange', s.brand_orange); }
    if (s.brand_green)      { r.setProperty('--green', s.brand_green); r.setProperty('--green-l', s.brand_green); }
    if (s.brand_green_deep) { r.setProperty('--green-deep', s.brand_green_deep); r.setProperty('--green-d', s.brand_green_deep); }
    if (s.brand_silver)     { r.setProperty('--silver', s.brand_silver); }
    if (s.brand_bg)         { r.setProperty('--bg', s.brand_bg); r.setProperty('--bg0', s.brand_bg); }
    if (s.brand_ink)        { r.setProperty('--ink', s.brand_ink); }

    // Typography
    if (s.font_family) {
      const fontStack = `'${s.font_family}','SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif`;
      r.setProperty('--font-sans', fontStack);
      r.setProperty('--font-display', fontStack);
    }
    if (s.font_family_url && !document.querySelector(`link[href="${s.font_family_url}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = s.font_family_url;
      document.head.appendChild(link);
    }
    if (s.font_size_base) {
      document.body.style.fontSize = s.font_size_base + 'px';
    }
    if (s.headline_letter_spacing) {
      r.setProperty('--headline-tracking', s.headline_letter_spacing);
    }

    // Logos — swap any nav/footer logos
    if (s.logo_url) {
      const u = normalizeImageUrl(s.logo_url);
      document.querySelectorAll('.nav-logo img, .footer-logo, .sb-logo img')
        .forEach(img => { img.src = u; });
    }
    if (s.favicon_url) {
      let f = document.querySelector('link[rel="icon"]');
      if (!f) { f = document.createElement('link'); f.rel = 'icon'; document.head.appendChild(f); }
      f.href = normalizeImageUrl(s.favicon_url);
    }

    // Hero on homepage — with carousel support
    const heroImg = document.querySelector('.hero-img');
    if (heroImg) {
      // Check if carousel is enabled and has images
      if (s.hero_carousel_enabled && Array.isArray(s.hero_carousel_images) && s.hero_carousel_images.length >= 2) {
        initHeroCarousel(heroImg, s.hero_carousel_images, s.hero_carousel_duration || 5000, s.hero_carousel_transition || 'fade');
      } else if (s.hero_image_url) {
        // Fallback to single image
        const u = normalizeImageUrl(s.hero_image_url);
        heroImg.style.backgroundImage = `linear-gradient(180deg,rgba(14,18,23,.55) 0%,rgba(14,18,23,.30) 40%,rgba(14,18,23,.85) 100%),url('${u}')`;
      }
    }
    if (s.hero_headline) {
      const h1 = document.querySelector('.hero-h1');
      if (h1 && h1.dataset.allowOverride !== 'no') {
        const parts = s.hero_headline.split(/\s*\|\s*/);
        h1.innerHTML = parts.length > 1
          ? parts[0] + '<br><em>' + parts.slice(1).join(' ') + '</em>'
          : s.hero_headline;
      }
    }
    if (s.hero_subheadline) {
      const sub = document.querySelector('.hero-sub');
      if (sub) sub.textContent = s.hero_subheadline;
    }
    if (s.hero_cta_primary_text || s.hero_cta_primary_url) {
      const primaryLink = document.querySelector('.hero-ctas a:first-child');
      if (primaryLink) {
        if (s.hero_cta_primary_text) {
          const btn = primaryLink.querySelector('button');
          if (btn && btn.firstChild) btn.firstChild.textContent = s.hero_cta_primary_text + ' ';
        }
        if (s.hero_cta_primary_url) {
          primaryLink.href = s.hero_cta_primary_url;
        }
      }
    }

    if (s.hero_cta_secondary_text || s.hero_cta_secondary_url) {
      const secondaryLink = document.querySelector('.hero-ctas a:last-child');
      if (secondaryLink) {
        if (s.hero_cta_secondary_text) {
          const btn = secondaryLink.querySelector('button');
          if (btn && btn.firstChild) btn.firstChild.textContent = s.hero_cta_secondary_text + ' ';
        }
        if (s.hero_cta_secondary_url) {
          secondaryLink.href = s.hero_cta_secondary_url;
        }
      }
    }

    // Announcement bar
    if (s.ann_bar_text) {
      const ann = document.querySelector('.ann-bar');
      if (ann) {
        const link = (s.ann_bar_link_text && s.ann_bar_link_url)
          ? ` <a href="${s.ann_bar_link_url}">${s.ann_bar_link_text} →</a>` : '';
        ann.innerHTML = s.ann_bar_text + link;
      }
    }

    // YouTube videos override
    if (Array.isArray(s.youtube_videos) && s.youtube_videos.length) {
      const grid = document.querySelector('.yt-grid');
      if (grid) {
        grid.innerHTML = s.youtube_videos.slice(0, 6).map(v => {
          const url = (v && (v.url || v)) || '';
          const id = extractYouTubeId(url);
          if (!id) return '';
          return `<div class="yt-wrap"><iframe src="https://www.youtube.com/embed/${id}" allowfullscreen title="${(v.title||'Video').replace(/"/g,'&quot;')}"></iframe></div>`;
        }).join('');
      }
    }

    // Footer / WhatsApp / Booking URLs
    if (s.whatsapp_number) {
      document.querySelectorAll('a[href*="wa.me/"]').forEach(a => {
        a.href = a.href.replace(/wa\.me\/\d+/, 'wa.me/' + s.whatsapp_number);
      });
    }
    if (s.booking_url) {
      const bookingUrl = s.booking_url.trim();
      // Only apply if it's a valid absolute URL (starts with http://, https://, or //)
      // Abaikan booking_url lama yang masih menunjuk ke domain serverHold
      if (/^(https?:)?\/\//.test(bookingUrl) && !/sewakamerabandung\.id/i.test(bookingUrl)) {
        document.querySelectorAll('a[href*="app.7summitscamera.com"]').forEach(a => {
          a.href = bookingUrl + (a.hash || '');
        });
      }
    }

    // Section header backgrounds
    if (Array.isArray(s.section_headers) && s.section_headers.length) {
      s.section_headers.forEach(config => {
        if (!config.page || !config.image_url) return;
        const selector = getHeaderSelector(config.page);
        if (!selector) return;
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const url = normalizeImageUrl(config.image_url);
          const opacity = config.opacity != null ? config.opacity : 1.0;
          const textColor = config.text_color || '#ffffff';

          if (config.page === 'katalog') {
            // kat-hero: use background-image with linear-gradient
            const gradient = `linear-gradient(180deg,rgba(14,18,23,.55) 0%,rgba(14,18,23,.30) 40%,rgba(14,18,23,.85) 100%)`;
            el.style.setProperty('background-image', `${gradient},url('${url}')`, 'important');
            el.style.setProperty('background-size', 'cover', 'important');
            el.style.setProperty('background-position', 'center', 'important');
          } else if (config.page.includes('section')) {
            // Homepage sections: apply background with proper layering
            el.style.setProperty('background-image', `linear-gradient(180deg,rgba(14,18,23,.4) 0%,rgba(14,18,23,.2) 40%,rgba(14,18,23,.7) 100%),url('${url}')`, 'important');
            el.style.setProperty('background-size', 'cover', 'important');
            el.style.setProperty('background-position', 'center', 'important');
            el.style.setProperty('background-attachment', 'fixed', 'important');
            if (opacity < 1) el.style.setProperty('opacity', opacity.toString(), 'important');
          } else {
            // page-hero: layer background with gradient overlay
            const gradient = `linear-gradient(180deg,rgba(14,18,23,.55) 0%,rgba(14,18,23,.30) 40%,rgba(14,18,23,.85) 100%)`;
            el.style.setProperty('background-image', `${gradient},url('${url}')`, 'important');
            el.style.setProperty('background-size', 'cover', 'important');
            el.style.setProperty('background-position', 'center', 'important');
            if (opacity < 1) el.style.setProperty('opacity', opacity.toString(), 'important');
          }

          // Apply heading and subheading colors separately
          const headingColor = config.heading_color || '#ffffff';
          const subheadingColor = config.subheading_color || '#ffffff';

          // Heading selectors (h1, page title, etc.)
          const headingSelectors = ['.page-h1', '.kat-h1', '.sec-h2', '.bk-h2', 'h1', 'h2'];
          headingSelectors.forEach(sel => {
            el.querySelectorAll(sel).forEach(textEl => {
              textEl.style.setProperty('color', headingColor, 'important');
            });
          });

          // Subheading selectors (description, subtitle, breadcrumb, etc.)
          const subheadingSelectors = ['.page-sub', '.kat-sub', '.sec-lbl', '.bk-p', '.breadcrumb', '.page-hero-cnt > p'];
          subheadingSelectors.forEach(sel => {
            el.querySelectorAll(sel).forEach(textEl => {
              textEl.style.setProperty('color', subheadingColor, 'important');
            });
          });
        });
      });
    }
  }

  function getHeaderSelector(page) {
    const selectors = {
      'katalog': '.kat-hero',
      'paket': '[data-page-section="paket"]',
      'panduan': '[data-page-section="panduan"]',
      'faq': '[data-page-section="faq"]',
      'lokasi': '[data-page-section="lokasi"]',
      'tentang': '[data-page-section="tentang"]',
      'stats': '[data-page-section="stats"]',
      'lokasi_section': '[data-page-section="lokasi_section"]',
      'booking_band': '[data-page-section="booking_band"]'
    };
    return selectors[page];
  }

  function extractYouTubeId(url) {
    if (!url) return '';
    const m = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : '';
  }

  async function load() {
    try {
      const res = await fetch(`${SB_URL}/rest/v1/site_settings?id=eq.1&select=*`, {
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
      });
      if (!res.ok) return;
      const rows = await res.json();
      if (rows && rows[0]) applySettings(rows[0]);
    } catch (e) { /* fail silently — site has sane defaults */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
