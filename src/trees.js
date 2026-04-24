/**
 * trees.js
 * ---------
 * Forêt d'arbres avec LOD complet (High / Mid / Impostor).
 *
 * - HIGH : on charge /textures/tree/tree.glb fourni par le formateur
 *   (~4000 polys comme annoncé). On dédoublonne/extrait la géométrie
 *   et on la met dans une InstancedMesh unique pour limiter les draw
 *   calls à 1 (le minimum possible).
 *
 * - MID : version simplifiée procédurale : tronc (CylinderGeometry
 *   8-sides) + deux IcosahedronGeometry pour le feuillage. Quelques
 *   centaines de triangles, matériau simple sans normal map.
 *
 * - IMPOSTOR : billboard créé par impostors.js, orienté caméra.
 *
 * Le placement d'arbres s'inspire de la photo de référence :
 *   - Alignement lâche de part et d'autre du chemin central.
 *   - Densité très forte au bord du chemin, décroissance douce.
 *   - Plus clairsemé autour de l'eau.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    getTerrainHeight, randRange, randInt,
    isOnLand, isOnPath, distanceToPath, distanceToWater,
} from './utils.js';
import {
    createImpostorMaterial, createImpostorMesh,
} from './impostors.js';
import { TreeLODManager } from './lodSystem.js';

const TOTAL_TREES = 220;       // nombre total d'arbres dans la scène
const MAX_HIGH = 35;           // alloue pour HIGH LOD
const MAX_MID = 90;            // alloue pour MID LOD
const MAX_IMP = TOTAL_TREES;   // tout le reste est potentiellement impostor

export function createTrees(textureLoader) {
    return new Promise((resolve) => {
        const loader = new GLTFLoader();

        loader.load('./textures/tree/tree.glb', (gltf) => {
            // Important : on s'assure que toutes les matrices world sont
            // à jour avant d'extraire les géométries transformées.
            gltf.scene.updateMatrixWorld(true);

            // --- 1. Extraction de la géométrie du GLB ---
            // On merge toutes les meshes trouvées en une seule géométrie
            // (trunk + canopy) pour pouvoir faire de l'InstancedMesh.
            const trunkMeshes = [];
            const leafMeshes = [];
            gltf.scene.traverse((o) => {
                if (o.isMesh) {
                    // Heuristique : matériau nommé leaves/foliage → feuillage
                    const name = (o.material && o.material.name) || o.name || '';
                    if (/leaf|leav|foli|branch_tip/i.test(name)) {
                        leafMeshes.push(o);
                    } else {
                        trunkMeshes.push(o);
                    }
                }
            });

            // Si aucun mesh trouvé, fallback procédural complet
            if (trunkMeshes.length === 0 && leafMeshes.length === 0) {
                console.warn('tree.glb vide, fallback procédural');
                resolve(buildProceduralOnly(textureLoader));
                return;
            }

            // On unifie avec des matériaux bien configurés, on construit
            // une seule InstancedMesh HIGH. Pour rester simple et robuste,
            // on crée un Group qui contient une InstancedMesh par
            // sous-mesh du glb. Toutes utilisent la même instanceMatrix via
            // un helper : on duplique les positions dans chaque.
            const highGroup = new THREE.Group();
            const subMeshes = [...trunkMeshes, ...leafMeshes];

            // Palette de matériaux : on clone ceux du glb en s'assurant
            // qu'ils reçoivent correctement le fog + ombres
            const materialCache = new WeakMap();
            const prepMat = (m) => {
                if (!m) return new THREE.MeshStandardMaterial({ color: 0x7f5a3a });
                if (materialCache.has(m)) return materialCache.get(m);
                const nm = m.clone();
                nm.side = THREE.DoubleSide;
                if (nm.map) nm.map.colorSpace = THREE.SRGBColorSpace;
                // alphaTest pour les feuilles à transparence
                if (nm.transparent && nm.alphaTest === 0) {
                    nm.alphaTest = 0.5;
                    nm.transparent = false;
                }
                nm.fog = true;
                materialCache.set(m, nm);
                return nm;
            };

            const highInstances = subMeshes.map((sm) => {
                const geom = sm.geometry.clone();
                geom.applyMatrix4(sm.matrixWorld);
                const mat = prepMat(sm.material);
                const inst = new THREE.InstancedMesh(geom, mat, MAX_HIGH);
                inst.castShadow = true;
                inst.receiveShadow = true;
                inst.count = 0;
                inst.frustumCulled = false; // contrôle manuel côté LOD
                highGroup.add(inst);
                return inst;
            });

            // --- 2. MID LOD procédural ---
            const midGroup = buildMidLOD(MAX_MID);

            // --- 3. IMPOSTOR ---
            const impostorMat = createImpostorMaterial(textureLoader);
            const impMesh = createImpostorMesh(impostorMat, MAX_IMP);

            // --- 4. Placement ---
            const positions = scatterTrees(TOTAL_TREES);

            // --- 5. Manager LOD ---
            // L'interface du manager attend un « high » InstancedMesh
            // unique. On encapsule les instances multiples en fournissant
            // une façade qui redirige setMatrixAt / count sur toutes.
            const highFacade = makeMultiInstancedFacade(highInstances);
            const midFacade = midGroup.facade;

            const manager = new TreeLODManager(
                positions, highFacade, midFacade, impMesh
            );

            resolve({
                group: assembleGroup(highGroup, midGroup.mesh, impMesh),
                manager,
                impostor: impMesh,
                impostorMat,
                impostorPositions: impMesh.userData.positions,
                highCount: MAX_HIGH, midCount: MAX_MID, totalCount: TOTAL_TREES,
            });
        }, undefined, (err) => {
            console.error('Échec du chargement tree.glb, fallback procédural', err);
            resolve(buildProceduralOnly(textureLoader));
        });
    });
}

/* ==========================================================
 * Façade multi-InstancedMesh : expose instanceMatrix.count,
 * count, setMatrixAt etc. en propageant à tous les sous-mesh.
 * Permet de réutiliser TreeLODManager sans le complexifier.
 * ========================================================== */
