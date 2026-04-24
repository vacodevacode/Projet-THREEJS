/**
 * renderer.js
 * ------------
 * Création et configuration du WebGLRenderer.
 * - Tone mapping ACIIFilmic : rendu cinéma, essentiel pour un coucher
 *   de soleil crédible (les hautes lumières ne cramment pas).
 * - sRGB output : couleurs correctes avec les textures PBR.
 * - Ombres PCFSoft : ombres douces cohérentes avec la lumière chaude.
 * - Pixel ratio plafonné à 2 pour préserver le 60 FPS sur écrans HiDPI.
 */
import * as THREE from 'three';

export function createRenderer() {
    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        stencil: false,
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Espace couleur linéaire en interne, sRGB en sortie
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Tone mapping essentiel pour le HDR du ciel coucher de soleil
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // Ombres douces
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    document.body.appendChild(renderer.domElement);

    return renderer;
}

/* Redimensionnement réactif */
export function handleResize(renderer, camera, composer) {
    const onResize = () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (composer) composer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);
    return onResize;
}
