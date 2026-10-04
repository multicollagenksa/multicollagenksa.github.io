const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const appPath = process.argv[2] || path.join(__dirname, '../app.js');
const code = fs.readFileSync(appPath, 'utf8');

// Isolated DOM and network adapters: no requests or analytics leave this test.
function setup({values = {}, fetchImpl, brokenPixel = false} = {}) {
  const data = {name:'عميلة اختبار', phone:'0501234567', address:'الرياض، حي تجريبي', offer:'1', ...values};
  const handlers = {};
  const controls = Object.fromEntries(Object.keys(data).map(name => [name, {
    disabled:false, validationMessage:'', attrs:{},
    setCustomValidity(text) {this.validationMessage=text;},
    setAttribute(k,v){this.attrs[k]=v;}, removeAttribute(k){delete this.attrs[k];}
  }]));
  const status={textContent:''};
  const button={disabled:false,textContent:'تأكيد الطلب'};
  const requests=[], events=[], timers=new Map();
  let timerId=0;
  const form={
    innerHTML:'', attrs:{}, focused:false,
    elements:{namedItem:name=>controls[name]},
    addEventListener(name,fn){handlers[name]=fn;},
    querySelector(selector){return selector==='.submit'?button:{focus:()=>{form.focused=true;}};},
    querySelectorAll(){return Object.values(controls);},
    setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
    reportValidity(){return Object.values(controls).every(x=>!x.validationMessage);}
  };
  const context={
    console, Date, Math, JSON, String, Number, Object, URLSearchParams, AbortController,
    setTimeout(fn){timers.set(++timerId,fn);return timerId;},
    clearTimeout(id){timers.delete(id);},
    document:{getElementById:id=>id==='order-form'?form:status},
    window:{location:{href:'https://example.test/?utm_source=test',search:'?utm_source=test'},
      snaptr(...args){if(brokenPixel)throw Error('pixel unavailable');events.push(args);}},
    FormData:class{get(name){return controls[name]?.disabled?null:data[name];}},
    fetch:async(url,options)=>{
      requests.push({url,options,payload:JSON.parse(options.body)});
      return fetchImpl?fetchImpl(url,options):{ok:true,json:async()=>({ok:true})};
    }
  };
  vm.createContext(context);vm.runInContext(code,context);
  return {data,controls,form,status,button,requests,events,timers,
    submit:()=>handlers.submit({preventDefault(){}}),
    input:name=>handlers.input({target:controls[name]}),
    normalize:value=>context.normalizeSaudiPhone(value)};
}

test('accepts common Saudi phone formats and Arabic/Persian digits',()=>{
  const t=setup();
  for(const value of ['0501234567','501234567','+966501234567','966501234567','00966501234567','٠٥٠١٢٣٤٥٦٧','۰۵۰۱۲۳۴۵۶۷','+966 (50) 123-4567']) assert.equal(t.normalize(value),'0501234567',value);
  for(const value of ['12345678','050123456789','abc0501234567','+212612345678','          ','']) assert.equal(t.normalize(value),null,value);
});

test('all three packages submit the matching quantity, price, and label',async()=>{
  const expected=[[1,194,'باقة العناية الأساسية'],[2,285,'باقة التوفير المميّز'],[3,359,'باقة التوفير القصوى']];
  for(const [offer,price,label] of expected){
    const t=setup({values:{offer:String(offer),phone:'٠٥٠١٢٣٤٥٦٧',name:'  عميلة اختبار  '}});
    await t.submit();
    const req=t.requests[0];
    assert.equal(req.payload.price,price);assert.equal(req.payload.offerCode,offer);assert.ok(req.payload.offer.startsWith(label));
    assert.equal(req.payload.phone,'0501234567');assert.equal(req.payload.name,'عميلة اختبار');
    assert.equal(req.payload.sku,'MULTI-COLLAGEN');assert.equal(req.payload.currency,'SAR');
    assert.equal(req.payload.utm.utm_source,'test');assert.equal(req.options.mode,'cors');
    assert.ok(t.form.innerHTML.includes('تم استلام طلبك بنجاح'));assert.equal(t.form.focused,true);
    const purchases=t.events.filter(x=>x[1]==='PURCHASE');assert.equal(purchases.length,1);assert.equal(purchases[0][2].price,price);
    assert.equal(t.events.filter(x=>x[1]==='START_CHECKOUT').length,1);
  }
});

