/**
 * grass.js
 * ---------
 * Herbe à haute densité par INSTANCED MESH (exigence du sujet).
 *
 * Technique :
 *   - Brin d'herbe = petit plane vertical à 2 triangles.
 *   - Chaque brin est une instance positionnée aléatoirement sur
 *     le terrain (scatter), aligné sur la hauteur du sol via
 *     getTerrainHeight (cohérence parfaite avec le mesh terrain).
 *   - Le chemin central et la zone d'eau sont évités.
 *
 * Shader de VENT (exigence du sujet) :
 *   - onBeforeCompile injecte un léger déplacement du sommet
 *     haut du brin (y > 0) suivant une sinusoïde fonction de la
 *     position instanciée et du temps. Résultat : vent cohérent
 *     par zone, amplitude = 0 au sol = 0 effet d'arrachement.
 */
import * as THREE from 'three';
import {
    getTerrainHeight, randRange,
    isOnLand, isOnPath,
} from './utils.js';

const INSTANCES = 22000;
const PATCH_RADIUS = 85; // zone couverte par l'herbe

export function createGrass(textureLoader) {
    // --- Géométrie : un brin = 2 plans croisés pour un peu de volume ---
    // On garde 2 tris par plan pour rester très léger sur 22 000 instances.
    const blade = new THREE.PlaneGeometry(0.35, 1.1, 1, 3);
    blade.translate(0, 0.55, 0); // pivot au sol
    // Deuxième lame croisée
    const blade2 = blade.clone();
    blade2.rotateY(Math.PI / 2);
    const merged = mergeGeometries(blade, blade2);

    // Couleurs par sommet pour variation naturelle
    const colors = new Float32Array(merged.attributes.position.count * 3);
    const colorBase = new THREE.Color(0x3d5a2a);
    const colorTip = new THREE.Color(0x95a255);
    for (let i = 0; i < merged.attributes.position.count; i++) {
        const y = merged.attributes.position.getY(i);
        const t = Math.min(1, y / 1.1);
        const c = colorBase.clone().lerp(colorTip, t);
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // --- Texture alpha (brin d'herbe PNG avec transparence) ---
    const tex = textureLoader.load('./textures/grass/color.png');
    tex.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshStandardMaterial({
        map: tex,
        alphaTest: 0.35,
        transparent: false, // alphaTest suffit et coûte moins cher
        side: THREE.DoubleSide,
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.0,
    });

    // --- Injection du shader de vent via onBeforeCompile ---
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 };
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', /* glsl */`
                #include <common>
                uniform float uTime;
                // Hash cheap pour variation par instance
                float hash11(float p) { return fract(sin(p * 12.9898) * 43758.5453); }
            `)
            .replace('#include <begin_vertex>', /* glsl */`
                vec3 transformed = vec3(position);

                // La position de l'instance est dans instanceMatrix
                float ix = instanceMatrix[3][0];
                float iz = instanceMatrix[3][2];
                float phase = hash11(ix * 0.1 + iz * 0.13) * 6.28;

                // Amplitude liée à la hauteur du sommet : base immobile, tip plié
                float bend = smoothstep(0.0, 1.1, position.y);
                float wave = sin(uTime * 1.5 + ix * 0.25 + iz * 0.2 + phase);
                float gust = sin(uTime * 0.4 + ix * 0.02) * 0.5 + 0.5;

                transformed.x += wave * 0.18 * bend * (0.6 + 0.6 * gust);
                transformed.z += cos(uTime * 1.2 + iz * 0.3 + phase) * 0.08 * bend;
            `);
        material.userData.shader = shader;
    };

    // --- InstancedMesh + scatter ---
    const mesh = new THREE.InstancedMesh(merged, material, INSTANCES);
    mesh.castShadow = false;       // shadow trop coûteuse pour l'herbe
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;

    const dummy = new THREE.Object3D();
    let placed = 0;
    let attempts = 0;
    while (placed < INSTANCES && attempts < INSTANCES * 6) {
        attempts++;
        const r = Math.sqrt(Math.random()) * PATCH_RADIUS;
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;

        // Ne pas pousser sur l'eau, moins dense sur le chemin
        if (!isOnLand(x, z, 0.5)) continue;
        if (isOnPath(x, z, 1.8) && Math.random() > 0.15) continue;

        const y = getTerrainHeight(x, z);
        dummy.position.set(x, y - 0.05, z);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        const s = randRange(0.7, 1.4);
        dummy.scale.set(s, s * randRange(0.8, 1.3), s);
        dummy.updateMatrix();
        mesh.setMatrixAt(placed, dummy.matrix);
        placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;

    return {
        mesh,
        update(dt, elapsed) {
            const shader = material.userData.shader;
            if (shader) shader.uniforms.uTime.value = elapsed;
        },
    };
}

/* Petit helper de fusion de deux géométries — évite d'importer
   BufferGeometryUtils pour une opération triviale. */
function mergeGeometries(g1, g2) {
    const posA = g1.attributes.position.array;
    const posB = g2.attributes.position.array;
    const uvA = g1.attributes.uv.array;
    const uvB = g2.attributes.uv.array;
    const normA = g1.attributes.normal.array;
    const normB = g2.attributes.normal.array;
    const idxA = g1.index.array;
    const idxB = g2.index.array;

    const pos = new Float32Array(posA.length + posB.length);
    pos.set(posA, 0); pos.set(posB, posA.length);
    const uv = new Float32Array(uvA.length + uvB.length);
    uv.set(uvA, 0); uv.set(uvB, uvA.length);
    const norm = new Float32Array(normA.length + normB.length);
    norm.set(normA, 0); norm.set(normB, normA.length);

    const offset = posA.length / 3;
    const idx = new Uint32Array(idxA.length + idxB.length);
    idx.set(idxA, 0);
    for (let i = 0; i < idxB.length; i++) idx[idxA.length + i] = idxB[i] + offset;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
}
