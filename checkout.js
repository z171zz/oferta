// =====================================================
// CHECKOUT.JS — Dynamic Multi-Product Checkout
// Reads product info from localStorage.selectedProduct
// Connects to Netlify Functions for PIX payment
// =====================================================

var currentStep = 1;
var address = null;
var selectedProduct = null;

// API endpoint
var API_PIX = '/api/pix';

document.addEventListener('DOMContentLoaded', function() {
  // Load address
  var storedAddr = localStorage.getItem('checkoutAddress');
  if (storedAddr) {
    address = JSON.parse(storedAddr);
    populateAddresses();
  } else {
    window.location.href = '/';
    return;
  }

  // Load selected product
  var storedProduct = localStorage.getItem('selectedProduct');
  if (storedProduct) {
    selectedProduct = JSON.parse(storedProduct);
    populateProductInfo();
  } else {
    window.location.href = '/';
    return;
  }
});

// ====== POPULATE PRODUCT INFO ======
function populateProductInfo() {
  if (!selectedProduct) return;
  
  var price = parseFloat(selectedProduct.price);
  var intPart = Math.floor(price);
  var centsPart = (price % 1).toFixed(2).split('.')[1];
  var priceFormatted = 'R$ ' + intPart + ',<sup>' + centsPart + '</sup>';
  var priceFlat = 'R$ ' + price.toFixed(2).replace('.', ',');
  
  // Update all price displays
  document.querySelectorAll('.ck-product-price').forEach(function(el) {
    el.innerHTML = priceFormatted;
  });
  
  // Update summary sections
  document.querySelectorAll('.ck-summary-product-price').forEach(function(el) {
    el.innerHTML = priceFormatted;
  });
  document.querySelectorAll('.ck-summary-total-price').forEach(function(el) {
    el.innerHTML = priceFormatted;
  });
  
  // Update product image in step 2 and 4
  if (selectedProduct.image) {
    document.querySelectorAll('.ck-product-thumb').forEach(function(el) {
      el.src = selectedProduct.image;
    });
  }
  
  // Update product name
  document.querySelectorAll('.ck-product-name').forEach(function(el) {
    el.textContent = selectedProduct.name || 'Produto';
  });
  
  // Update PIX amount text
  var pixAmountEl = document.getElementById('pixAmountText');
  if (pixAmountEl) pixAmountEl.textContent = 'Pague ' + priceFlat + ' via Pix para concluir sua compra';
  
  // Update payment detail price
  var payDetailEl = document.getElementById('payDetailPrice');
  if (payDetailEl) payDetailEl.textContent = priceFlat;
}

// ====== ADDRESS ======
function getFullAddr() {
  if (!address) return '';
  var a = address.logradouro + ' ' + address.numero;
  if (address.complemento) a += ' - ' + address.complemento;
  a += ' - ' + address.bairro + ', ' + address.localidade + ' - CEP ' + address.cep;
  return a;
}

function getShortAddr() {
  if (!address) return '';
  return address.logradouro + ' ' + address.numero;
}

function populateAddresses() {
  var full = getFullAddr();
  var short = getShortAddr();
  var el1 = document.getElementById('step1Address');
  var el2 = document.getElementById('step2ShortAddress');
  var el4 = document.getElementById('step4Address');
  if (el1) el1.textContent = full;
  if (el2) el2.textContent = short;
  if (el4) el4.textContent = full;
}

// ====== STEP NAVIGATION ======
function goToStep(step) {
  document.getElementById('step' + currentStep).classList.remove('active');
  document.getElementById('step' + step).classList.add('active');
  currentStep = step;
  window.scrollTo(0, 0);
}

function goBackToAddress() {
  localStorage.setItem('returnToCheckout', 'true');
  if (selectedProduct && selectedProduct.slug) {
    window.location.href = '/' + selectedProduct.slug;
  } else {
    window.location.href = '/';
  }
}

// ====== CONFIRM PURCHASE ======
function confirmPurchase() {
  var nome = document.getElementById('ckNome').value.trim();
  var cpf = document.getElementById('ckCpf').value.trim();
  var email = document.getElementById('ckEmail').value.trim();
  if (!nome) { alert('Por favor, informe seu nome completo.'); return; }
  if (!cpf || cpf.length < 11) { alert('Por favor, informe um CPF válido (11 dígitos).'); return; }
  if (!email || email.indexOf('@') === -1) { alert('Por favor, informe um e-mail válido.'); return; }
  goToStep(5);
  createPixPayment(nome, cpf, email);
}

// ====== PIX PAYMENT ======
function createPixPayment(nome, cpf, email) {
  var payload = {
    productId: selectedProduct.id,
    customer: {
      name: nome,
      email: email,
      document: cpf.replace(/\D/g, '')
    }
  };

  fetch(API_PIX, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    console.log('PIX response:', JSON.stringify(data));
    var pixCode = data.pix_qr_code;
    var qrImg = data.qr_image;
    var tid = data.transactionId || data.identifier || '';

    if (pixCode) {
      showPixPage(pixCode, qrImg, tid, true);
    } else if (qrImg || data.order_url) {
      var img = qrImg || ('https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=' + encodeURIComponent(data.order_url));
      showPixPage('', img, tid, false);
    } else {
      var msg = data.message || data.error || JSON.stringify(data);
      if (typeof msg === 'object') msg = JSON.stringify(msg);
      console.error('PIX error:', msg);
      alert('Erro: ' + msg);
      goToStep(4);
    }
  })
  .catch(function(err) {
    console.error('Fetch error:', err);
    alert('Erro de conexão. Tente novamente.');
    goToStep(4);
  });
}

function showPixPage(pixCode, qrImg, tid, showCopyPaste) {
  var imgEl = document.getElementById('qrCodeImg');
  if (qrImg) {
    imgEl.src = qrImg;
  } else {
    imgEl.src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(pixCode);
  }

  var copySection = document.getElementById('pixCopySection');
  if (showCopyPaste && pixCode) {
    document.getElementById('pixCode').value = pixCode;
    if (copySection) copySection.style.display = 'block';
  } else {
    if (copySection) copySection.style.display = 'none';
  }

  goToStep(6);
  if (tid) pollStatus(tid);
}

function copyPixCode() {
  var input = document.getElementById('pixCode');
  input.select();
  input.setSelectionRange(0, 99999);
  try { navigator.clipboard.writeText(input.value); } catch(e) { document.execCommand('copy'); }
  var btn = document.getElementById('copyBtn');
  btn.textContent = 'Código copiado!';
  btn.classList.add('copied');
  setTimeout(function() { btn.textContent = 'Copiar código'; btn.classList.remove('copied'); }, 3000);
}

function pollStatus(tid) {
  var iv = setInterval(function() {
    fetch(API_PIX + '?check=1&tid=' + encodeURIComponent(tid))
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.paid) {
        clearInterval(iv);
        showPaymentSuccess();
      }
    }).catch(function() {});
  }, 5000);
}

function showPaymentSuccess() {
  goToStep(7);
  setTimeout(function() {
    var emailEl = document.getElementById('confirmEmail');
    var addrEl = document.getElementById('confirmAddress');
    if (emailEl) emailEl.textContent = document.getElementById('ckEmail').value || '';
    if (addrEl && address) addrEl.textContent = getFullAddr();
    goToStep(8);
  }, 2000);
}
