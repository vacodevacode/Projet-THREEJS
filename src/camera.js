/**
 * camera.js
 * ----------
 * Caméra perspective pédestre : hauteur de regard d'humain,
 * FOV 60° pour un cadre cinématographique, far plane aligné
 * avec la distance du fog pour éviter tout « pop-in » au loin.
 */
import * as THREE from 'three';

export function createCamera() {
    const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        400
    );
    // Position initiale : à l'entrée du chemin, regardant vers le soleil
    camera.position.set(0, 2.4, 40);
    camera.lookAt(0, 2, 0);
    return camera;
}
