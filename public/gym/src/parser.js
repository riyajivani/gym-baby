/**
 * Smart Gym Log Parser - Enhanced Multi-Day, Auto-Date Stamping & Clean Routine Naming
 */

/**
 * Normalizes routine titles to clean names (e.g. "Push Day", "Pull Day", "Legs + Core", "Upper Body", "Arms + Shoulders + Core")
 * without "Day 1 — ", "Day 2 — " prefixes.
 */
export function cleanRoutineName(rawTitle) {
  if (!rawTitle) return 'Workout Session';

  let cleaned = rawTitle.replace(/^[🟦🟩🟥🟪🟧🟢🟡🟣\s]+/, '');
  // Remove "DAY X — " or "DAY X - " or "DAY X: "
  cleaned = cleaned.replace(/^DAY\s*\d+\s*[—\-:]*\s*/i, '').trim();

  const lower = cleaned.toLowerCase();
  if (lower === 'push') return 'Push Day';
  if (lower === 'pull') return 'Pull Day';
  if (lower === 'legs' || lower === 'leg' || lower.includes('legs + core') || lower.includes('legs & core')) return 'Legs + Core';
  if (lower === 'upper' || lower === 'upper body') return 'Upper Body';
  if (lower.includes('arms') && lower.includes('shoulders')) return 'Arms + Shoulders + Core';

  return cleaned || 'Workout Session';
}

/**
 * Parses start date from text headers like:
 * "Dates: 2/9/26 to 8/9/26" -> 2026-09-02
 * "Dates: 25/8/26 to 31/8/26" -> 2026-08-25
 * "Dates: 25 to ___" -> 2026-08-25
 */
