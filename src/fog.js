/**
 * fog.js
 * -------
 * Brouillard exponentiel (FogExp2) : donne la profondeur
 * atmosphérique indispensable à l'ambiance coucher de soleil.
 * La couleur est calée sur le ciel lointain pour que la transition
 * horizon / arbres lointains soit imperceptible (pas de ligne dure).
 *
 * La densité est faible mais non nulle pour conserver la lisibilité.
 */
import * as THREE from 'three';

export const FOG_COLOR = 0xd2976a; // orange chaud du couchant

export function createFog() {
    // FogExp2 : décroissance exponentielle = résultat plus doux et physique
    // que Fog linéaire, et cohérent avec les brumes réelles.
    return new THREE.FogExp2(FOG_COLOR, 0.0085);
}
