/**
 * particles.js
 * -------------
 * Feuilles qui s'envolent — inspiré directement de la photo de
 * référence (on y voit des feuilles soulevées par le vent).
 *
 * Exigences du sujet respectées :
 *   - BufferGeometry obligatoire → on utilise un BufferGeometry avec
 *     attributs position + aPhase + aSize pour variation par particule.
 *   - Animation continue en boucle → une feuille qui sort du dôme
 *     est repositionnée de l'autre côté (« teleport » doux qui passe
 *     inaperçu grâce à la densité).
 *   - Système continu : uniform uTime qui avance à chaque frame.
 *
 * On utilise un Points (sprite GPU) avec un shader custom pour un
 * mouvement à 3 composantes (gravité, swirl, vent dominant). Le sprite
 * est une petite texture canvas générée au runtime → pas de fichier
 * externe requis.
 */
import * as THREE from 'three';

const COUNT = 900;
const DOMAIN_X = 80;
const DOMAIN_Y_MIN = 0;
const DOMAIN_Y_MAX = 18;
const DOMAIN_Z = 80;

function makeLeafTexture() {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');

    // Forme de feuille : ellipse avec pointe
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, '#d2b878');
    g.addColorStop(0.55, '#8a6a2f');
    g.addColorStop(1, 'rgba(120,80,30,0)');
    ctx.fillStyle = g;

    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2, size * 0.42, size * 0.25, Math.PI / 5, 0, Math.PI * 2);
    ctx.fill();

    // Nervure
    ctx.strokeStyle = 'rgba(60,40,10,0.5)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(size * 0.15, size * 0.7);
    ctx.lineTo(size * 0.85, size * 0.3);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

const vertexShader = /* glsl */`
    precision highp float;

    uniform float uTime;
    uniform vec3 uWind;
    uniform float uPixelRatio;

    attribute float aPhase;
    attribute float aSize;
    attribute float aSpeed;

    varying float vAlpha;

    void main() {
        vec3 p = position;

        float t = uTime * aSpeed;

        // Mouvement en tourbillon (swirl) autour de la position d'émission
        p.x += sin(t + aPhase) * 2.0 + uWind.x * t * 0.6;
        p.z += cos(t * 0.8 + aPhase * 1.3) * 2.0 + uWind.z * t * 0.6;

        // Chute + léger rebond (bruit)
        p.y = mod(position.y + uWind.y * t + sin(aPhase) * 1.5, ${DOMAIN_Y_MAX.toFixed(1)});
        p.y += sin(t * 2.0 + aPhase) * 0.4;

        // Wrap horizontal (boucle infinie)
        float dx = ${DOMAIN_X.toFixed(1)};
        float dz = ${DOMAIN_Z.toFixed(1)};
        p.x = mod(p.x + dx, dx * 2.0) - dx;
        p.z = mod(p.z + dz, dz * 2.0) - dz;

        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPos;

        // Taille dépendant de la distance (attenuation)
        gl_PointSize = aSize * uPixelRatio * (120.0 / -mvPos.z);

        // Fade en bas (les feuilles qui touchent le sol disparaissent)
        vAlpha = smoothstep(0.0, 1.5, p.y) * smoothstep(${DOMAIN_Y_MAX.toFixed(1)}, ${(DOMAIN_Y_MAX * 0.8).toFixed(1)}, p.y);
    }
`;

const fragmentShader = /* glsl */`
    precision highp float;
    uniform sampler2D uMap;
    varying float vAlpha;
    void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a < 0.1) discard;
        gl_FragColor = vec4(t.rgb, t.a * vAlpha);
    }
`;

export function createParticles() {
    const geometry = new THREE.BufferGeometry();

    const positions = new Float32Array(COUNT * 3);
    const phases = new Float32Array(COUNT);
    const sizes = new Float32Array(COUNT);
    const speeds = new Float32Array(COUNT);

    for (let i = 0; i < COUNT; i++) {
        positions[i * 3]     = (Math.random() - 0.5) * DOMAIN_X * 2;
        positions[i * 3 + 1] = Math.random() * DOMAIN_Y_MAX;
        positions[i * 3 + 2] = (Math.random() - 0.5) * DOMAIN_Z * 2;
        phases[i] = Math.random() * Math.PI * 2;
        sizes[i] = 18 + Math.random() * 28;
        speeds[i] = 0.3 + Math.random() * 0.6;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
            uTime: { value: 0 },
            uWind: { value: new THREE.Vector3(0.4, -0.25, 0.15) },
            uMap: { value: makeLeafTexture() },
            uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.name = 'LeafParticles';

    return {
        mesh: points,
        update(dt, elapsed) {
            material.uniforms.uTime.value = elapsed;
        },
    };
}
