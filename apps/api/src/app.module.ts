import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountController } from './account/account';
import { AutoApplyController } from './autoapply/autoapply.controller';
import { AutoApplyService } from './autoapply/autoapply.service';
import { AgentPackages } from './agents/packages';
import { ApplicationsController } from './applications/applications';
import { ResumeDraftsController } from './builder/builder';
import { CodingController } from './coding/coding';
import { ResumeJobs } from './builder/jobs';
import { PdfRenderer } from './builder/pdf';
import { AuthController, AuthService } from './auth/auth';
import { AuditService } from './common/audit.service';
import { PrismaErrorFilter } from './common/errors';
import { AuthGuard } from './common/http';
import { CoursesController, CoursesService } from './courses/courses';
import { DashboardController } from './dashboard/dashboard';
import { KnowledgeService, QuestionsController } from './knowledge/questions';
import { LlmController } from './llm/llm.controller';
import { LlmService } from './llm/llm.service';
import { PracticeController } from './practice/practice';
import { PrismaService } from './prisma.service';
import { ProfileController } from './profile/profile';
import { RoundsController } from './rounds/rounds';
import { SchedulerService } from './scheduler/scheduler.service';
import { TickService } from './scheduler/tick.service';
import { SharesController } from './shares/shares';
import { TaskDefinitions } from './tasks/definitions';
import { QueueService } from './tasks/queue.service';
import { TaskRunner } from './tasks/runner';
import { TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { WorkspaceAccess, WorkspacesController } from './workspaces/workspaces';

/** Services shared by the API and the worker. */
export const CORE_PROVIDERS = [
  PrismaService, AuditService, LlmService, QueueService, TasksService, TaskDefinitions, TaskRunner, AgentPackages,
  CoursesService, KnowledgeService, SchedulerService, TickService, WorkspaceAccess, AutoApplyService, PdfRenderer, ResumeJobs,
];

@Module({ providers: CORE_PROVIDERS, exports: CORE_PROVIDERS })
export class CoreModule {}

@Module({
  imports: [CoreModule, ThrottlerModule.forRoot([{ ttl: 60_000, limit: Number(process.env.THROTTLE_LIMIT || 600) }])],
  controllers: [
    AuthController, WorkspacesController, SharesController, ProfileController, ApplicationsController, RoundsController,
    QuestionsController, CoursesController, PracticeController, LlmController, TasksController, DashboardController, AccountController, AutoApplyController,
    ResumeDraftsController, CodingController,
  ],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: PrismaErrorFilter },
  ],
})
export class AppModule {}
