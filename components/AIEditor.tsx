
import React, { useState } from 'react';
import { useGameStore } from '../store';
import { AINodeDefinition, NODE_TYPES_METADATA, NODE_PARAM_DEFS, NodeParamValue } from './AIEngine';
import { NPCConfig } from '../types';

// --- TRANSLATIONS ---
const NODE_TRANSLATIONS: Record<string, string> = {
    'Selector': '选择器 (Selector)',
    'Sequence': '顺序执行 (Sequence)',
    
    'CheckThreat': '检测威胁 (CheckThreat)',
    'CheckMeleeTargeted': '检测格斗锁定 (CheckMeleeTargeted)',
    'CheckBoost': '检查气槽 (CheckBoost)',
    'CheckDistance': '检查距离 (CheckDistance)',
    'CheckCanAct': '可行动? (CanAct?)',
    'CheckCanDefend': '可防御? (CanDefend?)',
    'CheckShootCooldown': '射击冷却? (ShootCD?)',
    'Probability': '概率判定 (Probability)',
    
    'CheckState': '检查状态 (CheckState)',
    'CheckStateDuration': '状态持续时间 (Duration)',
    'CheckShotFired': '子弹已射出? (ShotFired?)',
    'CheckMeleeWhiff': '格斗挥空? (Whiff?)',
    'CheckAmmo': '有弹药? (HasAmmo?)',
    
    'ActionEvade': '动作:闪避 (Evade)',
    'ActionMelee': '动作:格斗 (Melee)',
    'ActionShoot': '动作:射击 (Shoot)',
    'ActionDash': '动作:冲刺 (Dash)',
    'ActionAscend': '动作:升空 (Ascend)',
    'ActionIdle': '动作:待机 (Idle)',
};

const PARAM_TRANSLATIONS: Record<string, string> = {
    'threshold': '阈值 (Threshold)',
    'operator': '比较符 (Op)',
    'value': '数值/配置 (Value)',
    'chance': '概率/配置 (Chance)',
    'isRainbow': '虹闪 (Rainbow)',
    'state': '状态名 (StateName)',
    'min': '最小时间 (MinTime)',
};

// --- HELPER: CONFIG SLIDER ---
const ConfigSlider: React.FC<{
    label: string;
    confKey: keyof NPCConfig;
    min: number;
    max: number;
    step: number;
    suffix?: string;
}> = ({ label, confKey, min, max, step, suffix = '' }) => {
    const { npcConfig, updateNpcConfig } = useGameStore();
    const val = npcConfig[confKey];

    return (
        <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-mono text-gray-300 select-text cursor-text">{label}</span>
                <span className="text-[10px] font-mono text-cyan-400">{val.toFixed(2)}{suffix}</span>
            </div>
            <input 
                type="range" 
                min={min} 
                max={max} 
                step={step} 
                value={val} 
                onChange={(e) => updateNpcConfig({ [confKey]: parseFloat(e.target.value) })}
                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
        </div>
    );
};

