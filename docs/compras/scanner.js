// Scanner isolado da área financeira. Usa BarcodeDetector e ZXing como alternativa.
(() => {
  const SCAN_WARMUP_MS = 1400;
  const STABLE_CODE_MS = 900;
  const MIN_CONFIRMATIONS = 4;
  const MAX_CONFIRMATION_GAP_MS = 550;
  const STATUS_THROTTLE_MS = 180;
  const DEFAULT_GUIDE_BOUNDS = Object.freeze({ left: 0.21, right: 0.79, top: 0.4, bottom: 0.6 });
  const SMALL_GUIDE_BOUNDS = Object.freeze({ left: 0.27, right: 0.73, top: 0.36, bottom: 0.64 });
  const NATIVE_FORMATS = Object.freeze(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'qr_code', 'data_matrix']);
  const TWO_DIMENSIONAL_FORMATS = new Set(['qr_code', 'data_matrix', 'aztec', 'pdf417']);

  class ShoppingBarcodeScanner {
    constructor() {
      this.camera = new window.ShoppingCameraCapture();
      this.video = null;
      this.detector = null;
      this.zxingReader = null;
      this.zxingControls = null;
      this.running = false;
      this.animationFrame = null;
      this.lastCode = '';
      this.lastDetectedAt = 0;
      this.onDetected = null;
      this.onContent = null;
      this.onRejected = null;
      this.onStatus = null;
      this.onCapabilities = null;
      this.readyAt = 0;
      this.detectionLocked = false;
      this.candidateCode = '';
      this.candidateStartedAt = 0;
      this.candidateLastSeenAt = 0;
      this.candidateConfirmations = 0;
      this.lastStatus = '';
      this.lastStatusAt = 0;
      this.smallCodeMode = false;
      this.startOptions = null;
      this.cropCanvas = null;
      this.cropContext = null;
    }

    static normalizeCode(value) {
      return String(value || '').replace(/\s+/g, '').trim();
    }

    static normalizeFormat(value) {
      const normalized = String(value ?? '')
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/[\s-]+/g, '_')
        .toLowerCase();
      const aliases = {
        ean13: 'ean_13',
        ean8: 'ean_8',
        upca: 'upc_a',
        upce: 'upc_e',
        code128: 'code_128',
        qrcode: 'qr_code',
        qr: 'qr_code',
        datamatrix: 'data_matrix',
        data_matrix_code: 'data_matrix',
      };
      return aliases[normalized] || normalized || 'unknown';
    }

    static getAllowedLengths() {
      return [8, 12, 13, 14];
    }

    static getFormatName(length) {
      return ({ 8: 'GTIN-8', 12: 'UPC-A', 13: 'EAN-13', 14: 'GTIN-14' })[length] || 'GTIN';
    }

    static calculateCheckDigit(body) {
      const digits = [...String(body)].map(Number);
      let sum = 0;
      let multiplyByThree = true;
      for (let index = digits.length - 1; index >= 0; index -= 1) {
        sum += digits[index] * (multiplyByThree ? 3 : 1);
        multiplyByThree = !multiplyByThree;
      }
      return (10 - (sum % 10)) % 10;
    }

    static expandUpcE(value) {
      const code = ShoppingBarcodeScanner.normalizeCode(value);
      if (!/^[01]\d{7}$/.test(code)) return '';
      const numberSystem = code[0];
      const digits = code.slice(1, 7);
      const checkDigit = code[7];
      const last = digits[5];
      let body = '';

      if (['0', '1', '2'].includes(last)) body = `${numberSystem}${digits.slice(0, 2)}${last}0000${digits.slice(2, 5)}`;
      else if (last === '3') body = `${numberSystem}${digits.slice(0, 3)}00000${digits.slice(3, 5)}`;
      else if (last === '4') body = `${numberSystem}${digits.slice(0, 4)}00000${digits[4]}`;
      else body = `${numberSystem}${digits.slice(0, 5)}0000${last}`;

      return `${body}${checkDigit}`;
    }

    static validateCode(value, { format = 'unknown' } = {}) {
      const code = ShoppingBarcodeScanner.normalizeCode(value);
      if (!code) return { valid: false, code, reason: 'Informe o código de barras.' };
      if (!/^\d+$/.test(code)) return { valid: false, code, reason: 'O código deve conter somente números.' };
      if (!ShoppingBarcodeScanner.getAllowedLengths().includes(code.length)) {
        return { valid: false, code, reason: 'Use um código com 8, 12, 13 ou 14 dígitos.' };
      }

      const normalizedFormat = ShoppingBarcodeScanner.normalizeFormat(format);
      const informedCheckDigit = Number(code.at(-1));
      const expectedCheckDigit = ShoppingBarcodeScanner.calculateCheckDigit(code.slice(0, -1));
      const regularGtinIsValid = informedCheckDigit === expectedCheckDigit;

      if (code.length === 8 && (normalizedFormat === 'upc_e' || !regularGtinIsValid)) {
        const expandedUpcA = ShoppingBarcodeScanner.expandUpcE(code);
        if (expandedUpcA) {
          const upcExpected = ShoppingBarcodeScanner.calculateCheckDigit(expandedUpcA.slice(0, -1));
          if (Number(expandedUpcA.at(-1)) === upcExpected) {
            return { valid: true, code, format: 'UPC-E', expandedUpcA };
          }
        }
        if (normalizedFormat === 'upc_e') {
          return { valid: false, code, reason: 'Dígito verificador UPC-E inválido. Confira se o código foi lido inteiro.' };
        }
      }

      if (!regularGtinIsValid) {
        return {
          valid: false,
          code,
          reason: 'Dígito verificador inválido. Confira se o código foi lido inteiro.',
          expectedCheckDigit,
          informedCheckDigit,
        };
      }

      return { valid: true, code, format: ShoppingBarcodeScanner.getFormatName(code.length) };
    }

    static isValidCode(value) {
      return ShoppingBarcodeScanner.validateCode(value).valid;
    }

    static isTwoDimensionalFormat(format) {
      return TWO_DIMENSIONAL_FORMATS.has(ShoppingBarcodeScanner.normalizeFormat(format));
    }

    static isHttpUrl(value) {
      try {
        const url = new URL(String(value || '').trim());
        return url.protocol === 'http:' || url.protocol === 'https:';
      } catch (error) {
        return false;
      }
    }

    static collectNumericCandidates(rawValue) {
      const raw = String(rawValue || '').trim();
      const candidates = [];
      const addCandidate = (value, source) => {
        const code = String(value || '').replace(/\D/g, '');
        if (!code || candidates.some((candidate) => candidate.code === code)) return;
        candidates.push({ code, source });
      };

      const direct = ShoppingBarcodeScanner.normalizeCode(raw);
      if (/^\d+$/.test(direct)) addCandidate(direct, 'direct');

      const gs1Patterns = [
        /\]d201(\d{14})/gi,
        /\(01\)\s*(\d{14})/gi,
        /(?:^|[\u001d|])01(\d{14})(?=$|[\u001d|])/g,
        /(?:^|[?&#/;\s])01[=:/.\s-]*(\d{14})(?=$|[?&#/;\s])/gi,
      ];
      gs1Patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.exec(raw))) addCandidate(match[1], 'gs1-ai-01');
      });

      const namedPattern = /(?:gtin|ean|upc|barcode|bar_code|product(?:_|\s|-)*code|codigo(?:_|\s|-)*(?:produto|barra))\s*["']?\s*[:=]\s*["']?(\d{8,14})/gi;
      let namedMatch;
      while ((namedMatch = namedPattern.exec(raw))) addCandidate(namedMatch[1], 'named-field');

      const numericPattern = /\d{8,14}/g;
      let numericMatch;
      while ((numericMatch = numericPattern.exec(raw))) {
        const before = raw[numericMatch.index - 1] || '';
        const after = raw[numericMatch.index + numericMatch[0].length] || '';
        if (/\d/.test(before) || /\d/.test(after)) continue;
        addCandidate(numericMatch[0], 'embedded-number');
      }

      return candidates;
    }

    static extractProductCode(rawValue) {
      const candidates = ShoppingBarcodeScanner.collectNumericCandidates(rawValue);
      for (const candidate of candidates) {
        const validation = ShoppingBarcodeScanner.validateCode(candidate.code);
        if (validation.valid) return { ...validation, source: candidate.source };
      }
      return null;
    }

    static createContentIdentifier(rawValue, format = 'qr_code') {
      const text = String(rawValue || '');
      let hashA = 0x811c9dc5;
      let hashB = 0x9e3779b9;
      for (let index = 0; index < text.length; index += 1) {
        const code = text.charCodeAt(index);
        hashA ^= code;
        hashA = Math.imul(hashA, 0x01000193);
        hashB ^= code + index;
        hashB = Math.imul(hashB, 0x85ebca6b);
      }
      const normalizedFormat = ShoppingBarcodeScanner.normalizeFormat(format);
      const prefix = normalizedFormat === 'data_matrix' ? 'dm' : normalizedFormat === 'qr_code' ? 'qr' : 'code2d';
      const digest = `${(hashA >>> 0).toString(36)}${(hashB >>> 0).toString(36)}`;
      return `${prefix}-${digest}`;
    }

    static decodeValue(rawValue, format = 'unknown') {
      const raw = String(rawValue || '').trim();
      const normalizedFormat = ShoppingBarcodeScanner.normalizeFormat(format);
      const directValidation = /^\d+$/.test(ShoppingBarcodeScanner.normalizeCode(raw))
        ? ShoppingBarcodeScanner.validateCode(raw, { format: normalizedFormat })
        : null;
      const productCode = directValidation?.valid ? { ...directValidation, source: 'direct' } : ShoppingBarcodeScanner.extractProductCode(raw);
      if (productCode) {
        return {
          kind: 'product',
          rawValue: raw,
          format: normalizedFormat,
          code: productCode.code,
          validation: productCode,
          extractedFromContent: productCode.source !== 'direct',
        };
      }

      const validation = ShoppingBarcodeScanner.validateCode(raw);
      const is2D = ShoppingBarcodeScanner.isTwoDimensionalFormat(normalizedFormat);
      const looksLikeRichContent = ShoppingBarcodeScanner.isHttpUrl(raw) || /[{}[\]:/?=&\u001d]/.test(raw) || raw.length > 18;
      if (raw && (is2D || (normalizedFormat === 'unknown' && looksLikeRichContent))) {
        return {
          kind: 'content',
          rawValue: raw,
          format: normalizedFormat,
          isUrl: ShoppingBarcodeScanner.isHttpUrl(raw),
          identifier: ShoppingBarcodeScanner.createContentIdentifier(raw, normalizedFormat),
        };
      }

      return { kind: 'invalid', rawValue: raw, format: normalizedFormat, validation };
    }

    static getZxingFormat(result) {
      const rawFormat = result?.getBarcodeFormat?.() ?? result?.barcodeFormat ?? result?.format ?? '';
      if (typeof rawFormat === 'string') return ShoppingBarcodeScanner.normalizeFormat(rawFormat);

      const enumSources = [window.ZXingBrowser?.BarcodeFormat, window.ZXing?.BarcodeFormat, window.ZXingCore?.BarcodeFormat].filter(Boolean);
      for (const enumSource of enumSources) {
        const name = enumSource[rawFormat];
        if (name) return ShoppingBarcodeScanner.normalizeFormat(name);
      }

      const zxingNumericFormats = {
        0: 'aztec',
        1: 'codabar',
        2: 'code_39',
        3: 'code_93',
        4: 'code_128',
        5: 'data_matrix',
        6: 'ean_8',
        7: 'ean_13',
        8: 'itf',
        10: 'pdf417',
        11: 'qr_code',
        14: 'upc_a',
        15: 'upc_e',
      };
      return zxingNumericFormats[Number(rawFormat)] || 'unknown';
    }

    get supported() {
      return Boolean(navigator.mediaDevices?.getUserMedia);
    }

    get guideBounds() {
      return this.smallCodeMode ? SMALL_GUIDE_BOUNDS : DEFAULT_GUIDE_BOUNDS;
    }

    updateStatus(message, force = false) {
      const now = Date.now();
      if (!force && message === this.lastStatus && now - this.lastStatusAt < STATUS_THROTTLE_MS) return;
      this.lastStatus = message;
      this.lastStatusAt = now;
      this.onStatus?.(message);
    }

    notifyCapabilities() {
      this.onCapabilities?.({ ...this.camera.getControlState(), smallCodeMode: this.smallCodeMode });
    }

    resetCandidate() {
      this.candidateCode = '';
      this.candidateStartedAt = 0;
      this.candidateLastSeenAt = 0;
      this.candidateConfirmations = 0;
    }

    resume() {
      if (!this.running) return;
      this.detectionLocked = false;
      this.readyAt = Date.now() + 350;
      this.lastCode = '';
      this.lastDetectedAt = 0;
      this.resetCandidate();
      this.updateStatus('Continue apontando a câmera para o próximo código.', true);
      if (this.detector && !this.animationFrame) this.startNativeLoop();
    }

    getResultCenter(result) {
      if (!result || !this.video?.videoWidth || !this.video?.videoHeight) return null;

      let centerX = null;
      let centerY = null;
      const box = result.boundingBox;
      if (box && Number.isFinite(box.x) && Number.isFinite(box.y) && Number.isFinite(box.width) && Number.isFinite(box.height)) {
        centerX = box.x + box.width / 2;
        centerY = box.y + box.height / 2;
      }

      if (centerX === null || centerY === null) {
        const points = result.cornerPoints || result.resultPoints || result.getResultPoints?.() || [];
        const normalizedPoints = [...points]
          .map((point) => ({ x: Number(point.x ?? point.getX?.()), y: Number(point.y ?? point.getY?.()) }))
          .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
        if (normalizedPoints.length) {
          centerX = normalizedPoints.reduce((sum, point) => sum + point.x, 0) / normalizedPoints.length;
          centerY = normalizedPoints.reduce((sum, point) => sum + point.y, 0) / normalizedPoints.length;
        }
      }

      if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) return null;
      return {
        x: centerX / this.video.videoWidth,
        y: centerY / this.video.videoHeight,
      };
    }

    isInsideGuide(result) {
      const center = this.getResultCenter(result);
      if (!center) return true;
      const bounds = this.guideBounds;
      return center.x >= bounds.left && center.x <= bounds.right && center.y >= bounds.top && center.y <= bounds.bottom;
    }

    getStableMessage(decoded, remainingSeconds) {
      if (decoded.kind === 'content') {
        const label = decoded.format === 'data_matrix' ? 'Data Matrix' : 'QR Code';
        return `${label} encontrado. Mantenha parado por ${remainingSeconds.toFixed(1)} s.`;
      }
      return `Código encontrado. Mantenha parado por ${remainingSeconds.toFixed(1)} s.`;
    }

    emitDetected(rawValue, result = null, format = 'unknown', { skipGuide = false } = {}) {
      if (!this.running || this.detectionLocked) return;

      const now = Date.now();
      if (now < this.readyAt) return;

      if (!skipGuide && !this.isInsideGuide(result)) {
        this.resetCandidate();
        this.updateStatus('Coloque o código dentro da faixa amarela.');
        return;
      }

      const decoded = ShoppingBarcodeScanner.decodeValue(rawValue, format);
      if (!decoded.rawValue) return;

      if (decoded.kind === 'invalid') {
        this.resetCandidate();
        const rejectedCode = decoded.validation?.code || decoded.rawValue;
        if (rejectedCode === this.lastCode && now - this.lastDetectedAt < 1200) return;
        this.lastCode = rejectedCode;
        this.lastDetectedAt = now;
        this.onRejected?.(decoded.validation, result, decoded);
        return;
      }

      const candidateKey = decoded.kind === 'product' ? `product:${decoded.code}` : `content:${decoded.identifier}`;
      const isSameCandidate = candidateKey === this.candidateCode && now - this.candidateLastSeenAt <= MAX_CONFIRMATION_GAP_MS;
      if (!isSameCandidate) {
        this.candidateCode = candidateKey;
        this.candidateStartedAt = now;
        this.candidateConfirmations = 1;
      } else {
        this.candidateConfirmations += 1;
      }
      this.candidateLastSeenAt = now;

      const requiredStableMs = decoded.kind === 'content' ? 700 : STABLE_CODE_MS;
      const requiredConfirmations = decoded.kind === 'content' ? 3 : MIN_CONFIRMATIONS;
      const stableFor = now - this.candidateStartedAt;
      const remainingMs = Math.max(0, requiredStableMs - stableFor);
      if (remainingMs > 0 || this.candidateConfirmations < requiredConfirmations) {
        const remainingSeconds = Math.max(0.1, Math.ceil(remainingMs / 100) / 10);
        this.updateStatus(this.getStableMessage(decoded, remainingSeconds));
        return;
      }

      this.detectionLocked = true;
      this.lastCode = candidateKey;
      this.lastDetectedAt = now;
      navigator.vibrate?.(80);

      if (decoded.kind === 'content') {
        const label = decoded.format === 'data_matrix' ? 'Data Matrix detectado.' : 'QR Code detectado.';
        this.updateStatus(label, true);
        this.onContent?.(decoded, result);
        return;
      }

      this.updateStatus(decoded.extractedFromContent ? 'Código do produto extraído e confirmado.' : 'Código confirmado.', true);
      this.onDetected?.(decoded.code, result, decoded.validation, decoded);
    }

    async start(video, { onDetected, onContent, onRejected, onStatus, onCapabilities, deviceId = '', smallCodeMode = false } = {}) {
      await this.stop();
      if (!this.supported) throw new Error('Este navegador não disponibiliza acesso à câmera.');

      this.video = video;
      this.onDetected = onDetected;
      this.onContent = onContent;
      this.onRejected = onRejected;
      this.onStatus = onStatus;
      this.onCapabilities = onCapabilities;
      this.smallCodeMode = Boolean(smallCodeMode);
      this.startOptions = { onDetected, onContent, onRejected, onStatus, onCapabilities, deviceId, smallCodeMode: this.smallCodeMode };

      const stream = await this.camera.start(video, { onStatus, deviceId, highResolution: true });
      await this.camera.setSmallCodeMode(this.smallCodeMode);
      this.running = true;
      this.readyAt = Date.now() + SCAN_WARMUP_MS;
      this.detectionLocked = false;
      this.resetCandidate();
      this.notifyCapabilities();
      this.updateStatus('Câmera pronta. Aguarde um instante antes de apontar o produto.', true);
      setTimeout(() => {
        if (this.running && !this.detectionLocked) {
          this.updateStatus(this.smallCodeMode ? 'Aproxime o código, use o zoom e mantenha-o dentro da área amarela.' : 'Agora centralize o código na faixa amarela e mantenha parado.', true);
        }
      }, SCAN_WARMUP_MS);

      if ('BarcodeDetector' in window) {
        await this.startNativeDetector();
        return;
      }

      if (window.ZXingBrowser?.BrowserMultiFormatReader) {
        await this.startZxingDetector(stream);
        return;
      }

      this.updateStatus('Câmera ativa, mas a leitura automática não carregou. Digite o código manualmente.', true);
    }

    async startNativeDetector() {
      let supportedFormats = NATIVE_FORMATS;
      try {
        const available = await BarcodeDetector.getSupportedFormats();
        supportedFormats = NATIVE_FORMATS.filter((format) => available.includes(format));
      } catch (error) {
        console.warn('Não foi possível consultar os formatos nativos do scanner.', error);
      }

      try {
        this.detector = supportedFormats.length ? new BarcodeDetector({ formats: supportedFormats }) : new BarcodeDetector();
      } catch (error) {
        console.warn('O leitor nativo não aceitou os formatos solicitados.', error);
        this.detector = new BarcodeDetector();
      }
      this.startNativeLoop();
    }

    getNativeDetectionSource() {
      if (!this.smallCodeMode || !this.video?.videoWidth || !this.video?.videoHeight || typeof document === 'undefined') {
        return { source: this.video, skipGuide: false };
      }

      if (!this.cropCanvas) {
        this.cropCanvas = document.createElement('canvas');
        this.cropContext = this.cropCanvas.getContext('2d', { alpha: false, willReadFrequently: true });
      }
      if (!this.cropContext) return { source: this.video, skipGuide: false };

      const videoWidth = this.video.videoWidth;
      const videoHeight = this.video.videoHeight;
      const bounds = this.guideBounds;
      const marginX = 0.06;
      const marginY = 0.08;
      const left = Math.max(0, bounds.left - marginX);
      const right = Math.min(1, bounds.right + marginX);
      const top = Math.max(0, bounds.top - marginY);
      const bottom = Math.min(1, bounds.bottom + marginY);
      const sourceX = Math.round(videoWidth * left);
      const sourceY = Math.round(videoHeight * top);
      const sourceWidth = Math.max(1, Math.round(videoWidth * (right - left)));
      const sourceHeight = Math.max(1, Math.round(videoHeight * (bottom - top)));
      const scale = Math.min(2.5, 1600 / sourceWidth, 900 / sourceHeight);
      this.cropCanvas.width = Math.max(1, Math.round(sourceWidth * scale));
      this.cropCanvas.height = Math.max(1, Math.round(sourceHeight * scale));
      this.cropContext.drawImage(this.video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, this.cropCanvas.width, this.cropCanvas.height);
      return { source: this.cropCanvas, skipGuide: true };
    }

    startNativeLoop() {
      if (!this.detector || !this.running) return;
      if (this.animationFrame) cancelAnimationFrame(this.animationFrame);

      const detect = async () => {
        this.animationFrame = null;
        if (!this.running || this.detectionLocked) return;
        if (this.video?.readyState >= 2) {
          try {
            const detectionSource = this.getNativeDetectionSource();
            const barcodes = await this.detector.detect(detectionSource.source);
            const result = detectionSource.skipGuide
              ? barcodes.find((barcode) => barcode.rawValue)
              : barcodes.find((barcode) => barcode.rawValue && this.isInsideGuide(barcode)) || barcodes.find((barcode) => barcode.rawValue);
            if (result?.rawValue) this.emitDetected(result.rawValue, result, result.format, { skipGuide: detectionSource.skipGuide });
          } catch (error) {
            console.warn('Falha pontual na leitura nativa do código.', error);
          }
        }
        if (this.running && !this.detectionLocked) this.animationFrame = requestAnimationFrame(detect);
      };

      this.animationFrame = requestAnimationFrame(detect);
    }

    async startZxingDetector(stream) {
      this.zxingReader = new window.ZXingBrowser.BrowserMultiFormatReader();
      try {
        this.zxingControls = await this.zxingReader.decodeFromStream(stream, this.video, (result, error) => {
          const rawValue = result?.getText?.() ?? result?.text;
          if (rawValue) this.emitDetected(rawValue, result, ShoppingBarcodeScanner.getZxingFormat(result));
          if (error && error.name && !['NotFoundException', 'ChecksumException', 'FormatException'].includes(error.name)) {
            console.warn('Falha pontual na leitura com ZXing.', error);
          }
        });
      } catch (error) {
        console.error('Não foi possível iniciar o leitor ZXing.', error);
        this.updateStatus('A câmera abriu, mas o leitor automático falhou. Digite o código manualmente.', true);
      }
    }

    async focus() {
      const result = await this.camera.focus();
      if (!result.supported) {
        this.updateStatus('Esta câmera não oferece foco manual. Afaste um pouco o produto e tente novamente.', true);
        return result;
      }
      this.updateStatus('Foco solicitado. Mantenha o produto parado.', true);
      return result;
    }

    async setZoom(value) {
      const result = await this.camera.setZoom(value);
      if (!result.supported) this.updateStatus('Esta câmera não oferece controle de zoom.', true);
      this.notifyCapabilities();
      return result;
    }

    async setSmallCodeMode(enabled) {
      this.smallCodeMode = Boolean(enabled);
      if (this.startOptions) this.startOptions.smallCodeMode = this.smallCodeMode;
      this.resetCandidate();
      await this.camera.setSmallCodeMode(this.smallCodeMode);
      this.notifyCapabilities();
      this.updateStatus(this.smallCodeMode ? 'Modo Código pequeno ativado. A área central será ampliada para leitura.' : 'Modo Código pequeno desativado.', true);
    }

    async switchCamera() {
      if (!this.running || !this.video || !this.startOptions) throw new Error('A câmera ainda não está pronta.');
      const nextDeviceId = await this.camera.getNextDeviceId();
      if (!nextDeviceId) {
        this.updateStatus('Não há outra câmera disponível neste aparelho.', true);
        return false;
      }
      const video = this.video;
      const options = { ...this.startOptions, deviceId: nextDeviceId, smallCodeMode: this.smallCodeMode };
      options.onStatus?.('Trocando de câmera...');
      await this.start(video, options);
      return true;
    }

    async stop() {
      this.running = false;
      this.detectionLocked = false;
      if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
      try {
        this.zxingControls?.stop?.();
        this.zxingReader?.reset?.();
      } catch (error) {
        console.debug('Não foi possível encerrar o leitor ZXing normalmente.', error);
      }
      this.zxingControls = null;
      this.zxingReader = null;
      this.detector = null;
      this.lastCode = '';
      this.lastDetectedAt = 0;
      this.readyAt = 0;
      this.resetCandidate();
      this.onDetected = null;
      this.onContent = null;
      this.onRejected = null;
      this.onStatus = null;
      this.onCapabilities = null;
      this.startOptions = null;
      this.lastStatus = '';
      this.lastStatusAt = 0;
      this.cropCanvas = null;
      this.cropContext = null;
      await this.camera.stop();
      this.video = null;
    }
  }

  window.ShoppingBarcodeScanner = ShoppingBarcodeScanner;
})();
