/**
 * main.js
 * --------
 * Point d'entrée. Responsabilités :
 *   - Créer renderer, camera, controls
 *   - Appeler createScene() (async, chargement du .glb)
 *   - Construire le composer de post-processing
 *   - Boucle de rendu : requestAnimationFrame à 60 FPS cible
 *   - Mise à jour du HUD (FPS / drawcalls / triangles)
 *
 * La boucle est volontairement minimale : les updates de la scène
 * sont tous délégués à `scene.updaters`. On ne fait que mesurer le
 * temps, appeler chaque updater, actualiser les contrôles et la
 * caméra LOD, puis rendre via le composer.
 */
import * as THREE from 'three';
import { createRenderer, handleResize } from './renderer.js';
import { createCamera } from './camera.js';
import { createControls } from './controls.js';
import { createScene } from './scene.js';
import { createComposer } from './postprocessing.js';

async function boot() {
    // --- Renderer / Camera / Controls ---
    const renderer = createRenderer();
    const camera = createCamera();
    const controls = createControls(camera, renderer.domElement);

    // --- Scene (async à cause du .glb) ---
    const sceneBundle = await createScene(camera);
    const { scene, updaters, updateTreesLOD } = sceneBundle;

    // --- Post-processing (Bloom) ---
    const { composer } = createComposer(renderer, scene, camera);

    // --- Redimensionnement ---
    handleResize(renderer, camera, composer);

    // --- HUD ---
    const fpsEl = document.getElementById('fps');
    const drawEl = document.getElementById('drawcalls');
    const triEl = document.getElementById('triangles');
    const loadingEl = document.getElementById('loading');
    loadingEl.classList.add('fadeout');

    let frames = 0;
    let fpsTimer = 0;
    const clock = new THREE.Clock();

    // --- Boucle principale ---
    renderer.setAnimationLoop(() => {
        const dt = Math.min(clock.getDelta(), 0.1); // clamp pour éviter les sauts
        const elapsed = clock.elapsedTime;

        // 1. Mise à jour des modules dynamiques (ciel, eau, herbe, particules)
        for (let i = 0; i < updaters.length; i++) {
            updaters[i].update(dt, elapsed);
        }

        // 2. LOD arbres (dépend de la caméra)
        updateTreesLOD(camera, elapsed);

        // 3. Contrôles caméra
        controls.update();

        // 4. Rendu via composer (RenderPass → BloomPass → OutputPass)
        composer.render();

        // 5. HUD stats
        frames++;
        fpsTimer += dt;
        if (fpsTimer >= 0.5) {
            const fps = Math.round(frames / fpsTimer);
            if (fpsEl) fpsEl.textContent = fps;
            if (drawEl) drawEl.textContent = renderer.info.render.calls;
            if (triEl) triEl.textContent = renderer.info.render.triangles.toLocaleString();
            frames = 0;
            fpsTimer = 0;
        }
    });
}

boot().catch((err) => {
    console.error('Erreur au démarrage :', err);
    const el = document.getElementById('loading');
    if (el) {
        el.innerHTML = `<div style="color:#ff8a8a">Erreur de chargement</div>
            <div class="sub">${err.message}</div>
            <div class="sub">Ouvrez la console pour plus de détails.</div>`;
    }
});
