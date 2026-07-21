import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { NestFactory } from '@nestjs/core'
import type { INestApplication } from '@nestjs/common'
import { readFile, readdir } from 'node:fs/promises'
import postgres, { type Sql } from 'postgres'
import request from 'supertest'
import { AppModule } from './app.module.js'
import { ApiErrorFilter } from './common/error.filter.js'

const password = 'secure-password'

describe('registration controls and invitations', () => {
  let app: INestApplication
  let ownerCookie = ''
  let ownerCsrf = ''
  let workspaceId = ''
  const runId = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const schemaName = `auth_invites_${runId.replaceAll('-', '_')}`
  const originalDatabaseUrl = process.env.DATABASE_URL
  let admin: Sql

  beforeAll(async () => {
    if (!originalDatabaseUrl) throw new Error('DATABASE_URL is required')
    admin = postgres(originalDatabaseUrl, { max: 1 })
    await admin`CREATE SCHEMA ${admin(schemaName)}`
    const scopedUrl = new URL(originalDatabaseUrl)
    scopedUrl.searchParams.set('options', `-csearch_path=${schemaName},public`)
    process.env.DATABASE_URL = scopedUrl.toString()
    const migrationClient = postgres(process.env.DATABASE_URL, { max: 1 })
    const migrationDirectory = new URL('./database/migrations/', import.meta.url)
    for (const name of (await readdir(migrationDirectory))
      .filter((item) => item.endsWith('.sql'))
      .sort()) {
      await migrationClient.begin(async (sql) =>
        sql.unsafe(await readFile(new URL(name, migrationDirectory), 'utf8')),
      )
    }
    await migrationClient.end()
    process.env.AUTH_REGISTRATION_MODE = 'admin_only'
    process.env.APP_ORIGIN = 'http://localhost:5173'
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
    app.setGlobalPrefix('api/v1', { exclude: ['mcp'] })
    app.useGlobalFilters(new ApiErrorFilter())
    await app.init()
  })

  afterAll(async () => {
    delete process.env.AUTH_REGISTRATION_MODE
    await app?.close()
    process.env.DATABASE_URL = originalDatabaseUrl
    await admin`DROP SCHEMA ${admin(schemaName)} CASCADE`
    await admin.end()
  })

  it('allows exactly the first account to bootstrap a closed instance', async () => {
    const config = await request(app.getHttpServer()).get('/api/v1/auth/config').expect(200)
    expect(config.body).toMatchObject({ registrationMode: 'admin_only', bootstrapAvailable: true })

    const candidates = [`owner-a-${runId}@example.com`, `owner-b-${runId}@example.com`]
    const registrations = await Promise.all(
      candidates.map((email, index) =>
        request(app.getHttpServer())
          .post('/api/v1/auth/register')
          .send({
            email,
            password,
            name: `Owner ${index + 1}`,
            workspaceName: `Phase 2 ${index + 1}`,
          }),
      ),
    )
    expect(registrations.map((response) => response.status).sort()).toEqual([201, 403])
    expect(registrations.find((response) => response.status === 403)?.body.code).toBe(
      'REGISTRATION_CLOSED',
    )
    const email = candidates[registrations.findIndex((response) => response.status === 201)]!

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201)
    ownerCookie = login.headers['set-cookie'][0].split(';')[0]
    ownerCsrf = login.body.csrfToken
    const workspaces = await request(app.getHttpServer())
      .get('/api/v1/workspaces')
      .set('Cookie', ownerCookie)
      .expect(200)
    workspaceId = workspaces.body[0].id
  })

  it('creates, lists, revokes, and audits an invitation', async () => {
    const email = `invite-${runId}@example.com`
    const created = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .set('x-request-id', `invite-create-${runId}`)
      .send({ email, role: 'MEMBER' })
      .expect(201)
    const token = new URL(created.body.invitation.inviteUrl).pathname.split('/').pop()
    expect(token).toBeTruthy()

    const preview = await request(app.getHttpServer()).get(`/api/v1/invites/${token}`).expect(200)
    expect(preview.body).toMatchObject({ email, usable: true, revoked: false })

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Cookie', ownerCookie)
      .expect(200)
    const invitation = listed.body.find((item: { email: string }) => item.email === email)
    expect(invitation).toBeTruthy()

    await request(app.getHttpServer())
      .delete(`/api/v1/workspaces/${workspaceId}/invitations/${invitation.id}`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .set('x-request-id', `invite-revoke-${runId}`)
      .expect(200)
    const revoked = await request(app.getHttpServer()).get(`/api/v1/invites/${token}`).expect(200)
    expect(revoked.body).toMatchObject({ usable: false, revoked: true })
    const afterRevoke = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Cookie', ownerCookie)
      .expect(200)
    expect(
      afterRevoke.body.find((item: { id: string }) => item.id === invitation.id),
    ).toMatchObject({ status: 'REVOKED' })

    const audit = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/audit-logs`)
      .set('Cookie', ownerCookie)
      .expect(200)
    expect(audit.body.map((item: { action: string }) => item.action)).toEqual(
      expect.arrayContaining(['invitation.created', 'invitation.revoked']),
    )
    expect(
      audit.body.find((item: { action: string }) => item.action === 'invitation.created'),
    ).toMatchObject({
      actorName: expect.any(String),
      actorEmail: expect.stringContaining('@'),
      afterData: { email, role: 'MEMBER' },
    })

    const concurrentEmail = `concurrent-invite-${runId}@example.com`
    await Promise.all(
      [0, 1].map(() =>
        request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/members`)
          .set('Cookie', ownerCookie)
          .set('x-csrf-token', ownerCsrf)
          .send({ email: concurrentEmail, role: 'VIEWER' })
          .expect(201),
      ),
    )
    const concurrentInvites = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/invitations`)
      .set('Cookie', ownerCookie)
      .expect(200)
    expect(
      concurrentInvites.body.filter(
        (item: { email: string; status: string }) =>
          item.email === concurrentEmail && item.status === 'PENDING',
      ),
    ).toHaveLength(1)
  })

  it('lets an existing account accept an invitation exactly once', async () => {
    const email = `existing-${runId}@example.com`
    const created = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Cookie', ownerCookie)
      .set('x-csrf-token', ownerCsrf)
      .send({ email, role: 'MEMBER' })
      .expect(201)
    const token = new URL(created.body.invitation.inviteUrl).pathname.split('/').pop()

    process.env.AUTH_REGISTRATION_MODE = 'open'
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'Existing', workspaceName: 'Existing workspace' })
      .expect(201)
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201)
    const cookie = login.headers['set-cookie'][0].split(';')[0]
    const csrf = login.body.csrfToken
    process.env.AUTH_REGISTRATION_MODE = 'admin_only'

    const attempts = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/auth/accept-invite')
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({ token }),
      request(app.getHttpServer())
        .post('/api/v1/auth/accept-invite')
        .set('Cookie', cookie)
        .set('x-csrf-token', csrf)
        .send({ token }),
    ])
    expect(attempts.map((response) => response.status).sort()).toEqual([201, 400])
    expect(attempts.find((response) => response.status === 400)?.body.code).toBe('INVITE_USED')
  })

  it('provisions an account and consumes its setup link exactly once', async () => {
    const email = `provision-${runId}@example.com`
    const provisions = await Promise.all(
      [0, 1].map((index) =>
        request(app.getHttpServer())
          .post(`/api/v1/workspaces/${workspaceId}/members/provision`)
          .set('Cookie', ownerCookie)
          .set('x-csrf-token', ownerCsrf)
          .set('x-request-id', `provision-${runId}-${index}`)
          .send({ email, name: 'Provisioned', role: 'VIEWER' }),
      ),
    )
    expect(provisions.map((response) => response.status).sort()).toEqual([201, 409])
    expect(provisions.find((response) => response.status === 409)?.body.code).toBe('ALREADY_MEMBER')
    const provisioned = provisions.find((response) => response.status === 201)!
    const token = new URL(provisioned.body.setupUrl).pathname.split('/').pop()
    expect(token).toBeTruthy()

    const loginBeforeSetup = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(401)
    expect(loginBeforeSetup.body.code).toBe('SETUP_REQUIRED')
    const preview = await request(app.getHttpServer())
      .get(`/api/v1/auth/setup/${token}`)
      .expect(200)
    expect(preview.body).toMatchObject({ email, usable: true, used: false })

    const attempts = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/setup').send({ token, password }),
      request(app.getHttpServer()).post('/api/v1/auth/setup').send({ token, password }),
    ])
    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409])
    expect(
      attempts.find((response) => response.status === 201)?.headers['set-cookie'][0],
    ).toContain('session=')

    const used = await request(app.getHttpServer()).get(`/api/v1/auth/setup/${token}`).expect(200)
    expect(used.body).toMatchObject({ usable: false, used: true })
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201)

    const audit = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/audit-logs`)
      .set('Cookie', ownerCookie)
      .expect(200)
    expect(audit.body.map((item: { action: string }) => item.action)).toContain('user.provisioned')
  })
})
