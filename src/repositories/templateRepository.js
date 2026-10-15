import { db } from '../db/database.js';

export const DEFAULT_TEMPLATES = [
  {
    id: 'tpl-upper-body',
    name: 'Upper Body',
    description: 'Custom Upper Body routine',
    isDefault: true,
    exercises: [],
    cardio: [],
    updatedAt: Date.now()
  },
  {
    id: 'tpl-push-day',
    name: 'Push Day',
    description: 'Custom Push Day routine (Chest, Shoulders, Triceps)',
    isDefault: false,
    exercises: [],
    cardio: [],
    updatedAt: Date.now()
  },
  {
    id: 'tpl-pull-day',
    name: 'Pull Day',
    description: 'Custom Pull Day routine (Back, Biceps, Rear Delts)',
    isDefault: false,
    exercises: [],
    cardio: [],
    updatedAt: Date.now()
  },
  {
    id: 'tpl-leg-day',
    name: 'Leg Day',
    description: 'Custom Leg Day routine (Quads, Hamstrings, Calves, Core)',
    isDefault: false,
    exercises: [],
    cardio: [],
    updatedAt: Date.now()
  }
];

/**
 * Retrieves all workout templates sorted with default first.
 * @returns {Promise<Array<Object>>}
 */
export async function getTemplates() {
  await seedDefaultTemplatesIfEmpty();
  const templates = await db.templates.toArray();
  return templates.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
}

/**
 * Retrieves a single template by ID.
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function getTemplate(id) {
  if (!id) return null;
  await seedDefaultTemplatesIfEmpty();
  const template = await db.templates.get(id);
  if (template) return template;
  return await getDefaultTemplate();
}

/**
 * Retrieves the default workout template.
 * @returns {Promise<Object>}
 */
export async function getDefaultTemplate() {
  await seedDefaultTemplatesIfEmpty();
  const defaultTpl = await db.templates.get('tpl-upper-body');
  if (defaultTpl) return defaultTpl;
  const all = await db.templates.toArray();
  return all[0] || DEFAULT_TEMPLATES[0];
}

/**
 * Creates a brand new custom workout routine template.
 * @param {string} name 
 * @param {string} description 
 * @returns {Promise<Object>}
 */
export async function createCustomTemplate(name, description = '') {
  const cleanName = (name || 'New Routine').trim();
  const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const id = `tpl-${slug}-${Date.now().toString(36)}`;

  const newTpl = {
    id: id,
    name: cleanName,
    description: description || `${cleanName} routine`,
    isDefault: false,
    exercises: [],
    cardio: [],
    updatedAt: Date.now()
  };

  await db.templates.put(newTpl);
  return newTpl;
}

/**
 * Saves or updates an entire template object.
 * @param {Object} template 
 * @returns {Promise<Object>}
 */
export async function saveTemplate(template) {
  const tpl = {
    ...template,
    updatedAt: Date.now()
  };
  await db.templates.put(tpl);
  return tpl;
}

/**
 * Renames a template by ID.
 * @param {string} id 
 * @param {string} newName 
 * @returns {Promise<Object|null>}
 */
export async function renameTemplate(id, newName) {
  const tpl = await db.templates.get(id);
  if (!tpl) return null;
  tpl.name = (newName || tpl.name).trim();
  tpl.updatedAt = Date.now();
  await db.templates.put(tpl);
  return tpl;
}

/**
 * Adds an exercise to an existing template.
 * @param {string} templateId 
 * @param {Object} exerciseData 
 * @returns {Promise<Object|null>}
 */
export async function addExerciseToTemplate(templateId, exerciseData) {
  const tpl = await db.templates.get(templateId);
  if (!tpl) return null;

  tpl.exercises = tpl.exercises || [];
  const newOrder = tpl.exercises.length + 1;
  const exId = `tpl-ex-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const targetSets = parseInt(exerciseData.targetSets) || 3;
  const targetScheme = exerciseData.targetScheme || `${targetSets}×8–12`;
  const targetWeight = exerciseData.targetWeight !== undefined && exerciseData.targetWeight !== '' && exerciseData.targetWeight !== null
    ? parseFloat(exerciseData.targetWeight)
    : null;

  const newEx = {
    id: exId,
    name: exerciseData.name.trim(),
    order: newOrder,
    targetSets: targetSets,
    minReps: exerciseData.minReps || 8,
    maxReps: exerciseData.maxReps || 12,
    targetScheme: targetScheme,
    targetWeight: targetWeight,
    targetWeightUnit: 'kg',
    target: targetWeight !== null ? `${targetWeight} kg` : targetScheme,
    category: exerciseData.category || 'Other'
  };

  tpl.exercises.push(newEx);
  tpl.updatedAt = Date.now();
  await db.templates.put(tpl);
  return tpl;
}

/**
 * Removes an exercise from an existing template.
 * @param {string} templateId 
 * @param {string} exerciseId 
 * @returns {Promise<Object|null>}
 */
export async function removeExerciseFromTemplate(templateId, exerciseId) {
  const tpl = await db.templates.get(templateId);
  if (!tpl || !tpl.exercises) return null;

  tpl.exercises = tpl.exercises.filter(e => e.id !== exerciseId);
  // Re-index order
  tpl.exercises.forEach((e, idx) => { e.order = idx + 1; });
  tpl.updatedAt = Date.now();
  await db.templates.put(tpl);
  return tpl;
}

/**
 * Deletes a template by ID.
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteTemplate(id) {
  await db.templates.delete(id);
}

/**
 * Seeds default workout templates if the templates store is empty.
 * @returns {Promise<void>}
 */
export async function seedDefaultTemplatesIfEmpty() {
  try {
    const count = await db.templates.count();
    if (count === 0) {
      for (const tpl of DEFAULT_TEMPLATES) {
        await db.templates.put(tpl);
      }
    }
  } catch (err) {
    console.warn('Could not check or seed templates:', err);
  }
}
