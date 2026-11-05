import * as THREE from 'three';

export class BlueFishFace {
  constructor(bodyPivot) {
    this.bodyPivot = bodyPivot;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 128;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d');

    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.magFilter = THREE.LinearFilter;

    const mat = new THREE.MeshBasicMaterial({
      map: this.tex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });

    const geom = new THREE.PlaneGeometry(2.4, 2.0);

    // Left eye & cheek plane (+Z side)
    this.meshL = new THREE.Mesh(geom, mat);
    this.meshL.position.set(3.2, 0.1, 1.04);
    bodyPivot.add(this.meshL);

    // Right eye & cheek plane (-Z side)
    this.meshR = new THREE.Mesh(geom, mat);
    this.meshR.position.set(3.2, 0.1, -1.04);
    this.meshR.rotation.y = Math.PI;
    bodyPivot.add(this.meshR);

    // Front mouth plane (+X side)
    this.mouthCanvas = document.createElement('canvas');
    this.mouthCanvas.width = 64;
    this.mouthCanvas.height = 64;
    this.mouthCtx = this.mouthCanvas.getContext('2d');
    this.mouthTex = new THREE.CanvasTexture(this.mouthCanvas);
    this.mouthTex.colorSpace = THREE.SRGBColorSpace;
    const mouthMat = new THREE.MeshBasicMaterial({
      map: this.mouthTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.meshMouth = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), mouthMat);
    this.meshMouth.position.set(5.03, -0.3, 0);
    this.meshMouth.rotation.y = Math.PI / 2;
    bodyPivot.add(this.meshMouth);

    this.key = '';
    this.#draw({});
  }

  apply(face) {
    if (!face) return;
    const c = face.current;
    const blink = face.blinkFactor;
    const state = {
      open: c.eyeOpen[0] * blink,
      heart: c.heart > 0.4,
      happy: c.happy > 0.4 || c.squeeze > 0.4,
      wide: c.wide > 0.3 || face.expression === 'surprised',
      blush: c.blush > 0.3,
      tears: c.tears > 0.4,
      sweat: c.sweat > 0.4,
      dizzy: c.dizzy > 0.4,
      mouthOpen: c.mouthOpen,
      mouthCurve: c.mouthCurve,
      lookX: Math.round(face.look.x * 4) / 4,
      lookY: Math.round(face.look.y * 4) / 4,
    };
    const key = JSON.stringify(state);
    if (key === this.key) return;
    this.key = key;
    this.#draw(state);
  }

  #draw(s) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 128, 128);

    const cx = 64 + (s.lookX || 0) * 8;
    const cy = 56 - (s.lookY || 0) * 6;

    // Blush
    if (s.blush) {
      ctx.fillStyle = 'rgba(255, 120, 160, 0.65)';
      ctx.beginPath();
      ctx.ellipse(cx - 2, cy + 28, 16, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.dizzy) {
      // Swirly dizzy eyes
      ctx.strokeStyle = '#1e2440';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let a = 0; a < Math.PI * 4; a += 0.2) {
        const r = a * 3.5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else if (s.heart) {
      // Pink heart eyes
      ctx.fillStyle = '#ff3366';
      ctx.beginPath();
      const hx = cx, hy = cy;
      ctx.moveTo(hx, hy + 6);
      ctx.bezierCurveTo(hx - 16, hy - 12, hx - 22, hy + 14, hx, hy + 26);
      ctx.bezierCurveTo(hx + 22, hy + 14, hx + 16, hy - 12, hx, hy + 6);
      ctx.fill();
    } else if (s.happy) {
      // Happy ^^ arched curve
      ctx.strokeStyle = '#1e2440';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy + 10, 18, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    } else if (s.open !== undefined && s.open < 0.25) {
      // Closed / blink
      ctx.strokeStyle = '#1e2440';
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy + 6);
      ctx.lineTo(cx + 18, cy + 6);
      ctx.stroke();
    } else if (s.wide) {
      // Big round "O" surprised eye
      ctx.fillStyle = '#1e2440';
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 6, cy - 6, 8, 0, Math.PI * 2);
      ctx.arc(cx + 7, cy + 7, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Normal cute eye: round black with shine
      ctx.fillStyle = '#1c2238';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 18, 19, 0, 0, Math.PI * 2);
      ctx.fill();

      // Dual shine highlights
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 5, 6.5, 0, Math.PI * 2);
      ctx.arc(cx + 6, cy + 6, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Tears
    if (s.tears) {
      ctx.fillStyle = '#5cc8ff';
      ctx.beginPath();
      ctx.arc(cx - 10, cy + 24, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sweat
    if (s.sweat) {
      ctx.fillStyle = '#60c8ff';
      ctx.beginPath();
      ctx.arc(cx + 26, cy - 18, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    this.tex.needsUpdate = true;

    // Draw tiny mouth on front plane
    const mctx = this.mouthCtx;
    mctx.clearRect(0, 0, 64, 64);
    if (s.mouthOpen > 0.35 || s.wide) {
      mctx.fillStyle = '#221526';
      mctx.beginPath();
      mctx.ellipse(32, 32, 7, 9 * Math.min(1.5, s.mouthOpen || 1), 0, 0, Math.PI * 2);
      mctx.fill();
    } else {
      mctx.strokeStyle = '#221526';
      mctx.lineWidth = 3.5;
      mctx.lineCap = 'round';
      mctx.beginPath();
      mctx.arc(32, 28, 7, Math.PI * 0.15, Math.PI * 0.85);
      mctx.stroke();
    }
    this.mouthTex.needsUpdate = true;
  }

  dispose() {
    this.tex?.dispose();
    this.mouthTex?.dispose();
    this.meshL?.geometry?.dispose();
    this.meshL?.material?.dispose();
    this.meshR?.geometry?.dispose();
    this.meshR?.material?.dispose();
    this.meshMouth?.geometry?.dispose();
    this.meshMouth?.material?.dispose();
  }
}
