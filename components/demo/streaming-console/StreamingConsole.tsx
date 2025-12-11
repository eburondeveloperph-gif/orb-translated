/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef, memo, useState } from 'react';
import { LiveConnectConfig, Modality, LiveServerContent } from '@google/genai';

import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import {
  useSettings,
  useLogStore,
  useTools,
} from '@/lib/state';

// Helper component for Teleprompter Script Effect with Typewriter and Speaker Coloring
const ScriptReader = memo(({ text }: { text: string }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    let index = 0;
    // Reset when text changes 
    // Optimization: Check if displayedText is already a substring of new text to avoid full reset if just appending
    if (text === displayedText) return;
    
    // If text changed completely, reset
    // If text is just the diarized version replacing raw version, we might want to type it out or show immediately.
    // For smoother UX on replace: show immediately if length difference is small or context similar? 
    // For now, let's re-type it fast to show the "correction" effect.
    
    const typingSpeed = 10; // Faster typing for updates

    const interval = setInterval(() => {
      setDisplayedText((prev) => {
        if (index >= text.length) {
          clearInterval(interval);
          return text;
        }
        index++;
        return text.slice(0, index);
      });
    }, typingSpeed);

    return () => clearInterval(interval);
  }, [text]);

  // Regex to split by Speaker Labels: "Male 1:", "Female 1:", etc.
  // Also handles stage directions.
  // We split by capturing groups to keep the delimiters.
  // Pattern: ((?:Male|Female) \d:|Speaker \d:|Host:|Guest:)
  const parts = displayedText.split(/((?:Male|Female) \d:|Speaker \d:|Host:|Guest:)/g);

  return (
    <div className="script-line">
      {parts.map((part, index) => {
        const trimmed = part.trim();
        
        // Check for Speaker Label
        if (trimmed.match(/^(Male 1|Speaker 1|Host):?$/i)) {
          return <span key={index} className="speaker-label male-1">{trimmed}</span>;
        }
        if (trimmed.match(/^(Female 1|Speaker 2|Guest):?$/i)) {
          return <span key={index} className="speaker-label female-1">{trimmed}</span>;
        }
        if (trimmed.match(/^(Male 2|Speaker 3):?$/i)) {
          return <span key={index} className="speaker-label male-2">{trimmed}</span>;
        }
        if (trimmed.match(/^(Female 2|Speaker 4):?$/i)) {
          return <span key={index} className="speaker-label female-2">{trimmed}</span>;
        }

        // Process content for stage directions
        const subParts = part.split(/([(\[].*?[)\]])/g);
        return (
          <span key={index}>
            {subParts.map((sub, subIdx) => {
               if (sub.match(/^[(\[].*[)\]]$/)) {
                 return <span key={`${index}-${subIdx}`} className="script-direction">{sub}</span>;
               }
               return <span key={`${index}-${subIdx}`} className="script-spoken">{sub}</span>;
            })}
          </span>
        );
      })}
    </div>
  );
});

// Digital Clock Component
const DigitalClock = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="digital-clock">
      <div className="clock-time">
        {time.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </div>
      <div className="clock-date">
        {time.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </div>
    </div>
  );
};

export default function StreamingConsole() {
  const { client, setConfig } = useLiveAPIContext();
  const { systemPrompt, voice } = useSettings();
  const { tools } = useTools();
  const turns = useLogStore(state => state.turns);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const config: LiveConnectConfig = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice,
          },
        },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: { parts: [{ text: systemPrompt }] }, 
    };

    const enabledTools = tools
      .filter(tool => tool.isEnabled)
      .map(tool => ({
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        ],
      }));

    if (enabledTools.length > 0) {
      config.tools = enabledTools;
    }

    setConfig(config);
  }, [setConfig, systemPrompt, tools, voice]);

  useEffect(() => {
    // Suppress transcriptions from Live API as we drive UI via Supabase
    const handleInputTranscription = () => {};
    const handleOutputTranscription = () => {};
    const handleContent = () => {};
    const handleTurnComplete = () => {};

    client.on('inputTranscription', handleInputTranscription);
    client.on('outputTranscription', handleOutputTranscription);
    client.on('content', handleContent);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('inputTranscription', handleInputTranscription);
      client.off('outputTranscription', handleOutputTranscription);
      client.off('content', handleContent);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client]);

  // Scroll to bottom when turns change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  // Filter: Only show "system" turns which contain our Script
  const scriptTurns = turns.filter(t => t.role === 'system');

  return (
    <div className="streaming-console-layout">
      <style>{`
        .speaker-label {
          font-weight: bold;
          font-size: 0.8em;
          text-transform: uppercase;
          margin-right: 8px;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-block;
          margin-bottom: 4px;
        }
        .speaker-label.male-1 { background-color: rgba(66, 133, 244, 0.2); color: #8ab4f8; border: 1px solid #4285f4; }
        .speaker-label.female-1 { background-color: rgba(52, 168, 83, 0.2); color: #81c995; border: 1px solid #34a853; }
        .speaker-label.male-2 { background-color: rgba(251, 188, 4, 0.2); color: #fdd663; border: 1px solid #fbbc04; }
        .speaker-label.female-2 { background-color: rgba(234, 67, 53, 0.2); color: #f28b82; border: 1px solid #ea4335; }
        
        /* Light mode overrides */
        [data-theme='light'] .speaker-label.male-1 { background-color: #e8f0fe; color: #1967d2; border-color: #aecbfa; }
        [data-theme='light'] .speaker-label.female-1 { background-color: #e6f4ea; color: #137333; border-color: #a8dab5; }
        [data-theme='light'] .speaker-label.male-2 { background-color: #fef7e0; color: #ea8600; border-color: #fde293; }
        [data-theme='light'] .speaker-label.female-2 { background-color: #fce8e6; color: #c5221f; border-color: #f6aea9; }
      `}</style>
      <DigitalClock />
      
      <div className="transcription-container">
        {scriptTurns.length === 0 ? (
          <div className="console-box empty">
            <div className="waiting-placeholder">
              <span className="material-symbols-outlined icon">auto_stories</span>
              <p>Waiting for stream...</p>
            </div>
          </div>
        ) : (
          <div className="console-box">
            <div className="transcription-view teleprompter-mode" ref={scrollRef}>
              {scriptTurns.map((t, i) => (
                <div key={i} className="transcription-entry system">
                  {/* Source Text Rendering */}
                  {t.sourceText && (
                    <div className="source-text" style={{ 
                        fontSize: '0.95rem', 
                        color: 'var(--text-secondary)', 
                        marginBottom: '8px',
                        fontStyle: 'italic',
                        opacity: 0.8,
                        borderLeft: '2px solid var(--accent-blue)',
                        paddingLeft: '8px'
                      }}>
                      {t.sourceText}
                    </div>
                  )}
                  {/* Translated Text Rendering */}
                  <div className="transcription-text-content">
                    <ScriptReader text={t.text} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}