// ============================================================================
// Altech POS — local database
//
// The whole shop lives in one JSON file on this PC (`data/altech-pos.json`).
// Every change made in the app is appended to a journal (`data/journal.jsonl`)
// and flushed to disk immediately, so nothing is lost if the PC shuts down.
// The journal is folded back into the main file regularly ("compaction"), and
// one dated copy of the database is kept per day in `data/backups/`.
//
//   tables  — collections of rows keyed by `id` (products, sales, users…)
//   values  — single documents (settings, brand list, category list…)
// ============================================================================

import fs from 'node:fs'
import path from 'node:path'

const SNAPSHOT_FILE = 'altech-pos.json'
const JOURNAL_FILE = 'journal.jsonl'
const BACKUP_DIR = 'backups'
const BACKUPS_KEPT = 30
const COMPACT_EVERY = 300

const NAME = /^[A-Za-z][A-Za-z0-9_]{0,40}$/

const today = () => new Date().toISOString().slice(0, 10)

/** Writes a file atomically: a crash mid-write never leaves a half file. */
const writeAtomic = (file, content) => {
  const tmp = `${file}.tmp`
  const fd = fs.openSync(tmp, 'w')
  try {
    fs.writeSync(fd, content)
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
  fs.renameSync(tmp, file)
}

export class LocalDatabase {
  constructor(dir) {
    this.dir = dir
    this.tables = Object.create(null)
    this.values = Object.create(null)
    this.rev = 0
    this.pendingJournal = 0
  }

  get snapshotPath() {
    return path.join(this.dir, SNAPSHOT_FILE)
  }

  get journalPath() {
    return path.join(this.dir, JOURNAL_FILE)
  }

  open() {
    fs.mkdirSync(path.join(this.dir, BACKUP_DIR), { recursive: true })

    if (fs.existsSync(this.snapshotPath)) {
      const raw = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf8'))
      this.load(raw)
    }

    // Replay what happened since the last compaction.
    if (fs.existsSync(this.journalPath)) {
      const lines = fs.readFileSync(this.journalPath, 'utf8').split('\n')
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          this.applyOps(entry.ops ?? [])
          this.rev = Math.max(this.rev, Number(entry.rev) || 0)
        } catch {
          // A torn last line (power cut while writing) — everything before it is safe.
        }
      }
    }

    this.compact()
    this.dailyBackup()
    return this
  }

  /** Loads a `{ rev, tables: { name: rows[] }, values }` document. */
  load(doc) {
    this.tables = Object.create(null)
    this.values = Object.create(null)
    for (const [name, rows] of Object.entries(doc?.tables ?? {})) {
      if (!NAME.test(name)) continue
      const table = (this.tables[name] = Object.create(null))
      const list = Array.isArray(rows) ? rows : Object.values(rows ?? {})
      for (const row of list) if (row && typeof row.id === 'string') table[row.id] = row
    }
    for (const [key, value] of Object.entries(doc?.values ?? {})) {
      if (NAME.test(key)) this.values[key] = value
    }
    this.rev = Number(doc?.rev) || 0
  }

  toJSON() {
    const tables = {}
    for (const [name, table] of Object.entries(this.tables)) tables[name] = Object.values(table)
    return { app: 'altech-pos', version: 1, rev: this.rev, savedAt: new Date().toISOString(), tables, values: { ...this.values } }
  }

  applyOps(ops) {
    for (const op of ops) {
      if (!op || typeof op !== 'object') continue
      if (op.type === 'set' && NAME.test(op.key)) {
        this.values[op.key] = op.value
        continue
      }
      if (!NAME.test(op.table)) continue
      const table = (this.tables[op.table] ??= Object.create(null))
      if (op.type === 'upsert' && Array.isArray(op.rows)) {
        for (const row of op.rows) if (row && typeof row.id === 'string') table[row.id] = row
      } else if (op.type === 'delete' && Array.isArray(op.ids)) {
        for (const id of op.ids) delete table[id]
      }
    }
  }

  /** Applies a batch of changes and makes it durable before answering. */
  write(ops) {
    if (!Array.isArray(ops) || ops.length === 0) return { rev: this.rev, prevRev: this.rev }
    const prevRev = this.rev
    this.applyOps(ops)
    this.rev += 1

    const fd = fs.openSync(this.journalPath, 'a')
    try {
      fs.writeSync(fd, `${JSON.stringify({ rev: this.rev, at: Date.now(), ops })}\n`)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }

    this.pendingJournal += 1
    if (this.pendingJournal >= COMPACT_EVERY) this.compact()
    return { rev: this.rev, prevRev }
  }

  /** Replaces everything (backup restore). The previous state is kept as a backup first. */
  replace(doc) {
    this.backup(`before-restore-${Date.now()}`)
    const prevRev = this.rev
    this.load(doc)
    this.rev = prevRev + 1
    this.compact()
    return { rev: this.rev, prevRev }
  }

  /** Folds the journal into the main file. */
  compact() {
    writeAtomic(this.snapshotPath, JSON.stringify(this.toJSON()))
    if (fs.existsSync(this.journalPath)) fs.truncateSync(this.journalPath, 0)
    this.pendingJournal = 0
  }

  backup(label) {
    if (!fs.existsSync(this.snapshotPath)) return
    fs.copyFileSync(this.snapshotPath, path.join(this.dir, BACKUP_DIR, `altech-pos-${label}.json`))
  }

  /** One copy per day, the 30 most recent are kept. */
  dailyBackup() {
    const target = path.join(this.dir, BACKUP_DIR, `altech-pos-${today()}.json`)
    if (!fs.existsSync(target)) this.backup(today())
    const files = fs
      .readdirSync(path.join(this.dir, BACKUP_DIR))
      .filter((f) => /^altech-pos-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort()
    for (const old of files.slice(0, Math.max(0, files.length - BACKUPS_KEPT))) {
      fs.rmSync(path.join(this.dir, BACKUP_DIR, old), { force: true })
    }
  }

  close() {
    try {
      this.compact()
    } catch (e) {
      console.error('[db] compaction on close failed', e)
    }
  }
}
