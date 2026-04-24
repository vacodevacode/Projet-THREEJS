/**
 * postprocessing.js
 * ------------------
 * Chaîne de post-processing : EffectComposer → RenderPass → UnrealBloomPass
 *
 * POURQUOI LE BLOOM ? (Justification pédagogique explicite)
 * ----------------------------------------------------------
 * Le sujet demande « réfléchissez à votre décision et pourquoi ça sera
 * le bloom ». Voici la réponse complète :
 *
 *   1. La scène représente un coucher de soleil : le soleil brille à
 *      l'horizon et émet bien plus de lumière que les autres surfaces.
 *      Sans bloom, cette différence d'intensité est clippée : le disque
 *      solaire devient un simple cercle blanc, sans volume. Le bloom
 *      simule le comportement optique d'une rétine / d'un objectif
 *      photo qui diffuse la lumière des zones très brillantes, donnant
 *      au couchant son caractère chaleureux et enveloppant.
 *
 *   2. Les feuilles-particules traversent parfois le halo solaire :
 *      le bloom les baigne alors d'une auréole dorée, renforçant
 *      l'atmosphère mélancolique voulue par la scène.
 *
 *   3. Les reflets sur l'eau centrale, lorsqu'ils captent le soleil,
 *      produisent des highlights très intenses : le bloom les
 *      transforme en étincelles organiques qui attirent le regard
 *      vers le point focal de la composition.
 *
 *   4. En termes techniques : c'est le post-processing le plus
 *      universellement utilisé en real-time rendering pour les
 *      ambiances HDR. Il n'y a pratiquement aucun moteur AAA qui s'en
 *      passe. Il tire le meilleur parti de notre tone mapping ACES
 *      déjà activé dans le renderer.
 *
 * Paramètres :
 *   - strength  : intensité du halo (modéré, 0.65, pour rester sobre)
 *   - radius    : taille du halo (0.6, diffusion douce)
 *   - threshold : au-dessus de quelle luminosité on bloom (0.7 →
 *                 seuls le soleil, ses reflets et les hautes lumières
 *                 sont concernés, pas les tons moyens verts).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createComposer(renderer, scene, camera) {
    const composer = new EffectComposer(renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(window.innerWidth, window.innerHeight);

    // Passe 1 : rendu de la scène en HDR linéaire
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    // Passe 2 : BLOOM — le cœur de notre post-processing
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.65, // strength
        0.55, // radius
        0.72  // threshold
    );
    composer.addPass(bloomPass);

    // Passe 3 : conversion finale sRGB + tone mapping
    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    return { composer, bloomPass };
}
