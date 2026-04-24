/**
 * scene.js
 * ---------
 * Assemble la scène complète en rassemblant tous les modules.
 * Renvoie l'ensemble des objets nécessaires à main.js pour le rendu
 * et la boucle d'update.
 *
 * Responsabilités :
 *   1. Instancie THREE.Scene, ajoute le fog
 *   2. Attache le sky, les lumières, le terrain, la végétation, l'eau,
 *      les particules
 *   3. Expose une liste « updaters » : objets qui ont besoin d'un
 *      update(dt, elapsed) par frame (herbe, ciel, eau, particules,
 *      LOD manager…).
 */
import * as THREE from 'three';
import { createFog, FOG_COLOR } from './fog.js';
import { createLighting } from './lighting.js';
import { createSky } from './sky.js';
import { createTerrain } from './terrain.js';
import { createWater } from './water.js';
import { createParticles } from './particles.js';
import { createVegetation } from './vegetation.js';
import { updateImpostors } from './impostors.js';

export async function createScene(camera) {
    const scene = new THREE.Scene();
    scene.fog = createFog();
    scene.background = new THREE.Color(FOG_COLOR); // au cas où le sky ne couvrirait pas un pixel

    const textureLoader = new THREE.TextureLoader();

    // Lumières
    const lights = createLighting(scene);

    // Ciel (suit la caméra pour simulation d'infini)
    const sky = createSky(scene, camera);

    // Terrain
    const terrain = createTerrain(textureLoader);
    scene.add(terrain.mesh);

    // Eau
    const water = createWater();
    scene.add(water.mesh);

    // Végétation (async car GLB à charger)
    const veg = await createVegetation(scene, textureLoader);

    // Particules
    const particles = createParticles();
    scene.add(particles.mesh);

    // Updaters par frame
    const updaters = [
        sky,
        water,
        particles,
        ...veg.updaters,
    ];

    return {
        scene,
        lights,
        updaters,
        trees: veg.trees,
        updateTreesLOD(camera, elapsed) {
            if (!veg.trees) return;
            veg.trees.manager.update(camera, elapsed);
            updateImpostors(veg.trees.impostor, camera);
        },
    };
}
