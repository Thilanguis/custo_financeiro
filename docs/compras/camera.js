// Controle de câmera isolado da área financeira.
(() => {
  function isLocalHost() {
    return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
  }

  function ensureCameraEnvironment() {
    if (!window.isSecureContext && !isLocalHost()) {
      throw new Error('A câmera só funciona em HTTPS ou localhost. Abra pelo Live Server ou pelo site publicado.');
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador não disponibiliza acesso à câmera.');
    }
  }

  function friendlyCameraError(error) {
    const name = error?.name || '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return 'A permissão da câmera foi negada. Clique no cadeado ao lado do endereço e permita o uso da câmera.';
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return 'Nenhuma câmera foi encontrada neste aparelho.';
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return 'A câmera está ocupada por outro programa ou não pôde ser iniciada. Feche outros aplicativos que estejam usando a câmera.';
    }
    if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
      return 'A câmera encontrada não suporta a configuração solicitada.';
    }
    if (name === 'SecurityError') {
      return 'O navegador bloqueou a câmera por segurança. Use HTTPS ou localhost.';
    }
    if (name === 'AbortError') {
      return 'A abertura da câmera foi interrompida. Tente novamente.';
    }
    return error?.message || 'Não foi possível abrir a câmera.';
  }

  async function waitForVideo(video) {
    if (video.readyState >= 2 && video.videoWidth > 0) return;
    await new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error('A câmera abriu, mas o vídeo não ficou disponível.'));
      }, 8000);
      const cleanup = () => {
        window.clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error('Não foi possível exibir a imagem da câmera.'));
      };
      video.addEventListener('loadedmetadata', onReady, { once: true });
      video.addEventListener('canplay', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value)));
  }

  class ShoppingCameraCapture {
    constructor() {
      this.stream = null;
      this.video = null;
      this.track = null;
      this.capabilities = {};
      this.settings = {};
      this.videoInputs = [];
      this.currentDeviceId = '';
      this.lastStartOptions = {};
    }

    buildConstraints({ deviceId = '', highResolution = false } = {}) {
      const video = {
        width: { ideal: highResolution ? 1920 : 1280 },
        height: { ideal: highResolution ? 1080 : 720 },
        frameRate: { ideal: 30, max: 60 },
      };

      if (deviceId) video.deviceId = { exact: deviceId };
      else video.facingMode = { ideal: 'environment' };

      return { audio: false, video };
    }

    async refreshVideoInputs() {
      if (!navigator.mediaDevices?.enumerateDevices) return this.videoInputs;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        this.videoInputs = devices.filter((device) => device.kind === 'videoinput');
      } catch (error) {
        console.debug('Não foi possível listar as câmeras disponíveis.', error);
      }
      return this.videoInputs;
    }

    refreshTrackInfo() {
      this.track = this.stream?.getVideoTracks?.()[0] || null;
      try {
        this.capabilities = this.track?.getCapabilities?.() || {};
      } catch (error) {
        this.capabilities = {};
      }
      try {
        this.settings = this.track?.getSettings?.() || {};
      } catch (error) {
        this.settings = {};
      }
      this.currentDeviceId = this.settings.deviceId || this.currentDeviceId || '';
    }

    async start(video, { onStatus, deviceId = '', highResolution = false } = {}) {
      await this.stop();
      ensureCameraEnvironment();
      this.video = video;
      this.currentDeviceId = deviceId || this.currentDeviceId || '';
      this.lastStartOptions = { deviceId: this.currentDeviceId, highResolution };
      onStatus?.('Solicitando permissão para usar a câmera...');

      const preferredConstraints = this.buildConstraints({ deviceId: this.currentDeviceId, highResolution });

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (firstError) {
        const canFallback = firstError?.name === 'OverconstrainedError' || firstError?.name === 'ConstraintNotSatisfiedError';
        if (!canFallback) throw new Error(friendlyCameraError(firstError));
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: this.currentDeviceId ? { deviceId: { exact: this.currentDeviceId } } : { facingMode: { ideal: 'environment' } },
          });
        } catch (fallbackError) {
          throw new Error(friendlyCameraError(fallbackError));
        }
      }

      video.muted = true;
      video.autoplay = true;
      video.setAttribute('playsinline', '');
      video.srcObject = this.stream;

      try {
        await waitForVideo(video);
        await video.play();
      } catch (error) {
        await this.stop();
        throw new Error(friendlyCameraError(error));
      }

      this.refreshTrackInfo();
      await this.refreshVideoInputs();
      await this.enableContinuousFocus({ silent: true });
      this.refreshTrackInfo();
      onStatus?.('Câmera pronta.');
      return this.stream;
    }

    getFocusModes() {
      const modes = this.capabilities?.focusMode;
      return Array.isArray(modes) ? modes : [];
    }

    async applyAdvancedConstraint(constraint) {
      if (!this.track?.applyConstraints) return false;
      await this.track.applyConstraints({ advanced: [constraint] });
      this.refreshTrackInfo();
      return true;
    }

    async enableContinuousFocus({ silent = false } = {}) {
      const modes = this.getFocusModes();
      if (!modes.includes('continuous')) return false;
      try {
        await this.applyAdvancedConstraint({ focusMode: 'continuous' });
        return true;
      } catch (error) {
        if (!silent) throw new Error('Não foi possível ativar o foco contínuo nesta câmera.');
        console.debug('Foco contínuo indisponível.', error);
        return false;
      }
    }

    async focus() {
      if (!this.track) throw new Error('A câmera ainda não está pronta.');
      const modes = this.getFocusModes();
      const singleMode = ['single-shot', 'single', 'manual'].find((mode) => modes.includes(mode));
      const continuousMode = modes.includes('continuous') ? 'continuous' : '';
      if (!singleMode && !continuousMode) return { supported: false };

      try {
        if (singleMode) {
          await this.applyAdvancedConstraint({ focusMode: singleMode });
          if (continuousMode) {
            window.setTimeout(() => this.applyAdvancedConstraint({ focusMode: continuousMode }).catch(() => {}), 450);
          }
        } else {
          await this.applyAdvancedConstraint({ focusMode: continuousMode });
        }
        return { supported: true };
      } catch (error) {
        throw new Error('A câmera não conseguiu refazer o foco. Afaste um pouco o produto e tente novamente.');
      }
    }

    getZoomRange() {
      const zoom = this.capabilities?.zoom;
      if (!zoom || !Number.isFinite(Number(zoom.min)) || !Number.isFinite(Number(zoom.max))) return null;
      const min = Number(zoom.min);
      const max = Number(zoom.max);
      return {
        min,
        max,
        step: Number(zoom.step) > 0 ? Number(zoom.step) : 0.1,
        value: clamp(Number(this.settings?.zoom ?? min), min, max),
      };
    }

    async setZoom(value) {
      const range = this.getZoomRange();
      if (!range) return { supported: false };
      const next = clamp(value, range.min, range.max);
      try {
        await this.applyAdvancedConstraint({ zoom: next });
        return { supported: true, value: next };
      } catch (error) {
        throw new Error('Não foi possível aplicar o zoom nesta câmera.');
      }
    }

    async setSmallCodeMode(enabled) {
      if (!enabled) return this.getControlState();
      await this.enableContinuousFocus({ silent: true });
      const zoom = this.getZoomRange();
      if (zoom && zoom.max > zoom.min) {
        const suggested = Math.min(zoom.max, Math.max(zoom.value, zoom.min + (zoom.max - zoom.min) * 0.22, 1.5));
        try {
          await this.setZoom(suggested);
        } catch (error) {
          console.debug('O zoom automático do modo Código pequeno não pôde ser aplicado.', error);
        }
      }
      return this.getControlState();
    }

    getControlState() {
      this.refreshTrackInfo();
      const zoom = this.getZoomRange();
      const currentIndex = this.videoInputs.findIndex((device) => device.deviceId === this.currentDeviceId);
      return {
        canFocus: this.getFocusModes().some((mode) => ['continuous', 'single-shot', 'single', 'manual'].includes(mode)),
        canZoom: Boolean(zoom && zoom.max > zoom.min),
        zoom,
        cameras: this.videoInputs.map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Câmera ${index + 1}`,
        })),
        cameraCount: this.videoInputs.length,
        currentCameraIndex: currentIndex >= 0 ? currentIndex : 0,
        currentDeviceId: this.currentDeviceId,
        width: Number(this.settings?.width) || 0,
        height: Number(this.settings?.height) || 0,
      };
    }

    async getNextDeviceId() {
      await this.refreshVideoInputs();
      if (this.videoInputs.length < 2) return '';
      const currentIndex = this.videoInputs.findIndex((device) => device.deviceId === this.currentDeviceId);
      const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % this.videoInputs.length : 0;
      return this.videoInputs[nextIndex].deviceId;
    }

    capture({ maxSize = 960, quality = 0.78 } = {}) {
      if (!this.video || this.video.videoWidth <= 0 || this.video.videoHeight <= 0) {
        throw new Error('A imagem da câmera ainda não está pronta.');
      }
      const scale = Math.min(1, maxSize / Math.max(this.video.videoWidth, this.video.videoHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(this.video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(this.video.videoHeight * scale));
      const context = canvas.getContext('2d');
      context.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', quality);
    }

    async stop() {
      if (this.video) {
        try {
          this.video.pause();
        } catch (error) {
          console.debug('Não foi possível pausar a prévia da câmera.', error);
        }
        this.video.srcObject = null;
      }
      this.stream?.getTracks?.().forEach((track) => track.stop());
      this.stream = null;
      this.video = null;
      this.track = null;
      this.capabilities = {};
      this.settings = {};
    }
  }

  window.ShoppingCameraCapture = ShoppingCameraCapture;
  window.getShoppingCameraErrorMessage = friendlyCameraError;
})();
