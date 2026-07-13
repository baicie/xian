import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { DatabaseService } from './database/database.service.js'
import { SessionGuard, requestContext } from './common/http.js'
import { AuthController, AuthService } from './modules/auth.js'
import { WorkspaceController, WorkspaceService } from './modules/workspaces.js'
import { ProjectController, ProjectService } from './modules/projects.js'
import { TaskController, TaskService } from './modules/tasks.js'
import { SystemController } from './modules/system.js'
import { DocumentController, DocumentService } from './modules/documents.js'
import { PlanController, PlanService } from './modules/plans.js'
import { McpController, McpService, McpTokenController, McpTokenService } from './modules/mcp.js'
import { TransferController, TransferService } from './modules/transfer.js'
import { GitHubController, GitHubService } from './modules/github.js'

@Module({
  controllers: [AuthController, WorkspaceController, ProjectController, TaskController, DocumentController, PlanController, McpTokenController, TransferController, GitHubController, McpController, SystemController],
  providers: [DatabaseService, AuthService, WorkspaceService, ProjectService, TaskService, DocumentService, PlanService, McpTokenService, McpService, TransferService, GitHubService, { provide: APP_GUARD, useClass: SessionGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(requestContext, cookieParser()).forRoutes('*') }
}
