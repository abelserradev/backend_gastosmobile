import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseAdminService {
  constructor(private readonly config: ConfigService) {}

  async verifyIdToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    if (!raw?.trim()) {
      throw new ServiceUnavailableException(
        'Firebase Admin no configurado: define FIREBASE_SERVICE_ACCOUNT_JSON en el servidor',
      );
    }
    if (!admin.apps.length) {
      const parsed = JSON.parse(raw) as admin.ServiceAccount;
      admin.initializeApp({
        credential: admin.credential.cert(parsed),
      });
    }
    return admin.auth().verifyIdToken(idToken);
  }
}
