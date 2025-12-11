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
  const { addTurn } = useLogStore();
  const { voiceStyle, speechRate } = useSettings();
  
  const lastProcessedIdRef = useRef<string | null>(null);
  const paragraphCountRef = useRef<number>(0);
  
  const voiceStyleRef = useRef(voiceStyle);
  const speechRateRef = useRef(speechRate);

  // Initialize independent GenAI client for Text Logic & TTS (REST)
  // This bypasses the WebSocket "Live API" model for the audio generation part
  // to support advanced features like Multi-Speaker output.
  const genAI = useMemo(() => new GoogleGenAI({ apiKey: process.env.API_KEY || '' }), []);

  useEffect(() => {
    voiceStyleRef.current = voiceStyle;
  }, [voiceStyle]);

  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  // High-performance queue using Refs
  const queueRef = useRef<string[]>([]);
  const isProcessingRef = useRef(false);

  // Multi-speaker Detection & Audio Generation Logic
  const processTextAndGenerateAudio = async (text: string) => {
    try {
      // 1. Detect Gender and Assign Speakers using Gemini Flash
      const analysisResponse = await genAI.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: `
          You are a script formatter.
          Analyze the following text.
          1. Identify distinct speakers.
          2. Assign a label 'Male 1', 'Female 1', 'Male 2', 'Female 2' to them based on context or names.
          3. If only one speaker is detected, use 'Male 1' as default.
          4. Rewrite the text strictly in the format: "Speaker: Text".
          5. Keep the content exactly as is, just add speaker labels.
          6. Do NOT add any markdown, intro, or outro.

          Text: "${text}"
        `
      });

      const script = analysisResponse.text?.trim() || `Male 1: ${text}`;
      console.log('[Speaker Analysis]', script);

      // 2. Generate Audio using Gemini TTS with Multi-Speaker Config
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

      // 3. Extract and Feed Audio
      const audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        const audioBuffer = base64ToArrayBuffer(audioBase64);
        feedAudio(new Uint8Array(audioBuffer));
        return true;
      }
    } catch (error) {
      console.error('Error in Smart TTS pipeline:', error);
    }
    return false;
  };

  // Data Ingestion & Processing Logic
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    isProcessingRef.current = false;

    if (!connected) return;

    // The consumer loop that processes the queue sequentially (Closed Loop Control)
    const processQueueLoop = async () => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      try {
        while (queueRef.current.length > 0) {
          // Safety check
          if (client.status !== 'connected') {
            isProcessingRef.current = false;
            return;
          }

          const rawText = queueRef.current[0];
          const style = voiceStyleRef.current;
          
          let scriptedText = rawText;
          if (rawText !== '(clears throat)') {
             if (style === 'breathy') {
               scriptedText = `(soft inhale) ${rawText} ... (pause)`;
             } else if (style === 'dramatic') {
                scriptedText = `(slowly) ${rawText} ... (long pause)`;
             }
          }

          if (!scriptedText || !scriptedText.trim()) {
            queueRef.current.shift();
            continue;
          }

          // Capture audio state BEFORE sending
          const preSendState = getAudioStreamerState();

          // >>> SWITCH TO SMART TTS PIPELINE <<<
          // We use the REST API for generation to support multi-speaker,
          // instead of client.send (Websocket).
          
          // Try Smart Pipeline first
          const success = await processTextAndGenerateAudio(scriptedText);
          
          // Fallback to basic Live API if Smart Pipeline fails (e.g. quota or model error)
          if (!success) {
             client.send([{ text: scriptedText }]);
          }
          
          queueRef.current.shift();

          // 2. Wait for Audio to ARRIVE (Scheduled Time Increases)
          // This confirms the model has responded and we have queued the audio.
          // We wait up to 15 seconds for the response to start arriving.
          const waitStart = Date.now();
          let audioArrived = false;
          while (Date.now() - waitStart < 15000) {
             const currentState = getAudioStreamerState();
             // Check if endOfQueueTime has increased by at least 100ms
             if (currentState.endOfQueueTime > preSendState.endOfQueueTime + 0.1) {
                audioArrived = true;
                break;
             }
             await new Promise(resolve => setTimeout(resolve, 100));
          }

          if (!audioArrived) {
            console.warn("Timeout waiting for audio response from model. Moving to next chunk.");
            // We proceed to next chunk anyway to avoid stalling forever
          }

          // 3. Pipelining Wait: Wait until remaining audio duration is < 3 seconds
          // This allows us to send the next request early, reducing the inter-paragraph gap.
          while (true) {
             const state = getAudioStreamerState();
             // If audio queue is getting empty (less than 3s left), break to send next
             // Also break if queue is completely empty (duration 0)
             if (state.duration < 3.0) {
                break;
             }
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

    const processNewData = (data: Transcript) => {
      const source = data.full_transcript_text;
      if (!data || !source) return;

      if (lastProcessedIdRef.current === data.id) return;
      lastProcessedIdRef.current = data.id;
      
      // Update UI
      addTurn({
        role: 'system',
        text: source, 
        sourceText: source, 
        isFinal: true
      });

      // Queue Paragraphs
      const segments = segmentText(source);
      if (segments.length > 0) {
        segments.forEach(seg => {
           queueRef.current.push(seg);
           paragraphCountRef.current += 1;
           if (paragraphCountRef.current > 0 && paragraphCountRef.current % 3 === 0) {
              queueRef.current.push('(clears throat)');
           }
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

    // Initialize Web Worker for background polling
    const blob = new Blob([workerScript], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = () => {
      fetchLatest();
    };
    worker.postMessage('start');

    // Setup Realtime Subscription
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
  }, [connected, client, addTurn, getAudioStreamerState, genAI, feedAudio]);

  return null;
}