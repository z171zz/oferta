const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function httpsRequest(options, data) {
  return new Promise(function (resolve, reject) {
    var req = https.request(options, function (res) {
      var body = '';
      res.on('data', function (c) { body += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('error', function (e) { reject(e); });
    req.setTimeout(30000, function () { req.destroy(); reject(new Error('Timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function getProduct(id) {
  var url = new URL(SB_URL + '/rest/v1/products?id=eq.' + encodeURIComponent(id) + '&select=id,price,name');
  var res = await httpsRequest({
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  var products = JSON.parse(res.body);
  return products.length > 0 ? products[0] : null;
}

async function createSale(productId, productName, amount, email, name, doc, tid) {
  var url = new URL(SB_URL + '/rest/v1/sales');
  var data = JSON.stringify({
    product_id: productId,
    product_name: productName,
    amount: amount,
    customer_email: email,
    customer_name: name,
    customer_document: doc,
    transaction_id: tid,
    status: 'pending'
  });
  await httpsRequest({
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: 'POST',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'Prefer': 'return=minimal'
    }
  }, data);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const params = req.query || {};

  // ====== CHECK PAYMENT STATUS ======
  if (params.check === '1' && params.tid) {
    try {
      var url = new URL(SB_URL + '/rest/v1/sales?transaction_id=eq.' + encodeURIComponent(params.tid) + '&select=status');
      var r = await httpsRequest({
        hostname: url.hostname, port: 443, path: url.pathname + url.search, method: 'GET',
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
      });
      var sales = JSON.parse(r.body);
      var paid = sales.length > 0 && (sales[0].status === 'paid' || sales[0].status === 'completed');
      return res.status(200).json({ paid: paid });
    } catch (e) {
      return res.status(200).json({ paid: false });
    }
  }

  // ====== CREATE PIX TRANSACTION ======
  if (req.method === 'POST') {
    try {
      const input = req.body;
      if (!input || !input.productId) {
        return res.status(400).json({ error: 'Dados insuficientes' });
      }

      // Fetch real product price from DB (anti-tamper)
      var product = await getProduct(input.productId);
      if (!product) {
        return res.status(404).json({ error: 'Produto não encontrado' });
      }

      // Chaves Nativas da SigiloPay ou Environment Variables da Vercel
      var pKey = process.env.SIGILOPAY_PUBLIC_KEY || 'sbck6bostinha_3i9zcuj3nr7ci5f9';
      var sKey = process.env.SIGILOPAY_SECRET_KEY || 'eek1l57m7ao05mrw8paylvv1u640o022g8hfq27gch7ww089n3dlui3fvzzlthuy';

      // Converter o preço garantindo ser um float válido com 2 casas
      var amountStr = product.price.toString().replace(/[^0-9.,]/g, '').replace(',', '.');
      var amountVal = parseFloat(amountStr) || 0;
      if (amountVal <= 0) {
        return res.status(400).json({ error: 'Preço do produto inválido' });
      }
      var amount = parseFloat(amountVal.toFixed(2));

      // Build SigiloPay payload
      var payload = JSON.stringify({
        identifier: 'sale_' + Date.now().toString() + '_' + Math.floor(Math.random() * 1000),
        amount: amount,
        client: {
          name: input.customer.name,
          email: input.customer.email,
          document: input.customer.document,
          phone: input.customer.phone || '00000000000'
        }
      });

      // Call SigiloPay API
      var sigiloRes = await httpsRequest({
        hostname: 'app.sigilopay.com.br',
        port: 443,
        path: '/api/v1/gateway/pix/receive',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-public-key': pKey,
          'x-secret-key': sKey,
          'Content-Length': Buffer.byteLength(payload)
        }
      }, payload);

      var data = JSON.parse(sigiloRes.body);

      var pixNode = null;
      if (data.pix && typeof data.pix === 'object') {
        pixNode = data.pix;
      } else if (data.order && data.order.pix && typeof data.order.pix === 'object') {
        pixNode = data.order.pix;
      }

      if (sigiloRes.status >= 400 || !pixNode) {
        var msg = data.message || data.error || '';
        var dets = data.details ? JSON.stringify(data.details) : JSON.stringify(data);
        return res.status(400).json({ error: 'Motivo Real Sigilopay: ' + msg + ' => Detalhes: ' + dets });
      }

      var tid = data.transactionId || data.identifier || ('local_' + Date.now());

      var pixPayload = pixNode.code || pixNode.payload || pixNode.emv || pixNode.qrCode || pixNode.qrcode || '';
      var qrImageSrc = '';
      if (pixNode.base64) {
        qrImageSrc = pixNode.base64.startsWith('data:image') ? pixNode.base64 : 'data:image/png;base64,' + pixNode.base64;
      } else if (pixNode.image) {
        qrImageSrc = pixNode.image;
      } else if (pixNode.imageUrl) {
        qrImageSrc = pixNode.imageUrl;
      } else if (pixNode.qrCodeImageUrl) {
        qrImageSrc = pixNode.qrCodeImageUrl;
      }

      // Record sale in Supabase
      if (tid) {
        await createSale(product.id, product.name, product.price, input.customer.email, input.customer.name, input.customer.document, tid);
      }

      if (!qrImageSrc && pixPayload) {
        qrImageSrc = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(pixPayload);
      }

      return res.status(200).json({
        success: true,
        transactionId: tid,
        pix_qr_code: pixPayload,
        qr_image: qrImageSrc,
        amount: product.price,
        productName: product.name
      });

    } catch (error) {
      console.error('PIX Error:', error);
      return res.status(500).json({ error: 'Erro ao gerar PIX: ' + error.message });
    }
  }

  return res.status(400).json({ error: 'Bad Request' });
};
