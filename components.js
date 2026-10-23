// 7summits Camera — Shared Components
// Include in each page: <script src="/components.js"></script>
// Then in body: <div id="navbar-placeholder"></div> and <div id="footer-placeholder"></div>

const BRAND = {
  bookingUrl: 'https://app.7summitscamera.com',
  waNumber: '6281121114410',
  instagram: 'https://instagram.com/sewakamerabandung.id',
  youtube: 'https://www.youtube.com/@7summitscamera',
};

function injectNavbar() {
  const el = document.getElementById('navbar-placeholder');
  if (!el) return;
  el.outerHTML = `
<a href="#main" class="skip-link">Lompat ke konten utama</a>
<div class="ann-bar" role="region" aria-label="Promo aktif">
  Promo aktif: sewa 3 hari bayar 2 hari — berlaku semua produk
  <a href="${BRAND.bookingUrl}" target="_blank" rel="noopener">Booking sekarang →</a>
</div>
<nav id="navbar" aria-label="Navigasi utama">
  <div class="nav-inner">
    <a href="/" class="nav-logo" aria-label="7summits Camera — Beranda"><img src="/logo-7summits.png" alt="7summits Camera"></a>
    <ul class="nav-links">
      <li><a href="/katalog.html">Katalog</a></li>
      <li><a href="/paket.html">Paket</a></li>
      <li><a href="/panduan.html">Panduan</a></li>
      <li><a href="/faq.html">FAQ</a></li>
      <li><a href="/lokasi.html">Lokasi</a></li>
      <li><a href="/tentang.html">Tentang</a></li>
    </ul>
    <div class="nav-acts">
      <a href="https://wa.me/${BRAND.waNumber}" aria-label="Chat via WhatsApp"><button class="btn-g">WhatsApp</button></a>
      <a href="${BRAND.bookingUrl}" target="_blank" rel="noopener" aria-label="Buka sistem booking"><button class="btn-p">Booking →</button></a>
    </div>
  </div>
</nav>`;
  window.addEventListener('scroll', () => {
    document.getElementById('navbar')?.classList.toggle('scrolled', window.scrollY > 20);
  });
  const path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav-links a').forEach(a => {
    const href = a.getAttribute('href').replace(/\.html$/, '').replace(/\/$/, '') || '/';
    if (href === path) {
      a.setAttribute('aria-current', 'page');
      a.classList.add('is-active');
    }
  });
}

function injectFooter() {
  const el = document.getElementById('footer-placeholder');
  if (!el) return;
  el.outerHTML = `
<footer role="contentinfo">
  <div class="cont">
    <div class="footer-grid">
      <div>
        <img src="/logo-7summits.png" alt="7summits Camera" class="footer-logo">
        <p class="footer-desc">Platform sewa gear produksi visual profesional di Bandung. Partner kreatif untuk filmmaker, fotografer, dan content creator.</p>
        <div class="footer-socs" role="list" aria-label="Sosial media">
          <a href="${BRAND.instagram}" target="_blank" rel="noopener" class="footer-soc" aria-label="Instagram 7summits Camera"><span aria-hidden="true">📸</span></a>
          <a href="${BRAND.youtube}" target="_blank" rel="noopener" class="footer-soc" aria-label="YouTube 7summits Camera"><span aria-hidden="true">▶</span></a>
          <a href="https://wa.me/${BRAND.waNumber}" class="footer-soc" aria-label="Chat WhatsApp"><span aria-hidden="true">💬</span></a>
        </div>
      </div>
      <div class="fcol"><h4>Gear</h4><ul>
        <li><a href="/katalog.html?cat=KAMERA">Kamera</a></li>
        <li><a href="/katalog.html?cat=LENSA">Lensa</a></li>
        <li><a href="/katalog.html?cat=LIGHTING">Lighting</a></li>
        <li><a href="/katalog.html?cat=VIDEO%20SUPPORT">Video Support</a></li>
        <li><a href="/katalog.html?cat=AUDIO%20SUPPORT">Audio</a></li>
      </ul></div>
      <div class="fcol"><h4>Layanan</h4><ul>
        <li><a href="/layanan/wedding">Sewa Kamera Wedding</a></li>
        <li><a href="/layanan/wisuda">Paket Wisuda Mahasiswa</a></li>
        <li><a href="/layanan/content-creator">Content Creator Setup</a></li>
        <li><a href="/layanan/sineas">Sineas Indie / TA Film</a></li>
        <li><a href="/paket.html">Semua Paket</a></li>
      </ul></div>
      <div class="fcol"><h4>Platform</h4><ul>
        <li><a href="${BRAND.bookingUrl}" target="_blank" rel="noopener">Sistem Booking</a></li>
        <li><a href="/panduan.html">Panduan Gear</a></li>
        <li><a href="/faq.html">FAQ Lengkap</a></li>
        <li><a href="/promo.html">Promo Aktif</a></li>
      </ul></div>
      <div class="fcol"><h4>Area Layanan</h4><ul>
        <li><a href="/area/dago">Sewa Kamera Dago</a></li>
        <li><a href="/area/setiabudi">Sewa Kamera Setiabudi</a></li>
        <li><a href="/area/lembang">Sewa Kamera Lembang</a></li>
        <li><a href="/area/cihampelas">Sewa Kamera Cihampelas</a></li>
        <li><a href="/area/pasteur">Sewa Kamera Pasteur</a></li>
        <li><a href="/area/buah-batu">Buah Batu (Tel-U)</a></li>
        <li><a href="/area/dipatiukur">Dipatiukur (Unpad)</a></li>
        <li><a href="/area/cikutra">Cikutra (UPI)</a></li>
        <li><a href="/area/cibiru">Cibiru (UIN)</a></li>
        <li><a href="/area/kopo">Kopo (Bdg Selatan)</a></li>
      </ul></div>
      <div class="fcol"><h4>Perusahaan</h4><ul>
        <li><a href="/tentang.html">Tentang Kami</a></li>
        <li><a href="/cisaranten.html">Cisaranten</a></li>
        <li><a href="/sriwijaya.html">Sriwijaya</a></li>
        <li><a href="/syarat.html">Syarat & Ketentuan</a></li>
      </ul></div>
    </div>
    <div class="footer-btm">
      <p>© 2025 7summits Camera · 7summitscamera.com · Bandung, Jawa Barat</p>
      <div class="fbr">
        <a href="/syarat.html">Syarat & Ketentuan</a>
        <a href="/privasi.html">Privasi</a>
      </div>
    </div>
  </div>
</footer>`;
}

function setupSkipLink() {
  const link = document.querySelector('.skip-link');
  if (!link) return;
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById('main')
      || document.querySelector('main, article, header.area-hero, header.art-hero, header.page-hero, body > section');
    if (target) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: false });
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  injectNavbar();
  injectFooter();
  setupSkipLink();
});
