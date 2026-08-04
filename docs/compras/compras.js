// Interface e regras exclusivas do Carrinho de Compras.
(() => {
  const view = document.getElementById('view-shopping');
  const navButton = document.querySelector('.nav-btn[data-view="shopping"]');
  if (!view || !navButton || !window.ShoppingAPI) return;

  const state = {
    products: new Map(),
    items: [],
    unsubscribers: [],
    initialized: false,
    scanner: new window.ShoppingBarcodeScanner(),
    photoCamera: new window.ShoppingCameraCapture(),
    pendingPhoto: '',
    productFormMode: 'create',
    addAfterSave: false,
    editingOriginalBarcode: '',
    marketMode: false,
    wakeLock: null,
  };

  const escapeHtml = (value) =>
    String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');

  const notify = (message, type = 'success') => {
    if (typeof window.showToast === 'function') window.showToast(message, type);
    else console[type === 'error' ? 'error' : 'log'](message);
  };

  const askConfirmation = async (message) => {
    if (typeof window.showConfirm === 'function') return window.showConfirm(message, true);
    return window.confirm(message);
  };

  view.innerHTML = `
    <div class="shopping-shell">
      <section class="shopping-hero card">
        <div>
          <span class="shopping-kicker">Lista compartilhada</span>
          <h2>🛒 Carrinho de compras</h2>
          <p>Cadastre uma vez pelo código de barras e reutilize nas próximas compras.</p>
        </div>
        <div class="shopping-hero-actions">
          <button type="button" class="action-btn" id="shopping-catalog-button">📦 Produtos</button>
          <button type="button" class="action-btn" id="shopping-register-button">＋ Cadastrar</button>
          <button type="button" class="btn-primary" id="shopping-scan-button">▣ Escanear</button>
        </div>
      </section>

      <section class="shopping-summary card">
        <div class="shopping-progress-copy">
          <strong id="shopping-progress-label">Lista vazia</strong>
          <small id="shopping-progress-detail">Cadastre ou escaneie um produto para começar.</small>
        </div>
        <div class="shopping-progress-track"><span id="shopping-progress-fill"></span></div>
        <div class="shopping-summary-actions">
          <button type="button" class="action-btn" id="shopping-market-mode">🛍️ Modo mercado</button>
          <button type="button" class="action-btn danger" id="shopping-clear-purchased">Limpar comprados</button>
        </div>
      </section>

      <section class="shopping-list-card card">
        <div class="shopping-list-toolbar">
          <div>
            <h3>Lista atual</h3>
            <small id="shopping-list-count">0 produtos</small>
          </div>
          <input type="search" id="shopping-list-search" class="list-search" placeholder="Buscar na lista..." aria-label="Buscar produto na lista" />
        </div>
        <div id="shopping-list" class="shopping-list"></div>
        <div id="shopping-empty" class="shopping-empty">
          <span>🛒</span>
          <strong>Sua lista está vazia</strong>
          <small>Use “Escanear” ou abra o catálogo para adicionar produtos.</small>
        </div>
      </section>
    </div>

    <div class="shopping-overlay" id="shopping-scanner-overlay" hidden>
      <div class="shopping-modal shopping-scanner-modal">
        <div class="shopping-modal-head">
          <div><strong>Escanear produto</strong><small>Centralize o código dentro da área.</small></div>
          <button type="button" class="action-btn shopping-modal-close" data-close="scanner">✕</button>
        </div>
        <div class="shopping-camera-frame">
          <video id="shopping-scanner-video" muted></video>
          <div class="shopping-camera-guide"><span></span></div>
        </div>
        <p id="shopping-scanner-status" class="shopping-scanner-status">Preparando câmera...</p>
        <form id="shopping-manual-code-form" class="shopping-manual-code-form">
          <input id="shopping-manual-code" inputmode="numeric" autocomplete="off" placeholder="Ou digite o código de barras" required />
          <button type="submit" class="action-btn">Procurar</button>
        </form>
      </div>
    </div>

    <div class="shopping-overlay" id="shopping-product-overlay" hidden>
      <div class="shopping-modal">
        <div class="shopping-modal-head">
          <div><strong id="shopping-product-form-title">Cadastrar produto</strong><small id="shopping-product-form-subtitle">Este código ainda não existe na sua base.</small></div>
          <button type="button" class="action-btn shopping-modal-close" data-close="product">✕</button>
        </div>
        <form id="shopping-product-form">
          <div class="shopping-product-photo-row">
            <div class="shopping-photo-column">
              <button type="button" class="shopping-photo-picker" id="shopping-open-photo-camera" title="Abrir câmera">
                <img id="shopping-product-photo-preview" alt="Foto do produto" hidden />
                <span id="shopping-product-photo-placeholder">📷<small>Sem foto</small></span>
              </button>
              <div class="shopping-photo-actions">
                <button type="button" class="action-btn" id="shopping-open-photo-camera-secondary">📷 Câmera</button>
                <label class="action-btn shopping-file-button">🖼️ Arquivo<input type="file" id="shopping-product-photo" accept="image/*" hidden /></label>
              </div>
            </div>
            <div class="shopping-product-main-fields">
              <label>Código de barras<input id="shopping-product-barcode" inputmode="numeric" autocomplete="off" maxlength="14" aria-describedby="shopping-barcode-help" /><small id="shopping-barcode-help" class="shopping-barcode-help">8, 12, 13 ou 14 dígitos. O sistema confere o dígito verificador.</small></label>
              <label>Nome do produto<input id="shopping-product-name" required autocomplete="off"/></label>
            </div>
          </div>
          <div class="field-row shopping-product-fields">
            <label class="field">Categoria
              <input id="shopping-product-category" list="shopping-product-category-options" autocomplete="off" />
              <datalist id="shopping-product-category-options">
                <option value="Bebidas"></option>
                <option value="Molhos e condimentos"></option>
                <option value="Temperos e especiarias"></option>
                <option value="Frutas, verduras e legumes"></option>
                <option value="Carnes e aves"></option>
                <option value="Peixes e frutos do mar"></option>
                <option value="Frios e laticínios"></option>
                <option value="Padaria e confeitaria"></option>
                <option value="Grãos, massas e cereais"></option>
                <option value="Enlatados e conservas"></option>
                <option value="Congelados"></option>
                <option value="Café, chá e achocolatados"></option>
                <option value="Lanches e snacks"></option>
                <option value="Biscoitos e salgadinhos"></option>
                <option value="Doces e sobremesas"></option>
                <option value="Produtos naturais e dietéticos"></option>
                <option value="Higiene pessoal"></option>
                <option value="Limpeza da casa"></option>
                <option value="Utilidades domésticas"></option>
                <option value="Bebê"></option>
                <option value="Pet shop"></option>
              </datalist>
            </label>
            <label class="field">Unidade<select id="shopping-product-unit"><option value="unidade">Unidade</option><option value="pacote">Pacote</option><option value="caixa">Caixa</option><option value="garrafa">Garrafa</option><option value="kg">Kg</option></select></label>
            <label class="field">Quantidade padrão<input type="number" id="shopping-product-default-quantity" min="1" step="1" value="1" /></label>
          </div>
          <div class="shopping-modal-actions">
            <button type="button" class="action-btn" id="shopping-save-only">Salvar produto</button>
            <button type="submit" class="btn-primary" id="shopping-save-add">Salvar e adicionar</button>
          </div>
        </form>
      </div>
    </div>

    <div class="shopping-overlay" id="shopping-photo-camera-overlay" hidden>
      <div class="shopping-modal shopping-photo-camera-modal">
        <div class="shopping-modal-head">
          <div><strong>Tirar foto do produto</strong><small>Posicione o produto e capture a imagem.</small></div>
          <button type="button" class="action-btn shopping-modal-close" data-close="photoCamera">✕</button>
        </div>
        <div class="shopping-camera-frame shopping-photo-camera-frame">
          <video id="shopping-photo-camera-video" muted></video>
        </div>
        <p id="shopping-photo-camera-status" class="shopping-scanner-status">Preparando câmera...</p>
        <div class="shopping-modal-actions">
          <button type="button" class="btn-primary" id="shopping-capture-photo" disabled>📸 Capturar foto</button>
        </div>
      </div>
    </div>

    <div class="shopping-overlay" id="shopping-found-overlay" hidden>
      <div class="shopping-modal shopping-found-modal">
        <div class="shopping-modal-head">
          <div><strong>Produto encontrado</strong><small>Ele já está cadastrado na sua base.</small></div>
          <button type="button" class="action-btn shopping-modal-close" data-close="found">✕</button>
        </div>
        <div id="shopping-found-content"></div>
      </div>
    </div>

    <div class="shopping-overlay" id="shopping-catalog-overlay" hidden>
      <div class="shopping-modal shopping-catalog-modal">
        <div class="shopping-modal-head">
          <div><strong>Catálogo de produtos</strong><small>Produtos que vocês já cadastraram.</small></div>
          <button type="button" class="action-btn shopping-modal-close" data-close="catalog">✕</button>
        </div>
        <input type="search" id="shopping-catalog-search" class="list-search" placeholder="Buscar produto..." />
        <div id="shopping-catalog-list" class="shopping-catalog-list"></div>
      </div>
    </div>
  `;

  const elements = {
    list: document.getElementById('shopping-list'),
    empty: document.getElementById('shopping-empty'),
    listCount: document.getElementById('shopping-list-count'),
    listSearch: document.getElementById('shopping-list-search'),
    progressLabel: document.getElementById('shopping-progress-label'),
    progressDetail: document.getElementById('shopping-progress-detail'),
    progressFill: document.getElementById('shopping-progress-fill'),
    scannerOverlay: document.getElementById('shopping-scanner-overlay'),
    scannerVideo: document.getElementById('shopping-scanner-video'),
    scannerStatus: document.getElementById('shopping-scanner-status'),
    manualCodeForm: document.getElementById('shopping-manual-code-form'),
    manualCode: document.getElementById('shopping-manual-code'),
    productOverlay: document.getElementById('shopping-product-overlay'),
    productForm: document.getElementById('shopping-product-form'),
    productFormTitle: document.getElementById('shopping-product-form-title'),
    productFormSubtitle: document.getElementById('shopping-product-form-subtitle'),
    barcode: document.getElementById('shopping-product-barcode'),
    productName: document.getElementById('shopping-product-name'),
    productCategory: document.getElementById('shopping-product-category'),
    productUnit: document.getElementById('shopping-product-unit'),
    productDefaultQuantity: document.getElementById('shopping-product-default-quantity'),
    productPhoto: document.getElementById('shopping-product-photo'),
    productPhotoPreview: document.getElementById('shopping-product-photo-preview'),
    productPhotoPlaceholder: document.getElementById('shopping-product-photo-placeholder'),
    openPhotoCamera: document.getElementById('shopping-open-photo-camera'),
    openPhotoCameraSecondary: document.getElementById('shopping-open-photo-camera-secondary'),
    photoCameraOverlay: document.getElementById('shopping-photo-camera-overlay'),
    photoCameraVideo: document.getElementById('shopping-photo-camera-video'),
    photoCameraStatus: document.getElementById('shopping-photo-camera-status'),
    capturePhoto: document.getElementById('shopping-capture-photo'),
    foundOverlay: document.getElementById('shopping-found-overlay'),
    foundContent: document.getElementById('shopping-found-content'),
    catalogOverlay: document.getElementById('shopping-catalog-overlay'),
    catalogSearch: document.getElementById('shopping-catalog-search'),
    catalogList: document.getElementById('shopping-catalog-list'),
    marketMode: document.getElementById('shopping-market-mode'),
  };

  function openOverlay(element) {
    element.hidden = false;
    document.body.classList.add('shopping-modal-open');
  }

  async function closeOverlay(element) {
    if (element === elements.scannerOverlay) await state.scanner.stop();
    if (element === elements.photoCameraOverlay) await state.photoCamera.stop();
    element.hidden = true;
    if (![elements.scannerOverlay, elements.productOverlay, elements.photoCameraOverlay, elements.foundOverlay, elements.catalogOverlay].some((overlay) => !overlay.hidden)) {
      document.body.classList.remove('shopping-modal-open');
    }
  }

  function getProduct(barcode) {
    return state.products.get(String(barcode));
  }

  function getItem(barcode) {
    return state.items.find((item) => String(item.barcode || item.id) === String(barcode));
  }

  function productImage(product, className = '') {
    if (product?.photoDataUrl) return `<img class="${className}" src="${product.photoDataUrl}" alt="${escapeHtml(product.name)}" />`;
    return `<span class="shopping-product-fallback ${className}" aria-hidden="true">📦</span>`;
  }

  function getUnitLabel(unit) {
    const labels = {
      unidade: 'Unidade',
      pacote: 'Pacote',
      caixa: 'Caixa',
      garrafa: 'Garrafa',
      kg: 'Kg',
    };

    return labels[String(unit || '').toLowerCase()] || String(unit || 'Unidade');
  }

  function getCategoryLabel(product) {
    return String(product?.category || '').trim() || 'Sem categoria';
  }

  function groupByCategory(entries, getEntryProduct) {
    const groups = new Map();

    entries.forEach((entry) => {
      const product = getEntryProduct(entry) || {};
      const category = getCategoryLabel(product);

      if (!groups.has(category)) {
        groups.set(category, []);
      }

      groups.get(category).push(entry);
    });

    return [...groups.entries()]
      .sort(([categoryA], [categoryB]) =>
        categoryA.localeCompare(categoryB, 'pt-BR', {
          sensitivity: 'base',
        }),
      )
      .map(([category, categoryEntries]) => ({
        category,

        entries: categoryEntries.sort((entryA, entryB) => {
          const productA = getEntryProduct(entryA) || {};
          const productB = getEntryProduct(entryB) || {};

          return String(productA.name || '').localeCompare(String(productB.name || ''), 'pt-BR', { sensitivity: 'base' });
        }),
      }));
  }

  function renderCategoryGroup(category, entries, renderEntry, className = '') {
    return `
    <section class="shopping-category-group ${className}">
      <div class="shopping-category-title">
        <strong>${escapeHtml(category)}</strong>
        <span>${entries.length}</span>
      </div>

      <div class="shopping-category-items">
        ${entries.map(renderEntry).join('')}
      </div>
    </section>`;
  }

  function renderShoppingItem(item) {
    const product = getProduct(item.barcode) || {
      name: 'Produto não cadastrado',
      category: '',
      unit: 'unidade',
    };

    return `
    <article class="shopping-item ${item.checked ? 'is-checked' : ''}" data-barcode="${escapeHtml(item.barcode)}">
      <button
        type="button"
        class="shopping-check"
        data-action="toggle"
        aria-label="${item.checked ? 'Desmarcar' : 'Marcar como comprado'}"
      >${item.checked ? '✓' : ''}</button>

      ${productImage(product, 'shopping-item-photo')}

      <div class="shopping-item-copy">
        <strong>${escapeHtml(product.name)}</strong>

        <small>
          ${escapeHtml(product.category || 'Sem categoria')}
          · ${escapeHtml(getUnitLabel(product.unit))}
          · ${escapeHtml(item.barcode)}
        </small>

        <input
          class="shopping-item-note"
          data-action="note"
          value="${escapeHtml(item.note || '')}"
          placeholder="Observação opcional"
          aria-label="Observação de ${escapeHtml(product.name)}"
        />
      </div>

      <div class="shopping-quantity" aria-label="Quantidade">
        <button type="button" data-action="decrease">−</button>
        <b>${Number(item.quantity) || 1}</b>
        <button type="button" data-action="increase">＋</button>
      </div>

      <button
        type="button"
        class="shopping-item-remove"
        data-action="remove"
        title="Remover da lista"
      >✕</button>
    </article>`;
  }

  function renderShoppingGroup(title, items, className = '') {
    if (!items.length) return '';

    const categoryGroups = groupByCategory(items, (item) => getProduct(item.barcode));

    return `
    <section class="shopping-list-group ${className}">
      <div class="shopping-list-group-title">
        <strong>${title}</strong>
        <span>${items.length}</span>
      </div>

      <div class="shopping-list-group-items">
        ${categoryGroups.map(({ category, entries }) => renderCategoryGroup(category, entries, renderShoppingItem, 'shopping-list-category')).join('')}
      </div>
    </section>`;
  }

  function renderList() {
    const query = elements.listSearch.value.trim().toLocaleLowerCase('pt-BR');
    const sorted = [...state.items].sort((a, b) => Number(a.checked) - Number(b.checked) || String(a.barcode).localeCompare(String(b.barcode)));
    const visible = sorted.filter((item) => {
      const product = getProduct(item.barcode) || {};
      const text = `
      ${product.name || ''}
      ${product.category || ''}
      ${getUnitLabel(product.unit)}
      ${item.note || ''}
      ${item.barcode || ''}
    `.toLocaleLowerCase('pt-BR');
      return !query || text.includes(query);
    });

    const pendingItems = visible.filter((item) => !item.checked);
    const purchasedItems = visible.filter((item) => item.checked);

    elements.list.innerHTML = [renderShoppingGroup('Pendentes', pendingItems, 'is-pending'), renderShoppingGroup('Comprados', purchasedItems, 'is-purchased')].join('');

    elements.empty.hidden = state.items.length > 0;
    elements.list.hidden = state.items.length === 0;
    elements.listCount.textContent = `${state.items.length} ${state.items.length === 1 ? 'produto' : 'produtos'}`;

    const purchased = state.items.filter((item) => item.checked).length;
    const total = state.items.length;
    const pending = total - purchased;
    elements.progressLabel.textContent = total ? `${purchased} de ${total} comprados` : 'Lista vazia';
    elements.progressDetail.textContent = total ? `${pending} ${pending === 1 ? 'produto pendente' : 'produtos pendentes'}` : 'Cadastre ou escaneie um produto para começar.';
    elements.progressFill.style.width = `${total ? (purchased / total) * 100 : 0}%`;

    navButton.dataset.count = String(pending);
    navButton.classList.toggle('has-items', pending > 0);
  }

  function renderCatalogProduct(product) {
    return `
    <article
      class="shopping-catalog-item"
      data-barcode="${escapeHtml(product.barcode)}"
    >
      ${productImage(product, 'shopping-catalog-photo')}

      <div>
        <strong>${escapeHtml(product.name)}</strong>

        <small>
          ${escapeHtml(getUnitLabel(product.unit))}
          · ${escapeHtml(product.barcode)}
        </small>
      </div>

      <div class="shopping-catalog-actions">
        <button
          type="button"
          class="action-btn"
          data-catalog-action="edit"
        >
          Editar
        </button>

        <button
          type="button"
          class="btn-primary"
          data-catalog-action="add"
        >
          Adicionar
        </button>

        <button
          type="button"
          class="action-btn danger shopping-catalog-delete"
          data-catalog-action="delete"
        >
          Excluir
        </button>
      </div>
    </article>`;
  }

  function renderCatalog() {
    const query = elements.catalogSearch.value.trim().toLocaleLowerCase('pt-BR');

    const products = [...state.products.values()].filter((product) => {
      const text = `
      ${product.name}
      ${product.category}
      ${getUnitLabel(product.unit)}
      ${product.barcode}
    `.toLocaleLowerCase('pt-BR');

      return !query || text.includes(query);
    });

    const categoryGroups = groupByCategory(products, (product) => product);

    elements.catalogList.innerHTML = products.length
      ? categoryGroups.map(({ category, entries }) => renderCategoryGroup(category, entries, renderCatalogProduct, 'shopping-catalog-category')).join('')
      : `
      <div class="shopping-empty compact">
        <span>📦</span>
        <strong>Nenhum produto encontrado</strong>
      </div>`;
  }

  async function addProductToList(product, increment = null) {
    const current = getItem(product.barcode);
    const quantityToAdd = Math.max(1, Number(increment ?? product.defaultQuantity) || 1);
    await window.ShoppingAPI.saveActiveItem({
      barcode: product.barcode,
      quantity: current ? Number(current.quantity || 1) + quantityToAdd : quantityToAdd,
      checked: false,
      note: current?.note || '',
      addedAt: current?.addedAt,
    });
    notify(current ? 'Quantidade atualizada na lista.' : 'Produto adicionado à lista.');
  }

  async function deleteRegisteredProduct(product, overlayToClose = null) {
    const activeItem = getItem(product.barcode);
    const activeListWarning = activeItem ? '\n\nEle também será removido da lista atual para não deixar um item sem cadastro.' : '';
    const confirmed = await askConfirmation(`Excluir permanentemente "${product.name}" do catálogo?${activeListWarning}`);
    if (!confirmed) return false;

    await window.ShoppingAPI.deleteProduct(product.barcode, {
      removeFromActiveList: Boolean(activeItem),
    });

    if (overlayToClose) await closeOverlay(overlayToClose);
    notify('Produto excluído do catálogo.');
    return true;
  }

  async function handleCode(code, { fromScanner = false } = {}) {
    const validation = window.ShoppingBarcodeScanner.validateCode(code);
    if (!validation.valid) {
      elements.scannerStatus.textContent = validation.reason;
      if (!fromScanner) notify(validation.reason, 'error');
      return false;
    }
    const barcode = validation.code;
    await closeOverlay(elements.scannerOverlay);
    const product = getProduct(barcode) || (await window.ShoppingAPI.getProduct(barcode));
    if (product) openFoundProduct(product);
    else openProductForm({ barcode, addAfterSave: true });
    return true;
  }

  function openFoundProduct(product) {
    elements.foundContent.innerHTML = `
      <div class="shopping-found-product">
        ${productImage(product, 'shopping-found-photo')}
        <div><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.category || 'Sem categoria')}</small><code>${escapeHtml(product.barcode)}</code></div>
      </div>
      <div class="shopping-modal-actions shopping-found-actions">
        <button type="button" class="action-btn" id="shopping-found-edit">Editar cadastro</button>
        <button type="button" class="btn-primary" id="shopping-found-add">Adicionar à lista</button>
        <button type="button" class="action-btn danger" id="shopping-found-delete">Excluir produto</button>
      </div>`;
    openOverlay(elements.foundOverlay);
    document.getElementById('shopping-found-edit').onclick = async () => {
      await closeOverlay(elements.foundOverlay);
      openProductForm({ product, addAfterSave: false });
    };
    document.getElementById('shopping-found-add').onclick = async () => {
      await addProductToList(product);
      await closeOverlay(elements.foundOverlay);
    };
    document.getElementById('shopping-found-delete').onclick = async () => {
      try {
        await deleteRegisteredProduct(product, elements.foundOverlay);
      } catch (error) {
        console.error(error);
        notify(error.message || 'Não foi possível excluir o produto.', 'error');
      }
    };
  }

  function resetPhoto(photoDataUrl = '') {
    state.pendingPhoto = photoDataUrl || '';
    elements.productPhoto.value = '';
    elements.productPhotoPreview.src = state.pendingPhoto;
    elements.productPhotoPreview.hidden = !state.pendingPhoto;
    elements.productPhotoPlaceholder.hidden = Boolean(state.pendingPhoto);
  }

  function openProductForm({ barcode = '', product = null, addAfterSave = true } = {}) {
    state.productFormMode = product ? 'edit' : 'create';
    state.addAfterSave = addAfterSave;
    state.editingOriginalBarcode = String(product?.barcode || '');
    const generatedManualCode = product?.isManual || String(product?.barcode || '').startsWith('manual-') ? '' : barcode || product?.barcode || '';
    elements.productFormTitle.textContent = product ? 'Editar produto' : 'Cadastrar produto';
    elements.productFormSubtitle.textContent = product ? 'Você pode corrigir os dados e o código de barras.' : barcode ? 'Este código ainda não existe na sua base.' : 'Cadastre um produto para reutilizar nas próximas listas.';
    elements.barcode.value = generatedManualCode;
    elements.barcode.readOnly = false;
    elements.productName.value = product?.name || '';
    elements.productCategory.value = product?.category || '';
    elements.productUnit.value = product?.unit || 'unidade';
    elements.productDefaultQuantity.value = Math.max(1, Number(product?.defaultQuantity) || 1);
    document.getElementById('shopping-save-add').textContent = product ? 'Salvar alterações' : 'Salvar e adicionar';
    document.getElementById('shopping-save-only').hidden = Boolean(product);
    resetPhoto(product?.photoDataUrl || '');
    openOverlay(elements.productOverlay);
    setTimeout(() => elements.productName.focus(), 80);
  }

  async function saveProduct({ addToList }) {
    const rawBarcode = window.ShoppingBarcodeScanner.normalizeCode(elements.barcode.value);
    const originalBarcode = String(state.editingOriginalBarcode || '');
    const originalWasManual = originalBarcode.startsWith('manual-');
    let barcode = rawBarcode;
    let isManual = !barcode;

    if (barcode) {
      const validation = window.ShoppingBarcodeScanner.validateCode(barcode);
      if (!validation.valid) return notify(validation.reason, 'error');
      barcode = validation.code;
    } else if (state.productFormMode === 'edit' && originalWasManual) {
      barcode = originalBarcode;
      isManual = true;
    } else {
      barcode = `manual-${crypto.randomUUID?.() || Date.now()}`;
      isManual = true;
    }

    const name = elements.productName.value.trim();
    if (!name) return notify('Informe o nome do produto.', 'error');

    if (state.productFormMode === 'edit' && originalBarcode && originalBarcode !== barcode) {
      const existing = getProduct(barcode) || (await window.ShoppingAPI.getProduct(barcode));
      if (existing) return notify('Já existe outro produto com este código de barras.', 'error');
    }

    const product = {
      barcode,
      name,
      category: elements.productCategory.value.trim(),
      unit: elements.productUnit.value,
      defaultQuantity: Math.max(1, Number(elements.productDefaultQuantity.value) || 1),
      photoDataUrl: state.pendingPhoto,
      isManual,
    };

    await window.ShoppingAPI.saveProduct(product);

    if (state.productFormMode === 'edit' && originalBarcode && originalBarcode !== barcode) {
      const currentItem = getItem(originalBarcode);
      if (currentItem) {
        await window.ShoppingAPI.saveActiveItem({ ...currentItem, barcode });
        await window.ShoppingAPI.deleteActiveItem(originalBarcode);
      }
      await window.ShoppingAPI.deleteProduct(originalBarcode);
    }

    if (addToList) await addProductToList(product);
    await closeOverlay(elements.productOverlay);
    notify(state.productFormMode === 'edit' ? 'Produto atualizado.' : 'Produto cadastrado.');
  }

  async function compressImage(file) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
    const maxSize = 720;
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  }

  async function openPhotoCamera() {
    openOverlay(elements.photoCameraOverlay);
    elements.capturePhoto.disabled = true;
    elements.photoCameraStatus.textContent = 'Preparando câmera...';
    try {
      await state.photoCamera.start(elements.photoCameraVideo, {
        onStatus: (message) => (elements.photoCameraStatus.textContent = message),
      });
      elements.photoCameraStatus.textContent = 'Câmera pronta. Posicione o produto e capture a foto.';
      elements.capturePhoto.disabled = false;
    } catch (error) {
      console.error(error);
      elements.photoCameraStatus.textContent = error.message || 'Não foi possível abrir a câmera.';
    }
  }

  async function openScanner() {
    openOverlay(elements.scannerOverlay);
    elements.scannerStatus.textContent = 'Preparando câmera...';
    try {
      await state.scanner.start(elements.scannerVideo, {
        onDetected: (code) => handleCode(code, { fromScanner: true }),
        onRejected: (validation) => {
          elements.scannerStatus.textContent = `Código ignorado: ${validation.reason}`;
        },
        onStatus: (message) => (elements.scannerStatus.textContent = message),
      });
    } catch (error) {
      elements.scannerStatus.textContent = error.message;
      elements.manualCode.focus();
    }
  }

  async function toggleMarketMode() {
    state.marketMode = !state.marketMode;
    view.classList.toggle('is-market-mode', state.marketMode);
    elements.marketMode.textContent = state.marketMode ? '↩ Sair do modo mercado' : '🛍️ Modo mercado';
    if (state.marketMode) {
      try {
        state.wakeLock = await navigator.wakeLock?.request('screen');
      } catch (error) {
        console.warn('Não foi possível manter a tela ligada.', error);
      }
    } else {
      await state.wakeLock?.release?.();
      state.wakeLock = null;
    }
  }

  function initializeData() {
    if (state.initialized || !window.auth?.currentUser) return;
    state.initialized = true;
    const onError = (error) => {
      console.error(error);
      notify('Não foi possível carregar a área de compras. Verifique as regras do Firebase.', 'error');
    };
    state.unsubscribers.push(
      window.ShoppingAPI.listenProducts((products) => {
        state.products = new Map(products.map((product) => [String(product.barcode || product.id), product]));
        renderList();
        renderCatalog();
      }, onError),
    );
    state.unsubscribers.push(
      window.ShoppingAPI.listenActiveItems((items) => {
        state.items = items.map((item) => ({ ...item, barcode: String(item.barcode || item.id) }));
        renderList();
      }, onError),
    );
  }

  navButton.addEventListener('click', () => {
    document.body.classList.add('shopping-view-active');
    initializeData();
  });
  document.querySelectorAll('.nav-btn:not([data-view="shopping"])').forEach((button) => button.addEventListener('click', () => document.body.classList.remove('shopping-view-active')));

  document.getElementById('shopping-scan-button').addEventListener('click', openScanner);
  document.getElementById('shopping-register-button').addEventListener('click', () => openProductForm({ addAfterSave: true }));
  document.getElementById('shopping-catalog-button').addEventListener('click', () => {
    renderCatalog();
    openOverlay(elements.catalogOverlay);
  });
  document.getElementById('shopping-market-mode').addEventListener('click', toggleMarketMode);
  document.getElementById('shopping-clear-purchased').addEventListener('click', async () => {
    const purchased = state.items.filter((item) => item.checked).length;
    if (!purchased) return notify('Nenhum produto marcado como comprado.', 'error');
    if (!confirm(`Remover ${purchased} produto(s) comprado(s) da lista?`)) return;
    await window.ShoppingAPI.clearPurchased(state.items);
    notify('Produtos comprados removidos da lista.');
  });

  elements.listSearch.addEventListener('input', renderList);
  elements.catalogSearch.addEventListener('input', renderCatalog);
  elements.manualCodeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleCode(elements.manualCode.value, { fromScanner: false });
  });
  elements.barcode.addEventListener('input', () => {
    const digitsOnly = elements.barcode.value.replace(/\D/g, '').slice(0, 14);
    if (elements.barcode.value !== digitsOnly) elements.barcode.value = digitsOnly;
  });

  elements.productForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await saveProduct({ addToList: state.addAfterSave && state.productFormMode !== 'edit' });
    } catch (error) {
      console.error(error);
      notify(error.message || 'Não foi possível salvar o produto.', 'error');
    }
  });
  document.getElementById('shopping-save-only').addEventListener('click', async () => {
    try {
      await saveProduct({ addToList: false });
    } catch (error) {
      console.error(error);
      notify(error.message || 'Não foi possível salvar o produto.', 'error');
    }
  });
  elements.openPhotoCamera.addEventListener('click', openPhotoCamera);
  elements.openPhotoCameraSecondary.addEventListener('click', openPhotoCamera);
  elements.capturePhoto.addEventListener('click', async () => {
    try {
      state.pendingPhoto = state.photoCamera.capture();
      resetPhoto(state.pendingPhoto);
      await closeOverlay(elements.photoCameraOverlay);
      notify('Foto capturada.');
    } catch (error) {
      console.error(error);
      elements.photoCameraStatus.textContent = error.message || 'Não foi possível capturar a foto.';
    }
  });

  elements.productPhoto.addEventListener('change', async () => {
    const file = elements.productPhoto.files?.[0];
    if (!file) return;
    try {
      state.pendingPhoto = await compressImage(file);
      elements.productPhotoPreview.src = state.pendingPhoto;
      elements.productPhotoPreview.hidden = false;
      elements.productPhotoPlaceholder.hidden = true;
    } catch (error) {
      console.error(error);
      notify('Não foi possível preparar a foto.', 'error');
    }
  });

  elements.list.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    const article = event.target.closest('.shopping-item');
    if (!action || !article) return;
    const item = getItem(article.dataset.barcode);
    if (!item) return;
    try {
      if (action === 'toggle') await window.ShoppingAPI.saveActiveItem({ ...item, checked: !item.checked });
      if (action === 'increase') await window.ShoppingAPI.saveActiveItem({ ...item, quantity: Number(item.quantity || 1) + 1 });
      if (action === 'decrease') {
        const next = Number(item.quantity || 1) - 1;
        if (next < 1) await window.ShoppingAPI.deleteActiveItem(item.barcode);
        else await window.ShoppingAPI.saveActiveItem({ ...item, quantity: next });
      }
      if (action === 'remove') await window.ShoppingAPI.deleteActiveItem(item.barcode);
    } catch (error) {
      console.error(error);
      notify('Não foi possível atualizar a lista.', 'error');
    }
  });
  elements.list.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-action="note"]');
    if (!input) return;
    const article = input.closest('.shopping-item');
    const item = getItem(article.dataset.barcode);
    if (item) await window.ShoppingAPI.saveActiveItem({ ...item, note: input.value });
  });

  elements.catalogList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-catalog-action]');
    const article = event.target.closest('.shopping-catalog-item');
    if (!button || !article) return;
    const product = getProduct(article.dataset.barcode);
    if (!product) return;
    try {
      if (button.dataset.catalogAction === 'add') await addProductToList(product);
      if (button.dataset.catalogAction === 'edit') {
        await closeOverlay(elements.catalogOverlay);
        openProductForm({ product, addAfterSave: false });
      }
      if (button.dataset.catalogAction === 'delete') {
        button.disabled = true;
        await deleteRegisteredProduct(product);
      }
    } catch (error) {
      console.error(error);
      button.disabled = false;
      notify(error.message || 'Não foi possível atualizar o produto.', 'error');
    }
  });

  document.querySelectorAll('.shopping-modal-close').forEach((button) =>
    button.addEventListener('click', () => {
      const target = button.dataset.close;
      const overlay = {
        scanner: elements.scannerOverlay,
        product: elements.productOverlay,
        photoCamera: elements.photoCameraOverlay,
        found: elements.foundOverlay,
        catalog: elements.catalogOverlay,
      }[target];
      if (overlay) closeOverlay(overlay);
    }),
  );
  document.querySelectorAll('.shopping-overlay').forEach((overlay) =>
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeOverlay(overlay);
    }),
  );

  window.auth?.onAuthStateChanged((user) => {
    if (user) initializeData();
    else {
      state.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
      state.unsubscribers = [];
      state.initialized = false;
      state.products.clear();
      state.items = [];
      renderList();
    }
  });

  renderList();
})();
