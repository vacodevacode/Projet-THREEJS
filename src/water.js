/**
 * water.js
 * ---------
 * Plan d'eau SHADER (exigence sujet).
 * Version « avancée » pour les points bonus :
 *   - vagues par somme de sinusoïdes (gerstner-like, simplifié)
 *   - effet FRESNEL (réflexion plus intense aux angles rasants)
 *   - reflet du soleil (highlight spéculaire)
 *   - deux couleurs : eau peu profonde (cyan-vert) / eau profonde (bleu foncé)
 *   - couplage au fog : l'eau lointaine se fond correctement
 *
 * Positionné au centre du terrain conformément à la demande :
 * « l'eau en plein milieu du terrain ».
 */
import * as THREE from 'three';
import {
    WATER_CENTER, WATER_RADIUS, WATER_LEVEL,
} from './utils.js';
import { SUN_POSITION } from './lighting.js';

const vertexShader = /* glsl */`
    precision highp float;

    uniform float uTime;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUv;

    // Bruit rapide pour micro-vagues
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

    void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);

        // Somme de sinusoïdes (directions différentes)
        float t = uTime;
        float wave = 0.0;
        wave += sin(worldPos.x * 0.6 + t * 1.2) * 0.08;
        wave += sin(worldPos.z * 0.4 + t * 0.9) * 0.10;
        wave += sin((worldPos.x + worldPos.z) * 0.35 + t * 1.6) * 0.05;
        wave += sin(worldPos.x * 1.3 - worldPos.z * 0.7 + t * 2.1) * 0.03;

        worldPos.y += wave;

        // Calcul d'une normale approchée à partir des dérivées analytiques
        // (on rapproche à la main pour éviter dFdx qui n'est pas dispo en vertex)
        vec3 tangent = vec3(1.0, 0.6 * cos(worldPos.x * 0.6 + t * 1.2) + 1.3 * cos(worldPos.x * 1.3 - worldPos.z * 0.7 + t * 2.1), 0.0);
        vec3 bitangent = vec3(0.0, 0.4 * cos(worldPos.z * 0.4 + t * 0.9) - 0.7 * cos(worldPos.x * 1.3 - worldPos.z * 0.7 + t * 2.1), 1.0);
        vec3 n = normalize(cross(bitangent, tangent));

        vWorldPos = worldPos.xyz;
        vNormal = n;
        vUv = uv;

        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const fragmentShader = /* glsl */`
    precision highp float;

    uniform float uTime;
    uniform vec3 uColorShallow;
    uniform vec3 uColorDeep;
    uniform vec3 uSunDir;
    uniform vec3 uSunColor;
    uniform vec3 uSkyColor;
    uniform vec3 uFogColor;
    uniform float uFogDensity;

    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying vec2 vUv;

    void main() {
        vec3 viewDir = normalize(cameraPosition - vWorldPos);
        vec3 n = normalize(vNormal);

        // Fresnel (Schlick approximation)
        float fres = pow(1.0 - max(dot(viewDir, n), 0.0), 3.5);

        // Gradient profondeur → centre plus profond
        float distCenter = length(vWorldPos.xz);
        float depth = 1.0 - smoothstep(0.0, 14.0, distCenter);
        vec3 waterColor = mix(uColorShallow, uColorDeep, depth);

        // Reflet du ciel (teinte du ciel en fonction du fresnel)
        vec3 col = mix(waterColor, uSkyColor, fres * 0.85);

        // Highlight solaire : réflexion spéculaire sur les vagues
        vec3 R = reflect(-uSunDir, n);
        float spec = pow(max(dot(viewDir, R), 0.0), 90.0);
        col += uSunColor * spec * 2.5;

        // Pétillement : tiny noise shimmer animé
        float shimmer = sin((vWorldPos.x + vWorldPos.z) * 8.0 + uTime * 5.0) * 0.5 + 0.5;
        col += uSunColor * shimmer * 0.04 * fres;

        // Fog exponentiel manuel (cohérence scène)
        float depthCam = length(cameraPosition - vWorldPos);
        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * depthCam * depthCam);
        col = mix(col, uFogColor, fogFactor);

        gl_FragColor = vec4(col, 0.92);
    }
`;

export function createWater() {
    const geometry = new THREE.PlaneGeometry(
        WATER_RADIUS * 2 + 4, WATER_RADIUS * 2 + 4,
        64, 64
    );
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
            uTime: { value: 0 },
            uColorShallow: { value: new THREE.Color(0x6aa39b) },
            uColorDeep: { value: new THREE.Color(0x0f2a3a) },
            uSunDir: { value: SUN_POSITION.clone().normalize() },
            uSunColor: { value: new THREE.Color(0xffd097) },
            uSkyColor: { value: new THREE.Color(0xffb085) },
            uFogColor: { value: new THREE.Color(0xd2976a) },
            uFogDensity: { value: 0.0085 },
        },
        transparent: true,
        depthWrite: false,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(WATER_CENTER.x, WATER_LEVEL, WATER_CENTER.z);
    mesh.name = 'Water';
    mesh.renderOrder = 1;

    return {
        mesh,
        update(dt, elapsed) {
            material.uniforms.uTime.value = elapsed;
        },
    };
}
