/**
 * Checklist Database
 * 
 * Stores and retrieves checklist templates from Supabase DIRECTLY
 * with IndexedDB as offline cache
 */

import { openDB } from 'idb';
import { supabase } from './supabase';

const DB_NAME = 'auditflow-checklists';
const DB_VERSION = 2;

let dbPromise = null;

/**
 * Initialize the local database (for offline cache)
 */
async function getDB() {
    if (typeof window === 'undefined') return null;

    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                // Checklists store
                if (!db.objectStoreNames.contains('checklists')) {
                    const store = db.createObjectStore('checklists', { keyPath: 'id' });
                    store.createIndex('title', 'title');
                    store.createIndex('createdAt', 'created_at');
                }
            },
        });
    }
    return dbPromise;
}

/**
 * Fetch checklists from Supabase
 */
async function fetchFromSupabase() {
    try {
        const { data, error } = await supabase
            .from('checklists')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Supabase fetch error:', error);
            return null;
        }
        return data || [];
    } catch (err) {
        console.log('Failed to fetch from Supabase:', err.message);
        return null;
    }
}

/**
 * Save checklist to Supabase
 */
async function saveToSupabase(checklist) {
    try {
        const { data, error } = await supabase
            .from('checklists')
            .upsert(checklist, { onConflict: 'id' })
            .select()
            .single();

        if (error) {
            console.error('Supabase save error:', error);
            return null;
        }
        return data;
    } catch (err) {
        console.log('Failed to save to Supabase:', err.message);
        return null;
    }
}

/**
 * Create a new checklist
 */
export async function createChecklist(checklist) {
    const db = await getDB();
    const id = checklist.id || `checklist_${Date.now()}`;
    const now = new Date().toISOString();

    const newChecklist = {
        id,
        title: checklist.title || 'New Checklist',
        description: checklist.description || '',
        sections: checklist.sections || [],
        created_at: now,
        updated_at: now,
    };

    // Save to local cache
    if (db) {
        await db.put('checklists', newChecklist);
    }

    // Sync to Supabase
    await saveToSupabase(newChecklist);

    return newChecklist;
}

/**
 * Get all checklists (from Supabase first, fallback to local)
 */
export async function getAllChecklists() {
    const db = await getDB();

    // Try to fetch from Supabase first
    const supabaseChecklists = await fetchFromSupabase();

    if (supabaseChecklists && supabaseChecklists.length > 0) {
        // Update local cache with Supabase data
        if (db) {
            for (const checklist of supabaseChecklists) {
                await db.put('checklists', checklist);
            }
        }
        return supabaseChecklists.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    }

    // Fallback to local cache
    if (db) {
        const localChecklists = await db.getAll('checklists');
        return localChecklists.sort((a, b) => new Date(b.updated_at || b.updatedAt) - new Date(a.updated_at || a.updatedAt));
    }

    return [];
}

/**
 * Get a single checklist
 */
export async function getChecklist(id) {
    const db = await getDB();

    // Try Supabase first
    try {
        const { data, error } = await supabase
            .from('checklists')
            .select('*')
            .eq('id', id)
            .single();

        if (data) {
            if (db) await db.put('checklists', data);
            return data;
        }
    } catch (err) {
        console.log('Failed to fetch from Supabase:', err.message);
    }

    // Fallback to local
    if (db) {
        return await db.get('checklists', id);
    }

    return null;
}

/**
 * Update a checklist
 */
export async function updateChecklist(id, updates) {
    const db = await getDB();
    let existing = null;

    if (db) {
        existing = await db.get('checklists', id);
    }

    if (!existing) {
        // Try to get from Supabase
        const { data } = await supabase.from('checklists').select('*').eq('id', id).single();
        existing = data;
    }

    if (!existing) {
        throw new Error('Checklist not found');
    }

    const updated = {
        ...existing,
        ...updates,
        id, // Ensure ID doesn't change
        updated_at: new Date().toISOString(),
    };

    // Save to local cache
    if (db) {
        await db.put('checklists', updated);
    }

    // Sync to Supabase
    await saveToSupabase(updated);

    return updated;
}

/**
 * Delete a checklist
 */
export async function deleteChecklist(id) {
    const db = await getDB();

    if (db) {
        await db.delete('checklists', id);
    }

    // Delete from Supabase
    try {
        await supabase.from('checklists').delete().eq('id', id);
    } catch (err) {
        console.log('Failed to delete from Supabase:', err.message);
    }
}

/**
 * Sync local checklists to Supabase (for migration)
 */
export async function syncLocalToCloud() {
    const db = await getDB();
    if (!db) return [];

    const localChecklists = await db.getAll('checklists');

    const synced = [];
    for (const checklist of localChecklists) {
        // Ensure proper field names for Supabase
        const toSync = {
            id: checklist.id,
            title: checklist.title,
            description: checklist.description || '',
            sections: checklist.sections || [],
            created_at: checklist.created_at || checklist.createdAt || new Date().toISOString(),
            updated_at: checklist.updated_at || checklist.updatedAt || new Date().toISOString(),
        };

        const result = await saveToSupabase(toSync);
        if (result) synced.push(result);
    }

    return synced;
}

/**
 * Initialize with default checklists if empty
 */
export async function initializeDefaultChecklists() {
    const existing = await getAllChecklists();

    if (existing.length === 0) {
        // Add the default Bus Bar checklist
        await createChecklist({
            id: 'bus_bar_critical_load_db',
            title: 'Bus Bar & Critical Load DB',
            sections: [
                {
                    section_id: 'copper_bus_bar_details',
                    section_title: 'Copper Bus Bar Details',
                    items: [
                        {
                            item_id: '2.1',
                            sl_no: '2.1',
                            checking_criteria: 'Minimum space of 25mm maintained between phase to phase and phase to neutral',
                            response_type: 'yes_no',
                            remarks_required_if: 'NO',
                            photo_required: true,
                        },
                        {
                            item_id: '2.2',
                            sl_no: '2.2',
                            checking_criteria: 'Bus bar joints are tight and free from overheating marks',
                            response_type: 'yes_no',
                            remarks_required_if: 'NO',
                            photo_required: true,
                        },
                    ],
                },
                {
                    section_id: 'support_and_fixing',
                    section_title: 'Support & Fixing',
                    items: [
                        {
                            item_id: '3.1',
                            sl_no: '3.1',
                            checking_criteria: 'Bus bars are properly supported and fixed',
                            response_type: 'yes_no',
                            remarks_required_if: 'NO',
                            photo_required: false,
                        },
                    ],
                },
            ],
        });
    }

    return getAllChecklists();
}
