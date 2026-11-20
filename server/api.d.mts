import type { IncomingMessage, ServerResponse } from 'node:http'

export interface LocalDatabase {
  rev: number
  close(): void
}

export function createApi(options: { dataDir: string; lanDatabase?: boolean }): {
  handle: (req: IncomingMessage, res: ServerResponse, next?: () => void) => Promise<unknown>
  db: LocalDatabase
}

export function lanAddresses(): string[]
