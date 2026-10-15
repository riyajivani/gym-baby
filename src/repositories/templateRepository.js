import { db } from '../db/database.js';

export const DEFAULT_TEMPLATES = [
  {
    id: 'tpl-upper-body',
    name: 'Upper Body',
    description: '8-exercise upper body routine: chest, back, shoulders, arms & incline walking',
    isDefault: true,
    exercises: [
      {
        id: 'tpl-ex-incline-bench',
        name: 'Incline Bench Press',
        order: 1,
        targetSets: 3,
        minReps: 6,
        maxReps: 10,
        targetScheme: '3×6–10',
        targetWeight: 35,
        targetWeightUnit: 'kg',
        target: '35 kg',
        category: 'Chest'
      },
      {
        id: 'tpl-ex-pullups',
        name: 'Assisted Pull-Ups',
        order: 2,
        targetSets: 3,
        minReps: 8,
        maxReps: 12,
        targetScheme: '3×8–12',
        targetWeight: 55,
        targetWeightUnit: 'kg',
        target: '55 kg assistance',
        category: 'Back'
      },
      {
        id: 'tpl-ex-cable-fly',
        name: 'Cable Fly',
        order: 3,
        targetSets: 2,
        minReps: 10,
        maxReps: 15,
        targetScheme: '2×10–15',
        targetWeight: 10,
        targetWeightUnit: 'kg',
        target: '10 kg',
        category: 'Chest'
      },
      {
        id: 'tpl-ex-cable-row',
        name: 'Seated Cable Row',
        order: 4,
        targetSets: 3,
        minReps: 8,
        maxReps: 12,
        targetScheme: '3×8–12',
        targetWeight: 13.5,
        targetWeightUnit: 'kg',
        target: '13.5 kg',
        category: 'Back'
      },
      {
        id: 'tpl-ex-db-shoulder-press',
        name: 'Dumbbell Shoulder Press',
        order: 5,
        targetSets: 3,
        minReps: 8,
        maxReps: 12,
        targetScheme: '3×8–12',
        targetWeight: 10,
        targetWeightUnit: 'kg',
        target: '10 kg',
        category: 'Shoulders'
      },
      {
        id: 'tpl-ex-lat-raise',
        name: 'Dumbbell Lateral Raise',
        order: 6,
        targetSets: 4,
        minReps: 12,
        maxReps: 20,
        targetScheme: '4×12–20',
        targetWeight: 2.5,
        targetWeightUnit: 'kg',
        target: '2.5 kg',
        category: 'Shoulders'
      },
      {
        id: 'tpl-ex-rear-delt-fly',
        name: 'Rear Delt Fly',
        order: 7,
        targetSets: 3,
        minReps: 12,
        maxReps: 20,
        targetScheme: '3×12–20',
        targetWeight: 15,
        targetWeightUnit: 'kg',
        target: '15 kg',
        category: 'Shoulders'
      },
      {
        id: 'tpl-ex-cable-curl',
        name: 'Cable Curl',
        order: 8,
        targetSets: 2,
        minReps: 10,
        maxReps: 15,
        targetScheme: '2×10–15',
        targetWeight: 20,
        targetWeightUnit: 'kg',
        target: '20 kg',
        category: 'Arms'
      }
    ],
    cardio: [
      {
        name: 'Incline Walking',
        time: '2 min',
        distance: '0.15 km',
        incline: '10%',
        speed: '4.0 km/h'
      }
    ],
    updatedAt: Date.now()
  },
  {
    id: 'tpl-push-day',
    name: 'Push Day',
    description: '3-exercise push session: Bench Press, Incline DB Press, Machine Chest Press',
    isDefault: false,
    exercises: [
      {
        id: 'tpl-ex-bench-press',
        name: 'Bench Press',
        order: 1,
        targetSets: 3,
        minReps: 6,
        maxReps: 10,
        targetScheme: '3×6–10',
        targetWeight: 40,
        targetWeightUnit: 'kg',
        target: '40 kg',
        category: 'Chest'
      },
      {
        id: 'tpl-ex-incline-db-press',
        name: 'Incline Dumbbell Press',
        order: 2,
        targetSets: 3,
        minReps: 8,
        maxReps: 12,
        targetScheme: '3×8–12',
        targetWeight: 12.5,
        targetWeightUnit: 'kg',
        target: '12.5 kg',
        category: 'Chest'
      },
      {
        id: 'tpl-ex-seated-machine-chest',
        name: 'Seated Machine Chest Press',
        order: 3,
        targetSets: 2,
        minReps: 10,
        maxReps: 15,
        targetScheme: '2×10–15',
        targetWeight: 35,
        targetWeightUnit: 'kg',
        target: '35 kg',
        category: 'Chest'
      }
    ],
    cardio: [],
    updatedAt: Date.now()
  }
];

/**
 * Retrieves all workout templates.
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
  // Fallback to default
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
 * Saves or updates a template.
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
