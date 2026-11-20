/* Variáveis Globais */
const WHATSAPP_NUMBER = "5561985023258"; // Substitua pelo WhatsApp oficial da loja (61 = Brasília)
const INSTAGRAM_USERNAME = "redemarrer_";
const CATALOG_URL = "./products.json?v=2611"; // URL do arquivo JSON com os produtos

const STORAGE_CART_KEY = "redemarrer_sacola_v1";
const STORAGE_STATE_KEY = "redemarrer_estado_v1";
const SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', '34', '36', '38', '40', '42', '44', 'UN'];

let allProducts = [];
let activeCategory = 'Todos';
let activeSize = 'Todos';
let selectedSizes = {};
let cart = [];

let zoomProduct = null;
let zoomIndex = 0;

function formatBRL(value) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3200);
}

/* Persistência no navegador (localStorage) */
function loadSavedState() {
    try {
        const savedCart = JSON.parse(localStorage.getItem(STORAGE_CART_KEY));
        if (Array.isArray(savedCart)) cart = savedCart;

        const savedState = JSON.parse(localStorage.getItem(STORAGE_STATE_KEY));
        if (savedState && typeof savedState === 'object') {
            activeCategory = savedState.activeCategory || 'Todos';
            activeSize = savedState.activeSize || 'Todos';
            selectedSizes = savedState.selectedSizes || {};
        }
    } catch (e) {
        console.warn('Não foi possível ler o cache local.', e);
    }
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_CART_KEY, JSON.stringify(cart));
        localStorage.setItem(STORAGE_STATE_KEY, JSON.stringify({
            activeCategory,
            activeSize,
            selectedSizes
        }));
    } catch (e) {
        console.warn('Não foi possível salvar no cache local.', e);
    }
}

/* Sincroniza itens salvos com o estoque atual do products.json */
function reconcileCartWithStock() {
    cart = cart.reduce((validItems, entry) => {
        const product = allProducts.find(p => p.id === entry.id);
        if (!product || !product.stock) return validItems;

        const available = product.stock[entry.size] || 0;
        if (available <= 0) return validItems;

        validItems.push({
            id: entry.id,
            size: entry.size,
            qty: Math.min(entry.qty, available)
        });
        return validItems;
    }, []);

    saveState();
}

