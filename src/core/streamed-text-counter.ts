const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Count visible text without retaining the streamed output or splitting ANSI sequences. */
export class StreamedTextCounter {
  private state: "text" | "escape" | "csi" | "osc" | "osc-escape" = "text";
  private completed = 0;
  private tail = "";

  write(text: string): void {
    let visible = "";
    for (const char of text) {
      if (this.state === "csi") {
        if (char >= "@" && char <= "~") this.state = "text";
        continue;
      }
      if (this.state === "osc" || this.state === "osc-escape") {
        if (char === "\u0007" || (this.state === "osc-escape" && char === "\\")) {
          this.state = "text";
        } else {
          this.state = char === "\u001b" ? "osc-escape" : "osc";
        }
        continue;
      }
      if (this.state === "escape") {
        if (char === "[") { this.state = "csi"; continue; }
        if (char === "]") { this.state = "osc"; continue; }
        this.state = "text";
        if (char >= "@" && char <= "_") continue;
      }
      if (char === "\u001b") this.state = "escape";
      else visible += char;
    }
    if (!visible) return;
    let previous = "";
    for (const { segment } of segmenter.segment(this.tail + visible)) {
      if (previous) this.completed += 1;
      previous = segment;
    }
    // A following chunk can extend the last grapheme (combining marks or ZWJ).
    this.tail = previous;
  }

  get count(): number {
    return this.completed + (this.tail ? 1 : 0);
  }
}
