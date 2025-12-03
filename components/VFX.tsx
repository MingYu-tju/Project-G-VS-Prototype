import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, extend, createPortal, useThree } from '@react-three/fiber';
import { Mesh, Group, MathUtils, AdditiveBlending, ShaderMaterial, Color, DoubleSide, CylinderGeometry, Vector3, Object3D, Matrix4, Quaternion } from 'three';
import { SlashSpecsGroup, SlashSpec } from '../types';
import { useGameStore } from '../store'; // ADDED: Import store

// --- SLASH VFX CONFIGURATION ---
export const DEFAULT_SLASH_SPECS: SlashSpecsGroup ={
    SIZE: 4.4, WIDTH: 2.5, ARC: 2.9,
    SLASH_1: { color: '#ff00aa', pos: [0.06,1.21,-0.34], rot: [-1.64,1.31,-0.39], startAngle: 2.208, speed: 1, delay: 0 },
    SLASH_2: { color: '#ff00aa', pos: [-0.54,1.86,0], rot: [1.371,1.86,0.86], startAngle: 0.708, speed: -1, delay: 0.1 },
    SLASH_3: { color: '#ff00aa', pos: [0.06,1.31,-0.04], rot: [-1.34,1.21,1.21], startAngle: 1.708, speed: 1, delay: 0.3 },
    SIDE_SLASH_1: { color: '#ff00aa', pos: [-0.19,1.66,-0.19], rot: [1.21,0.51,0.31], startAngle: 0.108, speed: 0.4, delay: 0.08 },
    SIDE_SLASH_2: { color: '#ff00aa', pos: [0.01,2.11,0], rot: [1.371,-0.39,0.86], startAngle: 0.408, speed: -1, delay: 0.15 },
    SIDE_SLASH_3: { color: '#ff00aa', pos: [0.06,1.31,-0.04], rot: [-1.34,1.21,1.21], startAngle: 1.708, speed: 1, delay: 0.3 }
};

