/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { DEFAULT_LIVE_API_MODEL, DEFAULT_VOICE } from './constants';
import {
  FunctionResponse,
  FunctionResponseScheduling,
  LiveServerToolCall,
} from '@google/genai';

export type Template = 'eburon-tts';
export type Theme = 'light' | 'dark';
export type VoiceStyle = 'natural' | 'breathy' | 'dramatic';

const generateSystemPrompt = (language: string, speed: number = 1.0) => {
  let speedInstruction = "PACE: Natural, conversational speed.";
  if (speed < 1.0) {
    speedInstruction = `PACE: Slower than normal (${speed}x). Enunciate clearly and take your time.`;
  } else if (speed > 1.0) {
    speedInstruction = `PACE: Faster than normal (${speed}x). Speak quickly and efficiently.`;
  }

  return `
ROLE: Elite Simultaneous Interpreter & Voice Actor
TARGET LANGUAGE: [${language || 'Taglish (Philippines)'}]
${speedInstruction}

OBJECTIVE:
Translate the incoming text segments into [${language}] immediately. 

PRONUNCIATION & VOCABULARY PROTOCOL (STRICT):
1. **Native Authenticity**: You MUST adopt the exact accent, intonation, and phonology of a native speaker of the target locale. 
2. **Vocabulary Precision**: Use accurate local terminology, slang, and idioms appropriate for the region. Access your internal phonetic database for every word.
3. **Specific Handling**:
   - If [Taglish (Philippines)] is selected, you must naturally mix English and Tagalog (code-switching) as a native Manileño would, with the correct informal/formal balance.
4. **Natural Delivery**: Speak as a human, not a machine. Include natural breath pauses.

⛔️ CRITICAL RULE - SILENT INSTRUCTIONS ⛔️
The input contains stage directions in parentheses () or brackets [].
- **DO NOT READ THESE ALOUD.** 
- **ACT THEM OUT.**
- If you read "(soft inhale)", you must BREATHE.
- If you read "(clears throat)", you must make the sound of clearing your throat.
- If you read "(pause)", you must WAIT.
- If you read "(stop)", you must STOP speaking and enter standby mode.

VOICE PERSONA (The Charismatic Orator):
- **Dynamics**: Oscillate between a "soft, intense whisper" and a "powerful, projecting shout".
- **Rhythm**: Use a "preaching cadence"—hypnotic, repetitive, and building in momentum.
- **Tone**: High conviction, authoritative, urgent, yet deeply empathetic.

Translate and perform the text now.
`;
};

/**
 * Settings
 */
export const useSettings = create<{
  systemPrompt: string;
  model: string;
  voice: string;
  voiceStyle: VoiceStyle;
  language: string;
  speechRate: number;
  backgroundPadEnabled: boolean;
  backgroundPadVolume: number;
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
  setVoiceStyle: (style: VoiceStyle) => void;
  setLanguage: (language: string) => void;
  setSpeechRate: (rate: number) => void;
  setBackgroundPadEnabled: (enabled: boolean) => void;
  setBackgroundPadVolume: (volume: number) => void;
}>(set => ({
  language: 'Taglish (Philippines)',
  speechRate: 1.0,
  systemPrompt: generateSystemPrompt('Taglish (Philippines)', 1.0),
  model: DEFAULT_LIVE_API_MODEL,
  voice: DEFAULT_VOICE,
  voiceStyle: 'breathy',
  backgroundPadEnabled: false,
  backgroundPadVolume: 0.2,
  setSystemPrompt: prompt => set({ systemPrompt: prompt }),
  setModel: model => set({ model }),
  setVoice: voice => set({ voice }),
  setVoiceStyle: voiceStyle => set({ voiceStyle }),
  setLanguage: language => set(state => ({ 
    language, 
    systemPrompt: generateSystemPrompt(language, state.speechRate) 
  })),
  setSpeechRate: rate => set(state => ({ 
    speechRate: rate, 
    systemPrompt: generateSystemPrompt(state.language, rate) 
  })),
  setBackgroundPadEnabled: enabled => set({ backgroundPadEnabled: enabled }),
  setBackgroundPadVolume: volume => set({ backgroundPadVolume: volume }),
}));

/**
 * UI
 */
export const useUI = create<{
  isSidebarOpen: boolean;
  theme: Theme;
  toggleSidebar: () => void;
  toggleTheme: () => void;
}>(set => ({
  isSidebarOpen: false, // Default closed on mobile-first approach
  theme: 'dark',
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
  toggleTheme: () => set(state => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
}));

/**
 * Tools
 */
export interface FunctionCall {
  name: string;
  description?: string;
  parameters?: any;
  isEnabled: boolean;
  scheduling?: FunctionResponseScheduling;
}

export const useTools = create<{
  tools: FunctionCall[];
  template: Template;
  setTemplate: (template: Template) => void;
  toggleTool: (toolName: string) => void;
  addTool: () => void;
  removeTool: (toolName: string) => void;
  updateTool: (oldName: string, updatedTool: FunctionCall) => void;
}>(set => ({
  tools: [], // Default to no tools for read-aloud mode
  template: 'eburon-tts',
  setTemplate: (template: Template) => {
    // No-op for now as we only have one mode
  },
  toggleTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.map(tool =>
        tool.name === toolName ? { ...tool, isEnabled: !tool.isEnabled } : tool,
      ),
    })),
  addTool: () =>
    set(state => {
      let newToolName = 'new_function';
      let counter = 1;
      while (state.tools.some(tool => tool.name === newToolName)) {
        newToolName = `new_function_${counter++}`;
      }
      return {
        tools: [
          ...state.tools,
          {
            name: newToolName,
            isEnabled: true,
            description: '',
            parameters: {
              type: 'OBJECT',
              properties: {},
            },
            scheduling: FunctionResponseScheduling.INTERRUPT,
          },
        ],
      };
    }),
  removeTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.filter(tool => tool.name !== toolName),
    })),
  updateTool: (oldName: string, updatedTool: FunctionCall) =>
    set(state => {
      if (
        oldName !== updatedTool.name &&
        state.tools.some(tool => tool.name === updatedTool.name)
      ) {
        console.warn(`Tool with name "${updatedTool.name}" already exists.`);
        return state;
      }
      return {
        tools: state.tools.map(tool =>
          tool.name === oldName ? updatedTool : tool,
        ),
      };
    }),
}));

/**
 * Logs
 */
export interface LiveClientToolResponse {
  functionResponses?: FunctionResponse[];
}
export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  };
}

export interface ConversationTurn {
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  text: string;
  sourceText?: string;
  isFinal: boolean;
  toolUseRequest?: LiveServerToolCall;
  toolUseResponse?: LiveClientToolResponse;
  groundingChunks?: GroundingChunk[];
}

export const useLogStore = create<{
  turns: ConversationTurn[];
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => void;
  updateLastTurn: (update: Partial<ConversationTurn>) => void;
  clearTurns: () => void;
}>((set, get) => ({
  turns: [],
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) =>
    set(state => ({
      turns: [...state.turns, { ...turn, timestamp: new Date() }],
    })),
  updateLastTurn: (update: Partial<Omit<ConversationTurn, 'timestamp'>>) => {
    set(state => {
      if (state.turns.length === 0) {
        return state;
      }
      const newTurns = [...state.turns];
      const lastTurn = { ...newTurns[newTurns.length - 1], ...update };
      newTurns[newTurns.length - 1] = lastTurn;
      return { turns: newTurns };
    });
  },
  clearTurns: () => set({ turns: [] }),
}));