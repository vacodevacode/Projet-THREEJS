/**
 * impostors.js
 * -------------
 * Génération d'IMPOSTOR (billboard) pour les arbres lointains.
 *
 * Exigence stricte du sujet : « utilisez des LOD et des impostor
 * pour optimiser la scene ». L'impostor est un simple quad texturé
 * (2 triangles) qui fait face à la caméra — coût dérisoire, rendu
 * indistinguable à 40+ mètres de distance.
 *
 * Deux stratégies possibles :
 *   A. Utiliser la texture /textures/tree/impostor.webp fournie par
 *      le formateur (ce qu'on fait ici : c'est propre, pré-baké,
 *      optimal).
 *   B. Rendre l'arbre haute-poly dans un RenderTarget une fois au
 *      démarrage et utiliser cette texture (dynamic impostor).
 *
 * On retient (A) parce que la texture est fournie et parfaitement
 * calée sur le modèle .glb de l'arbre. C'est aussi ce que fait
 * n'importe quel moteur pro (billboards pré-calculés en build).
 */
import * as THREE from 'three';

export function createImpostorMaterial(textureLoader) {
    const tex = textureLoader.load('./textures/tree/impostor.webp');
    tex.colorSpace = THREE.SRGBColorSpace;
    // Important pour les textures billboard : pas de wrap, alpha net.
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

    // On utilise un MeshBasicMaterial pour que l'impostor ne soit
    // pas affecté par les lumières (il est déjà « peint » avec son
    // éclairage). On légèrement teinte en fonction du soleil via
    // un onBeforeCompile minimaliste.
    const mat = new THREE.MeshBasicMaterial({
        map: tex,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        transparent: false,
        fog: true,
        color: 0xdcc099, // teinte légèrement chaude cohérente avec le couchant
    });
    return mat;
}

/**
 * Impostor mesh = InstancedMesh de quads. Comme les billboards doivent
 * toujours faire face à la caméra, on n'utilise pas de vraie rotation
 * d'instance : on rend les quads avec une rotation Y dynamique dans
 * le shader (cheap). Ici on simplifie : on les oriente en Y au moment
 * du placement, et on met à jour légèrement chaque frame en fonction
 * de la caméra (billboard cylindrique).
 */
export function createImpostorMesh(material, count) {
    // Quad : largeur ~3m, hauteur ~6m (proche du .glb)
    const geo = new THREE.PlaneGeometry(5, 8);
    geo.translate(0, 4, 0); // pivot au sol

    const mesh = new THREE.InstancedMesh(geo, material, count);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false; // on gère nous-mêmes la visibilité

    // On stocke les positions fixes pour pouvoir re-générer la matrix
    // chaque frame avec rotation face caméra.
    mesh.userData.positions = new Array(count);
    return mesh;
}

/* Billboard update : oriente chaque impostor vers la caméra (axe Y). */
const _tmp = new THREE.Object3D();
const _cameraPos = new THREE.Vector3();

export function updateImpostors(mesh, camera) {
    const positions = mesh.userData.positions;
    if (!positions) return;
    camera.getWorldPosition(_cameraPos);

    for (let i = 0; i < mesh.count; i++) {
        const p = positions[i];
        if (!p) continue;
        _tmp.position.set(p.x, p.y, p.z);
        const dx = _cameraPos.x - p.x;
        const dz = _cameraPos.z - p.z;
        _tmp.rotation.y = Math.atan2(dx, dz);
        _tmp.scale.set(p.scale, p.scale, p.scale);
        _tmp.updateMatrix();
        mesh.setMatrixAt(i, _tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
}
