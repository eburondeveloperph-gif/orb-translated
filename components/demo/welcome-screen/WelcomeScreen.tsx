/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import './WelcomeScreen.css';

const WelcomeScreen: React.FC = () => {
  return (
    <div className="welcome-screen">
      <div className="welcome-content">
        <div className="title-container">
          <span className="welcome-icon">record_voice_over</span>
          <h2 style={{fontSize: '28px', margin: '0 0 10px 0', color: 'var(--accent-blue-headers)'}}>Eburon TTS Active</h2>
        </div>
        <p style={{color: 'var(--gray-300)'}}>
          System is ready to bridge Supabase streams to Gemini Live.
        </p>
        <div style={{
          background: 'var(--Neutral-15)', 
          padding: '20px', 
          borderRadius: '12px',
          border: '1px solid var(--gray-700)',
          marginTop: '20px',
          textAlign: 'left'
        }}>
          <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px'}}>
            <span className="material-symbols-outlined" style={{color:'var(--accent-green)'}}>check_circle</span>
            <span>Database Connection: <strong>Active</strong></span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'12px', marginBottom:'12px'}}>
            <span className="material-symbols-outlined" style={{color:'var(--accent-blue)'}}>schedule</span>
            <span>Polling Interval: <strong>5 Seconds</strong></span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
            <span className="material-symbols-outlined" style={{color:'var(--Red-400)'}}>graphic_eq</span>
            <span>Voice: <strong>Orus</strong></span>
          </div>
        </div>
        <p style={{marginTop: '30px', fontSize: '14px', color: 'var(--gray-500)'}}>
          Press <span className="material-symbols-outlined" style={{verticalAlign: 'middle', fontSize: '16px'}}>play_arrow</span> in the control tray to start the session.
        </p>
      </div>
    </div>
  );
};

export default WelcomeScreen;