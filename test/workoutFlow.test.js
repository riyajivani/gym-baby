import 'fake-indexeddb/auto';
import assert from 'node:assert';
import { db, initDatabase } from '../src/db/database.js';
import {
  getTemplates,
  getTemplate,
  getDefaultTemplate,
  addExerciseToTemplate
} from '../src/repositories/templateRepository.js';
import {
  getActiveSession,
  saveActiveSession,
  clearActiveSession,
  createSessionFromTemplate,
  finishSession,
  getPreviousExercisePerformance
} from '../src/repositories/sessionRepository.js';
import {
  getWorkoutHistory,
  getWorkout
} from '../src/repositories/workoutRepository.js';
import {
  exportBackup,
  validateBackup,
  importBackup
} from '../src/repositories/backupRepository.js';
import {
  formatShortDate,
  formatLongDate,
  formatTime,
  formatDuration
} from '../src/utils/formatters.js';

async function runTests() {
  console.log('--- Starting Yeshu Gym Step 3 Test Suite ---');

  // Test 1: Initialize Database & Seed Verification
  console.log('Test 1: Initializing database and verifying seeded data...');
  await initDatabase();

  const templates = await getTemplates();
  assert.ok(templates.length >= 2, 'Should have at least 2 default templates (Upper Body & Push Day)');
  console.log(`  ✓ Templates seeded: ${templates.map(t => t.name).join(', ')}`);

  const upperBodyTpl = await getTemplate('tpl-upper-body');
  assert.strictEqual(upperBodyTpl.name, 'Upper Body');
  assert.strictEqual(upperBodyTpl.exercises.length, 0, 'Clean Upper Body template should start with 0 exercises');
  console.log('  ✓ Upper Body template verified (starts clean with 0 exercises)');

  // Test adding an exercise to the clean template
  console.log('  Adding Incline Bench Press to Upper Body routine...');
  await addExerciseToTemplate('tpl-upper-body', {
    name: 'Incline Bench Press',
    targetSets: 3,
    targetWeight: 35,
    minReps: 6,
    maxReps: 10,
    category: 'Chest'
  });
  const updatedTpl = await getTemplate('tpl-upper-body');
  assert.strictEqual(updatedTpl.exercises.length, 1, 'Upper Body now has 1 exercise');
  assert.strictEqual(updatedTpl.exercises[0].name, 'Incline Bench Press');
  assert.strictEqual(updatedTpl.exercises[0].targetSets, 3);
  assert.strictEqual(updatedTpl.exercises[0].targetWeight, 35);
  console.log('  ✓ addExerciseToTemplate verified (1 exercise added with target 35 kg)');

  const initialHistory = await getWorkoutHistory();
  assert.strictEqual(initialHistory.length, 0, 'Clean database should start with 0 historical workouts');
  const initialHistoryCount = initialHistory.length;
  console.log(`  ✓ Clean database verified: ${initialHistoryCount} workouts in history`);

  // Test 2: Previous Performance Lookup on Clean Slate
  console.log('Test 2: Verifying previous performance lookup on clean database...');
  const prevPerf = getPreviousExercisePerformance('Incline Bench Press', initialHistory);
  assert.strictEqual(prevPerf, null, 'Clean database should have no previous performance');
  console.log('  ✓ Verified: Gracefully returns null when no prior performance exists');

  // Test 3: Create Fresh Session from Template
  console.log('Test 3: Creating fresh session from Upper Body template...');
  const freshSession = createSessionFromTemplate(updatedTpl, initialHistory, { bodyWeight: 73.0 });
  
  assert.ok(freshSession.id, 'Fresh session should have unique ID');
  assert.strictEqual(freshSession.status, 'in_progress');
  assert.strictEqual(freshSession.name, 'Upper Body');
  assert.strictEqual(freshSession.bodyWeight, 73.0);
  assert.strictEqual(freshSession.exercises.length, 1);

  // Check that all sets start incomplete
  for (const ex of freshSession.exercises) {
    for (const s of ex.sets) {
      assert.strictEqual(s.completed, false, `Set ${s.setNumber} of ${ex.name} must start incomplete!`);
    }
  }
  console.log('  ✓ Verified: All sets in fresh session start incomplete (completed: false)');

  // Check template targets preserved
  const inclineEx = freshSession.exercises[0];
  assert.strictEqual(inclineEx.name, 'Incline Bench Press');
  assert.strictEqual(inclineEx.target, '35 kg', 'Template target must be preserved');
  assert.strictEqual(inclineEx.targetWeight, 35, 'Template target weight must be preserved');
  console.log('  ✓ Verified: Template targets preserved for clean starting workout');

  // Test 4: Historical Workouts Immutability
  console.log('Test 4: Verifying historical workouts remain unchanged...');
  const afterStartHistory = await getWorkoutHistory();
  assert.strictEqual(afterStartHistory.length, initialHistoryCount, 'History count must not change when a workout starts');
  console.log('  ✓ Verified: Completed workouts in history are untouched');

  // Test 5: Active & Interrupted Workout Lifecycle (Save & Resume)
  console.log('Test 5: Testing active session persistence and recovery...');
  // Simulate logging Set 1
  freshSession.exercises[0].sets[0].weight = 37.5; // Progressive overload!
  freshSession.exercises[0].sets[0].reps = 10;
  freshSession.exercises[0].sets[0].completed = true;
  freshSession.exercises[0].rir = 2;

  await saveActiveSession(freshSession);

  // Simulate app restart / refresh: read active session from storage
  const restoredSession = await getActiveSession();
  assert.ok(restoredSession, 'Should recover active session from storage');
  assert.strictEqual(restoredSession.id, freshSession.id);
  assert.strictEqual(restoredSession.exercises[0].sets[0].weight, 37.5);
  assert.strictEqual(restoredSession.exercises[0].sets[0].completed, true);
  assert.strictEqual(restoredSession.exercises[0].rir, 2);
  console.log('  ✓ Verified: Active session persists and survives refresh with logged sets intact');

  // Test 6: Workout Completion Flow
  console.log('Test 6: Testing workout completion...');
  // Mark remaining sets
  freshSession.exercises[0].sets[1].completed = true;
  freshSession.exercises[0].sets[2].completed = true;

  const savedCompleted = await finishSession(freshSession, {
    bodyWeight: 72.9,
    durationMinutes: 48
  });

  assert.strictEqual(savedCompleted.status, 'completed');
  assert.strictEqual(savedCompleted.durationMinutes, 48);
  assert.strictEqual(savedCompleted.bodyWeight, 72.9);

  // Verify active session was cleared
  const activeAfterFinish = await getActiveSession();
  assert.strictEqual(activeAfterFinish, null, 'Active session must be cleared after completion');
  console.log('  ✓ Verified: Active session cleared upon completion');

  // Verify history contains the completed session exactly once
  const historyAfterFinish = await getWorkoutHistory();
  assert.strictEqual(historyAfterFinish.length, initialHistoryCount + 1, 'History must contain exactly 1 new workout');
  const matchingSaved = historyAfterFinish.filter(h => h.id === savedCompleted.id);
  assert.strictEqual(matchingSaved.length, 1, 'Completed workout must appear exactly once in history');
  console.log('  ✓ Verified: Completed workout appears exactly once in history');

  // Verify the completed workout in database contains all sets
  const fetchedWorkout = await getWorkout(savedCompleted.id);
  assert.ok(fetchedWorkout, 'Should fetch saved workout from IndexedDB');
  assert.strictEqual(fetchedWorkout.exercises.length, 1);
  assert.strictEqual(fetchedWorkout.exercises[0].sets[0].weight, 37.5);
  assert.strictEqual(fetchedWorkout.exercises[0].sets[0].completed, true);
  console.log('  ✓ Verified: Saved workout contains all exercises and sets in IndexedDB');

  // Test 7: Double Completion Prevention
  console.log('Test 7: Testing double completion prevention...');
  let errorCaught = false;
  try {
    // If active session is null, finishSession should reject
    await finishSession(null);
  } catch (e) {
    errorCaught = true;
  }
  assert.ok(errorCaught, 'Calling finishSession with null must fail');
  console.log('  ✓ Verified: Cannot complete null session');

  // Test 8: Backup Export & Import with Templates
  console.log('Test 8: Testing backup export, validation, and restore...');
  const backup = await exportBackup();
  assert.ok(backup, 'Backup data must be generated');
  assert.strictEqual(backup.app, 'Yeshu Gym');
  assert.strictEqual(backup.version, 2);
  assert.ok(Array.isArray(backup.templates) && backup.templates.length >= 2, 'Backup must include templates');
  assert.ok(Array.isArray(backup.history) && backup.history.length === initialHistoryCount + 1, 'Backup must include all history');
  assert.ok(validateBackup(backup), 'Backup validation must pass');
  console.log(`  ✓ Backup exported and validated (${backup.templates.length} templates, ${backup.history.length} workouts)`);

  // Test restore
  await importBackup(backup);
  const restoredHistory = await getWorkoutHistory();
  assert.strictEqual(restoredHistory.length, initialHistoryCount + 1, 'Restored history must match exported count');
  const restoredTemplates = await getTemplates();
  assert.strictEqual(restoredTemplates.length, backup.templates.length, 'Restored templates must match exported count');
  console.log('  ✓ Verified: Backup restore preserves templates and all workout history');

  // Test 9: History Tracked Data & Breakdown Verification
  console.log('Test 9: Verifying history workout details, exercises, and tracked performance data...');
  const latestHistory = await getWorkoutHistory();
  assert.ok(latestHistory.length > 0, 'History should have at least 1 workout');
  const histItem = latestHistory[0];
  assert.ok(histItem.exercises && histItem.exercises.length > 0, 'Workout in history must have exercises');

  let computedVol = 0;
  let completedSets = 0;
  histItem.exercises.forEach(ex => {
    (ex.sets || []).forEach(s => {
      if (s.completed) {
        completedSets++;
        computedVol += (parseFloat(s.weight) || 0) * (parseInt(s.reps) || 0);
      }
    });
  });

  assert.ok(completedSets > 0, 'Workout must have completed sets');
  assert.ok(computedVol > 0, 'Workout must have positive volume');
  assert.strictEqual(formatDuration(48), '48m');
  assert.strictEqual(formatDuration(90), '1h 30m');
  assert.ok(typeof formatTime(Date.now()) === 'string');
  console.log(`  ✓ Verified: History item contains ${histItem.exercises.length} exercise(s), ${completedSets} completed sets, ${computedVol} kg total volume`);

  console.log('\n=== ALL 9 TEST SUITES PASSED CLEANLY! ===\n');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
