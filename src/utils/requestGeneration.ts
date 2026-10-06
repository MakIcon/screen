/** Invalidates asynchronous work without requiring cancellation support from the transport. */
export class RequestGeneration {
  private generation = 0;

  capture(): () => boolean {
    const generation = this.generation;
    return () => generation === this.generation;
  }

  begin(): () => boolean {
    this.invalidate();
    return this.capture();
  }

  invalidate(): void {
    this.generation += 1;
  }
}
