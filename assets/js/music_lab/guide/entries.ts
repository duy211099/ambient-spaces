export interface GuideEntry {
  id: string;
  title: string;
  body: string;
  source: string; // "Lesson 3" … "Lesson 9" or "Beyond the course"
}

const entry = (id: string, title: string, source: string, body: string): [string, GuideEntry] => [id, { id, title, body, source }];

export const GUIDE_ENTRIES: Record<string, GuideEntry> = Object.fromEntries([
  entry("oscillator", "A pure tone", "Lesson 3",
    "An oscillator makes the simplest sound there is: one smooth wave at one pitch. " +
    "Nothing is heard until it is connected to the speakers, and it starts quiet on purpose so it never hurts your ears. " +
    "Every richer instrument here is built from waves like this one."),
  entry("sampler", "The piano sampler", "Lesson 4",
    "A sampler plays short recordings of a real instrument, here an upright piano. " +
    "Only a dozen notes are recorded, and the sampler shifts the nearest recording up or down to play any other note. " +
    "The recordings have to load before the first note can sound, so you may see \"loading piano…\" for a moment."),
  entry("instrument", "Instrument", "Lesson 9",
    "Each layer can play a different sound: the recorded piano, or one of the synth voices. " +
    "Swapping the sound changes the mood a lot while the notes and timing stay the same. " +
    "The course ends by inviting you to bring your own sounds, and this is the place to try that idea."),
  entry("scheduling-time", "Playing a note on time", "Lesson 5",
    "Notes are booked ahead on a clock rather than played the instant code runs. " +
    "The clock calls the booking a little early and passes along the exact moment as a \"time\" value, and the note must be played at that time, not \"now\". " +
    "When one note books the next, it adds its gap to that same time, so small delays never pile up."),
  entry("note-set", "Note set", "Lesson 6",
    "A note set is the handful of pitches a layer is allowed to play. " +
    "They are picked so any of them sound good together, in any order and any overlap. " +
    "That is why the music can be left to chance and still sound calm."),
  entry("timing-eno", "Eno loops", "Lesson 6",
    "Brian Eno made \"2/1\" from tape loops, one note per loop: \"One of the notes repeats every 23 1/2 seconds… they all repeat in cycles that are called incommensurable — they are not likely to come back into sync again.\" " +
    "Here each note repeats on its own fixed loop, 23.53 seconds, 25.76 seconds and so on, so the pattern drifts for a very long time before it lines up again. " +
    "Note weights are ignored in this mode, and Density and Mood stretch every loop by the same amount so the loops still never line up."),
  entry("timing-random-once", "Random, fixed", "Lesson 7",
    "Instead of hand-picked loop lengths, each note picks its own random loop length when the piece starts and then keeps it. " +
    "Each run sounds different, but within one run every note still repeats on a steady cycle."),
  entry("timing-random-every", "Random, every time", "Lesson 7",
    "After every note, that note picks a fresh random wait before it plays again. " +
    "There is no fixed cycle at all, so the piece never repeats. " +
    "This is the course's final timing rule and the default here."),
  entry("density", "Sparser to busier", "Lesson 7",
    "Density sets how long a note waits, on average, before it plays again. " +
    "Lower means longer silences between notes and more space; higher means notes arrive more often. " +
    "The course suggests trying notes that happen more or less often, and this slider does exactly that."),
  entry("weights", "Note weights", "Lesson 7",
    "A weight makes one note come up more often than the others. " +
    "A heavier note waits less between plays, so it becomes a kind of home note the music keeps returning to. " +
    "The course closes Lesson 7 with this idea as something to try."),
  entry("chord-changes", "Chord changes", "Lesson 7",
    "With chord changes on, the layer swaps between two note sets every few minutes. " +
    "Notes from the old set ring out while the new set fades in, so the change feels like a slow turn rather than a cut. " +
    "The course suggests switching chords only sometimes, using a coin flip."),
  entry("reverb", "Reverb", "Lesson 8",
    "Reverb is the sound of a room: each note keeps echoing softly after it is played. " +
    "Room size sets how long that tail lasts, and the mix sets how much of it you hear. " +
    "A long, soft tail blends separate notes into one wash of sound."),
  entry("dampening", "Dampening", "Lesson 8",
    "Dampening softens the high end of the reverb tail. " +
    "A lower value makes the room sound darker and warmer, like heavy curtains; a higher value keeps it bright."),
  entry("send", "Echo and reverb send", "Lesson 8",
    "The send sets how much of this layer goes into the shared echo and reverb. " +
    "At zero the layer sounds dry and close; turned up, it sits further back in the room. " +
    "All layers share one reverb, so the room sounds the same for every layer."),
  entry("drift", "Slow drift", "Lesson 8",
    "A drift slowly sweeps a setting up and down on its own, over minutes, using a very slow wave. " +
    "With a period of 1000 seconds the reverb takes over 16 minutes to move from dry to wet and back, so you feel it more than hear it. " +
    "Only one drift per target takes effect: a second drift on the same target does nothing. " +
    "Density drifts ignore \"modulated by\"."),
  entry("drift-on-drift", "Drift on drift", "Lesson 8",
    "A drift can itself be modulated by another drift, which slowly speeds up and slows down the first one. " +
    "The sweep then never settles into a steady rhythm. " +
    "The course ends Lesson 8 with this idea: one slow wave steering the speed of another."),
  entry("layers", "Layers", "Lesson 9",
    "A layer is one voice of the piece with its own sound, notes and timing: here a low drone, the main notes and high bells. " +
    "Stacking a few simple systems is how you grow the course's single generator into your own piece. " +
    "Mute a layer to hear what the others are doing."),
  entry("mute", "Mute", "Beyond the course",
    "Mute silences a layer without losing its settings. " +
    "Its notes keep their place, so unmuting brings it back in step with the rest."),
  entry("volume", "Layer volume", "Beyond the course",
    "Volume is in decibels, where every 6 dB down is about half as loud. " +
    "Background layers like the drone sound best well below the main notes. " +
    "The loudest setting is capped so no layer can overpower the mix."),
  entry("brightness", "Darker to brighter", "Beyond the course",
    "Brightness opens or closes a soft filter on the layer. " +
    "Darker cuts the high, sharp part of the sound, which makes it feel distant and calm; brighter lets it shine."),
  entry("master", "Master volume", "Beyond the course",
    "This sets the loudness of everything together. " +
    "A limiter sits at the very end, so no combination of settings can clip or distort."),
  entry("mood", "Mood", "Beyond the course",
    "Mood is one slider that nudges several settings at once. " +
    "Calm makes notes sparser, darker and deeper in the reverb; busy makes them more frequent, brighter and closer. " +
    "Your own settings stay underneath, and Mood shifts them all together."),
  entry("seed", "Seed", "Beyond the course",
    "The seed is the starting point for every random choice the piece makes. " +
    "The same seed with the same settings plays the same piece from the start, as long as nobody touches a control. " +
    "Press New seed for a fresh piece, or share a link to let someone hear yours."),
  entry("reverb-kind", "Reverb type", "Beyond the course",
    "Freeverb is a light, classic reverb, the one used in the course. " +
    "Convolver builds its tail from a generated room echo, which sounds smoother but takes a moment to prepare when you change it."),
  entry("delay", "Echo", "Beyond the course",
    "An echo repeats each note after a short wait. " +
    "Delay time sets the wait between repeats, and the mix sets how loud the echoes are."),
  entry("feedback", "Echo feedback", "Beyond the course",
    "Feedback sends each echo back into the echo, so the repeats keep going and fade slowly. " +
    "It is capped below the point where the echoes would grow instead of fade."),
]);
