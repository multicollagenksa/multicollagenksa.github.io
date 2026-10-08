const SPREADSHEET_ID = '1z06hEE83QGVQbKH19_GNf9XB4JP2hOv1nCnBLbG_ooI';
const SHEET_NAME = 'Feuil1';

const PRODUCTS = {
  'SHILAJIT-PLUS': {
    product: 'SHILAJIT+',
    packages: {
      1: {label: 'العبوة الفردية — 1 عبوة / 100 غرام', price: 198},
      2: {label: 'الباقة الثنائية — عبوتان / 200 غرام', price: 288},
      3: {label: 'باقة التوفير — 3 عبوات / 300 غرام', price: 324}
    }
  },
  'MULTI-COLLAGEN': {
    product: 'Multi Collagen Peptides',
    packages: {
      1: {label: '1 عبوة — تكفيك شهر', price: 194},
      2: {label: '2 عبوة — تكفيك شهرين', price: 285},
      3: {label: '3 عبوات — تكفيك 3 أشهر', price: 359}
    }
  },
  'BISHT-ROYAL': {
    product: 'بشت التميز الملكي',
    packages: {
      1: {label: 'بشت واحد', price: 399},
      2: {label: '2 بشت — واحد لك والثاني لشخص عزيز عليك', price: 549}
    }
  },
  'COSMA-COLLAGEN': {
    product: 'Cosma Collagen',
    packages: {
      1: {label: 'باقة البداية — 1 عبوة / 30 حصة', price: 185},
      2: {label: 'باقة التوفير — 2 عبوة / 60 حصة', price: 249},
      3: {label: 'الباقة الذهبية — 3 عبوات / 90 حصة', price: 290}
    }
  },
  'GLUTA-COLLAGEN-DTX': {
    product: 'Gluta Collagen DTX+ Mixed Berry',
    packages: {
      1: {label: 'باقة البداية — 1 عبوة', price: 178},
      2: {label: 'باقة التوفير — 2 عبوة', price: 289},
      3: {label: 'الباقة الذهبية — 3 عبوات', price: 359},
      5: {label: 'باقة الاستمرارية — 5 عبوات', price: 499}
    }
  },
  'GLUTA-COLLAGEN-PINK': {
    product: 'Manee Gluta Collagen Pink',
    packages: {
      1: {label: 'باقة البداية — 1 عبوة', price: 178},
      2: {label: 'باقة التوفير — 2 عبوة', price: 289},
      3: {label: 'الباقة الذهبية — 3 عبوات', price: 359},
      5: {label: 'باقة الاستمرارية — 5 عبوات', price: 499}
    }
  }
};

const HEADERS = [
  'OrderDate', 'country', 'name', 'phone', 'address', 'url', 'sku', 'Product',
  'quantity', 'price', 'currency', 'notes', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_term', 'utm_content', 'national_address', 'national_address'
];

function doPost(e) {
  try {
    const order = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    ['name', 'phone', 'address'].forEach(key => {
      if (!String(order[key] || '').trim()) throw new Error('بيانات طلب ناقصة');
    });

    const sku = String(order.sku || '').trim().toUpperCase();
    const productConfig = PRODUCTS[sku];
    if (!productConfig) throw new Error('المنتج غير صالح');

    const selected = productConfig.packages[Number(order.offerCode)];
    if (!selected) throw new Error('العرض غير صالح');

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME) || spreadsheet.insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    }

    const safe = value => {
      const text = String(value == null ? '' : value).trim();
      return /^[=+\-@]/.test(text) ? "'" + text : text;
    };

    const utm = order.utm || {};
    const address = safe(order.address);

    const row = [
      new Date(),
      safe(order.country || 'SA'),
      safe(order.name),
      safe(order.phone),
      address,
      safe(order.pageUrl),
      safe(sku),
      safe(productConfig.product),
      Number(order.offerCode),
      selected.price,
      safe(order.currency || 'SAR'),
      'الدفع عند الاستلام — ' + selected.label,
      safe(utm.utm_source),
      safe(utm.utm_medium),
      safe(utm.utm_campaign),
      safe(utm.utm_term),
      safe(utm.utm_content),
      address,
      address
    ];

    sheet.appendRow(row);

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: true,
        sku: sku,
        product: productConfig.product,
        quantity: Number(order.offerCode),
        price: selected.price
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: String(error.message || error)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}