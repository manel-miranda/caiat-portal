/**
 * Generates the local prototype GLB used by the guest portal 3D/AR demo.
 * Run with: bun scripts/build-tajine-model.ts
 * Output: public/models/caiat-tajine.glb  (~30 cm across, real-world scale)
 */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mkdirSync, writeFileSync } from "node:fs";

// Minimal FileReader shim: GLTFExporter's binary path uses it to read a Blob.
class NodeFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

const scene = new THREE.Scene();
const root = new THREE.Group();
scene.add(root);

const mat = (color: number, roughness = 0.6, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

// Tagine base dish (30 cm diameter)
const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.125, 0.045, 64), mat(0xb1502f, 0.45));
base.position.y = 0.0225;
root.add(base);

const rim = new THREE.Mesh(new THREE.TorusGeometry(0.148, 0.008, 16, 64), mat(0x8c3a20, 0.4));
rim.rotation.x = Math.PI / 2;
rim.position.y = 0.045;
root.add(rim);

// Tomato sauce surface
const sauce = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.135, 0.012, 64), mat(0xc0361b, 0.75));
sauce.position.y = 0.05;
root.add(sauce);

// Meatballs
const ballGeo = new THREE.SphereGeometry(0.022, 24, 18);
const ballMat = mat(0x6b3a21, 0.85);
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2;
  const b = new THREE.Mesh(ballGeo, ballMat);
  b.position.set(Math.cos(a) * 0.075, 0.068, Math.sin(a) * 0.075);
  root.add(b);
}

// Egg white + yolk in the centre
const white = new THREE.Mesh(new THREE.SphereGeometry(0.038, 32, 24), mat(0xf4efe2, 0.5));
white.scale.set(1, 0.32, 1);
white.position.y = 0.058;
root.add(white);

const yolk = new THREE.Mesh(new THREE.SphereGeometry(0.017, 24, 18), mat(0xe8a92b, 0.35));
yolk.scale.set(1, 0.6, 1);
yolk.position.y = 0.066;
root.add(yolk);

// Herb / vegetable garnish
const herbGeo = new THREE.SphereGeometry(0.007, 10, 8);
const herbMat = mat(0x3f7a33, 0.9);
for (let i = 0; i < 14; i++) {
  const a = Math.random() * Math.PI * 2;
  const r = 0.03 + Math.random() * 0.1;
  const h = new THREE.Mesh(herbGeo, herbMat);
  h.scale.set(1, 0.5, 1.6);
  h.position.set(Math.cos(a) * r, 0.058, Math.sin(a) * r);
  h.rotation.y = Math.random() * Math.PI;
  root.add(h);
}

// Conical tagine lid, lifted and semi-transparent so the food stays visible
const lid = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.17, 48, 1, true), mat(0xd97b45, 0.5));
lid.position.y = 0.175;
(lid.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
(lid.material as THREE.MeshStandardMaterial).transparent = true;
(lid.material as THREE.MeshStandardMaterial).opacity = 0.35;
root.add(lid);

const knob = new THREE.Mesh(new THREE.SphereGeometry(0.018, 24, 18), mat(0x8c3a20, 0.4));
knob.position.y = 0.268;
root.add(knob);

new GLTFExporter().parse(
  scene,
  (result) => {
    mkdirSync("public/models", { recursive: true });
    writeFileSync("public/models/caiat-tajine.glb", Buffer.from(result as ArrayBuffer));
    console.log("wrote public/models/caiat-tajine.glb");
  },
  (err) => {
    console.error(err);
    process.exit(1);
  },
  { binary: true },
);
