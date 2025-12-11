/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef } from 'react';

export type AudioVisualizerProps = {
  volume: number; // 0 to 1
  active: boolean;
};

export default function AudioVisualizer({ volume, active }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number | null>(null);
  
  // Keep track of bar heights for smooth animation
  const barsRef = useRef<number[]>([0, 0, 0, 0]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Helper to draw a single frame
    const draw = () => {
      if (!canvas) return;
      
      const width = canvas.width;
      const height = canvas.height;
      const barCount = 4;
      const gap = 2;
      const barWidth = (width - ((barCount - 1) * gap)) / barCount;
      
      ctx.clearRect(0, 0, width, height);

      // Define styling
      const theme = document.body.getAttribute('data-theme') || 'dark';
      const color = theme === 'dark' ? '#1f94ff' : '#1a73e8'; // Blue-500 equivalent

      // Update bars based on volume input
      // We map the single volume value to slightly different random multipliers 
      // to create a "wave" effect across the bars
      barsRef.current = barsRef.current.map((currentHeight, i) => {
        let targetHeight = 0;
        
        if (active && volume > 0.01) {
          // Amplify the volume for visibility
          const amplified = Math.min(1, volume * 3); 
          
          // Randomize slightly for each bar based on index
          const variance = 0.7 + (Math.random() * 0.3);
          const indexMod = 1 - (Math.abs(1.5 - i) * 0.2); // Center bars higher
          
          targetHeight = amplified * height * variance * indexMod;
          targetHeight = Math.max(4, targetHeight); // Min height
        } else {
          targetHeight = 2; // Resting height
        }

        // Smooth interpolation (ease-out)
        return currentHeight + (targetHeight - currentHeight) * 0.2;
      });

      // Draw bars
      ctx.fillStyle = color;
      
      barsRef.current.forEach((h, i) => {
        const x = i * (barWidth + gap);
        // Center vertically
        const y = (height - h) / 2;
        
        // Rounded caps
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, 20);
        ctx.fill();
      });

      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [active, volume]);

  return (
    <div className="audio-visualizer-container">
      <canvas 
        ref={canvasRef} 
        width={32} 
        height={24} 
        className="audio-visualizer-canvas"
      />
    </div>
  );
}