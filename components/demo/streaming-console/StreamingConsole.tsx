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

// Helper component for Teleprompter Script Effect with Typewriter
const ScriptReader = memo(({ text }: { text: string }) => {
  const [displayedText, setDisplayedText] = useState('');
  
  useEffect(() => {
    let index = 0;
    // Reset when text changes (new log entry usually implies new text)
    if (text === displayedText) return;
    
    // Calculate typing speed - faster for long text to keep up, but minimum readable speed
    const typingSpeed = 20; 

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

  // Simple parser to separate stage directions from spoken text
  // Directions are in parentheses () or brackets []
  const parts = displayedText.split(/([(\[].*?[)\]])/g);

  return (
    <div className="script-line">
      {parts.map((part, index) => {
        if (part.match(/^[(\[].*[)\]]$/)) {
          // It's a stage direction
          return <span key={index} className="script-direction">{part}</span>;
        }
        // It's spoken text
        return <span key={index} className="script-spoken">{part}</span>;
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
      // Updated to use empty objects as per latest API spec for default models
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
    const { addTurn, updateLastTurn } = useLogStore.getState();

    // We only care about errors or keeping the connection alive, 
    // we do NOT want to log the transcription for the user to see in this specific mode.
    // However, we still listen to maintain protocol state.

    const handleInputTranscription = (text: string, isFinal: boolean) => {
       // Suppressed for Script View
    };

    const handleOutputTranscription = (text: string, isFinal: boolean) => {
       // Suppressed for Script View
    };

    const handleContent = (serverContent: LiveServerContent) => {
       // Suppressed for Script View
    };

    const handleTurnComplete = () => {
       // Suppressed
    };

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