function makeMultiInstancedFacade(instancedArray) {
    return {
        get count() { return instancedArray[0].count; },
        set count(v) { instancedArray.forEach(m => m.count = v); },
        instanceMatrix: {
            get count() { return instancedArray[0].instanceMatrix.count; },
            set needsUpdate(v) {
                instancedArray.forEach(m => m.instanceMatrix.needsUpdate = v);
            },
        },
        setMatrixAt(i, m) { instancedArray.forEach(sm => sm.setMatrixAt(i, m)); },
    };
}

/* ==========================================================
 * MID LOD procédural — ~500 poly, 1 draw call
 * ========================================================== */
function buildMidLOD(count) {
    // Tronc : CylinderGeometry low poly
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 4.5, 7);
    trunkGeo.translate(0, 2.25, 0);

    // Feuillage : 2 icosaèdres empilés
    const foliageA = new THREE.IcosahedronGeometry(1.6, 0);
    foliageA.translate(0, 5.2, 0);
    const foliageB = new THREE.IcosahedronGeometry(1.2, 0);
    foliageB.translate(0.5, 6.1, 0.3);

    // Merge manuel trunk + foliages en une seule géométrie
    const geoms = [trunkGeo, foliageA, foliageB];
    const merged = mergeSimple(geoms);

    // Couleurs par sommet : tronc brun, feuillage vert chaud
    const colors = new Float32Array(merged.attributes.position.count * 3);
    const brown = new THREE.Color(0x4a2f1a);
    const leaf = new THREE.Color(0x4a6030);
    for (let i = 0; i < merged.attributes.position.count; i++) {
        const y = merged.attributes.position.getY(i);
        const c = y < 4.2 ? brown : leaf;
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
    }
    merged.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.0,
        flatShading: true,
    });

    const mesh = new THREE.InstancedMesh(merged, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.count = 0;
    mesh.frustumCulled = false;

    return {
        mesh,
        facade: {
            get count() { return mesh.count; },
            set count(v) { mesh.count = v; },
            instanceMatrix: mesh.instanceMatrix,
            setMatrixAt: (i, m) => mesh.setMatrixAt(i, m),
        },
    };
}

