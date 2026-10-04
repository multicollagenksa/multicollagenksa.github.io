const CONFIG={
  scriptUrl:'https://script.google.com/macros/s/AKfycbxxBGHE4mZ5iDdplvvaFxVhrHoOMETyRoafgk8iG-DGx9vhY27JgFhc3VHFBO22hu4x0w/exec',
  snapPixelId:'233915bf-25f6-4119-9362-701fe3212185',
  sku:'GLUTA-COLLAGEN-DTX',
  product:'Gluta Collagen DTX+ Mixed Berry',
  offers:[
    {code:1,label:'باقة البداية — 1 عبوة',price:178},
    {code:2,label:'باقة التوفير — 2 عبوة',price:289},
    {code:3,label:'الباقة الذهبية — 3 عبوات',price:359},
    {code:5,label:'باقة الاستمرارية — 5 عبوات',price:499}
  ]
};

function trackEvent(eventName,data){
  try{
    if(typeof window.snaptr!=='function')return false;
    window.snaptr('track',eventName,data);
    return true;
  }catch(_){return false}
}

(function initSnap(){
  if(!CONFIG.snapPixelId)return;
  try{
    (function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script',r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];u.parentNode.insertBefore(r,u)})(window,document,'https://sc-static.net/scevent.min.js');
    window.snaptr('init',CONFIG.snapPixelId);
    trackEvent('PAGE_VIEW',{item_ids:[CONFIG.sku]});
  }catch(_){}
})();

const form=document.getElementById('order-form');
const sticky=document.querySelector('.sticky-order');
let checkoutTracked=false;
let orderSubmitting=false;
let orderSubmitted=false;
let pendingOrder=null;

function selectedOffer(){
  const code=Number(new FormData(form).get('offer'));
  return CONFIG.offers.find(o=>o.code===code);
}
function normalizeSaudiPhone(value){
  let phone=String(value||'').trim()
    .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[\s()\-\u200e\u200f\u061c]/g,'');
  if(phone.startsWith('+966'))phone='0'+phone.slice(4);
  else if(phone.startsWith('00966'))phone='0'+phone.slice(5);
  else if(phone.startsWith('966'))phone='0'+phone.slice(3);
  else if(/^5\d{8}$/.test(phone))phone='0'+phone;
  return /^05\d{8}$/.test(phone)?phone:null;
}
function trackCheckout(){
  if(checkoutTracked||orderSubmitted)return;
  const offer=selectedOffer(); if(!offer)return;
  checkoutTracked=trackEvent('START_CHECKOUT',{price:offer.price,currency:'SAR',item_ids:[CONFIG.sku]});
}
form.addEventListener('focusin',trackCheckout);
form.addEventListener('change',trackCheckout);

function setSticky(){
  if(!sticky)return;
  const r=form.getBoundingClientRect();
  const interacting=document.activeElement&&form.contains(document.activeElement);
  sticky.classList.toggle('is-hidden',interacting||(r.top<innerHeight*.78&&r.bottom>0));
}
addEventListener('scroll',setSticky,{passive:true});
addEventListener('resize',setSticky,{passive:true});
if(window.visualViewport)window.visualViewport.addEventListener('resize',setSticky);
sticky?.addEventListener('click',()=>sticky.classList.add('is-hidden'));
form.addEventListener('focusin',setSticky);
form.addEventListener('focusout',()=>setTimeout(setSticky,180));
setSticky();

form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(orderSubmitting||orderSubmitted)return;
  trackCheckout();

  const btn=form.querySelector('.submit');
  const msg=document.getElementById('form-message');
  const data=new FormData(form);
  const offer=selectedOffer();
  if(!offer)return;

  const name=String(data.get('name')||'').trim();
  const phone=normalizeSaudiPhone(data.get('phone'));
  const address=String(data.get('address')||'').trim();
  msg.textContent='';

  if(!name||!phone||!address){
    msg.textContent=!phone?'فضلاً أدخلي رقم جوال سعودي صحيحًا، مثل 05xxxxxxxx.':'فضلاً أكملي الاسم ورقم الهاتف والعنوان.';
    return;
  }

  const details={
    country:'SA',name,phone,address,pageUrl:location.href,
    sku:CONFIG.sku,product:CONFIG.product,offerCode:offer.code,
    offer:offer.label,price:offer.price,currency:'SAR',
    source:'Gluta Collagen DTX Landing Page'
  };
  const fingerprint=JSON.stringify(details);
  if(!pendingOrder||pendingOrder.fingerprint!==fingerprint){
    pendingOrder={fingerprint,transactionId:'GLUTA-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,8).toUpperCase()};
  }
  const payload={
    ...details,
    transactionId:pendingOrder.transactionId,
    utm:Object.fromEntries(new URLSearchParams(location.search))
  };

  orderSubmitting=true;
  const inputs=[...form.querySelectorAll('input')];
  inputs.forEach(i=>{i.disabled=true});
  btn.disabled=true;
  btn.textContent='جاري تأكيد طلبك...';
  form.setAttribute('aria-busy','true');

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try{
    const response=await fetch(CONFIG.scriptUrl,{
      method:'POST',mode:'cors',credentials:'omit',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify(payload),signal:controller.signal
    });
    if(!response.ok)throw new Error('http-error');
    const result=await response.json();
    if(!result||result.ok!==true)throw new Error('order-rejected');

    orderSubmitted=true;
    trackEvent('PURCHASE',{
      price:offer.price,currency:'SAR',
      transaction_id:payload.transactionId,
      client_dedup_id:payload.transactionId,
      item_ids:[CONFIG.sku]
    });
    form.innerHTML='<div class="success"><span>✓</span><h2>تم استلام طلبك</h2><p>شكرًا لك. سنتواصل معك لتأكيد بيانات الطلب قبل الشحن.</p></div>';
    sticky?.classList.add('is-hidden');
  }catch(err){
    inputs.forEach(i=>{i.disabled=false});
    btn.disabled=false;
    btn.textContent='احجزي باقتك الآن — الدفع عند الاستلام';
    msg.textContent=err.name==='AbortError'
      ?'تأخر رد الخدمة. إذا سبق إرسال الطلب، انتظري اتصال التأكيد قبل تكراره.'
      :'تعذر التأكد من تسجيل الطلب. راجعي البيانات وحاولي مرة أخرى.';
  }finally{
    clearTimeout(timeout);
    orderSubmitting=false;
    form.removeAttribute('aria-busy');
  }
});
