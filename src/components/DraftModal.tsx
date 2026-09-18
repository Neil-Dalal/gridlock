/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ModifierDefinition, drawDraftModifiers } from '../modifiers';

interface DraftModalProps {
  onSelectModifier: (modifier: ModifierDefinition) => void;
  highScore: number;
}

export const DraftModal: React.FC<DraftModalProps> = ({
  onSelectModifier,
  highScore,
}) => {
  // State: the 3 drawn cards
  const [cards, setCards] = useState<ModifierDefinition[]>(() => drawDraftModifiers());
  const [selectedModifier, setSelectedModifier] = useState<ModifierDefinition | null>(null);

  const handleReroll = () => {
    const freshCards = drawDraftModifiers();
    setCards(freshCards);
    setSelectedModifier(null);
  };

  const handleCardClick = (card: ModifierDefinition) => {
    setSelectedModifier(card);
  };

  const handleStartRun = () => {
    if (!selectedModifier) return;
    onSelectModifier(selectedModifier);
  };

  return (
    <div className="absolute inset-0 bg-[#070210]/95 backdrop-blur-sm z-30 flex flex-col items-center justify-between p-3.5 text-center select-none overflow-y-auto">
      {/* Title & Rules Section */}
      <div className="w-full max-w-[370px] pt-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#1e0a3d] border border-[#ff007f] text-[#ff007f] text-[9px] font-bold tracking-widest uppercase mb-1 shadow-[0_0_10px_rgba(255,0,127,0.3)]">
          <span>⚡</span> PRE-GAME DRAFT SYSTEM
        </div>
        <h2 className="text-base sm:text-lg font-black text-white tracking-wider drop-shadow-[0_0_8px_#00f0ff]">
          CHOOSE YOUR MODIFIER
        </h2>
        <p className="text-[9px] text-gray-300 max-w-[320px] mx-auto mt-0.5 leading-relaxed">
          Randomly drawn from 5 combat protocols. Applies <span className="text-[#39ff14] font-bold">1 permanent buff</span> & <span className="text-[#ff3366] font-bold">1 permanent debuff</span> for this 60s run.
        </p>
      </div>

      {/* 3 Drawn Cards */}
      <div className="w-full max-w-[370px] flex flex-col gap-2 my-2">
        {cards.map((mod, index) => {
          const isSelected = selectedModifier?.id === mod.id;
          return (
            <button
              key={mod.id}
              type="button"
              onClick={() => handleCardClick(mod)}
              className={`w-full text-left p-2.5 rounded-lg border transition-all duration-150 relative cursor-pointer group ${
                isSelected
                  ? 'bg-[#180a33] ring-2 shadow-[0_0_16px_rgba(0,240,255,0.4)] scale-[1.01]'
                  : 'bg-[#100624]/90 hover:bg-[#180b33] border-[#31165e] opacity-90 hover:opacity-100'
              }`}
              style={{
                borderColor: isSelected ? mod.borderColor : '#31165e',
                boxShadow: isSelected ? `0 0 14px ${mod.borderColor}66` : undefined,
              }}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl p-1 rounded bg-[#0b031c] border border-[#3b1b6d]">
                    {mod.emoji}
                  </span>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-xs font-black tracking-wider"
                        style={{ color: mod.color }}
                      >
                        {mod.name}
                      </span>
                      <span className="text-[8px] px-1 py-0.2 rounded bg-[#200e42] text-gray-400 font-mono">
                        #{index + 1}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Selection Radio Indicator */}
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                    isSelected
                      ? 'border-[#00f0ff] bg-[#00f0ff]'
                      : 'border-gray-600 bg-transparent group-hover:border-gray-400'
                  }`}
                >
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#070210]"></div>
                  )}
                </div>
              </div>

              {/* Single Description Box */}
              <div className="p-1.5 mt-1 rounded bg-[#0b031c]/80 border border-[#3b1b6d]/40">
                <p className="text-gray-300 leading-tight text-[8px] text-center">
                  {mod.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Action Footer */}
      <div className="w-full max-w-[370px] flex flex-col gap-1.5 pb-1">
        {/* Enforce selection warning or confirmation */}
        {!selectedModifier ? (
          <div className="text-[8.5px] text-amber-400 bg-amber-950/40 border border-amber-800/60 rounded py-1 px-2 font-mono">
            ⚠️ SELECT 1 MODIFIER ABOVE TO UNLOCK START
          </div>
        ) : (
          <div className="text-[8.5px] text-[#00f0ff] bg-[#00f0ff]/10 border border-[#00f0ff]/40 rounded py-1 px-2 font-mono font-bold flex items-center justify-center gap-1">
            <span>READY:</span>
            <span style={{ color: selectedModifier.color }}>
              [{selectedModifier.emoji} {selectedModifier.name}]
            </span>
            <span>ARMED FOR 60s RUN</span>
          </div>
        )}

        <div className="flex gap-2">
          {/* Reroll 3 button */}
          <button
            type="button"
            onClick={handleReroll}
            className="flex-1 py-2 px-2 text-[9px] font-bold bg-[#170a2f] hover:bg-[#251247] border border-[#482382] text-gray-300 hover:text-white rounded transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
            title="Redraw 3 new modifiers from the pool"
          >
            <span>🎲</span> REDRAW (3/5)
          </button>

          {/* Start Run Button */}
          <button
            type="button"
            disabled={!selectedModifier}
            onClick={handleStartRun}
            className={`flex-[2] py-2 px-3 text-[10px] font-black tracking-widest rounded transition-all flex items-center justify-center gap-1.5 ${
              selectedModifier
                ? 'bg-gradient-to-r from-[#00f0ff] to-[#0099ff] text-black shadow-[0_0_18px_rgba(0,240,255,0.6)] cursor-pointer hover:brightness-110 active:scale-95 animate-pulse'
                : 'bg-gray-800/60 text-gray-500 border border-gray-700 cursor-not-allowed'
            }`}
          >
            <span>▶</span> START RUN WITH MODIFIER
          </button>
        </div>

        {/* High score note */}
        <div className="flex justify-between text-[7.5px] text-gray-500 px-1 font-mono">
          <span>HIGH SCORE: {highScore.toLocaleString()} PTS</span>
          <span>KEYS [1-3] SELECT • [ENTER] START</span>
        </div>
      </div>
    </div>
  );
};
