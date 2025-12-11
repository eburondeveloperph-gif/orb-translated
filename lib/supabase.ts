/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { createClient } from '@supabase/supabase-js';

// Use environment variables for Supabase connection
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// If credentials are missing, create a client that won't error out immediately but won't connect
// This prevents "Network Error" on app load if Supabase is not configured, while keeping the app structure valid.
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co', 
  SUPABASE_KEY || 'placeholder-key'
);

export interface Transcript {
  id: string;
  session_id: string;
  user_id: string;
  source_language: string;
  full_transcript_text: string;
  created_at: string;
  updated_at: string;
}