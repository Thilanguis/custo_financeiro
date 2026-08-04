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

  class ShoppingCameraCapture {
    constructor() {
      this.stream = null;
      this.video = null;
    }

    async start(video, { onStatus } = {}) {
      await this.stop();
      ensureCameraEnvironment();
      this.video = video;
      onStatus?.('Solicitando permissão para usar a câmera...');

      const preferredConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      try {
        this.stream = await navigator.mediaDevices.getUserMedia(preferredConstraints);
      } catch (firstError) {
        if (firstError?.name !== 'OverconstrainedError' && firstError?.name !== 'ConstraintNotSatisfiedError') {
          throw new Error(friendlyCameraError(firstError));
        }
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
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

      onStatus?.('Câmera pronta.');
      return this.stream;
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
    }
  }

  window.ShoppingCameraCapture = ShoppingCameraCapture;
  window.getShoppingCameraErrorMessage = friendlyCameraError;
})();
