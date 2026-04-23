const https = require('https');

const GEMINI_KEY = process.env.GEMINI_API_KEY;

function geminiRequest(prompt) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify({
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3
      }
    });

    var options = {
      hostname: 'generativelanguage.googleapis.com',
      port: 443,
      path: '/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_KEY,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() { resolve({ statusCode: res.statusCode, body: body }); });
    });

    req.on('error', function(e) { reject(e); });
    req.setTimeout(30000, function() { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!GEMINI_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY não configurada no painel da Vercel.' });
  }

  try {
    const input = req.body;
    if (!input) return res.status(400).json({ error: 'Body vazio' });

    var name = input.name || '';
    var description = input.description || name;

    if (!name) {
      return res.status(400).json({ error: 'Campo "name" é obrigatório' });
    }

    var prompt = 'Você é um especialista em e-commerce do Mercado Livre.\n' +
      'Baseado no nome e descrição do produto abaixo, gere um JSON com as "Características Principais" técnicas dele.\n' +
      'Siga este formato estritamente:\n' +
      '{\n' +
      '  "Marca": "...",\n' +
      '  "Linha": "...",\n' +
      '  "Modelo": "...",\n' +
      '  "Material": "...",\n' +
      '  "Cor": "...",\n' +
      '  "Peso": "..."\n' +
      '}\n\n' +
      'Retorne APENAS o JSON, use no máximo 8 características relevantes.\n' +
      'Adapte os nomes das características ao tipo de produto.\n\n' +
      'NOME: ' + name + '\n' +
      'DESCRIÇÃO: ' + description;

    var result = await geminiRequest(prompt);
    
    if (result.statusCode !== 200) {
      var errBody;
      try { errBody = JSON.parse(result.body); } catch(e) { errBody = { error: result.body }; }
      console.error('Gemini API error:', result.statusCode, result.body);
      return res.status(500).json({ error: 'Erro na API Gemini: ' + (errBody.error && errBody.error.message ? errBody.error.message : 'Status ' + result.statusCode) });
    }

    var responseData = JSON.parse(result.body);
    var text = responseData.candidates[0].content.parts[0].text;

    var features;
    try {
      features = JSON.parse(text);
    } catch(e) {
      var match = text.match(/\{[\s\S]*\}/);
      if (match) features = JSON.parse(match[0]);
      else throw new Error('Resposta da IA não contém JSON válido');
    }

    return res.status(200).json(features);

  } catch (error) {
    console.error('AI Generator Error:', error);
    return res.status(500).json({ error: 'Falha ao gerar características: ' + error.message });
  }
};
