/**
 * lodSystem.js
 * -------------
 * Pilotage centralisé du LOD pour les arbres.
 *
 * Rappel exigence : « High poly proche / Medium distance / Billboard
 * impostor loin ».
 *
 * Implémentation :
 *   - HIGH_LOD_DISTANCE  : arbres visibles en détail (InstancedMesh
 *     haute résolution — géométrie du .glb dupliquée par instance).
 *   - MID_LOD_DISTANCE   : arbres en géométrie simplifiée (trunk +
 *     sphere foliage, ~500 poly).
 *   - FAR                : impostors (billboards 2-tris).
 *
 * À chaque frame on classe chaque position d'arbre dans une des 3
 * listes selon la distance caméra, et on met à jour les counts des
 * InstancedMesh correspondants. C'est le principe du « dynamic LOD ».
 *
 * Note : pour limiter le coût de ce tri, il n'est réalisé qu'à une
 * fréquence de ~6 Hz (toutes les 160 ms). La scène reste fluide.
 */
import * as THREE from 'three';

export const HIGH_LOD_DISTANCE = 28;
export const MID_LOD_DISTANCE = 70;
// Au-delà → impostor

const _v = new THREE.Vector3();
const _dummy = new THREE.Object3D();

export class TreeLODManager {
    /**
     * @param {Array<{x:number,y:number,z:number,scale:number,rotY:number}>} positions
     * @param {THREE.InstancedMesh} highMesh
     * @param {THREE.InstancedMesh} midMesh
     * @param {THREE.InstancedMesh} impostorMesh
     */
    constructor(positions, highMesh, midMesh, impostorMesh) {
        this.positions = positions;
        this.high = highMesh;
        this.mid = midMesh;
        this.imp = impostorMesh;

        // Budget d'instances (alloué dans createTrees), on n'y dépassera jamais
        this.high.count = 0;
        this.mid.count = 0;
        this.imp.count = 0;

        this.imp.userData.positions = new Array(impostorMesh.instanceMatrix.count);

        this._lastUpdate = -1;
        this.updateInterval = 0.16;
    }

    update(camera, elapsed) {
        if (elapsed - this._lastUpdate < this.updateInterval) return;
        this._lastUpdate = elapsed;

        camera.getWorldPosition(_v);
        const camX = _v.x, camZ = _v.z;

        let hi = 0, md = 0, ip = 0;
        const highMax = this.high.instanceMatrix.count;
        const midMax = this.mid.instanceMatrix.count;
        const impMax = this.imp.instanceMatrix.count;

        for (let i = 0; i < this.positions.length; i++) {
            const p = this.positions[i];
            const dx = p.x - camX;
            const dz = p.z - camZ;
            const d = Math.sqrt(dx * dx + dz * dz);

            _dummy.position.set(p.x, p.y, p.z);
            _dummy.rotation.set(0, p.rotY, 0);
            _dummy.scale.set(p.scale, p.scale, p.scale);
            _dummy.updateMatrix();

            if (d < HIGH_LOD_DISTANCE && hi < highMax) {
                this.high.setMatrixAt(hi++, _dummy.matrix);
            } else if (d < MID_LOD_DISTANCE && md < midMax) {
                this.mid.setMatrixAt(md++, _dummy.matrix);
            } else if (ip < impMax) {
                // Les impostors utilisent un billboard dynamique :
                // on ne fait que stocker la position et on laisse
                // updateImpostors() faire la matrice face caméra.
                this.imp.userData.positions[ip] = {
                    x: p.x, y: p.y, z: p.z, scale: p.scale,
                };
                ip++;
            }
        }

        this.high.count = hi;
        this.mid.count = md;
        this.imp.count = ip;
        this.high.instanceMatrix.needsUpdate = true;
        this.mid.instanceMatrix.needsUpdate = true;
        // impostor instanceMatrix mis à jour par updateImpostors()
    }
}
