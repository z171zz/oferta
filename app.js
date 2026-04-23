// === IMAGE GALLERY ===
var productImages = [
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-ncCid9uC9Xl1Ss0om9EDgHWKUOug45.png",
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-ZfiYtV9MQeuKEgE6BTvIVfXGb75Im5.png",
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-mugJhuzTIsDYw9HHx24YsUwFB4hcYM.png",
  "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-rkYiBHhJ2D00nEEjjiKU6MKKiepzmI.png"
];
var selectedImage = 0;
var savedAddress = null;

// Init gallery
function initGallery() {
  var thumbsEl = document.getElementById('thumbnails');
  var dotsEl = document.getElementById('mobileDots');
  thumbsEl.innerHTML = '';
  dotsEl.innerHTML = '';
  for (var i = 0; i < productImages.length; i++) {
    // Thumbnails
    var btn = document.createElement('button');
    btn.className = 'thumb-btn' + (i === selectedImage ? ' active' : '');
    btn.dataset.index = i;
    btn.onclick = (function(idx) { return function() { selectImage(idx); }; })(i);
    var img = document.createElement('img');
    img.src = productImages[i];
    img.alt = 'Imagem ' + (i + 1);
    btn.appendChild(img);
    thumbsEl.appendChild(btn);
    // Dots
    var dot = document.createElement('button');
    dot.className = 'dot' + (i === selectedImage ? ' active' : '');
    dot.onclick = (function(idx) { return function() { selectImage(idx); }; })(i);
    dotsEl.appendChild(dot);
  }
  updateMainImage();
}

function selectImage(idx) {
  selectedImage = idx;
  updateMainImage();
  updateThumbnails();
}

function nextImage() {
  selectedImage = (selectedImage + 1) % productImages.length;
  updateMainImage();
  updateThumbnails();
}

function prevImage() {
  selectedImage = (selectedImage - 1 + productImages.length) % productImages.length;
  updateMainImage();
  updateThumbnails();
}

function updateMainImage() {
  var mainImg = document.getElementById('mainImage');
  var counter = document.getElementById('imageCounter');
  if (mainImg) mainImg.src = productImages[selectedImage];
  if (counter) counter.textContent = (selectedImage + 1) + '/' + productImages.length;
}

function updateThumbnails() {
  var thumbs = document.querySelectorAll('.thumb-btn');
  var dots = document.querySelectorAll('.dot');
  for (var i = 0; i < thumbs.length; i++) {
    thumbs[i].className = 'thumb-btn' + (i === selectedImage ? ' active' : '');
  }
  for (var i = 0; i < dots.length; i++) {
    dots[i].className = 'dot' + (i === selectedImage ? ' active' : '');
  }
}

// === MODALS ===
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

function closeModalOverlay(e) {
  if (e.target === e.currentTarget) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// === ADDRESS (CEP) ===
function handleCepInput(input) {
  var val = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = val;
  if (val.length === 8) {
    fetchAddress(val);
  }
}

function fetchAddress(cep) {
  var loadingEl = document.getElementById('cepLoading');
  var errorEl = document.getElementById('cepError');
  var fieldsEl = document.getElementById('addressFields');
  var saveBtn = document.getElementById('saveAddressBtn');

  loadingEl.style.display = 'block';
  errorEl.style.display = 'none';
  fieldsEl.style.display = 'none';
  saveBtn.disabled = true;

  fetch('https://viacep.com.br/ws/' + cep + '/json/')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      loadingEl.style.display = 'none';
      if (data.erro) {
        errorEl.textContent = 'CEP não encontrado.';
        errorEl.style.display = 'block';
        return;
      }
      document.getElementById('ruaInput').value = data.logradouro || '';
      document.getElementById('bairroInput').value = data.bairro || '';
      document.getElementById('cidadeInput').value = data.localidade || '';
      document.getElementById('ufInput').value = data.uf || '';
      fieldsEl.style.display = 'block';
      document.getElementById('numeroInput').value = '';
      document.getElementById('complementoInput').value = '';
      // Enable save when numero is filled
      document.getElementById('numeroInput').oninput = function() {
        saveBtn.disabled = !this.value.trim();
      };
    })
    .catch(function() {
      loadingEl.style.display = 'none';
      errorEl.textContent = 'Erro ao buscar CEP. Tente novamente.';
      errorEl.style.display = 'block';
    });
}

