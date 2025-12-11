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

import cn from 'classnames';

import { memo, ReactNode, useEffect, useRef } from 'react';
import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import AudioVisualizer from '@/components/visualizer/AudioVisualizer';
import { useSettings } from '@/lib/state';
import { SUPPORTED_LANGUAGES } from '@/lib/constants';

export type ControlTrayProps = {
  children?: ReactNode;
};

function ControlTray({ children }: ControlTrayProps) {
  const connectButtonRef = useRef<HTMLButtonElement>(null);
  const { language, setLanguage } = useSettings();

  const { connected, connect, disconnect, isVolumeEnabled, setIsVolumeEnabled, volume } = useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  const connectButtonTitle = connected
    ? 'Stop streaming'
    : !language
    ? 'Select a language to start'
    : 'Start streaming';

  // Disable play button if connected or if no language is selected (when disconnected)
  const isPlayDisabled = !connected && !language;

  return (
    <section className="control-tray">
      <nav className={cn('actions-nav')}>
        <button
          className={cn('action-button')}
          onClick={() => setIsVolumeEnabled(!isVolumeEnabled)}
          title={isVolumeEnabled ? 'Mute Audio' : 'Unmute Audio'}
        >
          <span className="material-symbols-outlined filled">
            {isVolumeEnabled ? 'volume_up' : 'volume_off'}
          </span>
        </button>

        <div className="language-selector-container">
          <select
            className="tray-select"
            value={language}
            onChange={e => setLanguage(e.target.value)}
            disabled={connected}
          >
            <option value="" disabled>Select Language</option>
            {SUPPORTED_LANGUAGES.map(lang => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>

        {children}
      </nav>

      <div className={cn('connection-container', { connected })}>
        <div className="connection-button-container">
          <button
            ref={connectButtonRef}
            className={cn('action-button connect-toggle', { connected, disabled: isPlayDisabled })}
            onClick={connected ? disconnect : connect}
            title={connectButtonTitle}
            disabled={isPlayDisabled}
          >
            <span className="material-symbols-outlined filled">
              {connected ? 'pause' : 'play_arrow'}
            </span>
          </button>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', minWidth: '60px'}}>
          <AudioVisualizer volume={volume} active={connected && isVolumeEnabled} />
          <span className="text-indicator" style={{display: connected ? 'none' : 'block'}}>
            {connected ? '' : language ? 'Ready' : 'Select Language'}
          </span>
        </div>
      </div>
    </section>
  );
}

export default memo(ControlTray);