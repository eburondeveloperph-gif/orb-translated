/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useSettings, useUI, VoiceStyle } from '@/lib/state';
import c from 'classnames';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { useEffect, useState } from 'react';
import { supabase, Transcript, isSupabaseConfigured } from '@/lib/supabase';
import { SUPPORTED_LANGUAGES, AVAILABLE_VOICES } from '@/lib/constants';

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useUI();
  const { 
    language, setLanguage, 
    voice, setVoice, 
    voiceStyle, setVoiceStyle,
    speechRate, setSpeechRate,
    backgroundPadEnabled, setBackgroundPadEnabled,
    backgroundPadVolume, setBackgroundPadVolume
  } = useSettings();
  const { connected } = useLiveAPIContext();
  const [dbData, setDbData] = useState<Transcript | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    // Initial fetch
    supabase
      .from('transcripts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setDbData(data);
      });

    // Real-time subscription for UI updates
    const channel = supabase
      .channel('sidebar-db-monitor')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transcripts' },
        (payload) => {
          if (payload.new) {
             setDbData(payload.new as Transcript);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <>
      <aside className={c('sidebar', { open: isSidebarOpen })}>
        <div className="sidebar-header">
          <h3>Settings</h3>
          <button onClick={toggleSidebar} className="close-button">
            <span className="icon">close</span>
          </button>
        </div>
        <div className="sidebar-content">
          <div className="sidebar-section">
            <h4 className="sidebar-section-title">Database Monitor</h4>
            <div style={{ fontSize: '12px', background: 'var(--bg-panel-secondary)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              {isSupabaseConfigured() ? (
                  dbData ? (
                    <>
                      <div style={{ marginBottom: '8px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase' }}>Current ID: {dbData.id.substring(0, 8)}...</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{new Date(dbData.updated_at).toLocaleTimeString()}</div>
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                         <strong style={{color: 'var(--accent-blue)'}}>Source ({dbData.source_language || '?'}):</strong><br />
                         <div style={{ color: 'var(--text-main)', marginTop: '4px', fontStyle: 'italic', maxHeight: '100px', overflowY: 'auto' }}>
                           "{dbData.full_transcript_text?.substring(0, 200)}{dbData.full_transcript_text?.length > 200 ? '...' : ''}"
                         </div>
                      </div>
                      <div>
                        <strong style={{color: 'var(--accent-green)'}}>Processing Status:</strong><br />
                        <div style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Sent to Audio Engine</div>
                      </div>
                    </>
                  ) : (
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
                      <span className="material-symbols-outlined" style={{fontSize: '16px', animation: 'spin 2s linear infinite'}}>sync</span>
                      Connecting to Eburon DB...
                    </div>
                  )
              ) : (
                  <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Supabase credentials not configured. <br/> Monitoring disabled.
                  </div>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <fieldset disabled={connected}>
              <div style={{marginBottom: '1rem'}}>
                <label style={{display: 'block', marginBottom: '8px', fontSize: '0.85rem'}}>Target Language</label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  style={{
                    appearance: 'none',
                    backgroundImage: `var(--select-arrow)`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    backgroundSize: '1em',
                    paddingRight: '30px'
                  }}
                >
                  <option value="" disabled>Select...</option>
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{marginBottom: '1rem'}}>
                <label style={{display: 'block', marginBottom: '8px', fontSize: '0.85rem'}}>Voice Model</label>
                <select
                  value={voice}
                  onChange={e => setVoice(e.target.value)}
                  style={{
                    appearance: 'none',
                    backgroundImage: `var(--select-arrow)`,
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'right 12px center',
                    backgroundSize: '1em',
                    paddingRight: '30px'
                  }}
                >
                  {AVAILABLE_VOICES.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{marginBottom: '1rem'}}>
                <label style={{display: 'block', marginBottom: '8px', fontSize: '0.85rem'}}>Voice Style</label>
                <input
                  type="text"
                  value={voiceStyle}
                  onChange={e => setVoiceStyle(e.target.value as any)}
                  placeholder="e.g. Soft and engaging"
                  style={{width: '100%'}}
                />
              </div>

              <div>
                <label style={{display: 'block', marginBottom: '8px', fontSize: '0.85rem'}}>Reading Speed: {speechRate}x</label>
                <input 
                    type="range" 
                    min="0.5" 
                    max="2.0" 
                    step="0.1" 
                    value={speechRate}
                    onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                    style={{width: '100%', cursor: 'pointer'}}
                 />
                 <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px'}}>
                   <span>Slow</span>
                   <span>Normal</span>
                   <span>Fast</span>
                 </div>
              </div>

              <div style={{marginTop: '20px', padding: '12px', background: 'var(--bg-panel-secondary)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic'}}>
                 System Prompt is managed automatically by Eburon Controller based on selected language and style.
              </div>
            </fieldset>
          </div>

          <div className="sidebar-section">
            <h4 className="sidebar-section-title">Background Audio</h4>
            <div style={{display: 'flex', flexDirection: 'column', gap: '1rem'}}>
               <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
                 <label style={{fontSize: '0.9rem'}}>Ambient Pad</label>
                 <label className="switch" style={{position: 'relative', display: 'inline-block', width: '40px', height: '24px'}}>
                   <input 
                      type="checkbox" 
                      checked={backgroundPadEnabled}
                      onChange={(e) => setBackgroundPadEnabled(e.target.checked)}
                      style={{opacity: 0, width: 0, height: 0}}
                   />
                   <span 
                     style={{
                       position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, 
                       backgroundColor: backgroundPadEnabled ? 'var(--accent-blue)' : 'var(--Neutral-30)', 
                       transition: '.4s', borderRadius: '24px'
                     }}
                   >
                     <span style={{
                       position: 'absolute', content: '""', height: '16px', width: '16px', 
                       left: backgroundPadEnabled ? '20px' : '4px', bottom: '4px', 
                       backgroundColor: 'white', transition: '.4s', borderRadius: '50%'
                     }}></span>
                   </span>
                 </label>
               </div>
               
               {backgroundPadEnabled && (
                 <div>
                   <label style={{display: 'block', marginBottom: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)'}}>
                     Volume: {Math.round(backgroundPadVolume * 100)}%
                   </label>
                   <input 
                      type="range" 
                      min="0" 
                      max="0.5" 
                      step="0.01" 
                      value={backgroundPadVolume}
                      onChange={(e) => setBackgroundPadVolume(parseFloat(e.target.value))}
                      style={{width: '100%', cursor: 'pointer'}}
                   />
                 </div>
               )}
            </div>
          </div>
          
          <div className="sidebar-section">
            <div style={{padding: '12px', background: 'var(--active-bg-subtle)', borderRadius: '8px', border: '1px solid var(--accent-blue)', fontSize: '12px'}}>
              <strong style={{display:'block', marginBottom:'4px', color:'var(--accent-blue)'}}>Eburon Active</strong>
              Tools disabled. Polling interval: 5s.
            </div>
          </div>

        </div>
      </aside>
    </>
  );
}