// --- HELPER: RECURSIVE TREE NODE COMPONENT ---
const TreeNode: React.FC<{
    node: AINodeDefinition;
    onChange: (newNode: AINodeDefinition) => void;
    onDelete: () => void;
    depth?: number;
}> = ({ node, onChange, onDelete, depth = 0 }) => {
    const [collapsed, setCollapsed] = useState(false);

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange({ ...node, type: e.target.value, params: {} }); // Reset params on type change
    };

    const handleParamChange = (key: string, val: NodeParamValue) => {
        const newParams = { ...node.params, [key]: val };
        onChange({ ...node, params: newParams });
    };

    const handleAddChild = () => {
        const newChild: AINodeDefinition = { id: Math.random().toString(36).substr(2, 9), type: 'Sequence', children: [] };
        onChange({ ...node, children: [...(node.children || []), newChild] });
    };

    const handleChildChange = (idx: number, newChild: AINodeDefinition) => {
        const newChildren = [...(node.children || [])];
        newChildren.splice(idx, 1, newChild); // Fix: use splice to replace correctly
        onChange({ ...node, children: newChildren });
    };

    const handleChildDelete = (idx: number) => {
        const newChildren = [...(node.children || [])];
        newChildren.splice(idx, 1);
        onChange({ ...node, children: newChildren });
    };

    const isComposite = NODE_TYPES_METADATA['Composites'].includes(node.type);
    const isAction = NODE_TYPES_METADATA['Actions'].includes(node.type);
    const isCondition = NODE_TYPES_METADATA['Conditions'].includes(node.type);

    // Style based on type
    let borderColor = 'border-gray-600';
    let headerBg = 'bg-gray-800';
    if (isComposite) { borderColor = 'border-blue-500'; headerBg = 'bg-blue-900/30'; }
    else if (isAction) { borderColor = 'border-red-500'; headerBg = 'bg-red-900/30'; }
    else if (isCondition) { borderColor = 'border-yellow-500'; headerBg = 'bg-yellow-900/30'; }

    return (
        <div className={`ml-4 mb-2 border-l-2 ${borderColor} pl-2`}>
            {/* NODE HEADER */}
            <div className={`flex items-center space-x-2 p-1 rounded ${headerBg} border border-gray-700/50 hover:border-gray-500 transition-colors`}>
                {isComposite && (
                    <button 
                        onClick={() => setCollapsed(!collapsed)}
                        className="w-4 h-4 flex items-center justify-center text-xs text-gray-400 hover:text-white"
                    >
                        {collapsed ? '▸' : '▾'}
                    </button>
                )}
                
                <select 
                    value={node.type} 
                    onChange={handleTypeChange}
                    className="bg-transparent text-xs font-bold text-white focus:outline-none cursor-pointer appearance-none"
                >
                    {Object.entries(NODE_TYPES_METADATA).map(([category, types]) => (
                        <optgroup key={category} label={category}>
                            {types.map(t => <option key={t} value={t}>{NODE_TRANSLATIONS[t] || t}</option>)}
                        </optgroup>
                    ))}
                </select>

                {/* Dynamic Params Inputs */}
                {NODE_PARAM_DEFS[node.type] && NODE_PARAM_DEFS[node.type].map( def => (
                    <div key={def.key} className="flex items-center space-x-1 bg-black/30 px-1 rounded">
                        <span className="text-[9px] text-gray-500">{PARAM_TRANSLATIONS[def.key] || def.key}:</span>
                        {def.type === 'boolean' ? (
                            <input 
                                type="checkbox" 
                                checked={Boolean(node.params?.[def.key] ?? def.default)}
                                onChange={e => handleParamChange(def.key, e.target.checked)}
                            />
                        ) : def.options ? (
                            <select 
                                value={String(node.params?.[def.key] ?? def.default)}
                                onChange={e => handleParamChange(def.key, e.target.value)}
                                className="bg-transparent text-[10px] text-cyan-300 focus:outline-none"
                            >
                                {def.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        ) : (
                            <input 
                                type="text" 
                                value={String(node.params?.[def.key] ?? def.default)}
                                onChange={e => handleParamChange(def.key, e.target.value)}
                                className="w-24 bg-transparent text-[10px] text-cyan-300 focus:outline-none border-b border-gray-600 placeholder-gray-700"
                                placeholder={String(def.default)}
                            />
                        )}
                    </div>
                ))}

                <div className="flex-1"></div>

                {isComposite && (
                    <button 
                        onClick={handleAddChild}
                        className="w-4 h-4 flex items-center justify-center text-[10px] bg-green-700 hover:bg-green-600 rounded text-white"
                        title="Add Child"
                    >
                        +
                    </button>
                )}
                
                {depth > 0 && (
                    <button 
                        onClick={onDelete}
                        className="w-4 h-4 flex items-center justify-center text-[10px] bg-red-900/50 hover:bg-red-600 rounded text-red-200"
                        title="Delete Node"
                    >
                        ×
                    </button>
                )}
            </div>

            {/* CHILDREN RECURSION */}
            {isComposite && !collapsed && (
                <div className="mt-1">
                    {node.children?.map((child, idx) => (
                        <TreeNode 
                            key={child.id || idx} 
                            node={child} 
                            onChange={(newChild) => handleChildChange(idx, newChild)}
                            onDelete={() => handleChildDelete(idx)}
                            depth={depth + 1}
                        />
                    ))}
                    {(!node.children || node.children.length === 0) && (
                        <div className="ml-6 text-[10px] text-gray-600 italic">No children (无子节点)</div>
                    )}
                </div>
            )}
        </div>
    );
};

