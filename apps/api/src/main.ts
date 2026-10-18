import './config';
import { ConsoleLogger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import { AppModule } from './app.module';
import { assertConfig, config } from './config';

export async function createApp(logger = true) {
  assertConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: logger ? new ConsoleLogger({ json: process.env.NODE_ENV === 'production', prefix: 'icc-api' }) : false,
    bodyParser: false,
  });
  app.set('trust proxy', 'loopback');
  app.use(json({ limit: '6mb' }));
  app.use(cookieParser());
  app.use((_req: unknown, res: { setHeader(k: string, v: string): void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle(`${config.appName} API`).setVersion('1.0').addCookieAuth('icc_session').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc);
  return app;
}

if (require.main === module) {
  createApp().then((app) => app.listen(config.port)).then(() => console.log(`API listening on :${config.port} (docs: /api/docs)`));
}
