import * as Tone from "tone";

/** Extension for the container the browser's MediaRecorder actually produced. */
export function extensionFor(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp4") || m.includes("aac")) return "m4a";
  if (m.includes("wav")) return "wav";
  return "webm";
}

export class StudioRecorder {
  private recorder: Tone.Recorder;
  private source: Tone.ToneAudioNode;
  private recording = false;

  constructor(source: Tone.ToneAudioNode) {
    this.source = source;
    this.recorder = new Tone.Recorder();
    source.connect(this.recorder);
  }

  get mimeType(): string {
    return this.recorder.mimeType;
  }

  start(): void {
    if (this.recording) return;
    this.recording = true;
    void this.recorder.start();
  }

  async stop(): Promise<Blob> {
    this.recording = false;
    return this.recorder.stop();
  }

  dispose(): void {
    if (this.recording) void this.recorder.stop().catch(() => {});
    this.recording = false;
    try {
      this.source.disconnect(this.recorder);
    } catch {
      /* source already disposed */
    }
    this.recorder.dispose();
  }
}
