import BrandMark from "../ui/BrandMark";
import { BRAND_NAME } from "../brand";

/**
 * Tadris+ P10-B — the owner sign-in page's brand panel (owner request: an illustration like the teacher / student sign-in page,
 * with the app icon, that says what the app and the owner's console are). The same panel classes as the main sign-in page
 * (.auth-brand, login-pro.css), so the two pages read as one product; the illustration is the owner's: a shield with a key and a
 * crown (the protected owner console) at the centre of the six things the owner manages — schools, teachers, classes and
 * students, the library, reports and access — with the step-up code's six dots under it.
 *
 * Decorative only (aria-hidden; the page's accessible text is the heading and the form). Every colour comes from the tokens in
 * owner.css (the classes below), never from attributes, so the dark theme follows; the mask's white stops are luminance, not a
 * colour. Sized by CSS — deliberately no preserveAspectRatio (the bundle guard's signature for lazy learning visuals). It lives in
 * the owner's lazy chunk, so teachers and students never download it.
 */
export default function OwnerLoginHero() {
  return (
    <section className="auth-brand eb-owner-hero" aria-label="لوحة مالك المنصة">
      <div className="auth-brand-top">
        <span className="auth-logo" aria-hidden="true"><BrandMark size={52} /></span>
        <div className="auth-logo-text">
          <bdi dir="ltr">{BRAND_NAME}</bdi>
          <small>مالك المنصة</small>
        </div>
      </div>

      <svg className="eb-owner-art" viewBox="0 0 640 560" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="eb-oa-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="1" />
            <stop offset=".72" stopColor="#fff" stopOpacity=".85" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="eb-oa-mask"><rect width="640" height="560" fill="url(#eb-oa-fade)" /></mask>
          <radialGradient id="eb-oa-glow" className="eb-oa-glow"><stop offset="0" stopOpacity=".55" /><stop offset="1" stopOpacity="0" /></radialGradient>
          <linearGradient id="eb-oa-shield" className="eb-oa-shield-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopOpacity=".22" /><stop offset="1" stopOpacity=".06" />
          </linearGradient>
        </defs>
        <circle cx="320" cy="250" r="260" fill="url(#eb-oa-glow)" />
        <g mask="url(#eb-oa-mask)">
          <g className="eb-oa-orbits" fill="none" strokeOpacity=".1" strokeWidth="1.25">
            <circle cx="320" cy="250" r="120" /><circle cx="320" cy="250" r="200" />
            <circle cx="320" cy="250" r="280" strokeDasharray="3 9" />
          </g>
          <g className="eb-oa-links" fill="none" strokeOpacity=".42" strokeWidth="1.5" strokeLinecap="round">
            <path d="M320 250 L148 132" /><path d="M320 250 L492 132" /><path d="M320 250 L536 300" />
            <path d="M320 250 L104 300" /><path d="M320 250 L222 430" /><path d="M320 250 L418 430" />
            <path d="M148 132 L104 300 M492 132 L536 300 M222 430 L418 430" strokeOpacity=".18" />
          </g>
          <g className="eb-oa-tiles" strokeOpacity=".26">
            <rect x="118" y="102" width="60" height="60" rx="16" />
            <rect x="462" y="102" width="60" height="60" rx="16" />
            <rect x="508" y="272" width="56" height="56" rx="15" />
            <rect x="76" y="272" width="56" height="56" rx="15" />
            <rect x="196" y="404" width="52" height="52" rx="14" />
            <rect x="392" y="404" width="52" height="52" rx="14" />
          </g>
          <g className="eb-oa-glyphs" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {/* schools */}
            <path d="M134 144 V130 L148 120 L162 130 V144 Z M143 144 V135 H153 V144 M130 144 H166" />
            {/* teachers */}
            <circle cx="492" cy="126" r="7" /><path d="M479 146 C479 136 505 136 505 146" />
            {/* classes and students */}
            <circle cx="530" cy="295" r="5.5" /><circle cx="544" cy="297" r="4.5" /><path d="M520 313 C520 304 540 304 540 313 M542 312 C542 306 552 306 552 312" />
            {/* the library */}
            <path d="M104 292 C98 288 92 288 88 289 V311 C92 310 98 310 104 313 Z M104 292 C110 288 116 288 120 289 V311 C116 310 110 310 104 313 Z" />
          </g>
          <g className="eb-oa-solid">
            {/* reports */}
            <rect x="210" y="430" width="6" height="11" rx="1.5" /><rect x="219" y="422" width="6" height="19" rx="1.5" /><rect x="228" y="426" width="6" height="15" rx="1.5" />
            {/* access switches */}
            <rect x="405" y="420" width="26" height="9" rx="4.5" fillOpacity=".35" /><circle cx="426.5" cy="424.5" r="3.6" />
            <rect x="405" y="433" width="26" height="9" rx="4.5" fillOpacity=".35" /><circle cx="409.5" cy="437.5" r="3.6" />
          </g>
          {/* the owner's console: a shield with a key, a crown over it */}
          <circle className="eb-oa-halo" cx="320" cy="250" r="92" fillOpacity=".06" />
          <circle className="eb-oa-core" cx="320" cy="254" r="70" />
          <path className="eb-oa-shield" d="M320 178 L378 200 V252 C378 290 352 316 320 330 C288 316 262 290 262 252 V200 Z" fill="url(#eb-oa-shield)" strokeOpacity=".55" strokeWidth="2" />
          <g className="eb-oa-glyphs" fill="none" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="320" cy="238" r="15" /><path d="M320 253 V290 M320 270 H332 M320 282 H329" />
          </g>
          <path className="eb-oa-crown" d="M300 172 L304 152 L314 163 L320 146 L326 163 L336 152 L340 172 Z" strokeWidth="2" strokeLinejoin="round" />
          {/* the step-up code */}
          <g className="eb-oa-code">
            <circle cx="290" cy="356" r="3.2" /><circle cx="302" cy="356" r="3.2" /><circle cx="314" cy="356" r="3.2" />
            <circle cx="326" cy="356" r="3.2" fillOpacity=".5" /><circle cx="338" cy="356" r="3.2" fillOpacity=".5" /><circle cx="350" cy="356" r="3.2" fillOpacity=".5" />
          </g>
          <g className="eb-oa-stars" fillOpacity=".6">
            <circle cx="60" cy="70" r="2" /><circle cx="586" cy="60" r="2" /><circle cx="604" cy="214" r="1.6" />
            <circle cx="40" cy="200" r="1.6" /><circle cx="250" cy="70" r="1.6" /><circle cx="400" cy="56" r="2" />
          </g>
        </g>
      </svg>

      <div className="auth-hero">
        <p className="auth-kicker">لوحة المالك · الحوكمة · الأمان</p>
        <h2>كل المنصة تحت إدارتك من مكان واحد</h2>
        <p className="auth-lead">المعلمون وصلاحياتهم، المدارس والصفوف، المكتبة والتقارير — بدخول محميّ برمز التحقق.</p>
      </div>
    </section>
  );
}
