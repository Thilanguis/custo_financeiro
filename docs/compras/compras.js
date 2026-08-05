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
    photoChanged: false,
    photoCompactionRunning: false,
    editingProduct: null,
    pendingScanMetadata: null,
    pendingScannerContent: null,
    scannerSmallCodeMode: false,
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
          <div><strong>Escanear produto</strong><small>EAN, UPC, Code 128, QR Code e Data Matrix.</small></div>
          <button type="button" class="action-btn shopping-modal-close" data-close="scanner">✕</button>
        </div>
        <div class="shopping-camera-frame" id="shopping-scanner-frame">
          <video id="shopping-scanner-video" muted></video>
          <div class="shopping-camera-guide"><span></span></div>
        </div>
        <div class="shopping-scanner-controls" aria-label="Controles da câmera">
          <button type="button" class="action-btn" id="shopping-scanner-focus">◎ Focar</button>
          <button type="button" class="action-btn" id="shopping-scanner-switch-camera">↻ Câmera</button>
          <label class="shopping-small-code-toggle"><input type="checkbox" id="shopping-scanner-small-code" /> Código pequeno</label>
        </div>
        <label class="shopping-scanner-zoom" id="shopping-scanner-zoom-wrap" hidden>
          <span>Zoom <output id="shopping-scanner-zoom-value">1,0×</output></span>
          <input type="range" id="shopping-scanner-zoom" min="1" max="1" step="0.1" value="1" />
        </label>
        <p id="shopping-scanner-status" class="shopping-scanner-status">Preparando câmera...</p>
        <div class="shopping-code-content" id="shopping-code-content" hidden>
          <strong id="shopping-code-content-title">QR Code detectado</strong>
          <code id="shopping-code-content-value"></code>
          <small id="shopping-code-content-help">Este conteúdo não possui um GTIN/EAN reconhecido.</small>
          <div class="shopping-code-content-actions">
            <button type="button" class="action-btn" id="shopping-code-content-copy">Copiar</button>
            <button type="button" class="action-btn" id="shopping-code-content-continue">Continuar lendo</button>
            <button type="button" class="btn-primary" id="shopping-code-content-use">Usar este código</button>
          </div>
        </div>
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
                <button type="button" class="action-btn danger" id="shopping-remove-photo" hidden>Remover</button>
              </div>
              <small id="shopping-photo-size-status" class="shopping-photo-size-status">Fotos são compactadas e salvas no Firestore do plano Spark.</small>
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
        <div class="shopping-catalog-toolbar">
          <input type="search" id="shopping-catalog-search" class="list-search" placeholder="Buscar produto..." />
          <button type="button" class="action-btn" id="shopping-compact-photos" hidden>🗜️ Compactar fotos antigas</button>
        </div>
        <p class="shopping-photo-maintenance-status" id="shopping-photo-maintenance-status" hidden></p>
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
    scannerFrame: document.getElementById('shopping-scanner-frame'),
    scannerStatus: document.getElementById('shopping-scanner-status'),
    scannerFocus: document.getElementById('shopping-scanner-focus'),
    scannerSwitchCamera: document.getElementById('shopping-scanner-switch-camera'),
    scannerSmallCode: document.getElementById('shopping-scanner-small-code'),
    scannerZoomWrap: document.getElementById('shopping-scanner-zoom-wrap'),
    scannerZoom: document.getElementById('shopping-scanner-zoom'),
    scannerZoomValue: document.getElementById('shopping-scanner-zoom-value'),
    codeContent: document.getElementById('shopping-code-content'),
    codeContentTitle: document.getElementById('shopping-code-content-title'),
    codeContentValue: document.getElementById('shopping-code-content-value'),
    codeContentHelp: document.getElementById('shopping-code-content-help'),
    codeContentCopy: document.getElementById('shopping-code-content-copy'),
    codeContentContinue: document.getElementById('shopping-code-content-continue'),
    codeContentUse: document.getElementById('shopping-code-content-use'),
    manualCodeForm: document.getElementById('shopping-manual-code-form'),
    manualCode: document.getElementById('shopping-manual-code'),
    productOverlay: document.getElementById('shopping-product-overlay'),
    productForm: document.getElementById('shopping-product-form'),
    productFormTitle: document.getElementById('shopping-product-form-title'),
    productFormSubtitle: document.getElementById('shopping-product-form-subtitle'),
    barcode: document.getElementById('shopping-product-barcode'),
    barcodeHelp: document.getElementById('shopping-barcode-help'),
    productName: document.getElementById('shopping-product-name'),
    productCategory: document.getElementById('shopping-product-category'),
    productUnit: document.getElementById('shopping-product-unit'),
    productDefaultQuantity: document.getElementById('shopping-product-default-quantity'),
    productPhoto: document.getElementById('shopping-product-photo'),
    productPhotoPreview: document.getElementById('shopping-product-photo-preview'),
    productPhotoPlaceholder: document.getElementById('shopping-product-photo-placeholder'),
    photoSizeStatus: document.getElementById('shopping-photo-size-status'),
    removePhoto: document.getElementById('shopping-remove-photo'),
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
    compactPhotos: document.getElementById('shopping-compact-photos'),
    photoMaintenanceStatus: document.getElementById('shopping-photo-maintenance-status'),
    marketMode: document.getElementById('shopping-market-mode'),
  };

  function openOverlay(element) {
    element.hidden = false;
    document.body.classList.add('shopping-modal-open');
  }

  async function closeOverlay(element) {
    if (element === elements.scannerOverlay) {
      await state.scanner.stop();
      hideScannerContent();
    }
    if (element === elements.productOverlay) state.pendingScanMetadata = null;
    if (element === elements.photoCameraOverlay) await state.photoCamera.stop();
    element.hidden = true;
    if (![elements.scannerOverlay, elements.productOverlay, elements.photoCameraOverlay, elements.foundOverlay, elements.catalogOverlay].some((overlay) => !overlay.hidden)) {
      document.body.classList.remove('shopping-modal-open');
    }
  }

  function getProduct(barcode) {
    return state.products.get(String(barcode));
  }

  function getProductByScan(decoded = {}) {
    const identifiers = new Set([decoded.code, decoded.identifier, ...(decoded.identifiers || [])].filter(Boolean).map(String));
    for (const identifier of identifiers) {
      const direct = getProduct(identifier);
      if (direct) return direct;
    }

    const normalizedValue = String(decoded.normalizedValue || '');
    for (const product of state.products.values()) {
      const productIdentifiers = new Set([
        product.barcode,
        product.scanFingerprint,
        ...(Array.isArray(product.scanIdentifiers) ? product.scanIdentifiers : []),
      ].filter(Boolean).map(String));
      if ([...identifiers].some((identifier) => productIdentifiers.has(identifier))) return product;
      if (normalizedValue && String(product.scanNormalizedValue || '') === normalizedValue) return product;
      if (normalizedValue && product.scanRawValue && window.ShoppingBarcodeScanner.normalizeContentForIdentifier(product.scanRawValue) === normalizedValue) return product;
      if (decoded.code && product.scanRawValue) {
        const extracted = window.ShoppingBarcodeScanner.extractProductCode(product.scanRawValue, product.scanFormat || 'unknown');
        if (extracted?.code === String(decoded.code)) return product;
      }
    }
    return null;
  }

  function getItem(barcode) {
    return state.items.find((item) => String(item.barcode || item.id) === String(barcode));
  }

  function productImage(product, className = '') {
    const photoSource = window.ShoppingPhotoStorage?.getProductPhotoSource(product) || product?.photoUrl || product?.photoDataUrl || '';
    if (photoSource) return `<img class="${className}" src="${escapeHtml(photoSource)}" alt="${escapeHtml(product.name)}" />`;
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
    const photosToCompact = [...state.products.values()].filter((product) =>
      window.ShoppingPhotoStorage?.isDataUrl(product.photoDataUrl)
      && product.photoStorageMode !== 'firestore-data-url-v2',
    );
    elements.compactPhotos.hidden = photosToCompact.length === 0;
    if (photosToCompact.length > 0 && !state.photoCompactionRunning) {
      elements.compactPhotos.textContent = `🗜️ Compactar ${photosToCompact.length} foto${photosToCompact.length === 1 ? '' : 's'} antiga${photosToCompact.length === 1 ? '' : 's'}`;
    }

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

  function formatZoomValue(value) {
    return `${Number(value || 1).toFixed(1).replace('.', ',')}×`;
  }

  function updateScannerControls(capabilities = {}) {
    const zoom = capabilities.zoom;
    elements.scannerFocus.disabled = !capabilities.canFocus;
    elements.scannerFocus.title = capabilities.canFocus ? 'Pedir para a câmera refazer o foco' : 'Foco manual não disponível nesta câmera';
    elements.scannerSwitchCamera.disabled = Number(capabilities.cameraCount || 0) < 2;
    elements.scannerSwitchCamera.textContent = Number(capabilities.cameraCount || 0) > 1
      ? `↻ Câmera ${Number(capabilities.currentCameraIndex || 0) + 1}/${capabilities.cameraCount}`
      : '↻ Câmera';

    elements.scannerZoomWrap.hidden = !capabilities.canZoom || !zoom;
    if (capabilities.canZoom && zoom) {
      elements.scannerZoom.min = String(zoom.min);
      elements.scannerZoom.max = String(zoom.max);
      elements.scannerZoom.step = String(zoom.step || 0.1);
      elements.scannerZoom.value = String(zoom.value);
      elements.scannerZoomValue.textContent = formatZoomValue(zoom.value);
    }
  }

  function hideScannerContent({ resume = false } = {}) {
    state.pendingScannerContent = null;
    elements.codeContent.hidden = true;
    elements.codeContentValue.textContent = '';
    if (resume) state.scanner.resume();
  }

  function showScannerContent(decoded) {
    state.pendingScannerContent = decoded;
    const isDataMatrix = decoded.format === 'data_matrix';
    elements.codeContentTitle.textContent = isDataMatrix ? 'Data Matrix detectado' : 'QR Code detectado';
    elements.codeContentValue.textContent = decoded.rawValue;
    elements.codeContentHelp.textContent = decoded.isUrl
      ? 'O código contém um endereço. Ele não será aberto automaticamente.'
      : 'Nenhum GTIN/EAN/UPC válido foi encontrado. Você pode usar o conteúdo como identificador do produto.';
    elements.codeContent.hidden = false;
  }

  async function handleCode(code, { fromScanner = false, decoded = null } = {}) {
    const validation = window.ShoppingBarcodeScanner.validateCode(code);
    if (!validation.valid) {
      elements.scannerStatus.textContent = validation.reason;
      if (!fromScanner) notify(validation.reason, 'error');
      return false;
    }
    const barcode = validation.code;
    const scanLookup = decoded || { kind: 'product', code: barcode, identifier: barcode, identifiers: [barcode] };
    await closeOverlay(elements.scannerOverlay);
    const product = getProduct(barcode)
      || getProductByScan(scanLookup)
      || (await window.ShoppingAPI.getProduct(barcode))
      || (await window.ShoppingAPI.findProductByScan(scanLookup));
    if (product) openFoundProduct(product);
    else openProductForm({ barcode, addAfterSave: true, scanMetadata: decoded?.rawValue ? scanLookup : null });
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

  function updatePhotoSizeStatus(photoSource = '') {
    const status = window.ShoppingPhotoStorage?.getPhotoSizeStatus(photoSource) || {
      level: 'empty',
      message: 'Fotos são compactadas e salvas no Firestore do plano Spark.',
    };
    elements.photoSizeStatus.textContent = status.message;
    elements.photoSizeStatus.dataset.level = status.level;
  }

  function resetPhoto(photoSource = '', { changed = false } = {}) {
    state.pendingPhoto = photoSource || '';
    state.photoChanged = Boolean(changed);
    elements.productPhoto.value = '';
    elements.productPhotoPreview.src = state.pendingPhoto;
    elements.productPhotoPreview.hidden = !state.pendingPhoto;
    elements.productPhotoPlaceholder.hidden = Boolean(state.pendingPhoto);
    elements.removePhoto.hidden = !state.pendingPhoto;
    updatePhotoSizeStatus(state.pendingPhoto);
  }

  function openProductForm({ barcode = '', product = null, addAfterSave = true, scanMetadata = null } = {}) {
    state.productFormMode = product ? 'edit' : 'create';
    state.addAfterSave = addAfterSave;
    state.editingOriginalBarcode = String(product?.barcode || '');
    state.editingProduct = product || null;
    state.pendingScanMetadata = scanMetadata || (product?.scanRawValue ? {
      rawValue: product.scanRawValue,
      format: product.scanFormat || 'qr_code',
      identifier: product.scanFingerprint || product.barcode,
      identifiers: Array.isArray(product.scanIdentifiers) ? product.scanIdentifiers : [product.barcode],
      normalizedValue: product.scanNormalizedValue || window.ShoppingBarcodeScanner.normalizeContentForIdentifier(product.scanRawValue),
      isUrl: Boolean(product.scanIsUrl),
    } : null);

    const isScannedContent = Boolean(state.pendingScanMetadata?.identifier);
    const generatedManualCode = product?.isManual || String(product?.barcode || '').startsWith('manual-') ? '' : barcode || product?.barcode || '';
    elements.productFormTitle.textContent = product ? 'Editar produto' : 'Cadastrar produto';
    elements.productFormSubtitle.textContent = product
      ? isScannedContent ? 'Produto identificado por QR Code ou Data Matrix.' : 'Você pode corrigir os dados e o código de barras.'
      : isScannedContent ? 'Cadastre os dados do produto encontrado no código 2D.' : barcode ? 'Este código ainda não existe na sua base.' : 'Cadastre um produto para reutilizar nas próximas listas.';
    elements.barcode.value = isScannedContent ? state.pendingScanMetadata.identifier : generatedManualCode;
    elements.barcode.readOnly = isScannedContent;
    elements.barcode.inputMode = isScannedContent ? 'text' : 'numeric';
    elements.barcode.maxLength = isScannedContent ? 80 : 14;
    elements.barcodeHelp.textContent = isScannedContent
      ? `Identificador interno de ${state.pendingScanMetadata.format === 'data_matrix' ? 'Data Matrix' : 'QR Code'}. O conteúdo original será preservado.`
      : '8, 12, 13 ou 14 dígitos. O sistema confere o dígito verificador.';
    elements.productName.value = product?.name || '';
    elements.productCategory.value = product?.category || '';
    elements.productUnit.value = product?.unit || 'unidade';
    elements.productDefaultQuantity.value = Math.max(1, Number(product?.defaultQuantity) || 1);
    document.getElementById('shopping-save-add').textContent = product ? 'Salvar alterações' : 'Salvar e adicionar';
    document.getElementById('shopping-save-only').hidden = Boolean(product);
    resetPhoto(window.ShoppingPhotoStorage?.getProductPhotoSource(product) || product?.photoDataUrl || product?.photoUrl || '', {
      changed: false,
    });
    openOverlay(elements.productOverlay);
    setTimeout(() => elements.productName.focus(), 80);
  }

  async function saveProduct({ addToList }) {
    const rawBarcode = window.ShoppingBarcodeScanner.normalizeCode(elements.barcode.value);
    const originalBarcode = String(state.editingOriginalBarcode || '');
    const originalWasManual = originalBarcode.startsWith('manual-');
    const scannedIdentifier = String(state.pendingScanMetadata?.identifier || '');
    let barcode = rawBarcode;
    let isManual = !barcode;

    if (scannedIdentifier) {
      barcode = scannedIdentifier;
      isManual = false;
    } else if (barcode) {
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
      photoDataUrl: window.ShoppingPhotoStorage?.isDataUrl(state.pendingPhoto) ? state.pendingPhoto : '',
      photoUrl: !state.photoChanged ? String(state.editingProduct?.photoUrl || '') : '',
      photoStoragePath: !state.photoChanged ? String(state.editingProduct?.photoStoragePath || '') : '',
      photoChanged: state.photoChanged,
      isManual,
      scanRawValue: state.pendingScanMetadata?.rawValue || '',
      scanFormat: state.pendingScanMetadata?.format || '',
      scanIsUrl: Boolean(state.pendingScanMetadata?.isUrl),
      scanNormalizedValue: state.pendingScanMetadata?.normalizedValue || '',
      scanFingerprint: state.pendingScanMetadata?.identifier || '',
      scanIdentifiers: state.pendingScanMetadata?.identifiers || (state.pendingScanMetadata?.identifier ? [state.pendingScanMetadata.identifier] : []),
    };

    const savedPhoto = await window.ShoppingAPI.saveProduct(product);
    product.photoUrl = savedPhoto.photoUrl;
    product.photoStoragePath = savedPhoto.photoStoragePath;
    product.photoDataUrl = savedPhoto.photoDataUrl;

    if (state.productFormMode === 'edit' && originalBarcode && originalBarcode !== barcode) {
      const currentItem = getItem(originalBarcode);
      if (currentItem) {
        await window.ShoppingAPI.saveActiveItem({ ...currentItem, barcode });
        await window.ShoppingAPI.deleteActiveItem(originalBarcode);
      }
      await window.ShoppingAPI.deleteProduct(originalBarcode, { preservePhoto: true });
    }

    if (addToList) await addProductToList(product);
    state.pendingScanMetadata = null;
    await closeOverlay(elements.productOverlay);
    notify(state.productFormMode === 'edit' ? 'Produto atualizado.' : 'Produto cadastrado.');
  }

  async function loadPhotoImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não foi possível abrir a imagem selecionada.'));
      image.src = dataUrl;
    });
  }

  function renderCompressedPhoto(image, maxSize, quality) {
    const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function compressPhotoDataUrl(dataUrl) {
    if (!window.ShoppingPhotoStorage?.isDataUrl(dataUrl)) throw new Error('A foto não está em um formato válido.');
    const image = await loadPhotoImage(dataUrl);
    const targetBytes = window.ShoppingPhotoStorage.TARGET_FIRESTORE_PHOTO_BYTES;
    const maxBytes = window.ShoppingPhotoStorage.MAX_FIRESTORE_PHOTO_BYTES;
    const sizes = [720, 640, 560, 480, 400];
    const qualities = [0.68, 0.60, 0.52, 0.44, 0.36];
    const attemptedDimensions = new Set();
    let smallest = '';
    let smallestBytes = Number.POSITIVE_INFINITY;

    for (const maxSize of sizes) {
      const scale = Math.min(1, maxSize / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
      const dimensionKey = `${Math.round((image.naturalWidth || image.width) * scale)}x${Math.round((image.naturalHeight || image.height) * scale)}`;
      if (attemptedDimensions.has(dimensionKey)) continue;
      attemptedDimensions.add(dimensionKey);

      for (const quality of qualities) {
        const candidate = renderCompressedPhoto(image, maxSize, quality);
        const bytes = window.ShoppingPhotoStorage.getDataUrlSize(candidate);
        if (bytes < smallestBytes) {
          smallest = candidate;
          smallestBytes = bytes;
        }
        if (bytes <= targetBytes) return candidate;
      }
    }

    window.ShoppingPhotoStorage.validateFirestorePhoto(smallest, maxBytes);
    return smallest;
  }

  async function compressImage(file) {
    if (!String(file?.type || '').startsWith('image/')) throw new Error('O arquivo selecionado não é uma imagem.');
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      reader.readAsDataURL(file);
    });
    return compressPhotoDataUrl(dataUrl);
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
    hideScannerContent();
    elements.scannerStatus.textContent = 'Preparando câmera...';
    elements.scannerSmallCode.checked = state.scannerSmallCodeMode;
    elements.scannerFrame.classList.toggle('is-small-code-mode', state.scannerSmallCodeMode);
    updateScannerControls({});
    try {
      await state.scanner.start(elements.scannerVideo, {
        smallCodeMode: state.scannerSmallCodeMode,
        onDetected: (code, result, validation, decoded) => handleCode(code, { fromScanner: true, decoded }),
        onContent: showScannerContent,
        onRejected: (validation) => {
          elements.scannerStatus.textContent = `Código ignorado: ${validation?.reason || 'formato não reconhecido.'}`;
        },
        onStatus: (message) => (elements.scannerStatus.textContent = message),
        onCapabilities: updateScannerControls,
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
  elements.scannerFocus.addEventListener('click', async () => {
    try {
      await state.scanner.focus();
    } catch (error) {
      elements.scannerStatus.textContent = error.message || 'Não foi possível refazer o foco.';
    }
  });
  elements.scannerSwitchCamera.addEventListener('click', async () => {
    elements.scannerSwitchCamera.disabled = true;
    try {
      await state.scanner.switchCamera();
    } catch (error) {
      elements.scannerStatus.textContent = error.message || 'Não foi possível trocar de câmera.';
    }
  });
  elements.scannerSmallCode.addEventListener('change', async () => {
    state.scannerSmallCodeMode = elements.scannerSmallCode.checked;
    elements.scannerFrame.classList.toggle('is-small-code-mode', state.scannerSmallCodeMode);
    try {
      await state.scanner.setSmallCodeMode(state.scannerSmallCodeMode);
    } catch (error) {
      elements.scannerStatus.textContent = error.message || 'Não foi possível ativar o modo Código pequeno.';
    }
  });
  elements.scannerZoom.addEventListener('input', () => {
    elements.scannerZoomValue.textContent = formatZoomValue(elements.scannerZoom.value);
  });
  elements.scannerZoom.addEventListener('change', async () => {
    try {
      await state.scanner.setZoom(elements.scannerZoom.value);
    } catch (error) {
      elements.scannerStatus.textContent = error.message || 'Não foi possível aplicar o zoom.';
    }
  });
  elements.codeContentContinue.addEventListener('click', () => hideScannerContent({ resume: true }));
  elements.codeContentCopy.addEventListener('click', async () => {
    const rawValue = state.pendingScannerContent?.rawValue || '';
    if (!rawValue) return;
    try {
      await navigator.clipboard.writeText(rawValue);
      notify('Conteúdo copiado.');
    } catch (error) {
      console.error(error);
      elements.scannerStatus.textContent = 'Não foi possível copiar automaticamente. Selecione o conteúdo manualmente.';
    }
  });
  elements.codeContentUse.addEventListener('click', async () => {
    const decoded = state.pendingScannerContent;
    if (!decoded?.rawValue) return;
    const identifier = decoded.identifier || window.ShoppingBarcodeScanner.createContentIdentifier(decoded.rawValue);
    const scanMetadata = {
      ...decoded,
      identifier,
      normalizedValue: decoded.normalizedValue || window.ShoppingBarcodeScanner.normalizeContentForIdentifier(decoded.rawValue),
      identifiers: decoded.identifiers || window.ShoppingBarcodeScanner.getContentIdentifiers(decoded.rawValue, decoded.format),
    };
    try {
      const existing = getProductByScan(scanMetadata) || (await window.ShoppingAPI.findProductByScan(scanMetadata));
      await closeOverlay(elements.scannerOverlay);
      if (existing) openFoundProduct(existing);
      else openProductForm({ barcode: identifier, addAfterSave: true, scanMetadata });
    } catch (error) {
      console.error(error);
      elements.scannerStatus.textContent = error.message || 'Não foi possível usar este código.';
      state.scanner.resume();
    }
  });
  elements.barcode.addEventListener('input', () => {
    if (elements.barcode.readOnly || state.pendingScanMetadata?.identifier) return;
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
      const capturedPhoto = state.photoCamera.capture({ maxSize: 720, quality: 0.68 });
      const preparedPhoto = await compressPhotoDataUrl(capturedPhoto);
      resetPhoto(preparedPhoto, { changed: true });
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
      const preparedPhoto = await compressImage(file);
      resetPhoto(preparedPhoto, { changed: true });
    } catch (error) {
      console.error(error);
      notify(error.message || 'Não foi possível preparar a foto.', 'error');
    }
  });

  elements.removePhoto.addEventListener('click', () => {
    resetPhoto('', { changed: true });
    notify('A foto será removida ao salvar o produto.');
  });

  elements.compactPhotos.addEventListener('click', async () => {
    const candidates = [...state.products.values()].filter((product) =>
      window.ShoppingPhotoStorage?.isDataUrl(product.photoDataUrl)
      && product.photoStorageMode !== 'firestore-data-url-v2',
    );
    if (!candidates.length || state.photoCompactionRunning) return renderCatalog();

    const confirmed = await askConfirmation(
      `Compactar ${candidates.length} foto${candidates.length === 1 ? '' : 's'} antiga${candidates.length === 1 ? '' : 's'} dentro do Firestore?\n\nAs fotos originais só serão substituídas depois que cada versão compactada for salva com sucesso.`,
    );
    if (!confirmed) return;

    state.photoCompactionRunning = true;
    elements.compactPhotos.disabled = true;
    elements.photoMaintenanceStatus.hidden = false;
    let compacted = 0;
    const failures = [];

    try {
      for (let index = 0; index < candidates.length; index += 1) {
        const product = candidates[index];
        elements.photoMaintenanceStatus.textContent = `Compactando fotos: ${index + 1}/${candidates.length} • ${product.name || product.barcode}`;
        try {
          const compressedPhoto = await compressPhotoDataUrl(product.photoDataUrl);
          await window.ShoppingAPI.saveProduct({
            ...product,
            barcode: product.barcode || product.id,
            photoDataUrl: compressedPhoto,
            photoChanged: true,
          });
          compacted += 1;
        } catch (error) {
          console.error(`Não foi possível compactar a foto de ${product.name || product.barcode}:`, error);
          failures.push(product.name || product.barcode);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 20));
      }

      if (failures.length) {
        elements.photoMaintenanceStatus.textContent = `${compacted}/${candidates.length} fotos compactadas. ${failures.length} foto${failures.length === 1 ? '' : 's'} permaneceu${failures.length === 1 ? '' : 'ram'} intacta${failures.length === 1 ? '' : 's'} por falha.`;
        notify('Compactação concluída com algumas falhas. As fotos que falharam foram preservadas.', 'error');
      } else {
        elements.photoMaintenanceStatus.textContent = `${compacted} foto${compacted === 1 ? '' : 's'} compactada${compacted === 1 ? '' : 's'} no Firestore.`;
        notify('Fotos antigas compactadas sem usar Firebase Storage.');
      }
    } finally {
      state.photoCompactionRunning = false;
      elements.compactPhotos.disabled = false;
      renderCatalog();
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
