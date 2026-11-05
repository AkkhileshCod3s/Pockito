import * as THREE from 'three';

export class GuineaPigFace {
  constructor(nodes) {
    this.eyeL = nodes.eyeL;
    this.eyeR = nodes.eyeR;
    this.sparkleL = nodes.sparkleL;
    this.sparkleR = nodes.sparkleR;
    this.sparkle2L = nodes.sparkle2L;
    this.sparkle2R = nodes.sparkle2R;
    this.snout = nodes.snout;

    // Add cute soft pink blush planes on the cheeks
    const blushCanvas = document.createElement('canvas');
    blushCanvas.width = 64;
    blushCanvas.height = 64;
    const bctx = blushCanvas.getContext('2d');
    bctx.fillStyle = '#ff6b95';
    bctx.beginPath();
    bctx.ellipse(32, 32, 26, 18, 0, 0, Math.PI * 2);
    bctx.fill();

    this.blushTex = new THREE.CanvasTexture(blushCanvas);
    const blushMat = new THREE.MeshBasicMaterial({
      map: this.blushTex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.blushMat = blushMat;

    const blushGeom = new THREE.PlaneGeometry(1.2, 0.8);
    // Cheeks are near Head (X ~ 4.5, Y ~ 1.5, Z ~ +/- 2.05)
    this.blushL = new THREE.Mesh(blushGeom, blushMat);
    this.blushL.position.set(4.8, 1.4, 2.02);
    nodes.guineaPig.add(this.blushL);

    this.blushR = new THREE.Mesh(blushGeom, blushMat);
    this.blushR.position.set(4.8, 1.4, -2.02);
    this.blushR.rotation.y = Math.PI;
    nodes.guineaPig.add(this.blushR);

    this.snoutBaseY = this.snout ? this.snout.position.y : 0;
  }

  apply(face, noseTwitch = 0) {
    if (!face) return;
    const c = face.current;
    const blink = face.blinkFactor;
    const open = c.eyeOpen[0] * blink;

    // Eye scale: blink, wide, squint
    let sy = 1;
    let sx = 1;
    if (c.wide > 0.3 || face.expression === 'surprised' || face.expression === 'sparkle') {
      sy = 1.35;
      sx = 1.35;
    } else if (open < 0.25) {
      sy = 0.12;
      sx = 1.0;
    } else if (c.happy > 0.4 || c.squeeze > 0.4) {
      sy = 0.35;
      sx = 1.1;
    }

    if (this.eyeL) this.eyeL.scale.set(sx, sy, 1);
    if (this.eyeR) this.eyeR.scale.set(sx, sy, 1);

    // Sparkles
    const showSparkle = c.heart > 0.35 || face.expression === 'love' || face.expression === 'excited' || face.expression === 'sparkle';
    if (this.sparkleL) this.sparkleL.visible = showSparkle;
    if (this.sparkleR) this.sparkleR.visible = showSparkle;
    if (this.sparkle2L) this.sparkle2L.visible = showSparkle;
    if (this.sparkle2R) this.sparkle2R.visible = showSparkle;

    // Blush opacity
    if (this.blushMat) {
      this.blushMat.opacity = c.blush > 0.2 ? 0.8 : 0.25;
    }

    // Nose twitch
    if (this.snout) {
      this.snout.position.y = this.snoutBaseY + noseTwitch * 0.12;
    }
  }

  dispose() {
    this.blushTex?.dispose();
    this.blushMat?.dispose();
    this.blushL?.geometry?.dispose();
    this.blushR?.geometry?.dispose();
  }
}
