const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function sbRequest(path, method, body) {
  if (!SB_URL || !SB_KEY) {
    return Promise.resolve({ statusCode: 500, body: '{"error":"Faltando chaves do Supabase no ambiente"}' });
  }
  method = method || 'GET';
  return new Promise(function(resolve, reject) {
    try {
    var cleanPath = path.startsWith('/') ? path : '/' + path;
    var url = new URL(SB_URL.replace(/\/$/, '') + '/rest/v1' + cleanPath);
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
    } catch(e) {
      reject(e);
    }
  });
}

async function getConfig(key) {
  try {
    var r = await sbRequest('/admin_config?id=eq.' + encodeURIComponent(key));
    var data = JSON.parse(r.body);
    if(data && data.length > 0) return data[0].value;
  } catch(e) {}
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, PUT, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query || {};
  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }

  // ====== SECURITY BYPASS & AUTH ======
  const providedPass = String(q.pass || body.pass || '').trim();
  
  const MASTER_PASS = 'vittin123';
  const FALLBACK_PASS = '2468';

  // Hard-coded checks first (no DB required)
  let isAuthorized = (providedPass === MASTER_PASS) || (providedPass === FALLBACK_PASS);

  // If not authorized by hard-coded, check DB
  if (!isAuthorized) {
    const adminPassConf = await getConfig('admin_password');
    const DB_PASS = adminPassConf && adminPassConf.password ? String(adminPassConf.password).trim() : null;
    if (DB_PASS && providedPass === DB_PASS) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
      return res.status(401).json({ 
        error: 'Acesso negado', 
        debug: { 
          hasPass: !!providedPass,
          passMatch: false,
          receivedLen: providedPass.length
        } 
      });
  }

  // Login check
  if (req.method === 'POST' && q.type === 'login') {
      return res.status(200).json({ success: true });
  }

  try {
    // ====== GET SALES & STATS ======
    if (req.method === 'GET' && q.type === 'sales') {
      var result = await sbRequest('/sales?order=created_at.desc&select=*');
      var sales = [];
      try { 
          const parsed = JSON.parse(result.body); 
          sales = Array.isArray(parsed) ? parsed : [];
      } catch(e) { sales = []; }

      var resultProducts = await sbRequest('/products?select=*');
      var products = [];
      try { 
          const parsedP = JSON.parse(resultProducts.body); 
          products = Array.isArray(parsedP) ? parsedP : [];
      } catch(e) { products = []; }

      var paidSales = sales.filter(function(s) { return s.status === 'paid' || s.status === 'completed'; });
      var revenue = paidSales.reduce(function(sum, s) { return sum + parseFloat(s.amount || 0); }, 0);
      var totalPix = sales.length || 0;

      return res.status(200).json({ 
          sales: sales, 
          revenue: Number(revenue) || 0,
          total_paid: Number(paidSales.length) || 0,
          total_pix: Number(totalPix) || 0,
          total_products: Number(products.length) || 0,
          products: products
      });
    }

    // ====== GET CONFIG ======
    if (req.method === 'GET' && q.type === 'config') {
      // Removed SigiloPay config fetching
      var general = await getConfig('general');
      return res.status(200).json({ sigilopay: {}, general: general || {} });
    }

    // ====== SAVE CONFIG ======
    if (req.method === 'POST' && q.type === 'config') {
      const payload = body;

      if(!payload || !payload.id || !payload.value) {
          return res.status(400).json({ error: 'Faltando id ou value', received: payload });
      }
      
      // Block saving sigilopay keys from admin panel
      if(payload.id === 'sigilopay') {
          return res.status(403).json({ error: 'As chaves PIX agora são gerenciadas via variáveis de ambiente.' });
      }

      var upsertData = {
          id: payload.id,
          value: payload.value,
          updated_at: new Date().toISOString()
      };
      
      var pUrl = new URL(SB_URL + '/rest/v1/admin_config');
      var pData = JSON.stringify(upsertData);
      var pOptions = {
          hostname: pUrl.hostname, port: 443, path: pUrl.pathname + '?on_conflict=id', method: 'POST',
          headers: {
            'apikey': SB_KEY,
            'Authorization': 'Bearer ' + SB_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'resolution=merge-duplicates,return=representation',
            'Content-Length': Buffer.byteLength(pData)
          }
      };

      var saveResult = await new Promise((resolve, reject) => {
        var r = https.request(pOptions, function(res) {
            var chunks = '';
            res.on('data', function(c) { chunks += c; });
            res.on('end', function() { resolve({ statusCode: res.statusCode, body: chunks }); });
        });
        r.on('error', reject);
        r.write(pData);
        r.end();
      });

      return res.status(saveResult.statusCode).send(saveResult.body);
    }

    // ====== CREATE PRODUCT ======
    if (req.method === 'POST' && !q.type) {
      const payload = body;
      if (!payload || !payload.name || !payload.price || !payload.slug) {
        return res.status(400).json({ error: 'Campos obrigatórios: name, price, slug' });
      }

      var productData = {
        name: payload.name,
        slug: payload.slug,
        price: parseFloat(payload.price),
        old_price: payload.old_price ? parseFloat(payload.old_price) : null,
        stock: parseInt(payload.stock) || 50,
        description: payload.description || '',
        source_html: payload.source_html || null,
        images: payload.images || [],
        features: payload.features || {},
        active: payload.active !== false
      };

      var result2 = await sbRequest('/products', 'POST', productData);
      
      if (result2.statusCode >= 400) {
        var errBody;
        try { errBody = JSON.parse(result2.body); } catch(e) { errBody = { message: result2.body }; }
        var errorMsg = errBody.message || errBody;
        if(typeof errorMsg === 'string' && errorMsg.includes('duplicate key value')) {
            errorMsg = 'Já existe um produto criado com este Slug. O Slug deve ser único para cada produto!';
        }
        return res.status(result2.statusCode).json({ error: 'Erro ao criar produto', details: errorMsg });
      }

      return res.status(201).send(result2.body);
    }

    // ====== DELETE PRODUCT ======
    if (req.method === 'DELETE' && q.id) {
      var result3 = await sbRequest('/products?id=eq.' + encodeURIComponent(q.id), 'DELETE');
      
      if(result3.statusCode >= 400) {
         var errStr = result3.body || "";
         if(errStr.includes("foreign key constraint")) {
             return res.status(400).json({ error: "Não é possível apagar completamente este produto porque já existem Vendas/PIX atrelados a ele no sistema." });
         }
         return res.status(400).json({ error: "Erro ao deletar produto." });
      }

      return res.status(result3.statusCode).send(result3.body);
    }

    return res.status(400).json({ error: 'Operação inválida' });

  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({ error: 'Erro interno', details: error.message });
  }
};
