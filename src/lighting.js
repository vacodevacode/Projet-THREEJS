/**
 * lighting.js
 * ------------
 * Éclairage triple pour une ambiance coucher de soleil cohérente :
 *
 *   1. DirectionalLight (SOLEIL) — lumière principale chaude,
 *      orientée presque à l'horizon pour des ombres très longues
 *      caractéristiques du coucher. Shadow map configurée pour
 *      couvrir la zone de jeu sans gaspillage (bonne perf).
 *
 *   2. HemisphereLight (CIEL / SOL) — rebond atmosphérique :
 *      remplit les zones d'ombre d'une teinte bleue (ciel) et
 *      rebondit un vert chaud depuis le sol, évitant les noirs
 *      crus injustifiés.
 *
 *   3. AmbientLight faible — petit fill global pour stabiliser
 *      la base d'exposition (les matériaux PBR sombres ne
 *      deviennent pas noirs).
 */
import * as THREE from 'three';

export const SUN_POSITION = new THREE.Vector3(-60, 18, -80); // quasi horizon derrière

export function createLighting(scene) {
    // --- 1. Soleil directionnel ---
    const sun = new THREE.DirectionalLight(0xffb27a, 3.2);
    sun.position.copy(SUN_POSITION);
    sun.castShadow = true;

    // Shadow map : compromis qualité / perf
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    const d = 90;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;

    scene.add(sun);
    scene.add(sun.target);
    sun.target.position.set(0, 0, 0);

    // --- 2. Hémisphère (rebond ciel / sol) ---
    const hemi = new THREE.HemisphereLight(
        0x88aaff, // bleu ciel opposé au soleil
        0x3a2a1a, // terre chaude
        0.55
    );
    hemi.position.set(0, 50, 0);
    scene.add(hemi);

    // --- 3. Ambient faible pour base stable ---
    const ambient = new THREE.AmbientLight(0xffd2a0, 0.12);
    scene.add(ambient);

    return { sun, hemi, ambient };
}
