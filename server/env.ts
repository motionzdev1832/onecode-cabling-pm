import type { DB } from './db'
import type { User } from '../shared/types'

export type Bindings = {
  DB: D1Database
}

export type Variables = {
  db: DB
  user: User | null
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }
