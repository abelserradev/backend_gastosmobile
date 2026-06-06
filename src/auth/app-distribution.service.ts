import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

const APP_DISTRIBUTION_BASE =
  'https://firebaseappdistribution.googleapis.com/v1';

/**
 * Agrega correos al grupo gastos-usuarios de Firebase App Distribution cuando
 * un usuario se registra o entra por primera vez con Google.
 *
 * Sin esta configuración el servicio queda inactivo (solo un warn en log);
 * el registro/login sigue funcionando con normalidad.
 *
 * Variables requeridas:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  → misma cuenta de servicio de Firebase Auth
 *   APP_DISTRIBUTION_PROJECT_NUMBER → número del proyecto (ej. 946063305135)
 *   APP_DISTRIBUTION_GROUP_ALIAS   → alias del grupo (ej. gastos-usuarios)
 */
@Injectable()
export class AppDistributionService {
  private readonly logger = new Logger(AppDistributionService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Llama batchJoin en segundo plano — nunca lanza, para no bloquear el registro.
   * Devuelve una promesa void; el caller debe usarla con void para no perder errores silenciosos.
   */
  async addUserToTesterGroup(email: string): Promise<void> {
    const serviceAccountJson = this.config.get<string>(
      'FIREBASE_SERVICE_ACCOUNT_JSON',
    );
    const projectNumber = this.config.get<string>(
      'APP_DISTRIBUTION_PROJECT_NUMBER',
    );
    const groupAlias = this.config.get<string>(
      'APP_DISTRIBUTION_GROUP_ALIAS',
    );

    const missingConfig =
      !serviceAccountJson?.trim() ||
      !projectNumber?.trim() ||
      !groupAlias?.trim();

    if (missingConfig) {
      this.logger.warn(
        '[AppDistribution] Saltando batchJoin: faltan APP_DISTRIBUTION_PROJECT_NUMBER o APP_DISTRIBUTION_GROUP_ALIAS',
      );
      return;
    }

    // En este punto las tres variables están definidas y no vacías
    const saJson = serviceAccountJson ?? '';
    const project = projectNumber ?? '';
    const group = groupAlias ?? '';

    try {
      const accessToken = await this.getServiceAccountToken(saJson);
      await this.callBatchJoin(accessToken, project, group, email);
      this.logger.log(
        `[AppDistribution] ${email} agregado al grupo '${group}'`,
      );
    } catch (err: unknown) {
      // Fallo no crítico: el usuario ya quedó registrado en BD
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      this.logger.warn(
        `[AppDistribution] No se pudo agregar ${email} al grupo: ${msg}`,
      );
    }
  }

  /**
   * Obtiene un access token de Google usando la cuenta de servicio.
   * firebase-admin ya trae este mecanismo internamente; lo usamos directamente
   * en lugar de añadir google-auth-library como dependencia extra.
   */
  private async getServiceAccountToken(
    serviceAccountJson: string,
  ): Promise<string> {
    const parsed = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    const credential = admin.credential.cert(parsed);
    const tokenResponse = await credential.getAccessToken();
    if (!tokenResponse?.access_token) {
      throw new Error('No se pudo obtener el access token de la cuenta de servicio');
    }
    return tokenResponse.access_token;
  }

  private async callBatchJoin(
    accessToken: string,
    projectNumber: string,
    groupAlias: string,
    email: string,
  ): Promise<void> {
    const url = `${APP_DISTRIBUTION_BASE}/projects/${projectNumber}/groups/${groupAlias}:batchJoin`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        emails: [email],
        // Crea el tester si aún no existe en el proyecto de Firebase
        createMissingTesters: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`App Distribution API respondió ${response.status}: ${body}`);
    }
  }
}
