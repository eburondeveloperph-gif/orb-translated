/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  createWorketFromSrc,
  registeredWorklets,
} from './audioworklet-registry';

export class AudioStreamer {
  private sampleRate: number = 24000;
  private bufferSize: number = 7680;
  private audioQueue: Float32Array[] = [];
  public isPlaying: boolean = false;
  private scheduledTime: number = 0;
  private initialBufferTime: number = 0.1;
  private checkTimeout: number | null = null;
  
  public gainNode: GainNode;
  public source: AudioBufferSourceNode;
  
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  
  private endOfQueueAudioSource: AudioBufferSourceNode | null = null;

  // Ambient Pad Components
  private padGain: GainNode | null = null;
  private padOscillators: OscillatorNode[] = [];
  private padFilter: BiquadFilterNode | null = null;

  public onComplete = () => {};
  public onPlay = () => {};

  constructor(public context: AudioContext) {
    this.gainNode = this.context.createGain();
    this.source = this.context.createBufferSource();
    this.gainNode.connect(this.context.destination);
    this.addPCM16 = this.addPCM16.bind(this);
  }

  // Exposed properties for pipelining
  public get duration(): number {
    // If not playing, or if scheduled time is in the past (gap), duration is 0
    if (!this.isPlaying) return 0;
    return Math.max(0, this.scheduledTime - this.context.currentTime);
  }

  public get endOfQueueTime(): number {
    return this.scheduledTime;
  }

  setPadVolume(volume: number) {
    if (this.padGain) {
      this.padGain.gain.linearRampToValueAtTime(volume, this.context.currentTime + 0.5);
    }
  }

  startPad(volume: number) {
    if (this.padGain) return;

    const now = this.context.currentTime;
    
    this.padGain = this.context.createGain();
    this.padGain.gain.value = 0;
    
    this.padFilter = this.context.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 400;
    this.padFilter.Q.value = 1;

    this.padFilter.connect(this.padGain);
    this.padGain.connect(this.gainNode);

    const freqs = [146.83, 220.00, 293.66]; 
    
    freqs.forEach(f => {
      const osc = this.context.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() * 10) - 5; 
      osc.connect(this.padFilter!);
      osc.start();
      this.padOscillators.push(osc);
    });

    this.padGain.gain.linearRampToValueAtTime(volume, now + 2);
  }

  stopPad() {
    if (!this.padGain) return;
    const now = this.context.currentTime;
    
    this.padGain.gain.linearRampToValueAtTime(0, now + 2);
    
    setTimeout(() => {
      this.padOscillators.forEach(o => {
        try {
          o.stop();
        } catch(e) {}
      });
      this.padOscillators = [];
      this.padGain?.disconnect();
      this.padFilter?.disconnect();
      this.padGain = null;
      this.padFilter = null;
    }, 2000);
  }

  async addWorklet<T extends (d: any) => void>(
    workletName: string,
    workletSrc: string,
    handler: T
  ): Promise<this> {
    let workletsRecord = registeredWorklets.get(this.context);
    if (workletsRecord && workletsRecord[workletName]) {
      workletsRecord[workletName].handlers.push(handler);
      return Promise.resolve(this);
    }

    if (!workletsRecord) {
      registeredWorklets.set(this.context, {});
      workletsRecord = registeredWorklets.get(this.context)!;
    }

    workletsRecord[workletName] = { handlers: [handler] };

    const src = createWorketFromSrc(workletName, workletSrc);
    await this.context.audioWorklet.addModule(src);
    const worklet = new AudioWorkletNode(this.context, workletName);

    workletsRecord[workletName].node = worklet;

    return this;
  }

  private _processPCM16Chunk(chunk: Uint8Array): Float32Array {
    const float32Array = new Float32Array(chunk.length / 2);
    const dataView = new DataView(chunk.buffer);

    for (let i = 0; i < chunk.length / 2; i++) {
      try {
        const int16 = dataView.getInt16(i * 2, true);
        float32Array[i] = int16 / 32768;
      } catch (e) {
        console.error(e);
      }
    }
    return float32Array;
  }

  addPCM16(chunk: Uint8Array) {
    let processingBuffer = this._processPCM16Chunk(chunk);
    while (processingBuffer.length >= this.bufferSize) {
      const buffer = processingBuffer.slice(0, this.bufferSize);
      this.audioQueue.push(buffer);
      processingBuffer = processingBuffer.slice(this.bufferSize);
    }
    if (processingBuffer.length > 0) {
      this.audioQueue.push(processingBuffer);
    }
    
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.onPlay(); // Notify listeners that playback has started
      // Reset scheduled time if it fell behind
      if (this.scheduledTime < this.context.currentTime) {
         this.scheduledTime = this.context.currentTime + this.initialBufferTime;
      }
      this.scheduleNextBuffer();
    }
  }

  private createAudioBuffer(audioData: Float32Array): AudioBuffer {
    const audioBuffer = this.context.createBuffer(
      1,
      audioData.length,
      this.sampleRate
    );
    audioBuffer.getChannelData(0).set(audioData);
    return audioBuffer;
  }

  private scheduleNextBuffer() {
    if (!this.isPlaying) return;

    const SCHEDULE_AHEAD_TIME = 0.2;

    while (
      this.audioQueue.length > 0 &&
      this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      const audioData = this.audioQueue.shift()!;
      const audioBuffer = this.createAudioBuffer(audioData);
      const source = this.context.createBufferSource();

      this.activeSources.add(source);

      source.onended = () => {
        this.activeSources.delete(source);
        if (this.activeSources.size === 0 && this.audioQueue.length === 0) {
          // Only stop if we are truly empty
          this.isPlaying = false;
          this.onComplete();
        }
      };

      source.buffer = audioBuffer;
      source.connect(this.gainNode);

      const worklets = registeredWorklets.get(this.context);

      if (worklets) {
        Object.entries(worklets).forEach(([workletName, graph]) => {
          const { node, handlers } = graph;
          if (node) {
            source.connect(node);
            node.port.onmessage = function (ev: MessageEvent) {
              handlers.forEach(handler => {
                handler.call(node.port, ev);
              });
            };
            node.connect(this.context.destination);
          }
        });
      }
      
      // Ensure we don't schedule in the past
      const startTime = Math.max(this.scheduledTime, this.context.currentTime);
      source.start(startTime);
      this.scheduledTime = startTime + audioBuffer.duration;
    }

    if (this.audioQueue.length > 0 || this.activeSources.size > 0) {
      this.checkTimeout = window.setTimeout(() => this.scheduleNextBuffer(), 100);
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
    this.audioQueue = [];
    
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
      }
    });
    this.activeSources.clear();
    this.scheduledTime = this.context.currentTime;
    this.onComplete(); // Ensure state is reset
  }

  async resume() {
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    this.gainNode.gain.setValueAtTime(1, this.context.currentTime);
    this.scheduledTime = this.context.currentTime + this.initialBufferTime;
  }

  complete() {
    this.isPlaying = false;
    if (this.checkTimeout) {
      clearTimeout(this.checkTimeout);
      this.checkTimeout = null;
    }
    this.onComplete();
  }
}