/**
 * Checklist Routes
 * 
 * CRUD operations for checklists stored in Supabase
 */

import { Router } from 'express';
import { getAllChecklists, getChecklistById, upsertChecklist, deleteChecklist } from '../services/database.js';

const router = Router();

/**
 * GET /api/checklists
 * Get all checklists
 */
router.get('/', async (req, res) => {
    try {
        const checklists = await getAllChecklists();
        res.json(checklists);
    } catch (err) {
        console.error('[CHECKLISTS] Error fetching:', err);
        res.status(500).json({ error: 'Failed to fetch checklists', message: err.message });
    }
});

/**
 * GET /api/checklists/:id
 * Get a specific checklist
 */
router.get('/:id', async (req, res) => {
    try {
        const checklist = await getChecklistById(req.params.id);
        if (!checklist) {
            return res.status(404).json({ error: 'Checklist not found' });
        }
        res.json(checklist);
    } catch (err) {
        console.error('[CHECKLISTS] Error fetching:', err);
        res.status(500).json({ error: 'Failed to fetch checklist', message: err.message });
    }
});

/**
 * POST /api/checklists
 * Create or update a checklist
 */
router.post('/', async (req, res) => {
    try {
        const checklist = req.body;

        if (!checklist.title) {
            return res.status(400).json({ error: 'Checklist title is required' });
        }

        // Generate ID if not provided
        if (!checklist.id) {
            checklist.id = `checklist_${Date.now()}`;
        }

        // Set timestamps
        checklist.updated_at = new Date().toISOString();
        if (!checklist.created_at) {
            checklist.created_at = checklist.updated_at;
        }

        const saved = await upsertChecklist(checklist);
        res.json(saved);
    } catch (err) {
        console.error('[CHECKLISTS] Error saving:', err);
        res.status(500).json({ error: 'Failed to save checklist', message: err.message });
    }
});

/**
 * PUT /api/checklists/:id
 * Update a checklist
 */
router.put('/:id', async (req, res) => {
    try {
        const checklist = { ...req.body, id: req.params.id };
        checklist.updated_at = new Date().toISOString();

        const saved = await upsertChecklist(checklist);
        res.json(saved);
    } catch (err) {
        console.error('[CHECKLISTS] Error updating:', err);
        res.status(500).json({ error: 'Failed to update checklist', message: err.message });
    }
});

/**
 * DELETE /api/checklists/:id
 * Delete a checklist
 */
router.delete('/:id', async (req, res) => {
    try {
        await deleteChecklist(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error('[CHECKLISTS] Error deleting:', err);
        res.status(500).json({ error: 'Failed to delete checklist', message: err.message });
    }
});

export default router;
