declare module 'node:sqlite' {
  interface StatementResultingChanges {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface StatementSync {
    all(...params: unknown[]): Record<string, unknown>[];
    get(...params: unknown[]): Record<string, unknown> | undefined;
    run(...params: unknown[]): StatementResultingChanges;
  }

  class DatabaseSync {
    constructor(location: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
