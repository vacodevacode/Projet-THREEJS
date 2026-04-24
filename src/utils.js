/**
 * utils.js
 * ----------
 * Fonctions utilitaires partagées : bruit procédural (Perlin-like), helpers
 * pour placer la végétation et échantillonner la hauteur du terrain.
 * Le bruit 2D est implémenté ici pour éviter toute dépendance externe :
 * on reste 100 % CDN + code pur (conforme à la contrainte du sujet).
 */

/* =========================================================
 * Bruit pseudo-Perlin 2D — noise2D(x, y) ∈ [-1, 1]
 * Implémentation inspirée de l'algorithme Perlin classique,
 * simplifiée et déterministe (table permutée fixe).
 * ========================================================= */
const PERM = new Uint8Array(512);
(function initPerm() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Shuffle déterministe (seed fixe pour reproductibilité)
    let seed = 1337;
    const rnd = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + t * (b - a); }
function grad(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
}

export function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x);
    const v = fade(y);
    const A = PERM[X] + Y;
    const B = PERM[X + 1] + Y;
    return lerp(
        lerp(grad(PERM[A], x, y), grad(PERM[B], x - 1, y), u),
        lerp(grad(PERM[A + 1], x, y - 1), grad(PERM[B + 1], x - 1, y - 1), u),
        v
    ) * 0.5; // normalisé approx. [-1, 1]
}

/* fBm = bruit fractal : plusieurs octaves pour un terrain plus naturel */
export function fbm2D(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let sum = 0;
    let amp = 1;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
        sum += amp * noise2D(x * freq, y * freq);
        norm += amp;
        amp *= gain;
        freq *= lacunarity;
    }
    return sum / norm;
}

/* =========================================================
 * Hauteur du terrain — fonction centrale partagée par tous
 * les modules qui veulent placer quelque chose au sol.
 * Garantit que l'herbe, les arbres, les buissons, etc. sont
 * cohérents avec la géométrie du mesh du sol.
 * ========================================================= */
export function getTerrainHeight(x, z) {
    // Grandes collines
    const h1 = fbm2D(x * 0.008, z * 0.008, 4) * 6.0;
    // Détails moyens
    const h2 = fbm2D(x * 0.04, z * 0.04, 2) * 0.8;
    // Petites bosses
    const h3 = noise2D(x * 0.15, z * 0.15) * 0.2;
    return h1 + h2 + h3;
}

/* =========================================================
 * Zone d'eau centrale : on creuse légèrement le terrain au
 * centre pour accueillir le plan d'eau. Renvoie vrai si on
 * est au-dessus de l'eau pour le placement de végétation.
 * ========================================================= */
export const WATER_CENTER = { x: 0, z: 0 };
export const WATER_RADIUS = 12;
export const WATER_LEVEL = -1.2;

export function distanceToWater(x, z) {
    const dx = x - WATER_CENTER.x;
    const dz = z - WATER_CENTER.z;
    return Math.sqrt(dx * dx + dz * dz);
}

export function isOnLand(x, z, margin = 1.0) {
    return distanceToWater(x, z) > WATER_RADIUS + margin;
}

/* =========================================================
 * Utilitaires divers
 * ========================================================= */
export function randRange(min, max) { return min + Math.random() * (max - min); }
export function randInt(min, max) { return Math.floor(randRange(min, max + 1)); }
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* Courbe : chemin central à travers la forêt (pour dégager l'avenue) */
export function distanceToPath(x, z) {
    // Chemin sinueux le long de l'axe Z, avec un léger serpentin
    const pathX = Math.sin(z * 0.05) * 2.0;
    return Math.abs(x - pathX);
}

export function isOnPath(x, z, width = 2.5) {
    return distanceToPath(x, z) < width;
}
