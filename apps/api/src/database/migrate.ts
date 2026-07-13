import postgres from 'postgres'
import { readFile, readdir } from 'node:fs/promises'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is required')
const sql = postgres(url, { max: 1 })
await sql`CREATE TABLE IF NOT EXISTS _migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`
const directory=new URL('./migrations/',import.meta.url)
for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort()){
  const [applied]=await sql`SELECT name FROM _migrations WHERE name=${name}`
  if(!applied) await sql.begin(async transaction=>{await transaction.unsafe(await readFile(new URL(name,directory),'utf8'));await transaction`INSERT INTO _migrations(name) VALUES(${name})`})
}
await sql.end()
console.log('Database migrated')
