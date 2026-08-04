// Scanner isolado da área financeira. Usa BarcodeDetector e ZXing como alternativa.
(() => {
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
    }

    static normalizeCode(value) {
      return String(value || '').replace(/\s+/g, '').trim();
    }

    get supported() {
      return Boolean(navigator.mediaDevices?.getUserMedia);
    }

    emitDetected(rawCode, result = null) {
      const code = ShoppingBarcodeScanner.normalizeCode(rawCode);
      if (!code || !this.running) return;
      const now = Date.now();
      if (code === this.lastCode && now - this.lastDetectedAt < 1800) return;
      this.lastCode = code;
      this.lastDetectedAt = now;
      navigator.vibrate?.(80);
      this.onDetected?.(code, result);
    }

    async start(video, { onDetected, onStatus } = {}) {
      await this.stop();
      if (!this.supported) throw new Error('Este navegador não disponibiliza acesso à câmera.');

      this.video = video;
      this.onDetected = onDetected;
      const stream = await this.camera.start(video, { onStatus });
      this.running = true;

      if ('BarcodeDetector' in window) {
        await this.startNativeDetector(onStatus);
        return;
      }

      if (window.ZXingBrowser?.BrowserMultiFormatReader) {
        await this.startZxingDetector(stream, onStatus);
        return;
      }

      onStatus?.('Câmera ativa, mas a leitura automática não carregou. Digite o código manualmente.');
    }

    async startNativeDetector(onStatus) {
      const preferredFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
      let supportedFormats = preferredFormats;
      try {
        const available = await BarcodeDetector.getSupportedFormats();
        supportedFormats = preferredFormats.filter((format) => available.includes(format));
      } catch (error) {
        console.warn('Não foi possível consultar os formatos nativos do scanner.', error);
      }

      this.detector = supportedFormats.length ? new BarcodeDetector({ formats: supportedFormats }) : new BarcodeDetector();
      onStatus?.('Câmera ativa. Centralize o código dentro do retângulo.');

      const detect = async () => {
        if (!this.running) return;
        if (this.video?.readyState >= 2) {
          try {
            const barcodes = await this.detector.detect(this.video);
            const result = barcodes.find((barcode) => barcode.rawValue);
            if (result?.rawValue) {
              this.emitDetected(result.rawValue, result);
              return;
            }
          } catch (error) {
            console.warn('Falha pontual na leitura nativa do código.', error);
          }
        }
        this.animationFrame = requestAnimationFrame(detect);
      };
      this.animationFrame = requestAnimationFrame(detect);
    }

    async startZxingDetector(stream, onStatus) {
      this.zxingReader = new window.ZXingBrowser.BrowserMultiFormatReader();
      onStatus?.('Câmera ativa. Centralize o código dentro do retângulo.');
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
        onStatus?.('A câmera abriu, mas o leitor automático falhou. Digite o código manualmente.');
      }
    }

    async stop() {
      this.running = false;
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
      this.onDetected = null;
      await this.camera.stop();
      this.video = null;
    }
  }

  window.ShoppingBarcodeScanner = ShoppingBarcodeScanner;
})();
