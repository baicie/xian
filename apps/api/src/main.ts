import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from 'helmet'
import express from 'express'
import { join } from 'node:path'
import { AppModule } from './app.module.js'
import { ApiErrorFilter } from './common/error.filter.js'
import { spaFallback } from './common/spa.js'

const app = await NestFactory.create(AppModule, { bodyParser: true })
app.setGlobalPrefix('api/v1',{exclude:['mcp']})
app.use(helmet({ contentSecurityPolicy: false }))
app.useGlobalFilters(new ApiErrorFilter())
const origin = process.env.APP_ORIGIN ?? 'http://localhost:5173'
app.enableCors({ origin, credentials: true, allowedHeaders: ['content-type','x-csrf-token','x-request-id'] })
const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('闲序 API').setVersion('1').addCookieAuth('session').build())
SwaggerModule.setup('api/docs', app, document)
if (process.env.NODE_ENV === 'production') {
  const publicDirectory = join(process.cwd(), 'public')
  app.use(express.static(publicDirectory))
  app.use(spaFallback(publicDirectory))
}
app.enableShutdownHooks()
await app.listen(Number(process.env.PORT ?? 8080), '0.0.0.0')
