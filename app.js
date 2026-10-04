/* رابط Google Apps Script المنشور لاستقبال طلبات النموذج. */
const CONFIG = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbxxBGHE4mZ5iDdplvvaFxVhrHoOMETyRoafgk8iG-DGx9vhY27JgFhc3VHFBO22hu4x0w/exec',
  snapPixelId: '233915bf-25f6-4119-9362-701fe3212185',
  product: 'Multi Collagen Peptides',
  sku: 'MULTI-COLLAGEN',
  offers: [
    { label: 'باقة العناية الأساسية — عبوة واحدة، 30 يوم', price: 194 },
    { label: 'باقة التوفير المميّز — عبوتان، 60 يوم', price: 285 },
    { label: 'باقة التوفير القصوى — 3 عبوات، 90 يوم', price: 359 }
  ]
};

// Analytics must never prevent a customer from completing an order.
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
  if (!CONFIG.snapPixelId || CONFIG.snapPixelId === 'YOUR_PIXEL_ID') return;
  try {
    (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');
    window.snaptr('init', CONFIG.snapPixelId);
    trackEvent('PAGE_VIEW', {item_ids:[CONFIG.sku]});
  } catch (_) {}
})();

const orderForm = document.getElementById('order-form');
let checkoutTracked = false;
let orderSubmitting = false;
let orderSubmitted = false;
let pendingOrder = null;

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
    field.setCustomValidity(message);
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
  if (!orderForm.reportValidity()) return;
  if (!selected) {
    status.textContent = 'اختاري الباقة المناسبة ثم أكّدي طلبك.';
    return;
  }
  if (!CONFIG.scriptUrl || CONFIG.scriptUrl.includes('PASTE_GOOGLE')) {
    status.textContent = 'استقبال الطلبات غير متاح مؤقتًا. حاولي لاحقًا.';
    return;
  }

  const details = {
    product: CONFIG.product, name, phone, address,
    offerCode: selected.code, offer: selected.label, price: selected.price,
    country: 'SA', sku: CONFIG.sku, currency: 'SAR',
    pageUrl: window.location.href, source: 'Landing Page'
  };
  const fingerprint = JSON.stringify(details);
  if (!pendingOrder || pendingOrder.fingerprint !== fingerprint) {
    pendingOrder = {
      fingerprint,
      transactionId: 'MC-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10).toUpperCase()
    };
  }
  const payload = {
    ...details, transactionId: pendingOrder.transactionId,
    utm: Object.fromEntries(new URLSearchParams(window.location.search))
  };

  trackStartCheckout();
  orderSubmitting = true;
  const inputs = [...orderForm.querySelectorAll('input')];
  inputs.forEach(input => { input.disabled = true; });
  button.disabled = true;
  button.textContent = 'جارٍ تأكيد طلبك…';
  orderForm.setAttribute('aria-busy', 'true');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(CONFIG.scriptUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {'Content-Type': 'text/plain;charset=utf-8'},
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) throw new Error('http-error');
    const result = await response.json();
    if (!result || result.ok !== true) throw new Error('order-rejected');

    orderSubmitted = true;
    orderForm.innerHTML = '<div class="success" role="status" tabindex="-1"><span aria-hidden="true">✓</span><h2>تم استلام طلبك بنجاح</h2><p>شكرًا لك. سنتواصل معك لتأكيد بيانات الطلب والتوصيل.<br>الدفع عند الاستلام.</p></div>';
    orderForm.querySelector('.success').focus({preventScroll: true});
    trackEvent('PURCHASE', {
      price: selected.price, currency: 'SAR',
      transaction_id: payload.transactionId,
      client_dedup_id: payload.transactionId,
      item_ids: [CONFIG.sku]
    });
  } catch (error) {
    inputs.forEach(input => { input.disabled = false; });
    button.disabled = false;
    button.textContent = 'تأكيد الطلب';
    status.textContent = error.name === 'AbortError'
      ? 'تأخر رد الخدمة ولم نتمكن من تأكيد التسجيل. إذا سبق إرسال الطلب، انتظري اتصال التأكيد قبل تكراره.'
      : error.message === 'order-rejected'
        ? 'لم يُسجّل الطلب. راجعي البيانات ثم حاولي مجددًا.'
        : 'تعذر التأكد من تسجيل الطلب. تحققي من الاتصال؛ إذا سبق إرسال الطلب، تجنّبي تكراره حتى يصلك التأكيد.';
  } finally {
    clearTimeout(timeout);
    orderSubmitting = false;
    orderForm.removeAttribute('aria-busy');
  }
});
