import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jfuhdjylglltrzhzikof.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpmdWhkanlsZ2xsdHJ6aHppa29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5NjQzNDIsImV4cCI6MjA4ODU0MDM0Mn0.mWu_zSIhA-nWDgGc2BrjjreyKCopNuXXqUPIHaVJIrw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