export class SlashMaterial extends ShaderMaterial {
    constructor() {
        super({
            uniforms: {
                uColor: { value: new Color('#00ffff') },
                uOpacity: { value: 0 },
                uInnerRadius: { value: 0.6 }, 
                uArc: { value: Math.PI }      
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                uniform vec3 uColor;
                uniform float uOpacity;
                uniform float uInnerRadius;
                uniform float uArc;

                void main() {
                    vec2 centered = vUv - 0.5;
                    float dist = length(centered) * 2.0; 

                    float radialAlpha = smoothstep(uInnerRadius, 1.0, dist);
                    radialAlpha *= step(dist, 1.0);

                    float angle = atan(centered.y, centered.x);
                    if (angle < 0.0) angle += 6.2831853;

                    float fadeWidth = 0.3; 
                    float startFade = smoothstep(0.0, fadeWidth, angle);
                    float endFade = 1.0 - smoothstep(uArc - fadeWidth, uArc, angle);
                    
                    float angularAlpha = startFade * endFade;
                    float finalAlpha = radialAlpha * angularAlpha * uOpacity;
                    
                    if (finalAlpha < 0.01) discard;

                    gl_FragColor = vec4(uColor, finalAlpha);
                }
            `,
            transparent: true,
            side: DoubleSide,
            depthWrite: false,
            blending: AdditiveBlending
        });
    }
}
extend({ SlashMaterial });

// Add to JSX Intrinsic Elements
declare global {
    namespace JSX {
        interface IntrinsicElements {
            slashMaterial: any;
        }
    }
}

// --- MELEE TYPES for internal use ---
type MeleePhase = 
    'NONE' | 'STARTUP' | 'LUNGE' | 'SLASH_1' | 'SLASH_2' | 'SLASH_3' | 'RECOVERY' |
    'SIDE_STARTUP' | 'SIDE_LUNGE' | 'SIDE_SLASH_1' | 'SIDE_SLASH_2' | 'SIDE_SLASH_3' | 'SIDE_RECOVERY';

interface SlashEffectProps {
    meleeState?: React.MutableRefObject<MeleePhase>;
    parentRef?: React.RefObject<Group>;
    overrideSpecs?: SlashSpecsGroup;
    manualProgress?: number | null;
    manualMode?: string | null;
}

export const ProceduralSlashEffect: React.FC<SlashEffectProps> = ({ 
    meleeState, 
    parentRef,
    overrideSpecs,
    manualProgress = null,
    manualMode = null
}) => {
    const meshRef = useRef<Mesh>(null);
    const materialRef = useRef<any>(null);
    const SPECS = overrideSpecs || DEFAULT_SLASH_SPECS;
    const rawInner = 1.0 - (SPECS.WIDTH / SPECS.SIZE);
    const innerR = Math.max(0.01, Math.min(0.99, rawInner));
    const animState = useRef({
        active: false,
        progress: 0,
        age: 0, 
        currentSlash: 'NONE' as string,
        spec: SPECS.SLASH_1 
    });

    useFrame((state, delta) => {
        if (!meshRef.current || !materialRef.current) return;

        // NEW: Check for HitStop and freeze VFX
        const hitStop = useGameStore.getState().hitStop;
        if (hitStop > 0) return;

        materialRef.current.uniforms.uInnerRadius.value = innerR;
        materialRef.current.uniforms.uArc.value = SPECS.ARC;

        if (manualProgress !== null && manualMode) {
            let spec = SPECS.SLASH_1;
            if (manualMode === 'SLASH_2') spec = SPECS.SLASH_2;
            else if (manualMode === 'SLASH_3') spec = SPECS.SLASH_3;
            else if (manualMode === 'SIDE_SLASH_1') spec = SPECS.SIDE_SLASH_1;
            else if (manualMode === 'SIDE_SLASH_2') spec = SPECS.SIDE_SLASH_2;
            else if (manualMode === 'SIDE_SLASH_3') spec = SPECS.SIDE_SLASH_3;

            meshRef.current.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
            meshRef.current.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
            meshRef.current.scale.setScalar(SPECS.SIZE);
            materialRef.current.uniforms.uColor.value.set(spec.color);
            materialRef.current.uniforms.uArc.value = SPECS.ARC;
            let opacity = 0;
            const p = manualProgress;
            if (p < 0.2) opacity = p / 0.2;
            else opacity = 1 - (p - 0.2) / 0.8;
            opacity = Math.max(0, opacity);
            materialRef.current.uniforms.uOpacity.value = opacity * 0.8;
            const currentRotation = spec.startAngle + (p * spec.speed);
            meshRef.current.rotation.z = currentRotation;
            return; 
        }

        if (!meleeState) return;
        const currentPhase = meleeState.current;
        const s = animState.current;
        const timeScale = delta * 60; 

        if (currentPhase.includes('SLASH') && currentPhase !== s.currentSlash) {
            s.active = true;
            s.currentSlash = currentPhase;
            s.progress = 0;
            s.age = 0;
            if (currentPhase === 'SLASH_1') s.spec = SPECS.SLASH_1;
            else if (currentPhase === 'SLASH_2') s.spec = SPECS.SLASH_2;
            else if (currentPhase === 'SLASH_3') s.spec = SPECS.SLASH_3;
            else if (currentPhase === 'SIDE_SLASH_1') s.spec = SPECS.SIDE_SLASH_1;
            else if (currentPhase === 'SIDE_SLASH_2') s.spec = SPECS.SIDE_SLASH_2;
            else if (currentPhase === 'SIDE_SLASH_3') s.spec = SPECS.SIDE_SLASH_3;
            else s.active = false; 

            if (s.active) {
                meshRef.current.position.set(s.spec.pos[0], s.spec.pos[1], s.spec.pos[2]);
                meshRef.current.rotation.set(s.spec.rot[0], s.spec.rot[1], s.spec.rot[2]);
                meshRef.current.scale.setScalar(SPECS.SIZE);
                materialRef.current.uniforms.uColor.value.set(s.spec.color);
                materialRef.current.uniforms.uArc.value = SPECS.ARC;
                materialRef.current.uniforms.uOpacity.value = 0; 
            }
        }
        else if (!currentPhase.includes('SLASH')) {
            s.active = false;
            s.currentSlash = 'NONE';
        }

        if (s.active) {
            s.age += delta;
            if (s.age < s.spec.delay) {
                materialRef.current.uniforms.uOpacity.value = 0;
                return;
            }
            s.progress += 0.02 * Math.abs(s.spec.speed) * timeScale; 
            let opacity = 0;
            if (s.progress < 0.2) opacity = s.progress / 0.2;
            else opacity = 1 - (s.progress - 0.2) / 0.8;
            opacity = Math.max(0, opacity);
            materialRef.current.uniforms.uOpacity.value = opacity * 0.8; 
            const currentRotation = s.spec.startAngle + (s.progress * s.spec.speed);
            meshRef.current.rotation.z = currentRotation;
            if (s.progress >= 1.0) {
                s.active = false;
                materialRef.current.uniforms.uOpacity.value = 0;
            }
        } else {
            materialRef.current.uniforms.uOpacity.value = 0;
        }
    });

    return (
        <mesh ref={meshRef}>
            <ringGeometry args={[innerR, 1.0, 32, 1, 0, SPECS.ARC]} />
            <slashMaterial 
                ref={materialRef} 
                uInnerRadius={innerR}
                uArc={SPECS.ARC}
            />
        </mesh>
    );
};

export const BoostBurst: React.FC<{ triggerTime: number }> = ({ triggerTime }) => {
    const groupRef = useRef<Group>(null);
    const DURATION = 0.4; 
    const CONE_LENGTH = 1.6;
    const CONE_WIDTH = 0.08;
    const TILT_ANGLE = -35;
    const BURST_COLOR = "#00ffff"; 

    useFrame(() => {
        if (!groupRef.current) return;
        const now = Date.now();
        const elapsed = (now - triggerTime) / 1000;
        if (elapsed > DURATION) {
            groupRef.current.visible = false;
            return;
        }
        groupRef.current.visible = true;
        const scaleProgress = elapsed / DURATION;
        const scale = MathUtils.lerp(0.5, 2.5, Math.pow(scaleProgress, 0.3));
        groupRef.current.scale.setScalar(scale);
        let opacity = 0;
        if (elapsed < 0.1) {
            opacity = elapsed / 0.1;
        } else {
            const fadeOutProgress = (elapsed - 0.1) / (DURATION - 0.1);
            opacity = 1 - fadeOutProgress;
        }
        groupRef.current.children.forEach((angleGroup: any) => {
            if (angleGroup.children && angleGroup.children[0] && angleGroup.children[0].children[0]) {
                const mesh = angleGroup.children[0].children[0];
                if (mesh.material) mesh.material.opacity = opacity;
            }
        });
    });

    return (
        <group ref={groupRef} visible={false} position={[0, -0.2, -0.3]} rotation={[0, 0, 0]}>
            {[45, 135, 225, 315].map((angle, i) => (
                <group key={i} rotation={[0, 0, MathUtils.degToRad(angle)]}>
                    <group rotation={[MathUtils.degToRad(TILT_ANGLE), 0, 0]}>
                        <mesh position={[0, CONE_LENGTH / 2, 0]}> 
                            <cylinderGeometry args={[0, CONE_WIDTH, CONE_LENGTH, 8, 1]} /> 
                            <meshBasicMaterial color={BURST_COLOR} transparent depthWrite={false} blending={AdditiveBlending} />
                        </mesh>
                    </group>
                </group>
            ))}
        </group>
    );
};

export const ThrusterPlume: React.FC<{ active: boolean, offset: [number, number, number], angle?: [ number, number, number], isAscending?: boolean , isFoot?:boolean, isLeft?:boolean}> = ({ active, offset, angle, isAscending, isFoot, isLeft}) => {
    const groupRef = useRef<Group>(null);
    useFrame((state) => {
        if (!groupRef.current) return;
        const flicker = MathUtils.randFloat(0.3, 1.2);
        const targetScale = active ? 1 : 0;
        const lerpSpeed = 0.1;
        groupRef.current.scale.z = MathUtils.lerp(groupRef.current.scale.z, targetScale * flicker, lerpSpeed);
        groupRef.current.scale.x = MathUtils.lerp(groupRef.current.scale.x, targetScale, lerpSpeed);
        groupRef.current.scale.y = MathUtils.lerp(groupRef.current.scale.y, targetScale, lerpSpeed);
        groupRef.current.visible = groupRef.current.scale.z > 0.05;
    });
    
    let finalAngle = angle ? [...angle] : [0,0,0];
    let finalOffset = offset ? [...offset] : [0,0,0];

    if (angle)
        finalAngle[0]=isAscending?(isLeft?angle[0]-1.2:angle[0]):angle[0];
    if(offset){
        finalOffset[1]=isAscending?(isLeft?offset[1]:offset[1]-0.15):offset[1]
        finalOffset[2]=isAscending?(isLeft?offset[2]+0.35:offset[2]+0.28):offset[2];
    }
    
    return (
        <group ref={groupRef} position={[0,-0.1,isAscending?0.3:0]}>
            <group rotation={[isAscending ? Math.PI + Math.PI/5 : -Math.PI/5 - Math.PI/2, 0, 0]}  visible={!isFoot}>
                <mesh position={[0, -0.3, 0.8]}>
                    <cylinderGeometry args={[0.02, 0.1, 1.5, 8]} rotation={[Math.PI/2, 0, 0]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.8} depthWrite={false} />
                </mesh>
                <mesh position={[0, -0.3, 0.5]}>
                    <cylinderGeometry args={[0.05, 0.15, 0.8, 8]} rotation={[Math.PI/2, 0, 0]} />
                    <meshBasicMaterial color="#ffffff" transparent opacity={0.4} depthWrite={false} />
                </mesh>
            </group>
            <group rotation={[finalAngle[0], finalAngle[1], finalAngle[2]]}  visible={isFoot}>
                <mesh position={[finalOffset[0], finalOffset[1], finalOffset[2]]}>
                    <cylinderGeometry args={[0.02, 0.1, 0.8, 8]} rotation={[0,0,0]} />
                    <meshBasicMaterial color="#00ffff" transparent opacity={0.8} depthWrite={false} />
                </mesh>
            </group>
        </group>
    );
};

export const MuzzleFlash: React.FC<{ active: boolean }> = ({ active }) => {
    const ref = useRef<Mesh>(null);
    const [scale, setScale] = useState(0);
    useEffect(() => {
        if (active) setScale(1.5);
    }, [active]);
    useFrame(() => {
        if (!ref.current) return;
        if (scale > 0) {
            setScale(s => Math.max(0, s - 0.2));
            ref.current.scale.setScalar(scale);
            ref.current.visible = true;
        } else {
            ref.current.visible = false;
        }
    });
    return (
        <mesh ref={ref} visible={false}>
            <sphereGeometry args={[0.5, 8, 8]} />
            <meshBasicMaterial color="#FFD966" transparent opacity={0.8} />
        </mesh>
    );
};

interface GhostEmitterProps {
    active: boolean;
    size?: [number, number, number];
    offset?: [number, number, number];
    rainbow?: boolean;
}

const MAX_GHOSTS = 60;
const GHOST_LIFETIME = 20;
const SPAWN_INTERVAL = 5;

export const GhostEmitter: React.FC<GhostEmitterProps> = ({ active, size=[0.4, 0.6, 0.4], offset=[0,0,0], rainbow=false }) => {
    const { scene } = useThree();
    const meshRef = useRef<any>(null);
    const trackerRef = useRef<Group>(null);
    const frameCount = useRef(0);
    const head = useRef(0);
    const ghostData = useRef(new Float32Array(MAX_GHOSTS * 16)); 
    const ghostAges = useRef(new Int16Array(MAX_GHOSTS).fill(-1));
    const ghostColors = useRef(new Float32Array(MAX_GHOSTS * 3)); 
    const tempObj = useMemo(() => new Object3D(), []);
    const tempMat = useMemo(() => new Matrix4(), []);
    const tempPos = useMemo(() => new Vector3(), []);
    const tempQuat = useMemo(() => new Quaternion(), []);
    const tempScale = useMemo(() => new Vector3(), []);
    const tempColor = useMemo(() => new Color(), []);

    useFrame(() => {
        if (!trackerRef.current || !meshRef.current) return;
        frameCount.current++;
        const currentInterval = rainbow ? 2 : SPAWN_INTERVAL;
        if (active && frameCount.current % currentInterval === 0) {
            trackerRef.current.updateMatrixWorld();
            const matrix = trackerRef.current.matrixWorld;
            const idx = head.current;
            for(let i=0; i<16; i++) {
                ghostData.current[idx * 16 + i] = matrix.elements[i];
            }
            ghostAges.current[idx] = 0;
            if (rainbow) {
                const hue = (frameCount.current * 0.04) % 1.0;
                tempColor.setHSL(hue, 1.0, 0.5);
            } else {
                tempColor.set('#aaaaaa');
            }
            ghostColors.current[idx*3] = tempColor.r;
            ghostColors.current[idx*3+1] = tempColor.g;
            ghostColors.current[idx*3+2] = tempColor.b;
            head.current = (head.current + 1) % MAX_GHOSTS;
        }
        let activeCount = 0;
        for (let i = 0; i < MAX_GHOSTS; i++) {
            const age = ghostAges.current[i];
            if (age >= 0 && age < GHOST_LIFETIME) {
                ghostAges.current[i]++;
                tempMat.fromArray(ghostData.current, i * 16);
                tempMat.decompose(tempPos, tempQuat, tempScale);
                const lifeRatio = 1 - (age / GHOST_LIFETIME);
                const s = lifeRatio * 0.9 + 0.1;
                tempScale.multiplyScalar(s);
                tempObj.position.copy(tempPos);
                tempObj.quaternion.copy(tempQuat);
                tempObj.scale.copy(tempScale);
                tempObj.updateMatrix();
                meshRef.current.setMatrixAt(i, tempObj.matrix);
                tempColor.setRGB(ghostColors.current[i*3], ghostColors.current[i*3+1], ghostColors.current[i*3+2]);
                meshRef.current.setColorAt(i, tempColor);
                activeCount++;
            } else {
                tempMat.identity().scale(new Vector3(0,0,0));
                meshRef.current.setMatrixAt(i, tempMat);
            }
        }
        meshRef.current.count = MAX_GHOSTS;
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) {
            meshRef.current.instanceColor.needsUpdate = true;
        }
    });

    return (
        <>
            <group ref={trackerRef} position={[offset[0], offset[1], offset[2]]} />
            {createPortal(
                <instancedMesh 
                    ref={meshRef} 
                    args={[undefined, undefined, MAX_GHOSTS]} 
                    frustumCulled={false}
                >
                    <boxGeometry args={[size[0], size[1], size[2]]} />
                    <meshBasicMaterial transparent opacity={rainbow?0.8:0.4} blending={AdditiveBlending} depthWrite={false} />
                </instancedMesh>,
                scene
            )}
        </>
    );
};