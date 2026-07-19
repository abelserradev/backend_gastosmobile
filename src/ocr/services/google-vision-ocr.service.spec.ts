import { ConfigService } from '@nestjs/config';
import { GoogleVisionOcrService } from './google-vision-ocr.service';

const validSa = JSON.stringify({
  type: 'service_account',
  project_id: 'gastos-test',
  client_email: 'vision@gastos-test.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
});

describe('GoogleVisionOcrService.isEnabled', () => {
  const build = (env: Record<string, string | undefined>): GoogleVisionOcrService => {
    const config = {
      get: (key: string) => env[key],
    } as ConfigService;
    return new GoogleVisionOcrService(config);
  };

  it('activo con credenciales Firebase y flag por defecto', () => {
    const svc = build({ FIREBASE_SERVICE_ACCOUNT_JSON: validSa });
    expect(svc.isEnabled()).toBe(true);
  });

  it('inactivo si GOOGLE_VISION_ENABLED=false', () => {
    const svc = build({
      GOOGLE_VISION_ENABLED: 'false',
      FIREBASE_SERVICE_ACCOUNT_JSON: validSa,
    });
    expect(svc.isEnabled()).toBe(false);
  });

  it('inactivo sin FIREBASE_SERVICE_ACCOUNT_JSON', () => {
    const svc = build({});
    expect(svc.isEnabled()).toBe(false);
  });

  it('inactivo si el JSON no tiene project_id', () => {
    const svc = build({
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ type: 'service_account' }),
    });
    expect(svc.isEnabled()).toBe(false);
  });
});
