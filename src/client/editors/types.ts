export type ShapeType = 'group' | 'box' | 'cylinder' | 'head' | 'prism' | 'trapezoid';

export interface ModelPart {
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