async function init() {
    loadSavedState();
    try {
        const res = await fetch(CATALOG_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        allProducts = await res.json();
        reconcileCartWithStock();
        buildFilters();
        renderCatalog();
        renderCart();
    } catch (err) {
        console.error('Erro ao carregar products.json:', err);
        document.getElementById('catalog').innerHTML =
            `<p class="empty-state">Não foi possível carregar o catálogo no momento.</p>`;
    }
}

function buildFilters() {
    const categories = ['Todos', ...new Set(allProducts.map(p => p.category).filter(Boolean))];
    if (!categories.includes(activeCategory)) activeCategory = 'Todos';

    document.getElementById('category-filters').innerHTML = categories.map(cat => `
    <button class="filter-chip ${cat === activeCategory ? 'active' : ''}" onclick="setCategory('${cat}')">
      ${cat}
    </button>
  `).join('');

    const presentSizes = new Set();
    allProducts.forEach(p => {
        if (!p.stock) return;
        Object.entries(p.stock).forEach(([size, qty]) => {
            if (qty > 0) presentSizes.add(size);
        });
    });

    const sortedSizes = ['Todos', ...SIZE_ORDER.filter(s => presentSizes.has(s))];
    if (!sortedSizes.includes(activeSize)) activeSize = 'Todos';

    document.getElementById('size-filters').innerHTML = sortedSizes.map(size => `
    <button class="filter-chip ${size === activeSize ? 'active' : ''}" onclick="setSizeFilter('${size}')">
      ${size === 'UN' ? 'Tamanho Único' : size}
    </button>
  `).join('');
}

function setCategory(cat) {
    activeCategory = cat;
    saveState();
    buildFilters();
    renderCatalog();
}

function setSizeFilter(size) {
    activeSize = size;
    saveState();
    buildFilters();
    renderCatalog();
}

function renderCatalog() {
    const container = document.getElementById('catalog');

    const filtered = allProducts.filter(item => {
        const matchesCat = activeCategory === 'Todos' || item.category === activeCategory;
        const matchesSize = activeSize === 'Todos' || (item.stock && item.stock[activeSize] > 0);
        return matchesCat && matchesSize;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-state">Nenhuma peça encontrada com os filtros selecionados.</p>`;
        return;
    }

    container.innerHTML = filtered.map(item => {
        const images = Array.isArray(item.images) ? item.images : [];
        const imgs = images.map((src, idx) =>
            `<img src="${src}" alt="${item.name} - Foto ${idx + 1}" loading="lazy" onclick="openZoom('${item.id}', ${idx})">`
        ).join('');

        const hasMultiple = images.length > 1;
        const arrows = hasMultiple ? `
      <button class="nav-btn prev" aria-label="Foto anterior" onclick="slide('${item.id}', -1)">‹</button>
      <button class="nav-btn next" aria-label="Próxima foto" onclick="slide('${item.id}', 1)">›</button>
    ` : '';

        const dots = hasMultiple ? `
      <div class="dots" id="dots-${item.id}">
        ${images.map((_, idx) => `<span class="dot ${idx === 0 ? 'active' : ''}"></span>`).join('')}
      </div>
    ` : '';

        const entries = Object.entries(item.stock || {});
        const isOneSize = entries.length === 1 && entries[0][0] === 'UN';

        let currentSize = selectedSizes[item.id] || '';
        if (currentSize && (!item.stock[currentSize] || item.stock[currentSize] <= 0)) {
            currentSize = '';
            delete selectedSizes[item.id];
        }
        if (!currentSize && isOneSize && item.stock['UN'] > 0) {
            currentSize = 'UN';
        } else if (!currentSize && activeSize !== 'Todos' && item.stock[activeSize] > 0) {
            currentSize = activeSize;
        }

        const sizePills = entries.map(([size, qty]) => `
      <button 
        class="size-pill ${currentSize === size ? 'active' : ''}" 
        data-size="${size}" 
        ${qty <= 0 ? 'disabled title="Tamanho esgotado"' : ''}
        onclick="toggleSize(this, '${item.id}')"
      >
        ${size === 'UN' ? 'Tamanho Único' : size}
      </button>
    `).join('');

        const isReady = Boolean(currentSize);
        const labelText = currentSize === 'UN' ? 'Tam. Único' : `Tam. ${currentSize}`;

        return `
      <article class="card">
        <div class="carousel-box">
          <div class="carousel-track" id="track-${item.id}" onscroll="updateDots('${item.id}')">${imgs}</div>
          ${arrows}
          ${dots}
        </div>
        <div class="card-body">
          <div>
            <span class="cat">${item.category}</span>
            <h3>${item.name}</h3>
            <p class="price">${formatBRL(item.price)}</p>
          </div>
          <div class="sizes" id="sizes-${item.id}">${sizePills}</div>
          <button 
            class="add-btn" 
            id="add-${item.id}" 
            data-size="${currentSize}"
            ${!isReady ? 'disabled' : ''}
            onclick="addToCart('${item.id}')"
          >
            ${isReady ? `Adicionar (${labelText}) à Sacola` : 'Selecione um tamanho'}
          </button>
        </div>
      </article>
    `;
    }).join('');
}

/* Alternar (Toggle) Seleção de Tamanho */
function toggleSize(pill, id) {
    const wasActive = pill.classList.contains('active');
    const container = document.getElementById(`sizes-${id}`);
    container.querySelectorAll('.size-pill').forEach(el => el.classList.remove('active'));

    const addBtn = document.getElementById(`add-${id}`);

    if (wasActive) {
        delete selectedSizes[id];
        addBtn.disabled = true;
        addBtn.dataset.size = '';
        addBtn.textContent = 'Selecione um tamanho';
    } else {
        pill.classList.add('active');
        const size = pill.dataset.size;
        selectedSizes[id] = size;
        const label = size === 'UN' ? 'Tam. Único' : `Tam. ${size}`;
        addBtn.disabled = false;
        addBtn.dataset.size = size;
        addBtn.textContent = `Adicionar (${label}) à Sacola`;
    }

    saveState();
}

/* Gerenciamento da Sacola */
function addToCart(id) {
    const addBtn = document.getElementById(`add-${id}`);
    const size = addBtn.dataset.size;
    if (!size) return;

    const product = allProducts.find(p => p.id === id);
    if (!product) return;

    const maxStock = product.stock[size] || 0;
    const existing = cart.find(item => item.id === id && item.size === size);

    if (existing) {
        if (existing.qty >= maxStock) {
            showToast(`Limite de estoque atingido (${maxStock} un. disponíveis).`);
            return;
        }
        existing.qty += 1;
    } else {
        cart.push({ id, size, qty: 1 });
    }

    saveState();
    renderCart();
    showToast('Peça adicionada à sua sacola.');
}

function updateCartQty(index, delta) {
    const item = cart[index];
    if (!item) return;

    const product = allProducts.find(p => p.id === item.id);
    const maxStock = product ? (product.stock[item.size] || 0) : 0;
    const newQty = item.qty + delta;

    if (newQty <= 0) {
        cart.splice(index, 1);
    } else if (newQty > maxStock) {
        showToast(`Apenas ${maxStock} unidade(s) em estoque.`);
        return;
    } else {
        item.qty = newQty;
    }

    saveState();
    renderCart();
}

function clearCart() {
    cart = [];
    saveState();
    renderCart();
}

function toggleCart(open) {
    document.getElementById('cart-drawer').classList.toggle('open', open);
    document.getElementById('cart-backdrop').classList.toggle('open', open);
}

function renderCart() {
    const countEl = document.getElementById('cart-count');
    const itemsEl = document.getElementById('cart-items');
    const footerEl = document.getElementById('cart-footer');
    const totalEl = document.getElementById('cart-total');

    const totalCount = cart.reduce((sum, item) => sum + item.qty, 0);
    countEl.textContent = totalCount;

    if (cart.length === 0) {
        itemsEl.innerHTML = `<p class="empty-state">Sua sacola está vazia.</p>`;
        footerEl.style.display = 'none';
        return;
    }
    footerEl.style.display = 'flex';
    let totalValue = 0;
    itemsEl.innerHTML = cart.map((entry, idx) => {
        const product = allProducts.find(p => p.id === entry.id);
        if (!product) return '';
        const subtotal = Number(product.price) * entry.qty;
        totalValue += subtotal;
        const sizeLabel = entry.size === 'UN' ? 'Tamanho Único' : `Tamanho: ${entry.size}`;
        const thumb = (Array.isArray(product.images) && product.images[0]) ? product.images[0] : '';
        return `<div class="cart-item"> <img src="${thumb}" alt="${product.name}"> <div class="cart-item-info"> <div> <p class="cart-item-title">${product.name}</p> <p class="cart-item-meta">${sizeLabel} • ${formatBRL(product.price)}</p> </div> <div class="qty-controls"> <button class="qty-btn" onclick="updateCartQty(${idx}, -1)">−</button> <span>${entry.qty}</span> <button class="qty-btn" onclick="updateCartQty(${idx}, 1)">+</button> </div> </div> </div>`;
    }).join('');
    totalEl.textContent = formatBRL(totalValue);
}

function buildCartMessage() {
    let total = 0;
    const lines = cart.map(entry => {
        const product = allProducts.find(p => p.id === entry.id);
        if (!product) return '';
        const subtotal = Number(product.price) * entry.qty;
        total += subtotal;
        const sizeLabel = entry.size === 'UN' ? 'Tamanho Único' : entry.size;
        return `• ${entry.qty} x * ${product.name}* (${sizeLabel}) — ${formatBRL(subtotal)}`;
    }).filter(Boolean);
    return `Olá, R E D É M A R R E R! Gostaria de encomendar: \n\n${lines.join('\n')} \n\n * Total estimado:* ${formatBRL(total)}`;
}

function checkoutWA() {
    if (cart.length === 0) return;
    const msg = buildCartMessage();
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
}

async function checkoutIG() {
    if (cart.length === 0) return;
    const msg = buildCartMessage();
    try {
        await navigator.clipboard.writeText(msg);
        showToast('Pedido copiado! Cole na DM de @redemarrer_.');
    } catch (err) {
        console.warn('Não foi possível copiar automaticamente.', err);
    }
    setTimeout(() => {
        window.open('https://ig.me/${INSTAGRAM_USERNAME}', '_blank');
    }, 600);
}

/* Carrossel e Modal de Zoom */
function slide(id, dir) {
  const track = document.getElementById(`track-${id}`);
  if (!track) return;

  const width = track.clientWidth;
  const totalSlides = track.children.length;
  if (totalSlides <= 1 || width === 0) return;

  const currentIndex = Math.round(track.scrollLeft / width);
  const nextIndex = (currentIndex + dir + totalSlides) % totalSlides;

  track.scrollTo({
    left: nextIndex * width,
    behavior: 'smooth'
  });
}


function updateDots(id) {
    const track = document.getElementById(`track - ${id}`);
    const dotsContainer = document.getElementById(`dots - ${id}`);
    if (!track || !dotsContainer) return;
    const index = Math.round(track.scrollLeft / track.clientWidth);
    dotsContainer.querySelectorAll('.dot').forEach((dot, idx) => {
        dot.classList.toggle('active', idx === index);
    });
}

function openZoom(productId, imgIndex) {
    zoomProduct = allProducts.find(p => p.id === productId);
    if (!zoomProduct || !zoomProduct.images || zoomProduct.images.length === 0) return;
    zoomIndex = imgIndex;
    updateZoomView();
    document.getElementById('zoom-modal').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function updateZoomView() {
    const total = zoomProduct.images.length;
    document.getElementById('modal-img').src = zoomProduct.images[zoomIndex];
    document.getElementById('modal-caption').textContent = `${zoomProduct.name} — ${zoomIndex + 1} / ${total}`;
    const showArrows = total > 1 ? 'block' : 'none';
    document.getElementById('modal-prev').style.display = showArrows;
    document.getElementById('modal-next').style.display = showArrows;
}

function stepZoom(dir) {
    if (!zoomProduct) return;
    const total = zoomProduct.images.length;
    zoomIndex = (zoomIndex + dir + total) % total;
    updateZoomView();
}

function closeZoom() {
    document.getElementById('zoom-modal').classList.remove('open');
    document.body.style.overflow = '';
    zoomProduct = null;
}

function closeModalOnBg(e) {
    if (e.target.id === 'zoom-modal') closeZoom();
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (zoomProduct) closeZoom();
        toggleCart(false);
    }
    if (!zoomProduct) return;
    if (e.key === 'ArrowRight') stepZoom(1);
    if (e.key === 'ArrowLeft') stepZoom(-1);
});

init();
