/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { useEffect, useRef, useMemo } from 'react';
import { supabase, Transcript, isSupabaseConfigured } from '../lib/supabase';
import { useLiveAPIContext } from '../contexts/LiveAPIContext';
import { useLogStore, useSettings } from '../lib/state';
import { GoogleGenAI, Modality } from '@google/genai';
import { GEMINI_FLASH_MODEL, GEMINI_TTS_MODEL } from '../lib/constants';
import { base64ToArrayBuffer } from '../lib/utils';

// Worker script to ensure polling continues even when tab is in background
const workerScript = `
  self.onmessage = function() {
    setInterval(() => {
      self.postMessage('tick');
    }, 5000);
  };
`;

// Helper to segment text into natural reading chunks (Paragraphs)
const segmentText = (text: string): string[] => {
  if (!text) return [];
  return text.split(/\r?\n+/).map(t => t.trim()).filter(t => t.length > 0);
};

export default function DatabaseBridge() {
  const { client, connected, getAudioStreamerState, feedAudio } = useLiveAPIContext();
  const { addTurn, updateLastTurn } = useLogStore();
  const { voiceStyle, speechRate, language } = useSettings();
  
  const lastProcessedIdRef = useRef<string | null>(null);
  const paragraphCountRef = useRef<number>(0);
  
  const voiceStyleRef = useRef(voiceStyle);
  const speechRateRef = useRef(speechRate);
  const languageRef = useRef(language);

  // Initialize independent GenAI client for Text Logic & TTS (REST)
  const genAI = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY || '' }), []);

  useEffect(() => {
    voiceStyleRef.current = voiceStyle;
  }, [voiceStyle]);

  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // High-performance queue using Refs
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  // 1. Diarization & Translation Logic (Gemini Flash)
  const diarizeAndTranslate = async (text: string, targetLanguage: string): Promise<string> => {
    try {
      const analysisResponse = await genAI.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: `
          You are a strict translator and script formatter.
          TASK:
          1. Translate the following text into [${targetLanguage}].
          2. Identify distinct speakers.
          3. Assign a label 'Male 1', 'Female 1', 'Male 2', 'Female 2' to them based on context or names in the source.
          4. If only one speaker is detected, use 'Male 1' as default.
          5. Rewrite the text strictly in the format: "Speaker Label: Translated Text".
          6. Do NOT add any markdown, intro, or outro. 
          7. Maintain stage directions in parentheses if present, translated.

          Source Text: "${text}"
        `
      });
      return analysisResponse.text?.trim() || `Male 1: ${text}`;
    } catch (error) {
      console.error('Diarization/Translation failed:', error);
      return `Male 1: ${text}`;
    }
  };

  // 2. Audio Generation Logic (Gemini TTS Multi-Speaker)
  const generateMultiSpeakerAudio = async (script: string) => {
    try {
      const ttsResponse = await genAI.models.generateContent({
        model: GEMINI_TTS_MODEL,
        contents: [{ parts: [{ text: script }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                    speaker: 'Male 1',
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } }
                },
                {
                    speaker: 'Female 1',
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } }
                },
                {
                    speaker: 'Male 2',
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } }
                },
                {
                    speaker: 'Female 2',
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
                }
              ]
            }
          }
        }
      });

      const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        const audioBuffer = base64ToArrayBuffer(audioBase64);
        feedAudio(new Uint8Array(audioBuffer));
        return true;
      }
    } catch (error) {
      console.error('TTS Generation failed:', error);
    }
    return false;
  };

  // Data Ingestion & Processing Logic
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    isProcessingRef.current = false;

    if (!connected) return;

    // The consumer loop that processes the queue sequentially
    const processQueueLoop = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        while (queueRef.current.length > 0) {
          if (client.status !== 'connected') {
            isProcessingRef.current = false;
            return;
          }

          const scriptedText = queueRef.current[0];
          
          if (!scriptedText || !scriptedText.trim()) {
            queueRef.current.shift();
            continue;
          }

          const preSendState = getAudioStreamerState();

          // >>> GENERATE AUDIO <<<
          // Text is already translated and diarized (e.g. "Male 1: Hola")
          const success = await generateMultiSpeakerAudio(scriptedText);
          
          // Fallback
          if (!success) {
             const cleanText = scriptedText.replace(/^(Male|Female) \d:\s*/i, '');
             client.send([{ text: cleanText }]);
          }
          
          queueRef.current.shift();

          // Wait logic (pipelining)
          const waitStart = Date.now();
          let audioArrived = false;
          while (Date.now() - waitStart < 15000) {
             const currentState = getAudioStreamerState();
             if (currentState.endOfQueueTime > preSendState.endOfQueueTime + 0.1) {
                audioArrived = true;
                break;
             }
             await new Promise(resolve => setTimeout(resolve, 100));
          }

          if (!audioArrived) {
            console.warn("Timeout waiting for audio response.");
          }

          while (true) {
             const state = getAudioStreamerState();
             if (state.duration < 3.0) break;
             await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      } catch (e) {
        console.error('Error in processing loop:', e);
      } finally {
        isProcessingRef.current = false;
      }
    };

    if (queueRef.current.length > 0) {
      processQueueLoop();
    }

    const processNewData = async (data: Transcript) => {
      const source = data.full_transcript_text;
      if (!data || !source) return;

      if (lastProcessedIdRef.current === data.id) return;
      lastProcessedIdRef.current = data.id;
      
      // 1. Show Raw Text Immediately
      addTurn({
        role: 'system',
        text: source, 
        sourceText: source, 
        isFinal: true
      });

      // 2. Diarize & Translate asynchronously
      const targetLang = languageRef.current || 'English';
      const diarizedScript = await diarizeAndTranslate(source, targetLang);
      
      // 3. Update UI with Diarized Script
      updateLastTurn({ text: diarizedScript });

      // 4. Queue for Audio Generation
      const segments = segmentText(diarizedScript);
      if (segments.length > 0) {
        segments.forEach(seg => {
           queueRef.current.push(seg);
        });
        processQueueLoop();
      }
    };

    const fetchLatest = async () => {
      const { data, error } = await supabase
        .from('transcripts')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();
      
      if (!error && data) {
        processNewData(data as Transcript);
      }
    };

    // Initialize Web Worker
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = () => {
      fetchLatest();
    };
    worker.postMessage('start');

    // Realtime Subscription
    const channel = supabase
      .channel('bridge-realtime-opt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transcripts' },
        (payload) => {
          if (payload.new) {
             processNewData(payload.new as Transcript);
          }
        }
      )
      .subscribe();

    fetchLatest();

    return () => {
      worker.terminate();
      supabase.removeChannel(channel);
    };
  }, [connected, client, addTurn, updateLastTurn, getAudioStreamerState, genAI, feedAudio]);

  return null;
}