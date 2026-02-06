/**
 * Supabase Database Client
 * Handles connection to Supabase PostgreSQL database
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://bwxqprlbbjpfqoncxdcx.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ3eHFwcmxiYmpwZnFvbmN4ZGN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDc1MjQsImV4cCI6MjA4MzEyMzUyNH0.M1ZgJkPVCXkWtpv_A0x0dKp8aMTc60Yk5DplVEkLZZQ';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Initialize database tables if they don't exist
 */
export async function initDatabase() {
    console.log('Initializing Supabase connection...');

    // Test connection
    const { data, error } = await supabase.from('checklists').select('id').limit(1);

    if (error && error.code === '42P01') {
        // Table doesn't exist - will be created via SQL
        console.log('Tables need to be created in Supabase dashboard');
        return false;
    }

    console.log('Supabase connected successfully');
    return true;
}

/**
 * Get all checklists
 */
export async function getAllChecklists() {
    const { data, error } = await supabase
        .from('checklists')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching checklists:', error);
        throw error;
    }

    return data || [];
}

/**
 * Get a checklist by ID
 */
export async function getChecklistById(id) {
    const { data, error } = await supabase
        .from('checklists')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching checklist:', error);
        throw error;
    }

    return data;
}

/**
 * Create or update a checklist
 */
export async function upsertChecklist(checklist) {
    const { data, error } = await supabase
        .from('checklists')
        .upsert(checklist, { onConflict: 'id' })
        .select()
        .single();

    if (error) {
        console.error('Error upserting checklist:', error);
        throw error;
    }

    return data;
}

/**
 * Delete a checklist
 */
export async function deleteChecklist(id) {
    const { error } = await supabase
        .from('checklists')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting checklist:', error);
        throw error;
    }

    return true;
}
