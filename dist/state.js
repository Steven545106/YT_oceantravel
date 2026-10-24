import * as THREE from 'three';

// ---- shared mutable state (see state.js) ----
export const state = { handling: { speed: 1, turn: 1 }, orbitMode: false, topDownMode: false, velocity: 0, collisionPulse: 0, smoothLookReady: false, autopilot: null, navBusy: false };
export const keys = new Set();
// Camera follows the boat's position on the water, not its wave bobbing: the bob would
// otherwise rock the whole view and make every distant island appear to shake.
export const cameraAnchor = new THREE.Vector3();
export const topDownView = { height: 58, offsetX: 0, offsetZ: 0, drag: null };