function mergeSimple(geoms) {
    // On ne se sert que de position + normal (pas d'UV pour les LOD mid,
    // la couleur vertex suffit).
    let totalPos = 0, totalIdx = 0;
    geoms.forEach((g) => {
        totalPos += g.attributes.position.count;
        totalIdx += (g.index ? g.index.count : g.attributes.position.count);
    });

    const pos = new Float32Array(totalPos * 3);
    const norm = new Float32Array(totalPos * 3);
    const idx = new Uint32Array(totalIdx);

    let posOff = 0, idxOff = 0, baseVert = 0;
    geoms.forEach((g) => {
        const p = g.attributes.position.array;
        const n = g.attributes.normal ? g.attributes.normal.array : new Float32Array(p.length);
        pos.set(p, posOff);
        norm.set(n, posOff);

        const vc = g.attributes.position.count;
        if (g.index) {
            for (let i = 0; i < g.index.count; i++) idx[idxOff++] = g.index.array[i] + baseVert;
        } else {
            for (let i = 0; i < vc; i++) idx[idxOff++] = i + baseVert;
        }
        posOff += p.length;
        baseVert += vc;
    });

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
}

/* ==========================================================
 * Placement : distribution inspirée de la photo de référence
 * ========================================================== */
function scatterTrees(total) {
    const positions = [];
    let attempts = 0;
    while (positions.length < total && attempts < total * 20) {
        attempts++;
        // Distribution radiale avec préférence pour un rayon moyen
        const r = randRange(8, 95);
        const a = Math.random() * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;

        if (!isOnLand(x, z, 2.5)) continue;
        if (isOnPath(x, z, 2.8)) continue;

        // Renforcement de densité le long du chemin
        const distPath = distanceToPath(x, z);
        if (distPath > 10 && Math.random() > 0.55) continue;
        if (distPath < 4 && Math.random() > 0.85) continue;

        // Moins d'arbres très près de l'eau
        if (distanceToWater(x, z) < 16 && Math.random() > 0.4) continue;

        // Rejet de positions trop proches d'arbres existants
        let tooClose = false;
        for (let i = 0; i < positions.length; i++) {
            const p = positions[i];
            if ((p.x - x) ** 2 + (p.z - z) ** 2 < 5.5) { tooClose = true; break; }
        }
        if (tooClose) continue;

        const y = getTerrainHeight(x, z);
        positions.push({
            x, y, z,
            scale: randRange(0.85, 1.35),
            rotY: Math.random() * Math.PI * 2,
        });
    }
    return positions;
}

function assembleGroup(highGroup, midMesh, impMesh) {
    const g = new THREE.Group();
    g.name = 'TreesLOD';
    g.add(highGroup);
    g.add(midMesh);
    g.add(impMesh);
    return g;
}

/* ==========================================================
 * Fallback : construire une forêt 100 % procédurale si le
 * .glb est introuvable (garantit que la scène fonctionne
 * quelles que soient les conditions).
 * ========================================================== */
function buildProceduralOnly(textureLoader) {
    const midHigh = buildMidLOD(MAX_HIGH);
    const mid = buildMidLOD(MAX_MID);
    const impostorMat = createImpostorMaterial(textureLoader);
    const impMesh = createImpostorMesh(impostorMat, MAX_IMP);
    const positions = scatterTrees(TOTAL_TREES);

    const manager = new TreeLODManager(
        positions,
        midHigh.facade,
        mid.facade,
        impMesh
    );

    const group = new THREE.Group();
    group.add(midHigh.mesh);
    group.add(mid.mesh);
    group.add(impMesh);

    return {
        group, manager, impostor: impMesh, impostorMat,
        impostorPositions: impMesh.userData.positions,
        highCount: MAX_HIGH, midCount: MAX_MID, totalCount: TOTAL_TREES,
    };
}