test('rejects whitespace-only fields, invalid phone, and invalid package without a request',async()=>{
  for(const values of [{name:'   '},{address:'   '},{phone:'12345678'},{offer:'0'},{offer:'4'},{offer:'1.5'}]){
    const t=setup({values});await t.submit();assert.equal(t.requests.length,0);assert.equal(t.form.innerHTML,'');
  }
});

test('validation clears when the customer corrects a field',async()=>{
  const t=setup({values:{phone:'123'}});await t.submit();assert.ok(t.controls.phone.validationMessage);
  t.data.phone='0501234567';t.input('phone');assert.equal(t.controls.phone.validationMessage,'');
  await t.submit();assert.equal(t.requests.length,1);
});

test('rapid repeated submits create one request, one success, and one purchase event',async()=>{
  let resolve;
  const t=setup({fetchImpl:()=>new Promise(r=>{resolve=r;})});
  const first=t.submit();await t.submit();assert.equal(t.requests.length,1);assert.equal(t.button.disabled,true);
  assert.equal(t.form.innerHTML,'');assert.equal(t.events.filter(x=>x[1]==='PURCHASE').length,0);
  resolve({ok:true,json:async()=>({ok:true})});await first;await t.submit();
  assert.equal(t.requests.length,1);assert.equal(t.events.filter(x=>x[1]==='PURCHASE').length,1);
});

test('server rejection, HTTP errors, bad JSON, and network failure never display success or fire PURCHASE',async()=>{
  const cases=[
    async()=>({ok:true,json:async()=>({ok:false,error:'server error'})}),
    async()=>({ok:false,json:async()=>({ok:true})}),
    async()=>({ok:true,json:async()=>{throw new SyntaxError('bad json');}}),
    async()=>{throw new TypeError('network down');}
  ];
  for(const fetchImpl of cases){
    const t=setup({fetchImpl});await t.submit();
    assert.equal(t.form.innerHTML,'');assert.ok(t.status.textContent);assert.equal(t.button.disabled,false);
    assert.equal(t.button.textContent,'تأكيد الطلب');assert.equal(t.events.filter(x=>x[1]==='PURCHASE').length,0);
    assert.ok(Object.values(t.controls).every(x=>!x.disabled));assert.equal(t.timers.size,0);
  }
});

test('retry after a rejection retains transaction ID for unchanged data',async()=>{
  let count=0;
  const t=setup({fetchImpl:async()=>({ok:true,json:async()=>({ok:++count>1})})});
  await t.submit();await t.submit();
  assert.equal(t.requests.length,2);assert.equal(t.requests[0].payload.transactionId,t.requests[1].payload.transactionId);
  assert.equal(t.events.filter(x=>x[1]==='PURCHASE').length,1);
});

test('unresponsive service times out and restores the form without a false success',async()=>{
  const t=setup({fetchImpl:(_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('timeout'),{name:'AbortError'}))))});
  const pending=t.submit();for(const fn of t.timers.values())fn();await pending;
  assert.equal(t.button.disabled,false);assert.equal(t.form.innerHTML,'');assert.ok(t.status.textContent.includes('تأخر'));
});

test('broken analytics cannot interrupt order delivery or success',async()=>{
  const t=setup({brokenPixel:true});await t.submit();assert.equal(t.requests.length,1);assert.ok(t.form.innerHTML.includes('بنجاح'));
});
