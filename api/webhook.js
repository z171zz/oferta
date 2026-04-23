const https = require('https');

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_KEY;

function httpsRequest(options, data) {
  return new Promise(function(resolve, reject) {
    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() { resolve({ status: res.statusCode, body: body }); });
    });
    req.on('error', function(e) { reject(e); });
    if (data) req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const data = req.body;
    if (!data) return res.status(400).json({ error: 'Body vazio' });

    console.log('Webhook received:', JSON.stringify(data));

    var transaction = data.transaction || {};
    var tid = transaction.id || data.identifier || data.transactionId;
    var status = (transaction.status || data.status || '').toUpperCase();

    // If payment was completed/paid
    if (status === 'COMPLETED' || status === 'PAID' || status === 'APPROVED') {
      if (tid) {
        var url = new URL(SB_URL + '/rest/v1/sales?transaction_id=eq.' + encodeURIComponent(tid));
        var updateData = JSON.stringify({ status: 'paid' });
        
        await httpsRequest({
          hostname: url.hostname,
          port: 443,
          path: url.pathname + url.search,
          method: 'PATCH',
          headers: {
            'apikey': SB_KEY,
            'Authorization': 'Bearer ' + SB_KEY,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(updateData)
          }
        }, updateData);

        console.log('Sale ' + tid + ' updated to PAID');
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('Webhook Error:', err);
    return res.status(500).json({ error: 'Internal Error' });
  }
};
