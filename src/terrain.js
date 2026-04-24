/**
 * terrain.js
 * -----------
 * Terrain procédural respectant les exigences du sujet :
 *   - PlaneGeometry déformée par programmation (fBm noise)
 *   - Texture PBR COMPLÈTE : albedo + normal + roughness
 *   - Relief naturel non-plat, relief cohérent avec le reste
 *     de la scène (même fonction getTerrainHeight partagée).
 *
 * On creuse légèrement une cuvette au centre pour accueillir le plan
 * d'eau, et on aplati très doucement un chemin sinueux pour un
 * parcours visible inspiré de la photo de référence.
 */
import * as THREE from 'three';
import {
    getTerrainHeight,
    WATER_CENTER, WATER_RADIUS, WATER_LEVEL,
    distanceToPath,
} from './utils.js';

const TERRAIN_SIZE = 220;
const TERRAIN_SEGMENTS = 220; // ~48 000 tris — base du budget polygonal

export function createTerrain(textureLoader) {
    const geometry = new THREE.PlaneGeometry(
        TERRAIN_SIZE, TERRAIN_SIZE,
        TERRAIN_SEGMENTS, TERRAIN_SEGMENTS
    );
    geometry.rotateX(-Math.PI / 2); // allongé au sol

    // Déformation des sommets
    const pos = geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);

        let y = getTerrainHeight(x, z);

        // Cuvette pour le plan d'eau central
        const dx = x - WATER_CENTER.x;
        const dz = z - WATER_CENTER.z;
        const distW = Math.sqrt(dx * dx + dz * dz);
        if (distW < WATER_RADIUS + 4) {
            const t = Math.max(0, 1 - distW / (WATER_RADIUS + 4));
            y -= t * t * 2.2;
            if (distW < WATER_RADIUS) y = Math.min(y, WATER_LEVEL - 0.3);
        }

        // Chemin légèrement aplani
        const distPath = distanceToPath(x, z);
        if (distPath < 3.0 && distW > WATER_RADIUS + 3) {
            const k = 1.0 - distPath / 3.0;
            y *= 1.0 - 0.6 * k;
        }

        pos.setY(i, y);
    }
    geometry.computeVertexNormals();

    // --- Textures PBR ---
    const repeat = 26;
    const loadTex = (path, colorSpace = THREE.NoColorSpace) => {
        const t = textureLoader.load(path);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeat, repeat);
        t.colorSpace = colorSpace;
        t.anisotropy = 8;
        return t;
    };

    const albedo = loadTex('./textures/ground/Albedo.jpg', THREE.SRGBColorSpace);
    const normal = loadTex('./textures/ground/Normal.jpg');
    const roughness = loadTex('./textures/ground/Roughness.jpg');

    const material = new THREE.MeshStandardMaterial({
        map: albedo,
        normalMap: normal,
        roughnessMap: roughness,
        roughness: 1.0,
        metalness: 0.0,
        color: 0xa89878, // légère teinte chaude qui réagit au soleil
    });
    material.normalScale.set(1.0, 1.0);

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'Terrain';

    return { mesh, size: TERRAIN_SIZE };
}