export const AIEditor: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { aiTreeData, updateAiTree } = useGameStore();
    const [localTree, setLocalTree] = useState<AINodeDefinition>(JSON.parse(JSON.stringify(aiTreeData)));
    const [isDirty, setIsDirty] = useState(false);

    const handleTreeChange = (newTree: AINodeDefinition) => {
        setLocalTree(newTree);
        setIsDirty(true);
    };

    const handleSave = () => {
        updateAiTree(localTree);
        setIsDirty(false);
    };

    const handleExport = () => {
        navigator.clipboard.writeText(JSON.stringify(localTree, null, 2));
        alert("AI JSON copied to clipboard!");
    };
    
    const handleImport = () => {
        const str = prompt("Paste AI JSON:");
        if(str) {
            try {
                const json = JSON.parse(str);
                if(json.type && json.children) {
                    setLocalTree(json);
                    setIsDirty(true);
                }
            } catch(e) { alert("Invalid JSON"); }
        }
    }

    return (
        <div className="absolute inset-0 z-[160] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 text-gray-200 font-mono">
            <div className="bg-[#0f1115] border border-gray-700 rounded-lg w-full max-w-7xl h-[90vh] flex flex-col shadow-2xl">
                
                {/* Header */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-black/40">
                    <div className="flex items-center space-x-4">
                        <h2 className="text-lg font-bold text-white tracking-widest flex items-center">
                            <span className="w-3 h-3 bg-purple-500 rounded-full mr-3 animate-pulse"></span>
                            行为树编辑器 (BEHAVIOR TREE EDITOR)
                        </h2>
                        {isDirty && <span className="text-xs text-yellow-500 italic">* 未保存修改 (Unsaved Changes)</span>}
                    </div>
                    
                    <div className="flex space-x-2">
                        <button onClick={handleImport} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-xs">导入 (IMPORT)</button>
                        <button onClick={handleExport} className="px-3 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded text-xs">导出 JSON (EXPORT)</button>
                        <div className="w-px bg-gray-700 mx-2"></div>
                        <button onClick={handleSave} className="px-4 py-1 bg-green-700 hover:bg-green-600 text-white font-bold rounded text-xs">应用 / 保存 (APPLY)</button>
                        <button onClick={onClose} className="px-4 py-1 bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-800 rounded text-xs">关闭 (CLOSE)</button>
                    </div>
                </div>

                {/* Main Workspace */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left: The Tree Editor */}
                    <div className="flex-1 overflow-y-auto p-6 bg-[#111] relative border-r border-gray-800">
                        {/* Background Grid Lines */}
                        <div className="absolute inset-0 pointer-events-none opacity-5" 
                             style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                        </div>
                        
                        <TreeNode 
                            node={localTree} 
                            onChange={handleTreeChange} 
                            onDelete={() => alert("Cannot delete Root node.")}
                        />
                        
                        <div className="h-20"></div>
                    </div>

                    {/* Right: Config & Legend */}
                    <div className="w-80 bg-[#0a0a0a] flex flex-col border-l border-gray-800">
                        {/* GLOBAL PARAMS SECTION */}
                        <div className="p-4 border-b border-gray-800 overflow-y-auto flex-1">
                             <h4 className="font-bold text-cyan-500 mb-4 border-b border-cyan-900 pb-2 text-xs tracking-wider">
                                全局参数配置 (BINDABLE CONFIGS)
                             </h4>
                             <div className="text-[9px] text-gray-500 mb-4 italic">
                                * 下列参数名可填入左侧节点的 Value/Chance 字段中以实现绑定。
                             </div>
                             
                             <div className="space-y-1">
                                <div className="text-[10px] text-gray-500 font-bold mt-2 mb-1 border-b border-gray-800">COMBAT</div>
                                <ConfigSlider label="CONFIG_MELEE" confKey="MELEE_TRIGGER_DISTANCE" min={5} max={50} step={1} suffix="m"/>
                                <ConfigSlider label="CONFIG_MELEE_AGGRESSION" confKey="MELEE_AGGRESSION_RATE" min={0} max={1} step={0.05}/>
                                
                                <div className="text-[10px] text-gray-500 font-bold mt-4 mb-1 border-b border-gray-800">DEFENSE</div>
                                <ConfigSlider label="DODGE_CHECK_RADIUS" confKey="DODGE_CHECK_RADIUS" min={5} max={40} step={1} suffix="m"/>
                                <ConfigSlider label="CONFIG_DODGE" confKey="DODGE_REACTION_RATE" min={0} max={1} step={0.05}/>
                                <ConfigSlider label="CONFIG_MELEE_DEFENSE" confKey="MELEE_DEFENSE_RATE" min={0} max={1} step={0.05}/>

                                <div className="text-[10px] text-gray-500 font-bold mt-4 mb-1 border-b border-gray-800">SHOOTING</div>
                                <ConfigSlider label="CONFIG_SHOOT" confKey="SHOOT_PROBABILITY" min={0} max={0.2} step={0.01}/>
                                <ConfigSlider label="SHOOT_COOLDOWN_MIN" confKey="SHOOT_COOLDOWN_MIN" min={0.1} max={5} step={0.1} suffix="s"/>
                             </div>
                        </div>

                        {/* LEGEND SECTION */}
                        <div className="p-4 bg-[#050505] border-t border-gray-800 text-xs text-gray-500">
                            <h4 className="font-bold text-gray-400 mb-2">节点图例 (LEGEND)</h4>
                            <div className="space-y-2">
                                <div className="flex items-center"><div className="w-2 h-2 bg-blue-600 rounded-sm mr-2"></div>流程控制 (Composite)</div>
                                <div className="flex items-center"><div className="w-2 h-2 bg-yellow-600 rounded-sm mr-2"></div>条件检查 (Condition)</div>
                                <div className="flex items-center"><div className="w-2 h-2 bg-red-600 rounded-sm mr-2"></div>执行动作 (Action)</div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
};
