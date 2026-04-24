/**
 * vegetation.js
 * --------------
 * Orchestrateur végétation : assemble herbe, buissons, fleurs, arbres
 * sur la scène. Isolé dans un module pour que scene.js reste lisible.
 *
 * Respecte le principe DRY : chaque sous-module expose une fonction
 * create* qui retourne soit un Mesh/Group soit un objet { mesh, update }.
 * Ici on les ajoute à la scène et on regroupe ceux qui demandent un
 * update par frame.
 */
import { createGrass } from './grass.js';
import { createBushes, createFlowers } from './bushes.js';
import { createTrees } from './trees.js';

export async function createVegetation(scene, textureLoader) {
    const updaters = [];

    // --- Herbe ---
    const grass = createGrass(textureLoader);
    scene.add(grass.mesh);
    updaters.push(grass);

    // --- Buissons ---
    const bushes = createBushes(textureLoader);
    scene.add(bushes);

    // --- Fleurs (bonus) ---
    const flowers = createFlowers(textureLoader);
    scene.add(flowers);

    // --- Arbres (LOD) — asynchrone (chargement GLB) ---
    const trees = await createTrees(textureLoader);
    scene.add(trees.group);

    return { updaters, trees };
}
