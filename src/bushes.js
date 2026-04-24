/**
 * bushes.js
 * ----------
 * Buissons + plantes à fleurs — tout en INSTANCED MESH (exigence).
 *
 * Technique dite « plans croisés » (cross planes) :
 *   - Un buisson = deux (ou trois) plans qui se croisent à 90° /
 *     60°, texturés avec une alpha de feuillage. De quelque angle
 *     qu'on regarde, on voit toujours de la masse verte → illusion
 *     de volume pour un coût dérisoire (4 à 6 triangles).
 *
 * La variation de taille et rotation est obligatoire pour casser
 * la répétition visuelle. On génère une rotation Y aléatoire par
 * instance et un scale uniforme distribué.
 *
 * Les fleurs utilisent les textures alpha fournies (alpha1..5.webp)
 * pour créer de petits buissons de fleurs colorés autour du chemin.
 */
import * as THREE from 'three';
import {
    getTerrainHeight, randRange, randInt,
    isOnLand, isOnPath,
} from './utils.js';

/* ==========================================================
 * BUISSONS (cross-planes)
 * ========================================================== */
export function createBushes(textureLoader) {
    const baseColor = textureLoader.load('./textures/bush/BaseColor.webp');
    baseColor.colorSpace = THREE.SRGBColorSpace;
    const normal = textureLoader.load('./textures/bush/Normal.webp');
    const orm = textureLoader.load('./textures/bush/OcclusionRoughnessMetallic.webp');

    // 3 plans croisés : Y 0°, Y 60°, Y 120°
    const geo = new THREE.BufferGeometry();
    const verts = [];
    const uvs = [];
    const idx = [];
    const w = 1.4;  // largeur buisson
    const h = 1.2;  // hauteur buisson

    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI;
        const c = Math.cos(angle), s = Math.sin(angle);
        const v0 = [-w * c, 0, -w * s];
        const v1 = [ w * c, 0,  w * s];
        const v2 = [ w * c, h,  w * s];
        const v3 = [-w * c, h, -w * s];
        const base = i * 4;
        verts.push(...v0, ...v1, ...v2, ...v3);
        uvs.push(0, 0,  1, 0,  1, 1,  0, 1);
        idx.push(base, base + 1, base + 2,  base, base + 2, base + 3);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        map: baseColor,
        normalMap: normal,
        roughnessMap: orm,
        aoMap: orm,
        metalnessMap: orm,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 1.0,
        metalness: 0.0,
    });

    const COUNT = 900;
    const mesh = new THREE.InstancedMesh(geo, material, COUNT);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;
    while (placed < COUNT && attempts < COUNT * 8) {
        attempts++;
        const r = Math.sqrt(Math.random()) * 85;
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;

        if (!isOnLand(x, z, 1.2)) continue;
        if (isOnPath(x, z, 2.2)) continue;

        const y = getTerrainHeight(x, z);
        dummy.position.set(x, y, z);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        const s = randRange(0.6, 1.8);
        dummy.scale.set(s, s * randRange(0.8, 1.2), s);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;

    return mesh;
}

/* ==========================================================
 * FLEURS (bonus — alpha cards instanciées)
 * ========================================================== */
export function createFlowers(textureLoader) {
    const flowerTextures = [1, 2, 3, 4, 5].map((i) => {
        const t = textureLoader.load(`./textures/flower/alpha${i}.webp`);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    });

    const group = new THREE.Group();

    // Une InstancedMesh par texture pour rester en peu de draw calls.
    flowerTextures.forEach((tex, texIndex) => {
        // Cross-plane simple : 2 plans 90°
        const geo = new THREE.BufferGeometry();
        const verts = [];
        const uvs = [];
        const idx = [];
        const w = 0.35, h = 0.45;
        for (let i = 0; i < 2; i++) {
            const a = (i / 2) * Math.PI;
            const c = Math.cos(a), s = Math.sin(a);
            const base = i * 4;
            verts.push(
                -w * c, 0, -w * s,
                 w * c, 0,  w * s,
                 w * c, h,  w * s,
                -w * c, h, -w * s,
            );
            uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            map: tex,
            alphaTest: 0.4,
            side: THREE.DoubleSide,
            roughness: 0.95,
        });

        const COUNT = 260;
        const mesh = new THREE.InstancedMesh(geo, mat, COUNT);
        mesh.castShadow = false;
        mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        let placed = 0;
        let attempts = 0;
        while (placed < COUNT && attempts < COUNT * 6) {
            attempts++;
            const r = Math.sqrt(Math.random()) * 80;
            const a = Math.random() * Math.PI * 2;
            const x = Math.cos(a) * r;
            const z = Math.sin(a) * r;

            if (!isOnLand(x, z, 1.2)) continue;
            // On accepte plus de fleurs le long du chemin pour l'ambiance
            if (!isOnPath(x, z, 6.0) && Math.random() > 0.5) continue;

            const y = getTerrainHeight(x, z);
            dummy.position.set(x, y, z);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            const s = randRange(0.6, 1.3);
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            mesh.setMatrixAt(placed, dummy.matrix);
            placed++;
        }
        mesh.count = placed;
        mesh.instanceMatrix.needsUpdate = true;
        mesh.name = `Flowers_${texIndex}`;
        group.add(mesh);
    });

    return group;
}
