/**
 * Supabase Client for Frontend
 * Direct connection to Supabase - no backend needed
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bwxqprlbbjpfqoncxdcx.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3eHFwcmxiYmpwZnFvbmN4ZGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDc1MjQsImV4cCI6MjA4MzEyMzUyNH0.M1ZgJkPVCXkWtpv_A0x0dKp8aMTc60Yk5DplVEkLZZQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
