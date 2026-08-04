// Scanner isolado da área financeira. Usa BarcodeDetector e ZXing como alternativa.
(() => {
  const SCAN_WARMUP_MS = 1400;
  const STABLE_CODE_MS = 1000;
  const MIN_CONFIRMATIONS = 4;
  const MAX_CONFIRMATION_GAP_MS = 500;
  const STATUS_THROTTLE_MS = 180;
  const GUIDE_BOUNDS = Object.freeze({ left: 0.21, right: 0.79, top: 0.4, bottom: 0.6 });

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
      this.onRejected = null;
      this.onStatus = null;
      this.readyAt = 0;
      this.detectionLocked = false;
      this.candidateCode = '';
      this.candidateStartedAt = 0;
      this.candidateLastSeenAt = 0;
      this.candidateConfirmations = 0;
      this.lastStatus = '';
      this.lastStatusAt = 0;
    }

    static normalizeCode(value) {
      return String(value || '').replace(/\s+/g, '').trim();
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

    static validateCode(value) {
      const code = ShoppingBarcodeScanner.normalizeCode(value);
      if (!code) return { valid: false, code, reason: 'Informe o código de barras.' };
      if (!/^\d+$/.test(code)) return { valid: false, code, reason: 'O código deve conter somente números.' };
      if (!ShoppingBarcodeScanner.getAllowedLengths().includes(code.length)) {
        return { valid: false, code, reason: 'Use um código com 8, 12, 13 ou 14 dígitos.' };
      }

      const informedCheckDigit = Number(code.at(-1));
      const expectedCheckDigit = ShoppingBarcodeScanner.calculateCheckDigit(code.slice(0, -1));
      if (informedCheckDigit !== expectedCheckDigit) {
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

    get supported() {
      return Boolean(navigator.mediaDevices?.getUserMedia);
    }

    updateStatus(message, force = false) {
      const now = Date.now();
      if (!force && message === this.lastStatus && now - this.lastStatusAt < STATUS_THROTTLE_MS) return;
      this.lastStatus = message;
      this.lastStatusAt = now;
      this.onStatus?.(message);
    }

    resetCandidate() {
      this.candidateCode = '';
      this.candidateStartedAt = 0;
      this.candidateLastSeenAt = 0;
      this.candidateConfirmations = 0;
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
      return center.x >= GUIDE_BOUNDS.left && center.x <= GUIDE_BOUNDS.right && center.y >= GUIDE_BOUNDS.top && center.y <= GUIDE_BOUNDS.bottom;
    }

    emitDetected(rawCode, result = null) {
      if (!this.running || this.detectionLocked) return;

      const now = Date.now();
      if (now < this.readyAt) return;

      if (!this.isInsideGuide(result)) {
        this.resetCandidate();
        this.updateStatus('Coloque o código dentro da faixa amarela.');
        return;
      }

      const validation = ShoppingBarcodeScanner.validateCode(rawCode);
      const code = validation.code;
      if (!code) return;

      if (!validation.valid) {
        this.resetCandidate();
        if (code === this.lastCode && now - this.lastDetectedAt < 1200) return;
        this.lastCode = code;
        this.lastDetectedAt = now;
        this.onRejected?.(validation, result);
        return;
      }

      const isSameCandidate = code === this.candidateCode && now - this.candidateLastSeenAt <= MAX_CONFIRMATION_GAP_MS;
      if (!isSameCandidate) {
        this.candidateCode = code;
        this.candidateStartedAt = now;
        this.candidateConfirmations = 1;
      } else {
        this.candidateConfirmations += 1;
      }
      this.candidateLastSeenAt = now;

      const stableFor = now - this.candidateStartedAt;
      const remainingMs = Math.max(0, STABLE_CODE_MS - stableFor);
      if (remainingMs > 0 || this.candidateConfirmations < MIN_CONFIRMATIONS) {
        const remainingSeconds = Math.max(0.1, Math.ceil(remainingMs / 100) / 10);
        this.updateStatus(`Código encontrado. Mantenha parado por ${remainingSeconds.toFixed(1)} s.`);
        return;
      }

      this.detectionLocked = true;
      this.lastCode = code;
      this.lastDetectedAt = now;
      this.updateStatus('Código confirmado.', true);
      navigator.vibrate?.(80);
      this.onDetected?.(code, result, validation);
    }

    async start(video, { onDetected, onRejected, onStatus } = {}) {
      await this.stop();
      if (!this.supported) throw new Error('Este navegador não disponibiliza acesso à câmera.');

      this.video = video;
      this.onDetected = onDetected;
      this.onRejected = onRejected;
      this.onStatus = onStatus;
      const stream = await this.camera.start(video, { onStatus });
      this.running = true;
      this.readyAt = Date.now() + SCAN_WARMUP_MS;
      this.detectionLocked = false;
      this.resetCandidate();
      this.updateStatus('Câmera pronta. Aguarde um instante antes de apontar o produto.', true);
      setTimeout(() => {
        if (this.running && !this.detectionLocked) this.updateStatus('Agora centralize o código na faixa amarela e mantenha parado.', true);
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
      const preferredFormats = ['ean_13', 'ean_8', 'upc_a'];
      let supportedFormats = preferredFormats;
      try {
        const available = await BarcodeDetector.getSupportedFormats();
        supportedFormats = preferredFormats.filter((format) => available.includes(format));
      } catch (error) {
        console.warn('Não foi possível consultar os formatos nativos do scanner.', error);
      }

      this.detector = supportedFormats.length ? new BarcodeDetector({ formats: supportedFormats }) : new BarcodeDetector();

      const detect = async () => {
        if (!this.running) return;
        if (this.video?.readyState >= 2 && !this.detectionLocked) {
          try {
            const barcodes = await this.detector.detect(this.video);
            const result = barcodes.find((barcode) => barcode.rawValue && this.isInsideGuide(barcode)) || barcodes.find((barcode) => barcode.rawValue);
            if (result?.rawValue) this.emitDetected(result.rawValue, result);
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
          if (result?.getText) this.emitDetected(result.getText(), result);
          else if (result?.text) this.emitDetected(result.text, result);
          if (error && error.name && !['NotFoundException', 'ChecksumException', 'FormatException'].includes(error.name)) {
            console.warn('Falha pontual na leitura com ZXing.', error);
          }
        });
      } catch (error) {
        console.error('Não foi possível iniciar o leitor ZXing.', error);
        this.updateStatus('A câmera abriu, mas o leitor automático falhou. Digite o código manualmente.', true);
      }
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
      this.onRejected = null;
      this.onStatus = null;
      this.lastStatus = '';
      this.lastStatusAt = 0;
      await this.camera.stop();
      this.video = null;
    }
  }

  window.ShoppingBarcodeScanner = ShoppingBarcodeScanner;
})();
