const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function sbRequest(path, method, body) {
  method = method || 'GET';
  return new Promise(function(resolve, reject) {
    var url = new URL(SB_URL + '/rest/v1' + path);
    var data = body ? JSON.stringify(body) : null;
    var options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      }
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    var req = https.request(options, function(res) {
      var chunks = '';
      res.on('data', function(c) { chunks += c; });
      res.on('end', function() { resolve({ statusCode: res.statusCode, body: chunks }); });
    });
    req.on('error', function(e) { reject(e); });
    if (data) req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const q = req.query || {};

    // Single product by slug
    if (q.slug) {
      var result = await sbRequest('/products?slug=eq.' + encodeURIComponent(q.slug) + '&select=*');
      var products = JSON.parse(result.body);
      if (!products.length) return res.status(404).json({ error: 'Produto não encontrado' });
      return res.status(200).json(products[0]);
    }

    // Single product by ID
    if (q.id) {
      var result2 = await sbRequest('/products?id=eq.' + encodeURIComponent(q.id) + '&select=*');
      var products2 = JSON.parse(result2.body);
      if (!products2.length) return res.status(404).json({ error: 'Produto não encontrado' });
      return res.status(200).json(products2[0]);
    }

    // List all active products
    var result3 = await sbRequest('/products?active=eq.true&select=id,name,slug,price,old_price,stock,images,features&order=created_at.desc');
    return res.status(200).send(result3.body);

  } catch (error) {
    console.error('Products API Error:', error);
    return res.status(500).json({ error: 'Erro interno do servidor', details: error.message });
  }
};
