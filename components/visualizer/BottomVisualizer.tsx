/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef } from 'react';
import { useLiveAPIContext } from '../../contexts/LiveAPIContext';
import { useUI } from '../../lib/state';

export default function BottomVisualizer() {
  const { volume, connected, isVolumeEnabled } = useLiveAPIContext();
  const { theme } = useUI();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = 120; 
    };
    window.addEventListener('resize', resize);
    resize();

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Configuration
    const barCount = 32;
    const barWidth = 8;
    const spacing = 12;
    const totalWidth = (barCount * barWidth) + ((barCount - 1) * spacing);
    
    const currentHeights = new Array(barCount).fill(0);

    const draw = () => {
        if (!canvas) return;
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        if (!connected || !isVolumeEnabled) {
             requestRef.current = requestAnimationFrame(draw);
             return;
        }
        
        const startX = (w - totalWidth) / 2;
        const centerIdx = barCount / 2;

        const color = theme === 'dark' ? '161, 228, 242' : '26, 115, 232';

        for (let i = 0; i < barCount; i++) {
            // Calculate amplitude for this bar based on volume
            const dist = Math.abs(i - centerIdx) / centerIdx; 
            const falloff = Math.cos(dist * Math.PI / 2); 
            
            let targetHeight = 0;
            if (volume > 0.005) {
                const v = Math.min(1, volume * 3.5);
                const r = 0.8 + Math.random() * 0.4; // Subtle jitter
                targetHeight = v * h * falloff * r; 
                targetHeight = Math.max(4, targetHeight);
            } else {
                targetHeight = 2;
            }

            // Smooth interpolation
            currentHeights[i] += (targetHeight - currentHeights[i]) * 0.3;

            // Draw
            ctx.fillStyle = `rgba(${color}, ${0.5 + (currentHeights[i]/h)*0.5})`;
            
            const x = startX + i * (barWidth + spacing);
            const y = h - currentHeights[i];
            
            ctx.beginPath();
            ctx.roundRect(x, y, barWidth, currentHeights[i], 4);
            ctx.fill();
        }
        
        requestRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
        window.removeEventListener('resize', resize);
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
  }, [volume, connected, isVolumeEnabled, theme]);

  return (
    <div className="bottom-visualizer" style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '120px',
        pointerEvents: 'none',
        zIndex: 90, // Behind ControlTray (100)
    }}>
      <canvas ref={canvasRef} style={{width: '100%', height: '100%'}} />
    </div>
  );
}