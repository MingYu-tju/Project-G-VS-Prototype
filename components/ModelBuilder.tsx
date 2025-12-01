
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, useCursor, Html, useGLTF } from '@react-three/drei';
import { Vector3, Euler, Mesh, Group, MathUtils, Color, AdditiveBlending, BoxGeometry } from 'three';

// --- TYPES ---

type ShapeType = 'group' | 'box' | 'cylinder' | 'head' | 'prism' | 'trapezoid';

interface ModelPart {
    id: string;
    name: string;
    type: ShapeType;
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    args: number[]; 
    color: string;
    children: ModelPart[];
    visible: boolean;
}

// --- ASSETS (Copied from Player.tsx for visual fidelity) ---
const MODEL_PATH = '/models/head.glb';
useGLTF.preload(MODEL_PATH);

const MechaHead: React.FC<{ mainColor: string }> = ({ mainColor }) => {
    const { nodes } = useGLTF(MODEL_PATH) as any;
    const meshProps = {}; 
    return (
        <group position={[-0.08, 0.4, 0.1]} >
            <group dispose={null}>
                <group position={[-0, -0.28, -0]} scale={0.02}>
                    <group rotation={[Math.PI / 2, 0, 0]}>
                      <mesh geometry={nodes.Polygon_35.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps} > <meshToonMaterial color={mainColor} /></mesh>
                      <mesh geometry={nodes.Polygon_55.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#00ff00" /></mesh>
                      <mesh geometry={nodes.Polygon_56.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#00ff00" /></mesh>
                      <mesh geometry={nodes.Polygon_57.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ff0000" /></mesh>
                      <mesh geometry={nodes.Polygon_58.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}><meshToonMaterial color={mainColor} /></mesh>
                      <mesh geometry={nodes.Polygon_59.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ffff00" /></mesh>
                      <mesh geometry={nodes.Polygon_60.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#000000" /></mesh>
                      <mesh geometry={nodes.Polygon_61.geometry} position={[6.218, 171.76, 3.453]} scale={0.175} {...meshProps}> <meshToonMaterial color="#ff0000" /></mesh>
                    </group>
                </group>
            </group>
        </group>
    );
};

// --- TRAPEZOID GEOMETRY COMPONENT ---
const Trapezoid: React.FC<{ args: number[], color: string, isSelected: boolean }> = ({ args, color, isSelected }) => {
    const [width, height, depth, topScaleX, topScaleZ] = args;
    
    // USE MEMO FOR STABLE GEOMETRY GENERATION
    const geometry = useMemo(() => {
        const geo = new BoxGeometry(width, height, depth);
        const posAttribute = geo.attributes.position;
        const positions = posAttribute.array;
        
        for (let i = 0; i < positions.length; i += 3) {
            const y = positions[i+1];
            if (y > 0) {
                positions[i] *= topScaleX;   // Scale X of top face
                positions[i+2] *= topScaleZ; // Scale Z of top face
            }
        }
        
        geo.computeVertexNormals(); // Recalculate lighting normals
        return geo;
    }, [width, height, depth, topScaleX, topScaleZ]);
    
    // CLEANUP GEOMETRY
    useEffect(() => {
        return () => {
            geometry.dispose();
        };
    }, [geometry]);

    return (
        <mesh geometry={geometry}>
            <meshToonMaterial color={color} />
        </mesh>
    );
};

// --- REF MAP ---
const REF_MAP: Record<string, string> = {
    'torso': 'torsoRef',
    'chest': 'upperBodyRef',
    'head': 'headRef',
    'legs_root': 'legsRef',
    'arm_r_shoulder': 'rightArmRef',
    'arm_r_elbow': 'rightForeArmRef',
    'arm_r_twist': 'rightForearmTwistRef',
    'arm_r_fist': 'rightWristRef',
    'arm_l_shoulder': 'gunArmRef',
    'arm_l_elbow': 'leftForeArmRef',
    'arm_l_twist': 'leftForearmTwistRef',
    'arm_l_fist': 'leftWristRef',
    'shield_group': 'shieldRef',
    'gun_group': 'gunMeshRef',
    'muzzle': 'muzzleRef',
    'leg_r': 'rightLegRef',
    'lower_leg_r': 'rightLowerLegRef',
    'foot_group_r': 'rightFootRef',
    'leg_l': 'leftLegRef',
    'lower_leg_l': 'leftLowerLegRef',
    'foot_group_l': 'leftFootRef',
};

// --- INITIAL DATA ---
const INITIAL_MODEL: ModelPart = {"id":"root","name":"ROOT CONTAINER","type":"group","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"torso","name":"Waist (Torso)","type":"box","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0,0,0],"color":"#ff0000","visible":true,"children":[{"id":"chest","name":"Upper Body (Group)","type":"group","position":[0,0.65,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"head","name":"Head","type":"head","position":[0,0,0],"rotation":[-0.4,0,0],"scale":[1,1,1],"args":[],"color":"#eeeeee","visible":true,"children":[{"id":"u4dsm52qa","name":"New box","type":"box","position":[-0.026173806758658973,0.4198127335434858,0.3864234815174432],"rotation":[0.2,-0.52,0.4],"scale":[0.6,0.1,1],"args":[0.05,0.05,0],"color":"#000000","children":[],"visible":true},{"id":"tuptvabbt","name":"New box","type":"box","position":[-0.026,0.40484563871317003,0.3815201267665433],"rotation":[0.2,-0.52,0.4],"scale":[0.6,0.1,1],"args":[0.05,0.05,0],"color":"#000000","children":[],"visible":true},{"id":"wbp2w5d0t","name":"New box","type":"box","position":[-0.003790769061516548,0.42,0.386],"rotation":[0.2,0.52,-0.4],"scale":[0.6,0.1,1],"args":[0.05,0.05,0],"color":"#000000","children":[],"visible":true},{"id":"dc3q6ev02","name":"New box","type":"box","position":[-0.003852766592489121,0.405,0.381],"rotation":[0.2,0.52,-0.4],"scale":[0.6,0.1,1],"args":[0.05,0.05,0],"color":"#000000","children":[],"visible":true}]},{"id":"backpack","name":"Backpack","type":"box","position":[0,-0.056261784829226,-0.3649163497264357],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.7,0.8,0.3],"color":"#333333","visible":true,"children":[{"id":"saber_l","name":"Saber Hilt L","type":"cylinder","position":[0.3238177494036575,0.5,0],"rotation":[0.2,0,-0.2],"scale":[1,1,1],"args":[0.04,0.04,0.65,8],"color":"#ffffff","visible":true,"children":[]},{"id":"saber_r","name":"Saber Hilt R","type":"cylinder","position":[-0.3236958325357817,0.5,0],"rotation":[0.2,0,0.2],"scale":[1,1,1],"args":[0.04,0.04,0.65,8],"color":"#ffffff","visible":true,"children":[]},{"id":"thruster_l","name":"Thruster L","type":"cylinder","position":[0.25,-0.9,-0.4],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.1,0.15,0.2,8],"color":"#222222","visible":true,"children":[]},{"id":"thruster_r","name":"Thruster R","type":"cylinder","position":[-0.25,-0.9,-0.4],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.1,0.15,0.2,8],"color":"#222222","visible":true,"children":[]}]},{"id":"arm_r_shoulder","name":"R Shoulder","type":"box","position":[0.65,0.1,0],"rotation":[0.35,0.3,0],"scale":[1,1,1],"args":[0,0,0],"color":"#eeeeee","visible":true,"children":[{"id":"arm_r_elbow","name":"R Elbow","type":"box","position":[0,-0.4,0],"rotation":[-0.65,-0.3,0],"scale":[1,1,1],"args":[0.25,0.6,0.3],"color":"#444444","visible":true,"children":[{"id":"arm_r_twist","name":"R Forearm Twist","type":"group","position":[0,0,0],"rotation":[-0.2,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"arm_r_armor_group","name":"R Armor Group","type":"group","position":[0,-0.5,0.1],"rotation":[-0.2,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"arm_r_armor","name":"R Armor Mesh","type":"box","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.28,0.6,0.35],"color":"#eeeeee","visible":true,"children":[]},{"id":"arm_r_fist","name":"R Fist","type":"box","position":[0,-0.35,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.25,0.3,0.25],"color":"#222222","visible":true,"children":[]}]},{"id":"shield_group","name":"Shield Group","type":"group","position":[0,-0.5,0.1],"rotation":[-0.2,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"shield_body","name":"Shield Body","type":"box","position":[0.35,0,0.1],"rotation":[0,0,-0.32],"scale":[1,1,1],"args":[0.1,1.7,0.7],"color":"#eeeeee","visible":true,"children":[{"id":"shield_stripe","name":"Shield Stripe","type":"box","position":[0.06,0,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.1,1.55,0.5],"color":"#ff0000","visible":true,"children":[]}]}]}]}]},{"id":"0l5pmha2t","name":"R Shoulder Group","type":"group","position":[0.03424718153862165,-8.673617379884037e-19,0.010593894696857148],"rotation":[0,0,0],"scale":[1,1,1],"args":[],"color":"#888888","children":[{"id":"mey2gxkj0","name":"R Shoulder_1","type":"box","position":[0.01335836393531055,0.03182877221400997,-0.14318395904834483],"rotation":[0,0,0],"scale":[1,0.7,0.8],"args":[0.5,0.5,0.5],"color":"#ffffff","children":[],"visible":true}],"visible":true}]},{"id":"arm_l_shoulder","name":"L Shoulder","type":"box","position":[-0.65,0.1,0],"rotation":[0.35,-0.3,0],"scale":[1,1,1],"args":[0,0,0],"color":"#ffffff","visible":true,"children":[{"id":"arm_l_elbow","name":"L Elbow","type":"box","position":[0,-0.4,0],"rotation":[-0.65,0.3,0],"scale":[1,1,1],"args":[0.25,0.6,0.3],"color":"#444444","visible":true,"children":[{"id":"arm_l_twist","name":"L Forearm Twist","type":"group","position":[0,0,0],"rotation":[-0.2,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"arm_l_armor_group","name":"L Armor Group","type":"group","position":[0,-0.5,0.1],"rotation":[-0.2,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"arm_l_armor","name":"L Armor Mesh","type":"box","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.28,0.6,0.35],"color":"#eeeeee","visible":true,"children":[]},{"id":"arm_l_fist","name":"L Fist","type":"box","position":[0,-0.35,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.25,0.3,0.25],"color":"#222222","visible":true,"children":[{"id":"saber_group","name":"Saber Held","type":"group","position":[0,0,0.1],"rotation":[1.74,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":false,"children":[{"id":"saber_h","name":"Handle","type":"cylinder","position":[0,-0.25,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.035,0.04,0.7,8],"color":"#ffffff","visible":true,"children":[]},{"id":"saber_b","name":"Beam","type":"cylinder","position":[0,1.4,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.05,0.05,2.4,8],"color":"#ff0088","visible":true,"children":[]}]}]},{"id":"gun_group","name":"Beam Rifle","type":"group","position":[0,-0.2,0.3],"rotation":[1.5,0,3.14],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"gun_grip","name":"Grip","type":"box","position":[0,0.1,-0.1],"rotation":[0.2,0,0],"scale":[1,1,1],"args":[0.1,0.2,0.15],"color":"#222222","visible":true,"children":[]},{"id":"gun_body","name":"Body","type":"box","position":[0,0.2,0.4],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.15,0.25,1],"color":"#444444","visible":true,"children":[]},{"id":"gun_barrel","name":"Barrel","type":"cylinder","position":[0,0.2,1],"rotation":[1.57,0,0],"scale":[1,1,1],"args":[0.04,0.04,0.6,8],"color":"#222222","visible":true,"children":[]},{"id":"gun_scope","name":"Scope","type":"cylinder","position":[0.05,0.35,0.2],"rotation":[1.57,0,0],"scale":[1,1,1],"args":[0.08,0.08,0.3,8],"color":"#222222","visible":true,"children":[]},{"id":"muzzle","name":"Muzzle Flash Point","type":"group","position":[0,0.2,1.35],"rotation":[0,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[]}]}]}]}]},{"id":"d3apr4hxl","name":"L Shoulder Group","type":"group","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"onhhu0ms8","name":"L Shoulder_1","type":"box","position":[-0.03936779961562069,0.046805712863927616,-0.1272653937755505],"rotation":[0,0,0],"scale":[1,0.7,0.8],"args":[0.5,0.5,0.5],"color":"#ffffff","children":[],"visible":true}]}]},{"id":"au11yf43y","name":"CHEST","type":"group","position":[0,0,0],"rotation":[0,0,0],"scale":[1.2,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"chest_plate","name":"Chest Armor Plate","type":"trapezoid","position":[0,-0.2638684838261454,0.2835990058641681],"rotation":[0.3,0,0],"scale":[0.4,1.6,0.3],"args":[0.5,0.5,0.25,1,5.85],"color":"#2244aa","visible":true,"children":[]},{"id":"vent_l","name":"Vent L","type":"box","position":[0.225990113543164,-0.08817205459143082,0.43113059077658106],"rotation":[0.3145,0,0],"scale":[0.7,0.8,1.1],"args":[0.35,0.25,0.05],"color":"#ffaa00","visible":true,"children":[]},{"id":"vent_r","name":"Vent R","type":"box","position":[-0.2253896611600935,-0.0909420706630869,0.43],"rotation":[0.315,0,0],"scale":[0.7,0.8,1.1],"args":[0.35,0.25,0.05],"color":"#ffaa00","visible":true,"children":[]},{"id":"4tieasja1","name":"CHEST_1","type":"box","position":[0,0.012536958654478014,-0.04303451595813357],"rotation":[0,0,0],"scale":[1.5,1.2,0.8],"args":[0.5,0.5,0.5],"color":"#2244aa","children":[],"visible":true},{"id":"4tq92wdjv","name":"CHEST_2","type":"box","position":[0,0.3208805961368267,-0.016339340170401395],"rotation":[0,0,0],"scale":[0.8,0.1,0.7],"args":[0.5,0.5,0.5],"color":"#ffaa00","children":[],"visible":true},{"id":"khuvslub1","name":"CHEST_3","type":"trapezoid","position":[0,-0.025142208434128517,0.23557175845358175],"rotation":[1.9,0,0],"scale":[1.5,1,1.5],"args":[0.5,0.35,0.35,1,0.45],"color":"#2244aa","children":[],"visible":true},{"id":"7lr2mtri4","name":"CHEST_4","type":"trapezoid","position":[0,0.2542626089606949,0.2150559046313923],"rotation":[2.21,-1.5719,0],"scale":[0.8,1,1],"args":[0.1,0.2,0.4,1,0.4],"color":"#ffaa00","children":[],"visible":true}]}]},{"id":"y2ypya1wh","name":"Waist_1","type":"trapezoid","position":[0,0.2596467927540469,-0.043],"rotation":[0,0,0],"scale":[0.8,0.7,0.9],"args":[0.75,0.3,0.35,1.15,1.35],"color":"#ff0000","children":[],"visible":true},{"id":"9iom3hu23","name":"Waist_2","type":"trapezoid","position":[0,0.02094520455654747,-0.04371213542588834],"rotation":[-3.1429,0,0],"scale":[0.8,0.9,0.9],"args":[0.75,0.3,0.35,1.15,1.35],"color":"#ff0000","children":[],"visible":true}]},{"id":"legs_root","name":"Legs Container","type":"group","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"leg_r","name":"Right Leg","type":"group","position":[0.25,-0.3,0],"rotation":[-0.1,0,0.05],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"thigh_r","name":"R Thigh","type":"box","position":[0,-0.4,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.35,0.7,0.4],"color":"#eeeeee","visible":true,"children":[]},{"id":"lower_leg_r","name":"R Shin Group","type":"group","position":[0,-0.75,0],"rotation":[0.2,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"shin_r","name":"R Shin","type":"box","position":[0,-0.4,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.35,0.8,0.45],"color":"#eeeeee","visible":true,"children":[]},{"id":"knee_r","name":"R Knee Pad","type":"box","position":[0,-0.2,0.25],"rotation":[-0.2,0,0],"scale":[1,1,1],"args":[0.25,0.3,0.1],"color":"#eeeeee","visible":true,"children":[]},{"id":"foot_group_r","name":"R Foot Group","type":"group","position":[0,-0.8,0.05],"rotation":[-0.1,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"foot_r","name":"R Foot","type":"box","position":[0,-0.1,0.1],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.32,0.2,0.7],"color":"#aa2222","visible":true,"children":[]}]}]}]},{"id":"leg_l","name":"Left Leg","type":"group","position":[-0.25,-0.3,0],"rotation":[-0.1,0,-0.05],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"thigh_l","name":"L Thigh","type":"box","position":[0,-0.4,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.35,0.7,0.4],"color":"#eeeeee","visible":true,"children":[]},{"id":"lower_leg_l","name":"L Shin Group","type":"group","position":[0,-0.75,0],"rotation":[0.2,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"shin_l","name":"L Shin","type":"box","position":[0,-0.4,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.35,0.8,0.45],"color":"#eeeeee","visible":true,"children":[]},{"id":"knee_l","name":"L Knee Pad","type":"box","position":[0,-0.2,0.25],"rotation":[-0.2,0,0],"scale":[1,1,1],"args":[0.25,0.3,0.1],"color":"#eeeeee","visible":true,"children":[]},{"id":"foot_group_l","name":"L Foot Group","type":"group","position":[0,-0.8,0.05],"rotation":[-0.1,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"foot_l","name":"L Foot","type":"box","position":[0,-0.1,0.1],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.32,0.2,0.7],"color":"#aa2222","visible":true,"children":[]}]}]}]},{"id":"r1jyfl48p","name":"Hip","type":"group","position":[0,0,0],"rotation":[0,0,0],"scale":[1,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"jftcaezo7","name":"HIP_1","type":"box","position":[0,-0.2956032797067895,0],"rotation":[0,0,0],"scale":[0.4,1,1],"args":[0.5,0.5,0.5],"color":"#444444","children":[],"visible":true},{"id":"78gt0vmf0","name":"HIP_2","type":"trapezoid","position":[0,-0.317667273336241,0.36483073502315344],"rotation":[-1.571,-1.571,0],"scale":[1,0.8,1.3],"args":[0.1,0.3,0.15,4.45,1],"color":"#ffffff","children":[],"visible":true},{"id":"cecapsc7a","name":"HIP_3","type":"trapezoid","position":[0,-0.12485606825974244,0.2566598899484604],"rotation":[0,0,0],"scale":[1,0.8,1.1],"args":[0.2,0.2,0.25,1,0.45],"color":"#ffffff","children":[],"visible":true},{"id":"bg89mj0sr","name":"HIP_4","type":"box","position":[0,-0.12492716809865968,0.35635373295462486],"rotation":[1.13,0,0],"scale":[0.9,0.5,1],"args":[0.2,0.05,0.15],"color":"#ff0000","children":[],"visible":true},{"id":"zwpuwx6qu","name":"HIP_5","type":"box","position":[0,-0.20660172422412404,0.4084855667215894],"rotation":[0.6,0,0],"scale":[0.9,0.4,0.8],"args":[0.2,0.05,0.2],"color":"#ff0000","children":[],"visible":true},{"id":"y7euaiabk","name":"HIP_6","type":"group","position":[0.03742011791408362,0,0.07730154225496483],"rotation":[0,-0.1,-0.1],"scale":[0.9,1,1],"args":[],"color":"#ffffff","visible":true,"children":[{"id":"6h013ipwl","name":"New trapezoid","type":"trapezoid","position":[-0.302941996098679,-0.2660905481589926,0.2534956880739917],"rotation":[0,0,-1.6],"scale":[1,1,1],"args":[0.3,0.35,0.1,1.5,1],"color":"#ffffff","children":[],"visible":true},{"id":"ymkhlku50","name":"New box","type":"box","position":[-0.2989027597653852,-0.09642713172157036,0.253],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.35,0.1,0.1],"color":"#ffffff","children":[],"visible":true},{"id":"7knere55t","name":"New prism","type":"prism","position":[-0.29765610094554357,-0.21456892217056334,0.31973293029701305],"rotation":[1.571,0,0],"scale":[1,1,1],"args":[0.15,0.2,0.1],"color":"#ffaa00","children":[],"visible":true}]},{"id":"y6w65cob7","name":"HIP_7","type":"group","position":[-0.037,0,0.077],"rotation":[0,0.1,0.1],"scale":[0.9,1,1],"args":[],"color":"#888888","children":[{"id":"gxvqvylgt","name":"New trapezoid","type":"trapezoid","position":[0.303,-0.266,0.253],"rotation":[0,0,1.6],"scale":[1,1,1],"args":[0.3,0.35,0.1,1.5,1],"color":"#ffffff","children":[],"visible":true},{"id":"o0dsgmzhg","name":"New box","type":"box","position":[0.299,-0.096,0.253],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.35,0.1,0.1],"color":"#ffffff","children":[],"visible":true},{"id":"c4t4klkye","name":"New prism","type":"prism","position":[0.298,-0.215,0.32],"rotation":[1.571,0,0],"scale":[1,1,1],"args":[0.15,0.2,0.1],"color":"#ffaa00","children":[],"visible":true}],"visible":true},{"id":"1qfvhkpie","name":"HIP_8","type":"group","position":[-0.037,0,0.1211817517604678],"rotation":[0,-0.1,0.1],"scale":[0.9,1,1],"args":[],"color":"#888888","children":[{"id":"jt6fha02c","name":"New trapezoid","type":"trapezoid","position":[0.303,-0.266,-0.418],"rotation":[0,0,1.6],"scale":[1,1,1],"args":[0.3,0.35,0.1,1.5,1],"color":"#ffffff","children":[],"visible":true},{"id":"ztltv2vdu","name":"New box","type":"box","position":[0.299,-0.096,-0.418],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.35,0.1,0.1],"color":"#ffffff","children":[],"visible":true},{"id":"sokm8fsqr","name":"New prism","type":"prism","position":[0.298,-0.215,-0.475],"rotation":[-1.571,0,0],"scale":[1,1,1],"args":[0.15,0.2,0.1],"color":"#ffaa00","children":[],"visible":true}],"visible":true},{"id":"4dy2kavo5","name":"HIP_9","type":"group","position":[0.037,0,0.121],"rotation":[0,0.1,-0.1],"scale":[0.9,1,1],"args":[],"color":"#888888","children":[{"id":"tf5cwn0q8","name":"New trapezoid","type":"trapezoid","position":[-0.303,-0.266,-0.418],"rotation":[0,0,-1.6],"scale":[1,1,1],"args":[0.3,0.35,0.1,1.5,1],"color":"#ffffff","children":[],"visible":true},{"id":"af5n35b85","name":"New box","type":"box","position":[-0.299,-0.096,-0.418],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.35,0.1,0.1],"color":"#ffffff","children":[],"visible":true},{"id":"rp262lar6","name":"New prism","type":"prism","position":[-0.298,-0.215,-0.4750805507276266],"rotation":[-1.571,0,0],"scale":[1,1,1],"args":[0.15,0.2,0.1],"color":"#ffaa00","children":[],"visible":true}],"visible":true},{"id":"anngxxagw","name":"HIP_10","type":"group","position":[0,0,-1.522290819965645],"rotation":[0,0,0],"scale":[1,1,1],"args":[],"color":"#888888","children":[{"id":"832vkcwlb","name":"New box","type":"box","position":[0,-0.21076397945685327,1.2],"rotation":[0,0,0],"scale":[1,1,1],"args":[0.2,0.35,0.2],"color":"#ffffff","children":[],"visible":true},{"id":"8b815s0hf","name":"New trapezoid","type":"trapezoid","position":[0,-0.36857439166111017,1.2],"rotation":[-1.571,0,0],"scale":[1,1,1],"args":[0.2,0.2,0.4,1,0.25],"color":"#ffffff","children":[],"visible":true}],"visible":true},{"id":"dgj7w2p30","name":"HIP_11","type":"group","position":[0,0,0],"rotation":[0,0,0],"scale":[0.9,1,1],"args":[],"color":"#888888","children":[{"id":"u03ae8nkx","name":"New box","type":"box","position":[0.48006166390862154,-0.17826084524250502,0],"rotation":[0,0,0.3],"scale":[1,1,1],"args":[0.1,0.4,0.4],"color":"#ffffff","children":[],"visible":true},{"id":"dkwfi8r7i","name":"New box","type":"box","position":[0.5057737936836264,-0.08828795570062664,0],"rotation":[0,0,0.3],"scale":[1,1,1],"args":[0.1,0.3,0.25],"color":"#ffffff","children":[],"visible":true}],"visible":true},{"id":"ivhsosh16","name":"HIP_12","type":"group","position":[0,0,0],"rotation":[0,0,0],"scale":[0.9,1,1],"args":[],"color":"#888888","children":[{"id":"exo8nkmkx","name":"New box","type":"box","position":[-0.48,-0.178,0],"rotation":[0,0,-0.3],"scale":[1,1,1],"args":[0.1,0.4,0.4],"color":"#ffffff","children":[],"visible":true},{"id":"4hx2p51f9","name":"New box","type":"box","position":[-0.506,-0.088,0],"rotation":[0,0,-0.3],"scale":[1,1,1],"args":[0.1,0.3,0.25],"color":"#ffffff","children":[],"visible":true}],"visible":true}]}]}]};
const generateUUID = () => Math.random().toString(36).substr(2, 9);

const findPart = (root: ModelPart, id: string): ModelPart | null => {
    if (root.id === id) return root;
    for (const child of root.children) {
        const found = findPart(child, id);
        if (found) return found;
    }
    return null;
};

const findParent = (root: ModelPart, childId: string): ModelPart | null => {
    for (const child of root.children) {
        if (child.id === childId) return root;
        const found = findParent(child, childId);
        if (found) return found;
    }
    return null;
};

const updatePart = (root: ModelPart, id: string, updates: Partial<ModelPart>): ModelPart => {
    if (root.id === id) return { ...root, ...updates };
    return {
        ...root,
        children: root.children.map(c => updatePart(c, id, updates))
    };
};

const updatePartChildren = (root: ModelPart, parentId: string, newChildren: ModelPart[]): ModelPart => {
    if (root.id === parentId) {
        return { ...root, children: newChildren };
    }
    return {
        ...root,
        children: root.children.map(c => updatePartChildren(c, parentId, newChildren))
    };
};

const addChild = (root: ModelPart, parentId: string, newPart: ModelPart): ModelPart => {
    if (root.id === parentId) {
        return { ...root, children: [...root.children, newPart] };
    }
    return {
        ...root,
        children: root.children.map(c => addChild(c, parentId, newPart))
    };
};

const removeParts = (root: ModelPart, ids: Set<string>): ModelPart | null => {
    if (ids.has(root.id)) return null;
    return {
        ...root,
        children: root.children.map(c => removeParts(c, ids)).filter(Boolean) as ModelPart[]
    };
};

const setVisibilityRecursively = (part: ModelPart, targetId: string, visible: boolean): ModelPart => {
    let newPart = { ...part };
    if (newPart.id === targetId) {
        newPart.visible = visible;
    }
    newPart.children = newPart.children.map(c => setVisibilityRecursively(c, targetId, visible));
    return newPart;
};

// --- 3D COMPONENTS ---

const EditablePart: React.FC<{ 
    part: ModelPart, 
    selectedIds: Set<string>, 
    onSelect: (id: string, multi: boolean) => void,
    onTransform: (id: string, prop: 'position' | 'rotation' | 'scale', value: [number, number, number]) => void
    pushHistory: () => void 
}> = ({ part, selectedIds, onSelect, onTransform, pushHistory }) => {
    const groupRef = useRef<Group>(null);
    
    const isSelected = selectedIds.has(part.id);
    const showGizmo = isSelected && selectedIds.size === 1;

    useCursor(isSelected, 'move', 'auto');

    if (!part.visible) return null;

    return (
        <>
            <group
                ref={groupRef}
                position={part.position}
                rotation={part.rotation}
                scale={part.scale}
                onClick={(e) => { 
                    e.stopPropagation(); 
                    const isMulti = e.ctrlKey || e.metaKey;
                    onSelect(part.id, isMulti); 
                }}
            >
                {/* The Geometry */}
                {part.type === 'box' && (
                    <mesh>
                        <boxGeometry args={part.args as any} />
                        <meshToonMaterial color={part.color} />
                    </mesh>
                )}
                {part.type === 'cylinder' && (
                    <mesh>
                        <cylinderGeometry args={part.args as any} />
                        <meshToonMaterial color={part.color} />
                    </mesh>
                )}
                {part.type === 'prism' && (
                    <mesh rotation={[0, Math.PI / 4, 0]}>
                        <cylinderGeometry args={[part.args[0], part.args[1], part.args[2], 4]} />
                        <meshToonMaterial color={part.color} />
                    </mesh>
                )}
                {part.type === 'trapezoid' && (
                    <Trapezoid args={part.args} color={part.color} isSelected={isSelected} />
                )}
                {part.type === 'head' && (
                    <group>
                        <MechaHead mainColor={part.color} />
                    </group>
                )}
                {part.type === 'group' && isSelected && (
                    <mesh visible={false}>
                        <boxGeometry args={[0.2, 0.2, 0.2]} />
                        <meshBasicMaterial wireframe color="yellow" />
                    </mesh>
                )}

                {/* Recursion */}
                {part.children.map(child => (
                    <EditablePart 
                        key={child.id} 
                        part={child} 
                        selectedIds={selectedIds} 
                        onSelect={onSelect} 
                        onTransform={onTransform}
                        pushHistory={pushHistory}
                    />
                ))}
            </group>

            {/* Gizmo */}
            {showGizmo && groupRef.current && (
                <TransformControls 
                    object={groupRef.current || undefined} 
                    mode="translate"
                    onMouseDown={() => pushHistory()}
                    onMouseUp={() => {
                        if (groupRef.current) {
                            onTransform(part.id, 'position', groupRef.current.position.toArray() as [number, number, number]);
                            onTransform(part.id, 'rotation', [groupRef.current.rotation.x, groupRef.current.rotation.y, groupRef.current.rotation.z]);
                            onTransform(part.id, 'scale', groupRef.current.scale.toArray() as [number, number, number]);
                        }
                    }}
                />
            )}
        </>
    );
};

// --- UI COMPONENTS ---

const NumberInput: React.FC<{ label: string, value: number, step?: number, onChange: (val: number) => void }> = ({ label, value, step = 0.1, onChange }) => (
    <div className="flex items-center space-x-2">
        <label className="text-[10px] text-gray-500 w-4">{label}</label>
        <input 
            type="number" 
            step={step} 
            value={parseFloat(value.toFixed(3))} 
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full bg-gray-800 text-white text-xs px-1 border border-gray-700 rounded"
        />
    </div>
);

const Vector3Input: React.FC<{ label: string, value: [number, number, number], onChange: (val: [number, number, number]) => void }> = ({ label, value, onChange }) => (
    <div className="mb-2">
        <div className="text-[10px] text-gray-400 mb-1">{label}</div>
        <div className="grid grid-cols-3 gap-1">
            <NumberInput label="X" value={value[0]} onChange={(v) => onChange([v, value[1], value[2]])} />
            <NumberInput label="Y" value={value[1]} onChange={(v) => onChange([value[0], v, value[2]])} />
            <NumberInput label="Z" value={value[2]} onChange={(v) => onChange([value[0], value[1], v])} />
        </div>
    </div>
);

// --- JSX GENERATOR ---
const TRAPEZOID_COMPONENT_CODE = `
// Helper Component for Trapezoid Shapes (Paste at top of Player.tsx or outside Player component)
// IMPORTANT: Ensure 'BoxGeometry' is imported from 'three'
const Trapezoid = ({ args, color }) => {
    const [width, height, depth, topScaleX, topScaleZ] = args;
    
    const geometry = React.useMemo(() => {
        const geo = new BoxGeometry(width, height, depth);
        const posAttribute = geo.attributes.position;
        const positions = posAttribute.array;
        for (let i = 0; i < positions.length; i += 3) {
            const y = positions[i+1];
            if (y > 0) {
                positions[i] *= topScaleX;
                positions[i+2] *= topScaleZ;
            }
        }
        geo.computeVertexNormals();
        return geo;
    }, [width, height, depth, topScaleX, topScaleZ]);

    // CLEANUP GEOMETRY
    React.useEffect(() => {
        return () => {
            geometry.dispose();
        };
    }, [geometry]);

    return (
        <mesh geometry={geometry}>
            <meshToonMaterial color={color} />
        </mesh>
    );
};
`;

const generateJSX = (part: ModelPart, depth: number = 0): string => {
    const i = " ".repeat(depth * 2);
    const f = (n: number) => parseFloat(n.toFixed(3));
    const pos = `[${f(part.position[0])}, ${f(part.position[1])}, ${f(part.position[2])}]`;
    const rot = `[${f(part.rotation[0])}, ${f(part.rotation[1])}, ${f(part.rotation[2])}]`;
    const sc = `[${f(part.scale[0])}, ${f(part.scale[1])}, ${f(part.scale[2])}]`;
    
    const refAttr = REF_MAP[part.id] ? ` ref={${REF_MAP[part.id]}}` : '';
    const childrenJSX = part.children.map(c => generateJSX(c, depth + 1)).join('\n');
    
    let extras = "";
    if (part.id === 'torso' || part.id === 'chest' || part.id.includes('shoulder') || part.id.includes('foot')) {
        const sizeArg = part.type === 'box' ? `[${part.args.join(', ')}]` : `[0.5, 0.5, 0.5]`; 
        extras = `\n${i}  <GhostEmitter active={isTrailActive} size={${sizeArg}} rainbow={trailRainbow.current} />`;
    }

    if (part.type === 'group') {
        return `${i}<group${refAttr} position={${pos}} rotation={${rot}} scale={${sc}}>\n${childrenJSX}${i}</group>`;
    } 
    else if (part.type === 'head') {
        return `${i}<group${refAttr} position={${pos}} rotation={${rot}} scale={${sc}}>\n${i}   <MechaHead mainColor={armorColor} />\n${i}</group>`;
    }
    else if (part.type === 'box') {
        return `${i}<group${refAttr} position={${pos}} rotation={${rot}} scale={${sc}}>\n${i}  <mesh>\n${i}    <boxGeometry args={[${part.args.join(', ')}]} />\n${i}    <meshToonMaterial color="${part.color}" />\n${i}  </mesh>${extras}\n${childrenJSX}${i}</group>`;
    }
    else if (part.type === 'cylinder') {
        return `${i}<group${refAttr} position={${pos}} rotation={${rot}} scale={${sc}}>\n${i}  <mesh>\n${i}    <cylinderGeometry args={[${part.args.join(', ')}]} />\n${i}    <meshToonMaterial color="${part.color}" />\n${i}  </mesh>${extras}\n${childrenJSX}${i}</group>`;
    }
    else if (part.type === 'prism') {
        return `${i}<group${refAttr} position={${pos}} rotation={${rot}} scale={${sc}}>\n${i}  <mesh rotation={[0, Math.PI/4, 0]}>\n${i}    <cylinderGeometry args={[${part.args[0]}, ${part.args[1]}, ${part.args[2]}, 4]} />\n${i}    <meshToonMaterial color="${part.color}" />\n${i}  </mesh>${extras}\n${childrenJSX}${i}</group>`;
    }
    else if (part.type === 'trapezoid') {
        const argsStr = `[${part.args.join(', ')}]`;
        return `${i}<group${refAttr} position={${pos}} rotation={${rot}} scale={${sc}}>\n${i}  <Trapezoid args={${argsStr}} color="${part.color}" />${extras}\n${childrenJSX}${i}</group>`;
    }
    return "";
};

export const ModelBuilder: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [model, setModel] = useState<ModelPart>(INITIAL_MODEL);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(['torso']));
    
    const [showHelp, setShowHelp] = useState(true);
    const [showImport, setShowImport] = useState(false);
    const [importText, setImportText] = useState('');
    const [weaponMode, setWeaponMode] = useState<'GUN' | 'SABER'>('GUN');

    // HISTORY STATE
    const [history, setHistory] = useState<ModelPart[]>([]);
    const [future, setFuture] = useState<ModelPart[]>([]);

    // Undo/Redo Logic
    const saveToHistory = useCallback(() => {
        setHistory(prev => [...prev, model]);
        setFuture([]); 
    }, [model]);

    const undo = useCallback(() => {
        if (history.length === 0) return;
        const previous = history[history.length - 1];
        const newHistory = history.slice(0, -1);
        setFuture(prev => [model, ...prev]); 
        setModel(previous);
        setHistory(newHistory);
    }, [history, model]);

    const redo = useCallback(() => {
        if (future.length === 0) return;
        const next = future[0];
        const newFuture = future.slice(1);
        setHistory(prev => [...prev, model]); 
        setModel(next);
        setFuture(newFuture);
    }, [future, model]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) redo();
                else undo();
                e.preventDefault();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                redo();
                e.preventDefault();
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
                handleDelete();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo, selectedIds, model]);

    // Update visibility when weapon mode changes
    useEffect(() => {
        let newModel = { ...model };
        newModel = setVisibilityRecursively(newModel, 'gun_group', weaponMode === 'GUN');
        newModel = setVisibilityRecursively(newModel, 'saber_group', weaponMode === 'SABER');
        setModel(newModel);
    }, [weaponMode]);

    const activeId = selectedIds.size === 1 ? Array.from(selectedIds)[0] : null;
    // Fix TS error by explicitly asserting activePart as ModelPart | null
    const activePart = useMemo<ModelPart | null>(() => activeId ? findPart(model, activeId) : null, [model, activeId]);

    const handleSelect = (id: string, multi: boolean) => {
        if (multi) {
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                if (newSet.has(id)) newSet.delete(id);
                else newSet.add(id);
                return newSet;
            });
        } else {
            setSelectedIds(new Set([id]));
        }
    };

    const handleSidebarUpdate = (id: string, prop: keyof ModelPart, value: any) => {
        saveToHistory();
        setModel(prev => updatePart(prev, id, { [prop]: value } as Partial<ModelPart>));
    }

    const handleAdd = (type: ShapeType) => {
        if (!activeId) {
            alert("Please select exactly one parent item to add to.");
            return;
        }
        saveToHistory();
        
        let args: number[] = [];
        if (type === 'box') args = [0.5, 0.5, 0.5];
        else if (type === 'cylinder') args = [0.2, 0.2, 0.5, 16];
        else if (type === 'prism') args = [0.4, 0.6, 0.5];
        else if (type === 'trapezoid') args = [0.5, 0.5, 0.5, 1.0, 0.5];

        const newPart: ModelPart = {
            id: generateUUID(),
            name: `New ${type}`,
            type: type,
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            args: args,
            color: '#888888',
            children: [],
            visible: true
        };
        setModel(prev => addChild(prev, activeId, newPart));
    };

    const handleDelete = () => {
        if (selectedIds.size === 0) return;
        if (selectedIds.has('root')) {
             alert("Cannot delete root.");
             return;
        }
        saveToHistory();
        setModel(prev => removeParts(prev, selectedIds) || prev);
        setSelectedIds(new Set());
    };

    const handleGroupSelection = () => {
        if (selectedIds.size < 1) return;
        
        const idsArr = Array.from(selectedIds);
        const firstId = idsArr[0];
        const parent = findParent(model, firstId);

        if (!parent) {
            alert("Cannot group root or detached items.");
            return;
        }

        const allAreSiblings = idsArr.every(id => parent.children.some(c => c.id === id));
        if (!allAreSiblings) {
            alert("Can only group items that share the same parent!");
            return;
        }

        saveToHistory();

        const newGroupId = generateUUID();
        const partsToMove = parent.children.filter(c => selectedIds.has(c.id));
        
        const newGroup: ModelPart = {
            id: newGroupId,
            name: 'New Group',
            type: 'group',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            args: [],
            color: '#ffffff',
            visible: true,
            children: partsToMove
        };

        const remainingChildren = parent.children.filter(c => !selectedIds.has(c.id));
        const newChildren = [...remainingChildren, newGroup];

        setModel(prev => updatePartChildren(prev, parent.id, newChildren));
        setSelectedIds(new Set([newGroupId]));
    };

    const handleExport = () => {
        const json = JSON.stringify(model);
        navigator.clipboard.writeText(json);
        alert("Model JSON copied to clipboard!");
    };

    const handleExportJSX = () => {
        const code = model.children.map(c => generateJSX(c, 2)).join('\n');
        const hasTrapezoid = JSON.stringify(model).includes('"type":"trapezoid"');
        const helperCode = hasTrapezoid ? TRAPEZOID_COMPONENT_CODE + "\n" : "";
        const instructions = hasTrapezoid ? "{/* PASTE THE TRAPEZOID COMPONENT DEFINITION ABOVE THE PLAYER COMPONENT */}\n" : "";
        const finalCode = `
${helperCode}
${instructions}
{/* PASTE START: Replace <group position={[0, 2.0, 0]}> content in Player.tsx */}
<group position={[0, 2.0, 0]}>
${code}
</group>
{/* PASTE END */}
`;
        navigator.clipboard.writeText(finalCode);
        alert("React JSX Code copied to clipboard! Note: This exports STATIC model structure only. Animation refs are mapped if IDs match original names.");
    };

    const handleImportJSON = () => {
        if (!importText.trim()) return;
        try {
            const data = JSON.parse(importText);
            if (data.id && data.children) {
                setModel(data);
                setShowImport(false);
                alert("Model imported from JSON!");
            } else {
                alert("Invalid Model JSON structure.");
            }
        } catch (e) {
            alert("Invalid JSON. Please check your input.");
        }
    };

    return (
        <div className="absolute inset-0 z-[200] bg-[#111] text-gray-200 flex font-mono text-xs">
            
            {/* IMPORT MODAL */}
            {showImport && (
                <div className="absolute inset-0 z-[250] bg-black/90 flex items-center justify-center p-8">
                    <div className="bg-gray-900 border border-gray-600 p-6 rounded w-full max-w-3xl flex flex-col h-[80vh]">
                        <h2 className="text-xl font-bold text-white mb-4">IMPORT MODEL JSON</h2>
                        <textarea 
                            className="flex-1 bg-black border border-gray-700 p-4 text-green-400 font-mono text-xs resize-none focus:outline-none focus:border-cyan-500"
                            value={importText}
                            onChange={(e) => setImportText(e.target.value)}
                            placeholder='{ "id": "root", "children": [...] }'
                        />
                        <div className="flex justify-end space-x-4 mt-4">
                            <button onClick={() => setShowImport(false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded">CANCEL</button>
                            <button onClick={handleImportJSON} className="px-6 py-2 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded">IMPORT JSON</button>
                        </div>
                    </div>
                </div>
            )}

            {/* HIERARCHY PANEL (Left) */}
            <div className="w-64 border-r border-gray-800 flex flex-col bg-[#0a0a0a]">
                <div className="p-2 border-b border-gray-800 font-bold text-cyan-400 flex justify-between items-center">
                    <span>HIERARCHY</span>
                    <button 
                        onClick={handleGroupSelection}
                        disabled={selectedIds.size < 1}
                        className={`px-2 py-0.5 text-[9px] rounded border ${selectedIds.size > 0 ? 'bg-cyan-900 border-cyan-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-500'}`}
                        title="Group selected items (Must be siblings)"
                    >
                        GROUP SELECTION
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <TreeItem part={model} selectedIds={selectedIds} onSelect={handleSelect} depth={0} />
                    <div className="mt-4 px-2 text-gray-600 italic text-[9px]">
                        Ctrl+Click to multi-select.
                    </div>
                </div>
                <div className="p-2 border-t border-gray-800 grid grid-cols-2 gap-1">
                     <div className="grid grid-cols-2 gap-1">
                        <button onClick={() => handleAdd('group')} className="bg-gray-800 hover:bg-gray-700 p-1 rounded border border-gray-700 text-[10px]">Grp</button>
                        <button onClick={() => handleAdd('box')} className="bg-gray-800 hover:bg-gray-700 p-1 rounded border border-gray-700 text-[10px]">Box</button>
                     </div>
                     <div className="grid grid-cols-3 gap-1">
                        <button onClick={() => handleAdd('cylinder')} className="bg-gray-800 hover:bg-gray-700 p-1 rounded border border-gray-700 text-[10px]">Cyl</button>
                        <button onClick={() => handleAdd('prism')} className="bg-yellow-900/40 hover:bg-yellow-900/60 p-1 rounded border border-yellow-800 text-[10px] text-yellow-500">Prism</button>
                        <button onClick={() => handleAdd('trapezoid')} className="bg-green-900/40 hover:bg-green-900/60 p-1 rounded border border-green-800 text-[10px] text-green-500">Trapz</button>
                     </div>
                </div>
            </div>

            {/* 3D VIEWPORT (Center) */}
            <div className="flex-1 relative bg-gradient-to-b from-gray-900 to-black">
                <Canvas camera={{ position: [3, 3, 3], fov: 50 }} shadows>
                    <color attach="background" args={['#151515']} />

                    <ambientLight intensity={0.5} />
                    <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
                    <pointLight position={[-5, 5, -5]} intensity={0.5} color="#00ffff" />
                    
                    <OrbitControls makeDefault />
                    <gridHelper args={[20, 20, 0x444444, 0x222222]} />
                    <axesHelper args={[2]} />

                    <group position={[0, -1, 0]}>
                        <EditablePart 
                            part={model} 
                            selectedIds={selectedIds} 
                            onSelect={handleSelect} 
                            onTransform={(id: string, prop: 'position' | 'rotation' | 'scale', val: [number, number, number]) => setModel(prev => updatePart(prev, id, { [prop]: val } as Partial<ModelPart>))}
                            pushHistory={saveToHistory}
                        />
                    </group>
                </Canvas>

                {/* Top Toolbar */}
                <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
                    <div className="flex space-x-2 pointer-events-auto">
                        <div className="bg-black/80 backdrop-blur border border-cyan-500/30 px-4 py-2 rounded text-cyan-400 font-bold">
                            MODEL FACTORY
                        </div>
                        <button 
                            onClick={() => setWeaponMode(m => m === 'GUN' ? 'SABER' : 'GUN')}
                            className="bg-gray-800 hover:bg-gray-700 text-yellow-400 border border-yellow-500/50 px-3 py-1 rounded font-bold transition-all"
                        >
                            WEAPON: {weaponMode}
                        </button>
                    </div>
                    <div className="pointer-events-auto flex space-x-2">
                        <button 
                            onClick={undo} 
                            disabled={history.length === 0}
                            className={`px-3 py-1 rounded text-white font-bold border ${history.length === 0 ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-gray-700 hover:bg-gray-600 border-gray-500'}`}
                            title="Undo (Ctrl+Z)"
                        >
                            ↶
                        </button>
                        <button 
                            onClick={redo} 
                            disabled={future.length === 0}
                            className={`px-3 py-1 rounded text-white font-bold border ${future.length === 0 ? 'bg-gray-800 text-gray-500 border-gray-700' : 'bg-gray-700 hover:bg-gray-600 border-gray-500'}`}
                            title="Redo (Ctrl+Y)"
                        >
                            ↷
                        </button>
                        <div className="w-px bg-gray-600 mx-1"></div>
                        <button onClick={() => setShowHelp(true)} className="bg-blue-600 px-3 py-1 rounded text-white hover:bg-blue-500">HELP</button>
                        <button onClick={() => setShowImport(true)} className="bg-yellow-600 px-3 py-1 rounded text-white hover:bg-yellow-500 border border-yellow-400">IMP JSON</button>
                        <button onClick={handleExport} className="bg-green-700/50 px-3 py-1 rounded text-white hover:bg-green-600/50">EXP JSON</button>
                        <button onClick={handleExportJSX} className="bg-purple-700 px-3 py-1 rounded text-white hover:bg-purple-600 border border-purple-400">EXPORT STATIC</button>
                        <button onClick={onClose} className="bg-red-700 px-3 py-1 rounded text-white hover:bg-red-600">EXIT</button>
                    </div>
                </div>

                {/* HELP MODAL */}
                {showHelp && (
                    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
                        <div className="bg-gray-900 border border-gray-600 p-6 rounded max-w-md">
                            <h2 className="text-xl text-cyan-400 font-bold mb-4">HOW TO MODEL</h2>
                            <ul className="space-y-2 list-disc pl-4 text-gray-300">
                                <li><strong>Select Parts:</strong> Click part in 3D or List. <strong>Ctrl+Click</strong> to multi-select.</li>
                                <li><strong>Grouping:</strong> Select multiple siblings (same parent) and click "GROUP SELECTION".</li>
                                <li><strong>Move/Rotate:</strong> Use Gizmo (active only when 1 item selected).</li>
                                <li><strong>Add Shapes:</strong> Select a parent, click "Add Box/Cyl/Grp" at bottom left.</li>
                                <li><strong>Trapz (Trapezoid):</strong> Adjust "Top Scale" to make wedges/ramps.</li>
                                <li><strong>Export:</strong> Use "EXP JSON" to save. "EXPORT STATIC" gives JSX code (structure only, no animation logic).</li>
                            </ul>
                            <button onClick={() => setShowHelp(false)} className="mt-6 w-full bg-cyan-600 hover:bg-cyan-500 py-2 rounded text-white font-bold">START BUILDING</button>
                        </div>
                    </div>
                )}
            </div>

            {/* PROPERTIES PANEL (Right) */}
            <div className="w-64 border-l border-gray-800 bg-[#0a0a0a] p-4 overflow-y-auto">
                <div className="font-bold text-cyan-400 mb-4 border-b border-gray-700 pb-2">PROPERTIES</div>
                
                {activePart ? (
                    <div className="space-y-4">
                        {selectedIds.size > 1 && (
                             <div className="bg-yellow-900/50 text-yellow-200 p-2 rounded mb-2 text-[10px] border border-yellow-700">
                                 Multi-selection active ({selectedIds.size} items). <br/>
                                 Click "GROUP SELECTION" to group them, or "DEL" to delete all.
                                 <br/>Properties shown for: <strong>{activePart.name}</strong>
                             </div>
                        )}

                        <div>
                            <label className="text-gray-500 text-[10px]">NAME</label>
                            <input 
                                type="text" 
                                value={activePart.name} 
                                onChange={(e) => activePart && handleSidebarUpdate(activePart.id as string, 'name', e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 px-2 py-1 rounded text-white"
                            />
                        </div>

                        <div className="flex space-x-2">
                             <div className="flex-1">
                                <label className="text-gray-500 text-[10px]">TYPE</label>
                                <div className="text-gray-300 px-2 py-1 bg-gray-800 rounded">{activePart.type.toUpperCase()}</div>
                             </div>
                             <button onClick={handleDelete} className="bg-red-900/50 text-red-400 border border-red-800 px-2 rounded hover:bg-red-900">DEL</button>
                        </div>

                        <hr className="border-gray-800" />

                        <Vector3Input label="POSITION" value={activePart.position} onChange={(v) => activePart && handleSidebarUpdate(activePart.id as string, 'position', v)} />
                        <Vector3Input label="ROTATION" value={activePart.rotation} onChange={(v) => activePart && handleSidebarUpdate(activePart.id as string, 'rotation', v)} />
                        <Vector3Input label="SCALE" value={activePart.scale} onChange={(v) => activePart && handleSidebarUpdate(activePart.id as string, 'scale', v)} />

                        <hr className="border-gray-800" />

                        {activePart.type !== 'group' && (
                            <>
                                <div>
                                    <label className="text-gray-500 text-[10px]">COLOR</label>
                                    <div className="flex space-x-2">
                                        <input 
                                            type="color" 
                                            value={activePart.color} 
                                            onChange={(e) => activePart && handleSidebarUpdate(activePart.id as string, 'color', e.target.value)}
                                            className="h-6 w-8 bg-transparent border-none cursor-pointer"
                                        />
                                        <input 
                                            type="text" 
                                            value={activePart.color}
                                            onChange={(e) => activePart && handleSidebarUpdate(activePart.id as string, 'color', e.target.value)}
                                            className="flex-1 bg-gray-800 border border-gray-700 px-2 text-xs"
                                        />
                                    </div>
                                </div>

                                {activePart.type !== 'head' && (
                                    <div>
                                        <label className="text-gray-500 text-[10px] uppercase">Geometry Args</label>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                            {activePart.args.map((arg, i) => (
                                                <div key={i}>
                                                    <label className="text-[9px] text-gray-500 block">
                                                        {activePart.type === 'box' ? ['Width', 'Height', 'Depth'][i] :
                                                         activePart.type === 'cylinder' ? ['Radius Top', 'Radius Bot', 'Height', 'Segments'][i] :
                                                         activePart.type === 'prism' ? ['Top Size', 'Bottom Size', 'Height'][i] :
                                                         activePart.type === 'trapezoid' ? ['Width', 'Height', 'Depth', 'Top Scale X', 'Top Scale Z'][i] :
                                                         `Arg ${i}`}
                                                    </label>
                                                    <input 
                                                        type="number" 
                                                        step={0.05} 
                                                        value={arg} 
                                                        onChange={(e) => {
                                                            if (activePart) {
                                                                const newArgs = [...activePart.args];
                                                                newArgs[i] = parseFloat(e.target.value);
                                                                handleSidebarUpdate(activePart.id as string, 'args', newArgs);
                                                            }
                                                        }}
                                                        className="w-full bg-gray-800 border border-gray-700 px-1 py-0.5 text-xs"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <div className="text-[9px] text-gray-600 mt-1 italic">
                                            {activePart.type === 'prism' && "Prisms are 4-sided cylinders."}
                                            {activePart.type === 'trapezoid' && "Scale Top X/Z to create wedges/ramps."}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="text-gray-600 text-center mt-10 italic">
                        {selectedIds.size > 1 ? `${selectedIds.size} items selected` : 'No part selected'}
                    </div>
                )}
            </div>
        </div>
    );
};

// --- RECURSIVE TREE ITEM ---
const TreeItem: React.FC<{ part: ModelPart, selectedIds: Set<string>, onSelect: (id: string, multi: boolean) => void, depth: number }> = ({ part, selectedIds, onSelect, depth }) => {
    const [collapsed, setCollapsed] = useState(false);
    const hasChildren = part.children.length > 0;
    const isSelected = selectedIds.has(part.id);

    if (!part.visible) return null;

    return (
        <div>
            <div 
                className={`flex items-center py-0.5 px-1 cursor-pointer hover:bg-gray-800 ${isSelected ? 'bg-cyan-900/50 text-cyan-300' : 'text-gray-400'}`}
                style={{ paddingLeft: `${depth * 12 + 4}px` }}
                onClick={(e) => {
                    e.stopPropagation();
                    const isMulti = e.ctrlKey || e.metaKey;
                    onSelect(part.id, isMulti);
                }}
            >
                {hasChildren && (
                    <span 
                        onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
                        className="mr-1 w-3 text-center hover:text-white"
                    >
                        {collapsed ? '▸' : '▾'}
                    </span>
                )}
                {!hasChildren && <span className="mr-1 w-3"></span>}
                <span className="truncate text-[10px]">{part.name}</span>
            </div>
            {!collapsed && part.children.map(child => (
                <TreeItem key={child.id} part={child} selectedIds={selectedIds} onSelect={onSelect} depth={depth + 1} />
            ))}
        </div>
    );
};