function saveAddress() {
  savedAddress = {
    logradouro: document.getElementById('ruaInput').value,
    numero: document.getElementById('numeroInput').value,
    complemento: document.getElementById('complementoInput').value,
    bairro: document.getElementById('bairroInput').value,
    localidade: document.getElementById('cidadeInput').value,
    uf: document.getElementById('ufInput').value,
    cep: document.getElementById('cepInput').value
  };
  localStorage.setItem('checkoutAddress', JSON.stringify(savedAddress));
  closeModal('addressModal');
  // If user came from checkout, redirect back
  if (localStorage.getItem('returnToCheckout')) {
    localStorage.removeItem('returnToCheckout');
    window.location.href = 'comprar?ref=a8k2m4';
  }
}

function getFullAddress() {
  if (!savedAddress) return '';
  var addr = savedAddress.logradouro + ' ' + savedAddress.numero;
  if (savedAddress.complemento) addr += ' - ' + savedAddress.complemento;
  addr += ' - ' + savedAddress.bairro + ', ' + savedAddress.localidade + ' - CEP ' + savedAddress.cep;
  return addr;
}

// === BUY FLOW ===
function handleBuyNow() {
  if (savedAddress && savedAddress.numero) {
    localStorage.setItem('checkoutAddress', JSON.stringify(savedAddress));
    window.location.href = 'comprar?ref=a8k2m4';
  } else {
    // Save flag to redirect after address is entered
    localStorage.setItem('returnToCheckout', 'true');
    openModal('addressModal');
  }
}

// === QUESTIONS ===
function sendQuestion() {
  var text = document.getElementById('questionText').value.trim();
  if (text) {
    closeModal('questionModal');
    document.getElementById('questionText').value = '';
    openModal('questionSuccessModal');
  }
}

// === SPECS TABLES ===
var characteristics = [
  { label: "Marca", value: "Lego" },
  { label: "Linha", value: "Editions Sports" },
  { label: "Modelo", value: "43020" },
  { label: "Quantidade De Peças", value: "2842" },
  { label: "Versão Do Personagem", value: "FIFA 2026" }
];

var productRecords = [
  { label: "Número de certificado de segurança do brinquedo", value: "NA" }
];

var otherCharacteristics = [
  { label: "Coleção", value: "Esportes" },
  { label: "Materiais do brinquedo", value: "Plastico" },
  { label: "Formas das peças", value: "Bloco" },
  { label: "Componentes do brinquedo", value: "Blocos montar" },
  { label: "Idade mínima recomendada - idade máxima recomendada", value: "12 anos - 99 anos" },
  { label: "É colecionável", value: "Sim" },
  { label: "Personagens", value: "FIFA" },
  { label: "É magnético", value: "Não" }
];

function buildTable(el, data) {
  var html = '';
  for (var i = 0; i < data.length; i++) {
    html += '<tr><td>' + data[i].label + '</td><td>' + data[i].value + '</td></tr>';
  }
  document.getElementById(el).innerHTML = html;
}

function buildCharModal() {
  var body = document.getElementById('charModalBody');
  var html = '<h4 class="muted text-sm bold" style="margin-bottom:12px">Características principais</h4>';
  html += '<table class="specs-table">';
  for (var i = 0; i < characteristics.length; i++) {
    html += '<tr><td>' + characteristics[i].label + '</td><td>' + characteristics[i].value + '</td></tr>';
  }
  html += '</table>';
  html += '<h4 class="muted text-sm bold" style="margin:24px 0 12px">Registros de produtos</h4>';
  html += '<table class="specs-table">';
  for (var i = 0; i < productRecords.length; i++) {
    html += '<tr><td>' + productRecords[i].label + '</td><td>' + productRecords[i].value + '</td></tr>';
  }
  html += '</table>';
  html += '<h4 class="muted text-sm bold" style="margin:24px 0 12px">Outros</h4>';
  html += '<table class="specs-table">';
  for (var i = 0; i < otherCharacteristics.length; i++) {
    html += '<tr><td>' + otherCharacteristics[i].label + '</td><td>' + otherCharacteristics[i].value + '</td></tr>';
  }
  html += '</table>';
  body.innerHTML = html;
}

// === INIT ===
document.addEventListener('DOMContentLoaded', function() {
  initGallery();
  buildTable('mainSpecs', characteristics);
  buildTable('recordSpecs', productRecords);
  buildCharModal();
  // Restore address from localStorage
  var stored = localStorage.getItem('checkoutAddress');
  if (stored && !savedAddress) {
    savedAddress = JSON.parse(stored);
  }
  // Auto-open address modal if returning from checkout
  if (window.location.search.indexOf('openAddress=true') !== -1) {
    openModal('addressModal');
  }
});