export function parseDateRange(text) {
  if (!text) return null;

  // Match e.g. "Dates: 2/9/26 to 8/9/26" or "Dates: 02/09/2026 - 08/09/2026"
  const fullRangeMatch = text.match(/Dates\s*[:=\-]\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\s*(?:to|-)\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/i);
  if (fullRangeMatch) {
    let startDay = parseInt(fullRangeMatch[1]);
    let startMonth = parseInt(fullRangeMatch[2]);
    let startYear = parseInt(fullRangeMatch[3]);
    if (startYear < 100) startYear += 2000;

    let endDay = parseInt(fullRangeMatch[4]);
    let endMonth = parseInt(fullRangeMatch[5]);
    let endYear = parseInt(fullRangeMatch[6]);
    if (endYear < 100) endYear += 2000;

    return {
      startDate: new Date(startYear, startMonth - 1, startDay),
      endDate: new Date(endYear, endMonth - 1, endDay)
    };
  }

  // Match e.g. "Dates: 25/8/26 to 31/8/26" or "Dates: 25 to 31"
  const partialRangeMatch = text.match(/Dates\s*[:=\-]\s*(\d{1,2})(?:[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?)?\s*(?:to|-)\s*(\d{1,2})?(?:[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?)?/i);
  if (partialRangeMatch && partialRangeMatch[1]) {
    let startDay = parseInt(partialRangeMatch[1]);
    let startMonth = partialRangeMatch[2] ? parseInt(partialRangeMatch[2]) : (startDay >= 20 ? 8 : 9); // default Aug or Sep
    let startYear = partialRangeMatch[3] ? parseInt(partialRangeMatch[3]) : 2026;
    if (startYear < 100) startYear += 2000;

    return {
      startDate: new Date(startYear, startMonth - 1, startDay)
    };
  }

  return null;
}

function formatDateToIso(date) {
  if (!date || isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseGymLog(text) {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Check date range
  const rangeInfo = parseDateRange(text);
  const baseStartDate = rangeInfo?.startDate || null;

  // Check weekly average body weight
  const avgBwMatch = text.match(/Body\s*weight\s*[—\-:]\s*(?:weekly\s*average\s*[:=\-]?)?\s*([\d.]+)\s*kg/i);
  const defaultWeeklyWeight = avgBwMatch ? parseFloat(avgBwMatch[1]) : null;

  const days = [];
  const todayDateStr = new Date().toISOString().split('T')[0];

  const getDayDate = (dayIndex) => {
    if (!baseStartDate) return todayDateStr;
    // Standard workout distribution across week: Day 1 (+0), Day 2 (+1), Day 3 (+2), Day 4 (+4), Day 5 (+5)
    const dayOffsets = [0, 1, 2, 4, 5, 6];
    const offset = dayOffsets[dayIndex] !== undefined ? dayOffsets[dayIndex] : dayIndex;
    const d = new Date(baseStartDate.getTime() + offset * 24 * 60 * 60 * 1000);
    return formatDateToIso(d);
  };

  let dayCounter = 0;
  let currentDay = {
    title: 'Workout Session',
    routineName: 'Push Day',
    date: getDayDate(0),
    bodyWeight: defaultWeeklyWeight,
    exercises: [],
    cardio: []
  };

  let currentExercise = null;
  let currentCardio = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Day Header: e.g. "DAY 1 — PUSH", "🟢 DAY 3 — LEGS + CORE", "🟡 DAY 4 — UPPER", "🟣 DAY 5"
    const dayHeaderMatch = line.match(/^(?:[🟦🟩🟥🟪🟧🟢🟡🟣\s]*)(DAY\s*\d+\s*[—\-:]?\s*[^•\n]+)/i);
    if (dayHeaderMatch) {
      if (currentExercise) {
        currentDay.exercises.push(currentExercise);
        currentExercise = null;
      }
      if (currentDay.exercises.length > 0 || currentDay.cardio.length > 0) {
        // Fallback for bodyweight if invalid or missing
        if (!currentDay.bodyWeight && defaultWeeklyWeight) {
          currentDay.bodyWeight = defaultWeeklyWeight;
        }
        days.push(currentDay);
        dayCounter++;
      }

      const rawTitle = dayHeaderMatch[1].trim();
      const cleanTitle = cleanRoutineName(rawTitle);

      currentDay = {
        title: cleanTitle,
        routineName: cleanTitle,
        date: getDayDate(dayCounter),
        bodyWeight: defaultWeeklyWeight,
        exercises: [],
        cardio: []
      };
      currentCardio = null;
      continue;
    }

    // Skip informational report lines & notes
    if (line.match(/^(WEEKLY FITNESS REPORT|Week:|Dates:|Waist at|Average daily|Average sleep|Goal:|Week 4:|Was depth|Skip if|📝 WEEKLY FEEDBACK|Recovery|Overall energy|Muscle soreness|Sleep quality|Any unusual|Training|Any exercise|Any questionable|Any joint|Any shoulder|Which exercise|Nutrition|Approx\. protein|Diet adherence|Water\/day|Any diet|Activity|Incline walking|⭐ Most Important|How do you feel|16-09-26)/i)) {
      continue;
    }

    // Check Body Weight line
    const weightMatch = line.match(/^(?:Body\s*)?Weight\s*[:=\-]\s*([\d.]+)\s*(kg|lbs)?/i);
    if (weightMatch) {
      const val = parseFloat(weightMatch[1]);
      if (val > 30) {
        currentDay.bodyWeight = val;
      }
      continue;
    }

    // Check Cardio properties
    if (currentCardio) {
      const timeMatch = line.match(/•?\s*Time\s*[:=\-]\s*(.+)/i);
      const distMatch = line.match(/•?\s*Distance\s*[:=\-]\s*(.+)/i);
      const inclMatch = line.match(/•?\s*Incline\s*[:=\-]\s*(.+)/i);
      const speedMatch = line.match(/•?\s*Speed\s*[:=\-]\s*(.+)/i);

      if (timeMatch) { currentCardio.time = timeMatch[1].trim(); continue; }
      if (distMatch) { currentCardio.distance = distMatch[1].trim(); continue; }
      if (inclMatch) { currentCardio.incline = inclMatch[1].trim(); continue; }
      if (speedMatch) { currentCardio.speed = speedMatch[1].trim(); continue; }
    }

    // Check Cardio Start
    if (line.match(/^•?\s*(Incline Walking|Treadmill|Running|Cycling|Stairmaster|Elliptical|Cardio)/i)) {
      if (currentExercise) {
        currentDay.exercises.push(currentExercise);
        currentExercise = null;
      }
      currentCardio = {
        name: line.replace(/^•?\s*/, '').trim(),
        time: '',
        distance: '',
        incline: '',
        speed: ''
      };
      currentDay.cardio.push(currentCardio);
      continue;
    }

    // Check Plank timing line: e.g. "• Set 1: 30 sec"
    const plankMatch = line.match(/•?\s*Set\s*(\d+)\s*[:=\-]\s*(\d+)\s*sec/i);
    if (plankMatch && currentExercise) {
      const setNum = parseInt(plankMatch[1]);
      const secs = parseInt(plankMatch[2]);
      currentExercise.sets.push({
        setNumber: setNum,
        weight: 0,
        reps: secs,
        rawWeightText: 'Bodyweight',
        completed: secs > 0
      });
      continue;
    }

    // Check Set Line: e.g. "• Set 1: 40 kg × 8" or "• Set 1: bar+2.5kg/side × 12" or "• Set 1: 15"
    const setMatch = line.match(/•?\s*Set\s*(\d+)\s*[:=\-]\s*(.+?)(?:\s*[×x*]\s*([\d._\-]+|\d+\s*reps|\d+\/per side reps)?)?$/i);
    if (setMatch && currentExercise) {
      const setNum = parseInt(setMatch[1]);
      const rawWeight = setMatch[2].trim();
      const rawReps = setMatch[3] ? setMatch[3].trim() : '';

      let weightNum = parseFloat(rawWeight.match(/[\d.]+/)?.[0] || '0');
      let repsNum = parseInt(rawReps.match(/\d+/)?.[0] || rawWeight.match(/\d+/)?.[0] || '0');

      if (rawWeight.includes('ez bar') || rawWeight.includes('bar+2.5')) {
        weightNum = 15;
      }

      if (!rawReps && !rawWeight.includes('kg') && !rawWeight.includes('bar')) {
        repsNum = parseInt(rawWeight) || 0;
        weightNum = 0;
      }

      currentExercise.sets.push({
        setNumber: setNum,
        weight: weightNum,
        reps: repsNum,
        rawWeightText: rawWeight,
        completed: repsNum > 0
      });
      continue;
    }

    // Check RIR Line
    const rirMatch = line.match(/•?\s*(?:Approx\.?\s*|Final-set\s*)?RIR(?:\s*(?:on\s*)?(?:final\s*set)?|\s*\([^)]*\))?\s*[:=\-]\s*([\d+\-]+)/i);
    if (rirMatch && currentExercise) {
      const rawVal = rirMatch[1].trim();
      if (rawVal.includes('5+')) currentExercise.rir = 5;
      else if (rawVal.includes('1-2') || rawVal.includes('2-3')) currentExercise.rir = 2;
      else currentExercise.rir = parseInt(rawVal) || 0;
      continue;
    }

    // Check Target Line
    const targetMatch = line.match(/•?\s*Target\s*[:=\-]\s*(.+)/i);
    if (targetMatch && currentExercise) {
      currentExercise.target = targetMatch[1].trim();
      continue;
    }

    // Check Exercise Header line
    const exHeaderMatch = line.match(/^([A-Za-z0-9\s/()\-–'+]+?)\s*(?:[—\-]\s*(\d+\s*[×x*]\s*\d+(?:[–\-]\d+)?|\d+–\d+\s*sec))?$/);
    if (exHeaderMatch) {
      const name = exHeaderMatch[1].replace(/^[•\-\s]+/, '').trim();
      const scheme = exHeaderMatch[2] ? exHeaderMatch[2].replace(/\s+/g, '') : '';

      if (name.toLowerCase().startsWith('target:') || name.toLowerCase().startsWith('weight:') || name.toLowerCase().startsWith('dates:')) {
        continue;
      }

      if (currentExercise) {
        currentDay.exercises.push(currentExercise);
      }
      currentCardio = null;

      currentExercise = {
        name: name,
        targetScheme: scheme || '3×8–12',
        target: '',
        category: autoDetectCategory(name),
        sets: [],
        rir: null
      };
    }
  }

  if (currentExercise) {
    currentDay.exercises.push(currentExercise);
  }
  if (currentDay.exercises.length > 0 || currentDay.cardio.length > 0) {
    if (!currentDay.bodyWeight && defaultWeeklyWeight) {
      currentDay.bodyWeight = defaultWeeklyWeight;
    }
    days.push(currentDay);
  }

  return {
    days: days.length > 0 ? days : [currentDay],
    singleSession: days[0] || currentDay
  };
}

export function autoDetectCategory(name) {
  const lower = name.toLowerCase();
  if (lower.includes('bench') || lower.includes('chest') || lower.includes('fly') || lower.includes('pushdown') || lower.includes('tricep') || lower.includes('overhead cable')) {
    if (lower.includes('tricep') || lower.includes('pushdown')) return 'Arms';
    return 'Chest';
  }
  if (lower.includes('pull') || lower.includes('row') || lower.includes('lat') || lower.includes('back') || lower.includes('face pull')) {
    return 'Back';
  }
  if (lower.includes('shoulder') || lower.includes('press') || lower.includes('lateral') || lower.includes('rear delt')) {
    return 'Shoulders';
  }
  if (lower.includes('curl') || lower.includes('bicep') || lower.includes('tricep') || lower.includes('arm') || lower.includes('ez-bar')) {
    return 'Arms';
  }
  if (lower.includes('squat') || lower.includes('leg') || lower.includes('calf') || lower.includes('lunge') || lower.includes('hamstring') || lower.includes('quad')) {
    return 'Legs';
  }
  if (lower.includes('crunch') || lower.includes('knee raise') || lower.includes('leg raise') || lower.includes('ab') || lower.includes('core') || lower.includes('twist') || lower.includes('plank')) {
    return 'Core';
  }
  return 'Other';
}

export function stringifyWorkout(workout) {
  let output = [];

  if (workout.exercises && workout.exercises.length > 0) {
    workout.exercises.forEach(ex => {
      let header = ex.name;
      if (ex.targetScheme) {
        header += ` — ${ex.targetScheme}`;
      }
      output.push(header);

      if (ex.target) {
        output.push(`Target: ${ex.target}`);
      }

      if (ex.sets && ex.sets.length > 0) {
        ex.sets.forEach((set, idx) => {
          output.push(`• Set ${idx + 1}: ${set.rawWeightText || set.weight + ' kg'} × ${set.reps}`);
        });
      }

      if (ex.rir !== null && ex.rir !== undefined && ex.rir !== '') {
        output.push(`• Final-set RIR: ${ex.rir}`);
      }

      output.push('');
    });
  }

  if (workout.cardio && workout.cardio.length > 0) {
    workout.cardio.forEach(c => {
      output.push(c.name);
      if (c.time) output.push(`• Time: ${c.time}`);
      if (c.distance) output.push(`• Distance: ${c.distance}`);
      if (c.incline) output.push(`• Incline: ${c.incline}`);
      if (c.speed) output.push(`• Speed: ${c.speed}`);
      output.push('');
    });
  }

  if (workout.bodyWeight) {
    output.push(`Weight: ${workout.bodyWeight}`);
  }

  return output.join('\n').trim();
}
