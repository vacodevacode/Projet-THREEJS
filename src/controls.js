/**
 * controls.js
 * ------------
 * OrbitControls configurés pour une exploration naturelle.
 * - damping pour un rendu fluide
 * - limite minPolar pour empêcher de passer sous le sol
 * - distance plafonnée sur l'échelle du terrain
 */
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function createControls(camera, rendererDom) {
    const controls = new OrbitControls(camera, rendererDom);
    controls.target.set(0, 2, 0);

    controls.enableDamping = true;
    controls.dampingFactor = 0.06;

    controls.minDistance = 2;
    controls.maxDistance = 120;

    // Empêche de passer sous le terrain
    controls.maxPolarAngle = Math.PI * 0.49;

    controls.screenSpacePanning = false;
    controls.update();
    return controls;
}
