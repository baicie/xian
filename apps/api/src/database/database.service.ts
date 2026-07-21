import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { Sql } from 'postgres'

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly client: Sql
  readonly db: PostgresJsDatabase

  constructor() {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is required')
    this.client = postgres(url, { max: 10 })
    this.db = drizzle(this.client)
  }

  async onModuleDestroy() {
    await this.client.end()
  }
}
