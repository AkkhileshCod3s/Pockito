import * as THREE from 'three';

const FUR = '#a38775';
const PINK = '#ef6f8c';
const TEAR = '#6fd0ff';
const DARK = '#1e1a16';

/**
 * Paints expressions onto a copy of the wolf texture, replacing the eye, brow,
 * and snout/mouth pixels whenever the quantised expression state changes.
 */
export class WolfFace {
  constructor(material) {
    const src = material.map;
    const img = src?.image;
    const width = img?.width || 64;
    const height = img?.height || 64;

    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (img) this.ctx.drawImage(img, 0, 0);

    // Save region covering snout and head front: x in [3..11], y in [47..61]
    this.base = this.ctx.getImageData(3, 47, 9, 15);

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
      mouth: c.mouthOpen > 0.45 ? 'open' : c.mouthCurve > 0.7 ? 'smile' : c.mouthCurve < -0.3 ? 'frown' : 'none',
    };
    const key = JSON.stringify(state);
    if (key === this.key) return;
    this.key = key;
    this.#draw(state);
  }

  #draw(s) {
    if (this.base && this.ctx.putImageData) {
      this.ctx.putImageData(this.base, 3, 47);
    }

    // Eyes at (col 5, row 57) and (col 8, row 57)
    if (s.heart) {
      this.ctx.fillStyle = PINK;
      this.ctx.fillRect(5, 57, 1, 1);
      this.ctx.fillRect(8, 57, 1, 1);
    } else {
      if (!s.openL) {
        this.ctx.fillStyle = FUR;
        this.ctx.fillRect(5, 57, 1, 1);
      }
      if (!s.openR) {
        this.ctx.fillStyle = FUR;
        this.ctx.fillRect(8, 57, 1, 1);
      }
    }

    // Brows on row 56
    if (s.brow > 0) {
      this.ctx.fillStyle = DARK;
      this.ctx.fillRect(5, 56, 1, 1);
      this.ctx.fillRect(8, 56, 1, 1);
    } else if (s.brow < 0) {
      this.ctx.fillStyle = DARK;
      this.ctx.fillRect(4, 56, 1, 1);
      this.ctx.fillRect(9, 56, 1, 1);
    }

    // Tears on row 58
    if (s.tears) {
      this.ctx.fillStyle = TEAR;
      this.ctx.fillRect(5, 58, 1, 1);
      this.ctx.fillRect(8, 58, 1, 1);
    }

    // Sweat on row 55 col 9
    if (s.sweat) {
      this.ctx.fillStyle = TEAR;
      this.ctx.fillRect(9, 55, 1, 1);
    }

    // Snout / mouth on rows 48-49 (below nose at (5, 49))
    if (s.mouth === 'open') {
      this.ctx.fillStyle = DARK;
      this.ctx.fillRect(5, 48, 2, 1);
    } else if (s.mouth === 'smile') {
      this.ctx.fillStyle = DARK;
      this.ctx.fillRect(4, 48, 1, 1);
      this.ctx.fillRect(7, 48, 1, 1);
    } else if (s.mouth === 'frown') {
      this.ctx.fillStyle = DARK;
      this.ctx.fillRect(5, 48, 2, 1);
    }

    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
  }
}
