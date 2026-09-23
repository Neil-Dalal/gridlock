/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ArcadeGame } from './components/ArcadeGame';
import { retroAudio } from './audio';

export default function App() {
  const [isMuted, setIsMuted] = useState<boolean>(() => retroAudio.getMuted());
  const [copied, setCopied] = useState<boolean>(false);

  const toggleMute = () => {
    const muted = retroAudio.toggleMute();
    setIsMuted(muted);
  };

  const handleCopyRawHTML = async () => {
    try {
      const response = await fetch('/game.html');
      const htmlText = await response.text();
      await navigator.clipboard.writeText(htmlText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
      window.open('/game.html', '_blank');
    }
  };

  return (
    <div className="h-screen w-full bg-[#070210] text-white flex flex-col items-center justify-between p-1 sm:p-2 selection:bg-[#ff007f] selection:text-white overflow-hidden">
      {/* Top Header Bar */}
      <header className="w-full max-w-5xl flex items-center justify-between py-1 px-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏎️</span>
          <div>
            <h1 className="text-xs font-bold text-[#00f0ff] tracking-wider drop-shadow-[0_0_6px_#00f0ff]">
              RETRO DODGER
            </h1>
            <span className="text-[8px] text-[#ff007f] block">ARCADE EDITION</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleCopyRawHTML}
            className="text-[8px] bg-[#1a0c3b] hover:bg-[#2e1564] border border-[#ff007f] text-[#ff007f] px-2 py-1 rounded transition-all active:scale-95 cursor-pointer font-bold hidden"
            title="Copy standalone single-file HTML code"
          >
            {copied ? '✓ COPIED!' : '📋 RAW HTML'}
          </button>

          {/*
          <a
            href="/game.html"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[8px] bg-[#1a0c3b] hover:bg-[#2e1564] border border-[#00f0ff] text-[#00f0ff] px-2 py-1 rounded transition-all active:scale-95 cursor-pointer font-bold inline-block hidden"
            title="Open pure single-file HTML in new tab"
          >
            ↗ STANDALONE
          </a>
          */}
        </div>
      </header>

      {/* Main Playable Game Component - Adapts to fill screen dynamically */}
      <main className="w-full flex-1 flex items-center justify-center min-h-0 py-0.5 px-1 sm:px-2 max-w-6xl">
        <ArcadeGame isMuted={isMuted} onToggleMute={toggleMute} />
      </main>

      {/* Retro Arcade Bottom Panel */}
      <footer className="w-full max-w-6xl text-center shrink-0 pb-0.5 px-2">
        <div className="bg-[#120726] border border-[#28144d] rounded p-1 text-[7.5px] text-gray-400 flex justify-around items-center">
          <span><kbd className="text-[#00f0ff] font-bold">[←] / [A]</kbd> LEFT</span>
          <span className="text-gray-600">|</span>
          <span><kbd className="text-[#00f0ff] font-bold">[→] / [D]</kbd> RIGHT</span>
          <span className="text-gray-600">|</span>
          <span><kbd className="text-[#ffd700] font-bold">❓ MYSTERY BOX</kbd> ROLLS SHIELD / EMP / MAGNET</span>
          <span className="text-gray-600">|</span>
          <span><kbd className="text-[#39ff14] font-bold">[SPACE]</kbd> START</span>
        </div>
      </footer>
    </div>
  );
}
