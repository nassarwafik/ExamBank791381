// UX-R0 — approved reference MOCKUP of the platform redesign (docs only; never built or shipped): renders the top bar and sidebar.
const P = {
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  help:'<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5"/><path d="M12 18h.01"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8"/><path d="M10.3 20a1.9 1.9 0 0 0 3.4 0"/>',
  home:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  book:'<path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6.5A2.5 2.5 0 0 0 4 20.5 2.5 2.5 0 0 0 6.5 23H20"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  clip:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  msg:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  chart:'<path d="M3 3v18h18"/><path d="M8 15v-4M12 15V7M16 15v-6"/>',
  pie:'<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.4A9 9 0 0 1 20.6 9H15z"/>',
  game:'<rect x="2.5" y="7" width="19" height="11" rx="4"/><path d="M7 11v3M5.5 12.5h3M15 12h.01M18 13.5h.01"/>',
  bank:'<path d="M3 9 12 4l9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18"/>',
  tool:'<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>',
  upload:'<path d="M12 15V3M7 8l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  review:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  pen:'<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z"/>',
  grip:'<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  check:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  chevL:'<path d="m15 18-6-6 6-6"/>',
  chevD:'<path d="m6 9 6 6 6-6"/>',
  select:'<circle cx="12" cy="12" r="9"/><path d="m8.5 10.5 3.5 3.5 3.5-3.5"/>',
  list:'<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  text:'<path d="M4 7h9M4 12h16M4 17h16M17 4v6M14.5 7h5"/>',
  code:'<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  file:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  alert:'<path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  trend:'<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  down:'<path d="M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  id:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h4M14 14h3"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l2 2M15 8l2 2"/>',
  print:'<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7"/>',
  archive:'<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>',
  filter:'<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  cog:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'
};
const ic = (n, s) => `<svg class="i" viewBox="0 0 24 24"${s ? ` style="width:${s}px;height:${s}px"` : ''}>${P[n] || ''}</svg>`;

window.shell = function shell(active) {
  const a = (id, icon, label, extra = '') => `<a class="${active === id ? 'on' : ''}">${ic(icon)}<span>${label}</span>${extra}</a>`;
  const top = `
  <header class="top">
    <span class="burger">${ic('menu', 22)}</span>
    <span class="brand"><span class="mark">ت</span><bdi dir="ltr">Tadris+</bdi></span>
    <span class="pill">لوحة المعلم</span>
    <div class="search">${ic('search', 19)}<span>ابحث عن طالب أو واجب أو سؤال…</span></div>
    <div class="top-actions">
      <span class="circ">${ic('help', 17)}<span class="dot"></span></span>
      <span class="circ">${ic('bell', 17)}</span>
      <span class="avatar">م.ع</span>
    </div>
  </header>`;
  const side = `
  <aside class="side">
    <div class="ws"><span class="wsicon">${ic('layers', 16)}</span><span>مدرسة النور الثانوية<small>الفصل الأول ٢٠٢٦</small></span></div>
    <nav class="nav">
      ${a('dashboard', 'home', 'لوحة المتابعة')}
      ${a('learning', 'book', 'المواد التعليمية')}
      ${a('students', 'users', 'الصفوف والطلاب')}
      ${a('assignments', 'clip', 'الواجبات', '<span class="badge">٣</span>')}
      ${a('messages', 'msg', 'الرسائل')}
    </nav>
    <div class="nav-sep"></div>
    <nav class="nav">
      ${a('projects', 'folder', 'المشاريع')}
      ${a('reports', 'pie', 'التقارير والإحصائيات')}
      ${a('games', 'game', 'الألعاب التعليمية')}
    </nav>
    <div class="nav-sep"></div>
    <nav class="nav">
      ${a('bank', 'bank', 'بنك الامتحانات')}
      ${a('builder', 'tool', 'باني الامتحان')}
      ${a('import', 'upload', 'استيراد من ملف')}
      ${a('reviews', 'review', 'مراجعات النشر')}
    </nav>
    <div class="spacer"></div>
    <div class="nav-sep"></div>
    <nav class="nav">
      ${a('audit', 'history', 'سجل النشاط')}
      ${a('settings', 'cog', 'الإعدادات')}
    </nav>
  </aside>`;
  document.body.insertAdjacentHTML('afterbegin', top);
  const layout = document.querySelector('.layout');
  layout.insertAdjacentHTML('afterbegin', side);
  document.querySelectorAll('[data-i]').forEach(el => { el.outerHTML = ic(el.dataset.i, el.dataset.s); });
};
