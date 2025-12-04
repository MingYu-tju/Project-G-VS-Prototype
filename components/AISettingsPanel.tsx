
import React from 'react';
import { useGameStore } from '../store';
import { NPCConfig } from '../types';

const SliderControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (val: number) => void;
    suffix?: string;
}> = ({ label, value, min, max, step, onChange, suffix = '' }) => {
    return (
        <div className="mb-4">
            <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-mono text-gray-400">{label}</span>
                <span className="text-[10px] font-mono text-cyan-400 font-bold">{value.toFixed(2)}{suffix}</span>
            </div>
            <input 
                type="range" 
                min={min} 
                max={max} 
                step={step} 
                value={value} 
                onChange={(e) => onChange(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
        </div>
    );
};

export const AISettingsPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const { npcConfig, updateNpcConfig } = useGameStore();

    const update = (key: keyof NPCConfig, value: number) => {
        updateNpcConfig({ [key]: value });
    };

    return (
        <div className="absolute inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0f1115] border border-gray-700 rounded-lg w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-black/40">
                    <h2 className="text-sm font-bold text-white tracking-widest font-mono flex items-center">
                        <span className="w-2 h-2 bg-cyan-500 rounded-full mr-2 animate-pulse"></span>
                        AI 参数配置 (AI CONFIG)
                    </h2>
                    <button 
                        onClick={onClose}
                        className="text-gray-500 hover:text-white text-xs font-bold"
                    >
                        ✕
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700">
                    
                    {/* Section: Combat Behavior */}
                    <div className="mb-6">
                        <h3 className="text-[10px] font-bold text-red-400 uppercase mb-3 border-b border-red-900/30 pb-1">
                            近战行为 (Melee Combat)
                        </h3>
                        <SliderControl 
                            label="格斗诱导范围 (Trigger Range)" 
                            value={npcConfig.MELEE_TRIGGER_DISTANCE} 
                            min={5} max={50} step={1} 
                            onChange={(v) => update('MELEE_TRIGGER_DISTANCE', v)} 
                            suffix="m"
                        />
                        <SliderControl 
                            label="进攻欲望 (Aggression Rate)" 
                            value={npcConfig.MELEE_AGGRESSION_RATE} 
                            min={0} max={1} step={0.05} 
                            onChange={(v) => update('MELEE_AGGRESSION_RATE', v)} 
                        />
                    </div>

                    {/* Section: Defense */}
                    <div className="mb-6">
                        <h3 className="text-[10px] font-bold text-blue-400 uppercase mb-3 border-b border-blue-900/30 pb-1">
                            防御与闪避 (Defense & Evasion)
                        </h3>
                        <SliderControl 
                            label="威胁感知半径 (Detection Radius)" 
                            value={npcConfig.DODGE_CHECK_RADIUS} 
                            min={5} max={40} step={1} 
                            onChange={(v) => update('DODGE_CHECK_RADIUS', v)} 
                            suffix="m"
                        />
                        <SliderControl 
                            label="弹幕闪避率 (Projectile Dodge)" 
                            value={npcConfig.DODGE_REACTION_RATE} 
                            min={0} max={1} step={0.05} 
                            onChange={(v) => update('DODGE_REACTION_RATE', v)} 
                        />
                        <SliderControl 
                            label="格斗回避率 (Melee Counter)" 
                            value={npcConfig.MELEE_DEFENSE_RATE} 
                            min={0} max={1} step={0.05} 
                            onChange={(v) => update('MELEE_DEFENSE_RATE', v)} 
                        />
                    </div>

                    {/* Section: Shooting */}
                    <div className="mb-6">
                        <h3 className="text-[10px] font-bold text-yellow-400 uppercase mb-3 border-b border-yellow-900/30 pb-1">
                            射击行为 (Ranged Combat)
                        </h3>
                        <SliderControl 
                            label="射击频率 (Fire Probability)" 
                            value={npcConfig.SHOOT_PROBABILITY} 
                            min={0} max={0.2} step={0.01} 
                            onChange={(v) => update('SHOOT_PROBABILITY', v)} 
                        />
                        <div className="grid grid-cols-2 gap-4">
                            <SliderControl 
                                label="最小间隔 (Min CD)" 
                                value={npcConfig.SHOOT_COOLDOWN_MIN} 
                                min={0.1} max={5} step={0.1} 
                                onChange={(v) => update('SHOOT_COOLDOWN_MIN', v)} 
                                suffix="s"
                            />
                            <SliderControl 
                                label="最大间隔 (Max CD)" 
                                value={npcConfig.SHOOT_COOLDOWN_MAX} 
                                min={0.1} max={10} step={0.1} 
                                onChange={(v) => update('SHOOT_COOLDOWN_MAX', v)} 
                                suffix="s"
                            />
                        </div>
                    </div>

                    {/* Section: General */}
                    <div className="mb-2">
                         <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3 border-b border-gray-800 pb-1">
                            通用行为 (General)
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                             <SliderControl 
                                label="切换目标最小 (Switch Min)" 
                                value={npcConfig.TARGET_SWITCH_MIN} 
                                min={1} max={10} step={0.5} 
                                onChange={(v) => update('TARGET_SWITCH_MIN', v)} 
                                suffix="s"
                            />
                            <SliderControl 
                                label="切换目标最大 (Switch Max)" 
                                value={npcConfig.TARGET_SWITCH_MAX} 
                                min={1} max={20} step={0.5} 
                                onChange={(v) => update('TARGET_SWITCH_MAX', v)} 
                                suffix="s"
                            />
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-800 bg-black/40 flex justify-end">
                     <button 
                        onClick={onClose}
                        className="px-6 py-2 bg-cyan-900/50 hover:bg-cyan-800 text-cyan-300 border border-cyan-700 rounded text-xs font-bold transition-colors"
                    >
                        关闭 (CLOSE)
                    </button>
                </div>
            </div>
        </div>
    );
};
