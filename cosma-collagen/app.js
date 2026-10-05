const CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbxxBGHE4mZ5iDdplvvaFxVhrHoOMETyRoafgk8iG-DGx9vhY27JgFhc3VHFBO22hu4x0w/exec',
  snapPixelId: '233915bf-25f6-4119-9362-701fe3212185',
  product: 'Cosma Collagen',
  sku: 'COSMA-COLLAGEN',
  offers: [
    { label: 'باقة البداية — 1 عبوة / 30 حصة', price: 185 },
    { label: 'باقة التوفير — 2 عبوة / 60 حصة', price: 249 },
    { label: 'الباقة الذهبية — 3 عبوات / 90 حصة', price: 290 }
  ]
};

function trackEvent(eventName, data) {
  try {
    if (typeof window.snaptr !== 'function') return false;
    window.snaptr('track', eventName, data);
    return true;
  } catch (_) {
    return false;
  }
}

(function initSnapPixel(){
  if (!CONFIG.snapPixelId) return;
  try {
    (function(e,t,n){
      if(e.snaptr)return;
      var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};
      a.queue=[];
      var r=t.createElement('script');
      r.async=true;
      r.src=n;
      var u=t.getElementsByTagName('script')[0];
      u.parentNode.insertBefore(r,u);
    })(window,document,'https://sc-static.net/scevent.min.js');
    window.snaptr('init', CONFIG.snapPixelId);
    trackEvent('PAGE_VIEW', {item_ids:[CONFIG.sku]});
  } catch (_) {}
})();

const orderForm = document.getElementById('order-form');
let checkoutTracked = false;
let orderSubmitting = false;
let orderSubmitted = false;

const ORDER_GUARD_KEY = 'cosma-collagen:last-submission:v2';
const ORDER_GUARD_TTL = 30 * 60 * 1000;

function selectedOffer(values) {
  const code = Number(values.get('offer'));
  return Number.isInteger(code) && code >= 1 && code <= CONFIG.offers.length
    ? {code, ...CONFIG.offers[code - 1]} : null;
}

function normalizeSaudiPhone(value) {
  let phone = String(value || '').trim()
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[\s()\-\u200e\u200f\u061c]/g, '');
  if (phone.startsWith('+966')) phone = '0' + phone.slice(4);
  else if (phone.startsWith('00966')) phone = '0' + phone.slice(5);
  else if (phone.startsWith('966')) phone = '0' + phone.slice(3);
  else if (/^5\d{8}$/.test(phone)) phone = '0' + phone;
  return /^05\d{8}$/.test(phone) ? phone : null;
}

function normalizeFingerprintText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function makeFingerprint(details) {
  return [
    CONFIG.sku,
    details.phone,
    details.offerCode,
    normalizeFingerprintText(details.name),
    normalizeFingerprintText(details.address)
  ].join('|');
}

function readOrderGuard() {
  try {
    const raw = localStorage.getItem(ORDER_GUARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.fingerprint || !parsed.createdAt) return null;
    if (Date.now() - Number(parsed.createdAt) > ORDER_GUARD_TTL) {
      localStorage.removeItem(ORDER_GUARD_KEY);
      return null;
    }
    return parsed;
  } catch (_) {
    return null;
  }
}

function writeOrderGuard(value) {
  try {
    localStorage.setItem(ORDER_GUARD_KEY, JSON.stringify(value));
  } catch (_) {}
}

function createTransactionId() {
  return 'COSMA-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function renderSuccess() {
  orderSubmitted = true;
  orderForm.innerHTML = '<div class="success" role="status" tabindex="-1"><span>✓</span><h2>تم استلام طلبك</h2><p>شكرًا لك. سنتواصل معك لتأكيد بيانات الطلب.</p></div>';
  orderForm.querySelector('.success')?.focus({preventScroll:true});
}

function trackStartCheckout() {
  if (checkoutTracked || orderSubmitted) return;
  const selected = selectedOffer(new FormData(orderForm));
  if (!selected) return;
  checkoutTracked = trackEvent('START_CHECKOUT', {
    price: selected.price, currency: 'SAR', item_ids: [CONFIG.sku]
  });
}

orderForm.addEventListener('focusin', trackStartCheckout);
orderForm.addEventListener('change', trackStartCheckout);
orderForm.addEventListener('input', event => {
  if (typeof event.target.setCustomValidity === 'function') {
    event.target.setCustomValidity('');
    event.target.removeAttribute('aria-invalid');
  }
});

orderForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (orderSubmitting || orderSubmitted) return;

  const status = document.getElementById('form-message');
  const button = orderForm.querySelector('.submit');
  const values = new FormData(orderForm);
  const selected = selectedOffer(values);
  const name = String(values.get('name') || '').trim();
  const address = String(values.get('address') || '').trim();
  const phone = normalizeSaudiPhone(values.get('phone'));
  status.textContent = '';

  const problems = [
    ['name', name.length < 2 ? 'أدخلي الاسم الكامل.' : ''],
    ['phone', !phone ? 'أدخلي رقم جوال سعودي صحيحًا، مثل 05xxxxxxxx.' : ''],
    ['address', !address ? 'أدخلي المدينة والحي والعنوان.' : '']
  ];
  for (const [fieldName, message] of problems) {
    const field = orderForm.elements.namedItem(fieldName);
    if (!field || typeof field.setCustomValidity !== 'function') continue;
    field.setCustomValidity(message);
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
  if (!orderForm.reportValidity()) return;
  if (!selected) {
    status.textContent = 'اختاري الباقة المناسبة ثم أكّدي طلبك.';
    return;
  }
  if (navigator.onLine === false) {
    status.textContent = 'لا يوجد اتصال بالإنترنت الآن. تحققي من الاتصال ثم أعيدي المحاولة.';
    return;
  }

  const details = {
    product: CONFIG.product, name, phone, address,
    offerCode: selected.code, offer: selected.label, price: selected.price,
    country: 'SA', sku: CONFIG.sku, currency: 'SAR',
    pageUrl: window.location.href, source: 'Cosma Collagen Landing Page'
  };
  const fingerprint = makeFingerprint(details);
  const previous = readOrderGuard();

  // Persistent idempotency guard: the same customer/order cannot be sent twice
  // from this browser during the protection window, even after refresh/reload.
  if (previous && previous.fingerprint === fingerprint) {
    renderSuccess();
    status?.remove();
    return;
  }

  const transactionId = createTransactionId();
  const guard = {
    fingerprint,
    transactionId,
    createdAt: Date.now(),
    state: 'sending'
  };
  writeOrderGuard(guard);

  const payload = {
    ...details,
    transactionId,
    clientOrderId: transactionId,
    utm: Object.fromEntries(new URLSearchParams(window.location.search))
  };

  trackStartCheckout();
  orderSubmitting = true;
  const inputs = [...orderForm.querySelectorAll('input')];
  inputs.forEach(input => { input.disabled = true; });
  button.disabled = true;
  button.textContent = 'جارٍ تأكيد طلبك…';
  orderForm.setAttribute('aria-busy', 'true');

  try {
    // Apps Script web apps can save the POST successfully while their redirected
    // response is unreadable by CORS. no-cors avoids showing a false failure that
    // makes customers press submit again and create a duplicate order.
    await fetch(CONFIG.scriptUrl, {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    });

    writeOrderGuard({...guard, state: 'sent', sentAt: Date.now()});
    renderSuccess();
    trackEvent('PURCHASE', {
      price: selected.price,
      currency: 'SAR',
      transaction_id: transactionId,
      client_dedup_id: transactionId,
      item_ids: [CONFIG.sku]
    });
  } catch (_) {
    // Do not clear the guard here. A POST may already have reached Apps Script
    // even if the browser loses the response. Blocking an immediate retry prevents
    // a second row for the same customer/order.
    writeOrderGuard({...guard, state: 'uncertain', failedAt: Date.now()});
    inputs.forEach(input => { input.disabled = false; });
    button.disabled = true;
    button.textContent = 'تم إرسال محاولة الطلب';
    status.textContent = 'قد يكون طلبك وصل بالفعل. لمنع تكرار الطلب، لا تعيدي الإرسال الآن. سنتواصل معك إذا تم استلامه.';
  } finally {
    orderSubmitting = false;
    orderForm.removeAttribute('aria-busy');
  }
});

const stickyOrderButton = document.querySelector('.sticky-order');
const orderSection = document.getElementById('order');

if (stickyOrderButton && orderSection) {
  let dismissed = false;
  const hideSticky = () => {
    if (dismissed) return;
    dismissed = true;
    stickyOrderButton.classList.add('is-hidden');
  };
  const checkCheckout = () => {
    if (dismissed) return;
    const rect = orderSection.getBoundingClientRect();
    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (rect.top <= vh * .88) hideSticky();
  };
  stickyOrderButton.addEventListener('click', event => {
    event.preventDefault();
    hideSticky();
    orderSection.scrollIntoView({behavior:'smooth',block:'start'});
  });
  orderSection.addEventListener('focusin', hideSticky);
  orderSection.addEventListener('pointerdown', hideSticky, {passive:true});
  window.addEventListener('scroll', checkCheckout, {passive:true});
  window.addEventListener('resize', checkCheckout, {passive:true});
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', checkCheckout, {passive:true});
    window.visualViewport.addEventListener('scroll', checkCheckout, {passive:true});
  }
  requestAnimationFrame(checkCheckout);
}
