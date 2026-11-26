import * as Tone from 'tone';

let synth: Tone.PolySynth | null = null;

export async function playPhaseChime(phaseLabel: string, enabled: boolean): Promise<void> {
  if (!enabled) return;
  try {
    if (Tone.getContext().state !== 'running') {
      await Tone.start();
    }
    if (!synth) {
      synth = new Tone.PolySynth(Tone.Synth, {
        oscillator: {type: 'sine'},
        envelope: {attack: 0.4, decay: 0.8, sustain: 0.2, release: 1.5},
      }).toDestination();
      synth.volume.value = -14;
    }

    if (phaseLabel.includes('들이마시기')) {
      synth.triggerAttackRelease(['C5', 'E5'], '1.2');
    } else if (phaseLabel.includes('내쉬기')) {
      synth.triggerAttackRelease(['G4', 'B4'], '1.5');
    } else {
      synth.triggerAttackRelease(['A4'], '0.8');
    }
  } catch {
    // Ignore browser autoplay restrictions until user interaction
  }
}
