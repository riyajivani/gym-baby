/**
 * Smart Gym Log Parser - Enhanced Multi-Day & Week 5 Support
 */

export function parseGymLog(text) {
  if (!text || typeof text !== 'string') return null;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  const days = [];
  const todayDateStr = new Date().toISOString().split('T')[0];
  let currentDay = {
    title: 'Workout Session',
    date: todayDateStr,
    bodyWeight: null,
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
        days.push(currentDay);
      }
      currentDay = {
        title: dayHeaderMatch[1].trim(),
        date: todayDateStr,
        bodyWeight: null,
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
    const setMatch = line.match(/•?\s*Set\s*(\d+)\s*[:=\-]\s*(.+?)(?:\s*[×x*]\s*([\d._\-]+|\d+\s*reps)?)?$/i);
    if (setMatch && currentExercise) {
      const setNum = parseInt(setMatch[1]);
      const rawWeight = setMatch[2].trim();
      const rawReps = setMatch[3] ? setMatch[3].trim() : '';

      let weightNum = parseFloat(rawWeight.match(/[\d.]+/)?.[0] || '0');
      let repsNum = parseInt(rawReps.match(/\d+/)?.[0] || rawWeight.match(/\d+/)?.[0] || '0');

      if (rawWeight.includes('bar+2.5')) {
        weightNum = 15;
      }

      if (!rawReps && !rawWeight.includes('kg') && !rawWeight.includes('bar')) {
        // Line format like "• Set 1: 15" where 15 is reps and weight is bodyweight
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

      if (name.toLowerCase().startsWith('target:') || name.toLowerCase().startsWith('weight:')) {
        continue;
      }

      if (currentExercise) {
        currentDay.exercises.push(currentExercise);
      }
      currentCardio = null;

      currentExercise = {
        name: name,
        targetScheme: scheme || '3x8-12',
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
