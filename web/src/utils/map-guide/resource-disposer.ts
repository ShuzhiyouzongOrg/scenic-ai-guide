export class ResourceDisposer {
  private readonly cleanups = new Set<() => void | Promise<void>>()
  private disposed = false

  add(cleanup: () => void | Promise<void>): () => void {
    if (this.disposed) {
      void cleanup()
      return () => undefined
    }
    this.cleanups.add(cleanup)
    return () => this.cleanups.delete(cleanup)
  }

  async dispose(): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    const pending = [...this.cleanups].reverse().map((cleanup) => Promise.resolve(cleanup()))
    this.cleanups.clear()
    await Promise.allSettled(pending)
  }
}
