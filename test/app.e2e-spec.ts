import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Seguridad API (e2e)', () => {
  let app: INestApplication<App>;
  const apiKey = process.env.SECRET_API_KEY ?? 'test-api-key-min-16-chars';

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /bcv/oficial-por-dia sin credenciales responde 401', () => {
    return request(app.getHttpServer()).get('/bcv/oficial-por-dia').expect(401);
  });

  it('GET /auth/health con X-API-KEY responde ok', () => {
    return request(app.getHttpServer())
      .get('/auth/health')
      .set('x-api-key', apiKey)
      .expect(200)
      .expect({ ok: true });
  });
});
