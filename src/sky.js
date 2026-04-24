/**
 * sky.js
 * -------
 * Ciel procédural par SHADER (aucune texture skybox requise — conforme
 * à la contrainte du projet où le dossier /textures/Skybox est vide).
 *
 * Le ciel est un grand skybox inversé (normals rendered from the inside)
 * avec un fragment shader qui compose :
 *   - un gradient vertical coucher de soleil (orange → rouge → bleu nuit)
 *   - un halo chaud autour de la direction du soleil (disque + diffusion)
 *   - des nuages doux procéduraux (bruit FBM)
 *   - un effet d'horizon brumeux qui se raccorde au fog de la scène
 *
 * Le shader est conçu pour que le soleil à l'écran « bloom » après
 * post-processing (valeur > 1.0 en HDR).
 */
import * as THREE from 'three';
import { SUN_POSITION } from './lighting.js';
import { FOG_COLOR } from './fog.js';

const vertexShader = /* glsl */`
    varying vec3 vWorldDir;
    void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const fragmentShader = /* glsl */`
    precision highp float;

    varying vec3 vWorldDir;

    uniform vec3 uSunDir;
    uniform vec3 uColorHorizon;
    uniform vec3 uColorZenith;
    uniform vec3 uColorGround;
    uniform vec3 uSunColor;
    uniform float uTime;

    // Hash + noise 3D rapides pour nuages
    float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
            mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
            f.z);
    }
    float fbm(vec3 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) {
            s += a * noise(p);
            p *= 2.02;
            a *= 0.5;
        }
        return s;
    }

    void main() {
        vec3 dir = normalize(vWorldDir);
        float up = clamp(dir.y, -1.0, 1.0);

        // Gradient vertical : sol (en bas), horizon chaud, zenith froid
        float tAbove = smoothstep(0.0, 0.45, up);
        float tBelow = smoothstep(0.0, -0.2, up);

        vec3 sky = mix(uColorHorizon, uColorZenith, tAbove);
        sky = mix(sky, uColorGround, tBelow);

        // Disque solaire + halo
        float sunDot = max(dot(dir, uSunDir), 0.0);
        float disc = pow(sunDot, 900.0) * 8.0;          // disque net
        float halo = pow(sunDot, 6.0) * 0.55;           // halo proche
        float diffuse = pow(sunDot, 2.0) * 0.25;        // diffusion lointaine
        sky += uSunColor * (disc + halo + diffuse);

        // Nuages (seulement au-dessus de l'horizon)
        if (up > 0.0) {
            vec3 p = dir * 3.0;
            p.xz += uTime * 0.01;
            float clouds = fbm(p);
            clouds = smoothstep(0.5, 0.75, clouds) * smoothstep(0.0, 0.35, up);
            // Nuages éclairés par le soleil : chauds vers le soleil, gris vers l'opposé
            vec3 cloudColor = mix(vec3(0.55, 0.52, 0.62), uSunColor * 1.4, pow(sunDot, 1.5));
            sky = mix(sky, cloudColor, clouds * 0.7);
        }

        // Brume horizon : raccord avec le fog
        float horizonFog = pow(1.0 - abs(up), 8.0);
        sky = mix(sky, uColorHorizon * 1.15, horizonFog * 0.6);

        gl_FragColor = vec4(sky, 1.0);
    }
`;

export function createSky(scene, camera) {
    // Box suffisamment grande pour dépasser la végétation lointaine
    // mais assez petite pour rester dans le far plane caméra (400).
    // On la re-centre sur la caméra à chaque frame pour qu'elle paraisse
    // infinie — technique skybox classique.
    const geo = new THREE.BoxGeometry(350, 350, 350);

    const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
            uSunDir: { value: SUN_POSITION.clone().normalize() },
            uColorHorizon: { value: new THREE.Color(FOG_COLOR) },
            uColorZenith: { value: new THREE.Color(0x1a3d66) },
            uColorGround: { value: new THREE.Color(0x2a1a0e) },
            uSunColor: { value: new THREE.Color(0xffd097) },
            uTime: { value: 0 },
        },
    });

    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -1; // toujours rendu avant le reste
    sky.frustumCulled = false;
    scene.add(sky);

    return {
        mesh: sky,
        update(dt, elapsed) {
            mat.uniforms.uTime.value = elapsed;
            // Le ciel suit la caméra → effet d'infini parfait
            if (camera) sky.position.copy(camera.position);
        },
    };
}
