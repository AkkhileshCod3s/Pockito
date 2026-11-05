import * as THREE from 'three';

const LID = '#9cc9f4';
const PINK = '#ef6f8c';
const TEAR = '#6fd0ff';
const BROW_DARK = '#2b1b36';

/**
 * Paints expressions onto a copy of the blue fish texture, updating eye pixels
 * whenever the quantised expression state changes.
 */
export class BlueFishFace {
  constructor(material) {
    const src = material.map;
    const img = src?.image;
    const width = img?.width || 128;
    const height = img?.height || 128;

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (img) this.ctx.drawImage(img, 0, 0);

    // Save base regions: Left eye is around (1, 37), Right eye is around (29, 37)
    this.baseL = this.ctx.getImageData(0, 35, 5, 5);
    this.baseR = this.ctx.getImageData(28, 35, 5, 5);

    const tex = new THREE.CanvasTexture(this.canvas);
    if (src) {
      tex.flipY = src.flipY;
      tex.colorSpace = src.colorSpace;
      tex.wrapS = src.wrapS;
      tex.wrapT = src.wrapT;
    }
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    material.map = tex;
    material.needsUpdate = true;
    this.tex = tex;
    this.key = '';
  }

  apply(face) {
    const c = face.current;
    const blink = face.blinkFactor;
    const state = {
      openL: c.eyeOpen[0] * blink > 0.25,
      openR: c.eyeOpen[1] * blink > 0.25,
      heart: c.heart > 0.5,
      brow: c.brow > 0.4 ? 1 : c.brow < -0.4 ? -1 : 0,
      tears: c.tears > 0.4,
      sweat: c.sweat > 0.4,
    };
    const key = JSON.stringify(state);
    if (key === this.key) return;
    this.key = key;
    this.#draw(state);
  }

  #draw(s) {
    if (this.baseL && this.ctx.putImageData) {
      this.ctx.putImageData(this.baseL, 0, 35);
      this.ctx.putImageData(this.baseR, 28, 35);
    }

    if (s.heart) {
      this.ctx.fillStyle = PINK;
      this.ctx.fillRect(1, 37, 2, 1);
      this.ctx.fillRect(29, 37, 2, 1);
    } else {
      if (!s.openL) {
        this.ctx.fillStyle = LID;
        this.ctx.fillRect(1, 37, 2, 1);
      }
      if (!s.openR) {
        this.ctx.fillStyle = LID;
        this.ctx.fillRect(29, 37, 2, 1);
      }
    }

    if (s.brow > 0) {
      this.ctx.fillStyle = BROW_DARK;
      this.ctx.fillRect(1, 36, 2, 1);
      this.ctx.fillRect(29, 36, 2, 1);
    } else if (s.brow < 0) {
      this.ctx.fillStyle = BROW_DARK;
      this.ctx.fillRect(1, 35, 2, 1);
      this.ctx.fillRect(29, 35, 2, 1);
    }

    if (s.tears) {
      this.ctx.fillStyle = TEAR;
      this.ctx.fillRect(1, 38, 2, 1);
      this.ctx.fillRect(29, 38, 2, 1);
    }

    if (s.sweat) {
      this.ctx.fillStyle = TEAR;
      this.ctx.fillRect(3, 35, 1, 1);
    }

    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
  }
}
