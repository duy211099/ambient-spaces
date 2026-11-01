export const NOTE_SETS: Record<string, { label: string; notes: string[] }> = {
  airports: { label: "Music for Airports 2/1 (Eno)", notes: ["F4", "Ab4", "C5", "Db5", "Eb5", "F5", "Ab5"] },
  pentatonic: { label: "C major pentatonic", notes: ["C4", "D4", "E4", "G4", "A4", "C5", "D5"] },
  night: { label: "Night (A minor)", notes: ["A3", "C4", "E4", "G4", "B4", "E5"] },
  nguCung: { label: "Ngũ cung (Vietnamese pentatonic)", notes: ["C4", "D4", "F4", "G4", "A4", "C5", "D5"] },
  drone: { label: "Low drone (F, C)", notes: ["F2", "C3"] },
  droneNight: { label: "Low drone, night (A, E)", notes: ["A2", "E3"] },
  bellsHigh: { label: "High bells", notes: ["C6", "Eb6", "F6", "Ab6"] },
  airportsAlt: { label: "Music for Airports, lower", notes: ["Db4", "F4", "Ab4", "C5", "Eb5", "F5"] },
};

// Lesson 6: loop lengths (seconds) and start offsets for the seven Eno voices.
export const ENO_INTERVALS = [23.53, 25.76, 29.123, 19.29, 16.831, 22.432, 27.97];
export const ENO_OFFSETS = [0, 5.23, 20.91, 15.47, 9.77, 19.55, 20.112];
