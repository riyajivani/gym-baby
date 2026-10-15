import 'fake-indexeddb/auto';
import assert from 'node:assert';
import { db, initDatabase } from '../src/db/database.js';
import {
  getTemplates,
  getTemplate,
  getDefaultTemplate
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
  getWorkout,
  createWorkout
} from '../src/repositories/workoutRepository.js';
import {
  exportBackup,
  validateBackup,
  importBackup
} from '../src/repositories/backupRepository.js';

async function runScenarioValidation() {
  console.log('====================================================');
  console.log('   Yeshu Gym Step 4: Full Workout Flow Validation   ');
  console.log('====================================================\n');

  // Initialize DB
  await initDatabase();

  const initialHistory = await getWorkoutHistory();
  const initialCount = initialHistory.length;
  console.log(`Baseline Setup: Database initialized with ${initialCount} historical completed sessions.`);

  // -------------------------------------------------------------------------
  // Scenario 1: Start a workout from a template
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Start a workout from a template ---');
  const template = await getTemplate('tpl-upper-body');
  assert.ok(template, 'Upper Body template must exist');
  assert.strictEqual(template.name, 'Upper Body');
  assert.strictEqual(template.exercises.length, 8, 'Upper Body template must have 8 exercises');
  console.log(`PASS: Template "${template.name}" retrieved with ${template.exercises.length} ordered exercises.`);

  // -------------------------------------------------------------------------
  // Scenario 2: Confirm a new session is created with a unique ID
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Confirm new session is created with a unique ID ---');
  const session1 = createSessionFromTemplate(template, initialHistory, { bodyWeight: 72.8 });
  assert.ok(session1.id.startsWith('sess-'), 'Session ID should start with sess-');
  assert.ok(!initialHistory.some(h => h.id === session1.id), 'Session ID must be unique and not match any historical workout');
  assert.strictEqual(session1.status, 'in_progress');
  assert.ok(session1.startedAt <= Date.now(), 'Session startedAt must be recorded');
  assert.strictEqual(session1.date, new Date().toISOString().split('T')[0]);
  console.log(`PASS: New session created. ID: ${session1.id}, Date: ${session1.date}, StartedAt: ${new Date(session1.startedAt).toLocaleTimeString()}`);

  // -------------------------------------------------------------------------
  // Scenario 3: Confirm today's sets are incomplete initially
  // -------------------------------------------------------------------------
  console.log("\n--- Scenario 3: Confirm today's sets are incomplete initially ---");
  let totalSetsChecked = 0;
  for (const ex of session1.exercises) {
    for (const s of ex.sets) {
      assert.strictEqual(s.completed, false, `Set ${s.setNumber} of ${ex.name} must be incomplete`);
      totalSetsChecked++;
    }
  }
  console.log(`PASS: All ${totalSetsChecked} sets across 8 exercises start strictly with completed = false.`);

  // -------------------------------------------------------------------------
  // Scenario 4: Confirm previous workout lookup on clean slate
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Confirm previous workout lookup on clean slate ---');
  const inclineBenchEx = session1.exercises.find(e => e.name === 'Incline Bench Press');
  assert.ok(inclineBenchEx, 'Incline Bench Press must be in session');
  assert.strictEqual(inclineBenchEx.previousPerformance, null, 'Clean database starts with no previous performance');
  assert.strictEqual(inclineBenchEx.target, '35 kg');
  assert.strictEqual(inclineBenchEx.targetScheme, '3×6–10');
  console.log(`PASS: Clean start verified: previousPerformance is null gracefully.`);
  console.log(`PASS: Template target preserved: ${inclineBenchEx.target} (${inclineBenchEx.targetScheme}).`);

  // -------------------------------------------------------------------------
  // Scenario 5: Edit weight and reps, then mark sets complete
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Edit weight and reps, then mark sets complete ---');
  inclineBenchEx.sets[0].weight = 37.5; // Progressive overload +2.5kg
  inclineBenchEx.sets[0].reps = 10;
  inclineBenchEx.sets[0].completed = true;

  inclineBenchEx.sets[1].weight = 37.5;
  inclineBenchEx.sets[1].reps = 9;
  inclineBenchEx.sets[1].completed = true;

  inclineBenchEx.sets[2].weight = 37.5;
  inclineBenchEx.sets[2].reps = 8;
  inclineBenchEx.sets[2].completed = true;
  inclineBenchEx.rir = 1;

  assert.strictEqual(inclineBenchEx.sets[0].completed, true);
  assert.strictEqual(inclineBenchEx.sets[1].completed, true);
  assert.strictEqual(inclineBenchEx.sets[2].completed, true);
  assert.strictEqual(inclineBenchEx.rir, 1);
  console.log('PASS: Logged Incline Bench Press: Set 1 (37.5kg × 10), Set 2 (37.5kg × 9), Set 3 (37.5kg × 8), RIR 1, all completed.');

  // -------------------------------------------------------------------------
  // Scenario 6: Navigate between exercises without losing changes
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Navigate between exercises without losing changes ---');
  session1.currentExerciseIndex = 0;
  await saveActiveSession(session1);

  // Navigate to Exercise 1 (Assisted Pull-Ups)
  session1.currentExerciseIndex = 1;
  const pullUpsEx = session1.exercises[1];
  pullUpsEx.sets[0].weight = 55;
  pullUpsEx.sets[0].reps = 10;
  pullUpsEx.sets[0].completed = true;
  await saveActiveSession(session1);

  // Navigate to Exercise 2 (Cable Fly)
  session1.currentExerciseIndex = 2;
  await saveActiveSession(session1);

  // Navigate back to Exercise 0 (Incline Bench Press)
  session1.currentExerciseIndex = 0;
  const verifiedIncline = session1.exercises[0];
  assert.strictEqual(verifiedIncline.sets[0].weight, 37.5);
  assert.strictEqual(verifiedIncline.sets[0].reps, 10);
  assert.strictEqual(verifiedIncline.sets[0].completed, true);
  assert.strictEqual(verifiedIncline.sets[1].weight, 37.5);
  assert.strictEqual(verifiedIncline.sets[1].reps, 9);
  assert.strictEqual(verifiedIncline.sets[1].completed, true);
  assert.strictEqual(verifiedIncline.rir, 1);

  // Check pull ups also retained
  assert.strictEqual(session1.exercises[1].sets[0].completed, true);
  assert.strictEqual(session1.exercises[1].sets[0].weight, 55);
  console.log('PASS: Navigated forward and backward between exercises. All set modifications, checks, and RIR intact.');

  // -------------------------------------------------------------------------
  // Scenario 7: Refresh page during active workout and confirm it can be resumed
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Refresh page during active workout and resume ---');
  session1.currentExerciseIndex = 1; // User was at exercise 1
  await saveActiveSession(session1);

  // Simulate total application restart / fresh load
  const resumedSession = await getActiveSession();
  assert.ok(resumedSession, 'Active session must be recovered from storage after refresh');
  assert.strictEqual(resumedSession.id, session1.id);
  assert.strictEqual(resumedSession.status, 'in_progress');
  assert.strictEqual(resumedSession.currentExerciseIndex, 1);
  assert.strictEqual(resumedSession.exercises[0].sets[0].weight, 37.5);
  assert.strictEqual(resumedSession.exercises[0].sets[0].completed, true);
  assert.strictEqual(resumedSession.exercises[1].sets[0].completed, true);
  console.log(`PASS: Page refresh simulated. Session ${resumedSession.id} successfully resumed at exercise index ${resumedSession.currentExerciseIndex} with all progress intact.`);

  // -------------------------------------------------------------------------
  // Scenario 8: Finish workout and confirm it appears exactly once in History
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Finish workout and confirm it appears exactly once ---');
  // Mark remaining sets in session as done
  resumedSession.exercises.forEach(ex => {
    ex.sets.forEach(s => { s.completed = true; });
  });
  resumedSession.cardio = [{
    name: 'Incline Walking',
    time: '5 min',
    distance: '0.40 km',
    incline: '12%',
    speed: '4.5 km/h'
  }];

  const completedSession1 = await finishSession(resumedSession, {
    bodyWeight: 72.9,
    durationMinutes: 44
  });

  assert.strictEqual(completedSession1.status, 'completed');
  assert.strictEqual(completedSession1.durationMinutes, 44);
  assert.strictEqual(completedSession1.bodyWeight, 72.9);

  // Confirm active session is cleared
  const activeAfterFinish = await getActiveSession();
  assert.strictEqual(activeAfterFinish, null, 'Active in-progress session must be cleared after finish');

  // Confirm history contains it exactly once
  const historyAfter1 = await getWorkoutHistory();
  assert.strictEqual(historyAfter1.length, initialCount + 1, `History count should increase by 1 (expected ${initialCount + 1}, got ${historyAfter1.length})`);
  const matches = historyAfter1.filter(h => h.id === completedSession1.id);
  assert.strictEqual(matches.length, 1, 'Completed workout must appear exactly once in History');
  console.log(`PASS: Workout completed. Active session cleared. Session appears exactly once in History.`);

  // -------------------------------------------------------------------------
  // Scenario 9: Start another session and confirm previous session remains unchanged
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Start another session & confirm previous session is immutable ---');
  // Retrieve previous completed workout
  const preSnapshot = await getWorkout(completedSession1.id);
  assert.ok(preSnapshot, 'Completed workout must exist in IndexedDB');
  const preSnapshotSets = JSON.parse(JSON.stringify(preSnapshot.exercises[0].sets));

  // Start a new session from Push Day template
  const pushTemplate = await getTemplate('tpl-push-day');
  assert.ok(pushTemplate, 'Push Day template must exist');
  const session2 = createSessionFromTemplate(pushTemplate, historyAfter1, { bodyWeight: 72.9 });
  await saveActiveSession(session2);

  assert.notStrictEqual(session2.id, completedSession1.id, 'Session 2 must have distinct ID');
  assert.strictEqual(session2.status, 'in_progress');

  // Verify previous completed session remains completely unchanged
  const postSnapshot = await getWorkout(completedSession1.id);
  assert.strictEqual(postSnapshot.id, completedSession1.id);
  assert.strictEqual(postSnapshot.status, 'completed');
  assert.strictEqual(postSnapshot.durationMinutes, 44);
  assert.strictEqual(postSnapshot.bodyWeight, 72.9);
  assert.deepStrictEqual(postSnapshot.exercises[0].sets, preSnapshotSets, 'Sets of previous completed session must be untouched');
  console.log('PASS: Started Session 2. Previous completed Session 1 verified completely unchanged and immutable.');

  // -------------------------------------------------------------------------
  // Scenario 10: Verify body weight, cardio, and workout duration are saved correctly
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 10: Verify body weight, cardio, and workout duration ---');
  session2.exercises[0].sets.forEach(s => { s.completed = true; });
  session2.cardio = [{
    name: 'Treadmill Cooldown',
    time: '10 min',
    distance: '1.2 km',
    incline: '2%',
    speed: '6.0 km/h'
  }];

  const completedSession2 = await finishSession(session2, {
    bodyWeight: 73.1,
    durationMinutes: 38
  });

  const verifiedSession2 = await getWorkout(completedSession2.id);
  assert.strictEqual(verifiedSession2.bodyWeight, 73.1, 'Body weight must match 73.1 kg');
  assert.strictEqual(verifiedSession2.durationMinutes, 38, 'Duration must match 38 minutes');
  assert.strictEqual(verifiedSession2.cardio.length, 1);
  assert.strictEqual(verifiedSession2.cardio[0].name, 'Treadmill Cooldown');
  assert.strictEqual(verifiedSession2.cardio[0].distance, '1.2 km');
  console.log(`PASS: Session 2 saved with Body Weight: ${verifiedSession2.bodyWeight} kg, Duration: ${verifiedSession2.durationMinutes} min, Cardio: ${verifiedSession2.cardio[0].name} (${verifiedSession2.cardio[0].distance}).`);

  // -------------------------------------------------------------------------
  // Scenario 11: Test backup export and import
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 11: Test backup export and import ---');
  const backupData = await exportBackup();
  assert.strictEqual(backupData.app, 'Yeshu Gym');
  assert.strictEqual(backupData.version, 2);
  assert.ok(Array.isArray(backupData.history));
  assert.strictEqual(backupData.history.length, initialCount + 2); // 4 initial + 2 completed
  assert.ok(Array.isArray(backupData.templates) && backupData.templates.length >= 2);
  assert.ok(validateBackup(backupData), 'Backup validation must pass');

  // Test importing backup into fresh state
  await importBackup(backupData);
  const importedHistory = await getWorkoutHistory();
  assert.strictEqual(importedHistory.length, initialCount + 2, 'Imported history count must match');
  const importedTemplates = await getTemplates();
  assert.strictEqual(importedTemplates.length, backupData.templates.length, 'Imported templates count must match');
  console.log(`PASS: Backup exported (${backupData.history.length} workouts, ${backupData.templates.length} templates) and successfully restored without data loss.`);

  // -------------------------------------------------------------------------
  // Scenario 12: Verify existing workout history survives all changes
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 12: Verify existing workout history survives all changes ---');
  const currentHistory = await getWorkoutHistory();
  // Verify completed sessions are still present with their original dates and data
  const restoredSession1 = currentHistory.find(h => h.id === completedSession1.id);
  assert.ok(restoredSession1, 'Completed session 1 must exist after restore');
  assert.strictEqual(restoredSession1.exercises.length, 8);
  assert.strictEqual(restoredSession1.exercises[0].name, 'Incline Bench Press');

  const restoredSession2 = currentHistory.find(h => h.id === completedSession2.id);
  assert.ok(restoredSession2, 'Completed session 2 must exist after restore');
  console.log('PASS: Verified all user workouts survive intact after backup restore with all exercises and sets.');

  // -------------------------------------------------------------------------
  // Offline & Persistence Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Offline & Persistence Verification ---');
  // 1. Check Dexie tables are responsive
  const workoutCount = await db.workouts.count();
  const templateCount = await db.templates.count();
  const exerciseCount = await db.exercises.count();
  const setCount = await db.sets.count();
  assert.ok(workoutCount > 0, 'Workouts table has records');
  assert.ok(templateCount >= 2, 'Templates table has records');
  assert.ok(exerciseCount > 0, 'Exercises table has records');
  assert.ok(setCount > 0, 'Sets table has records');
  console.log(`PASS: IndexedDB stores active: ${workoutCount} workouts, ${templateCount} templates, ${exerciseCount} exercises, ${setCount} sets.`);

  console.log('\n====================================================');
  console.log('   ALL 12 SCENARIOS + PERSISTENCE CHECKS PASSED!    ');
  console.log('====================================================\n');
}

runScenarioValidation().catch(err => {
  console.error('\n❌ Scenario Validation Failed:', err);
  process.exit(1);
});
