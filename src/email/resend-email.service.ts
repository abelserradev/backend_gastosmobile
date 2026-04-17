import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/**
 * Resend vive solo en el servidor: la API key no debe exponerse al cliente Angular.
 * Sin RESEND_API_KEY los envíos se omiten (dev) salvo endpoints que exigen configuración.
 */
@Injectable()
export class ResendEmailService {
  private readonly logger = new Logger(ResendEmailService.name);
  private readonly client: Resend | null;

  constructor(private readonly config: ConfigService) {
    const key = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.client = key ? new Resend(key) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  private resolveFromAddress(): string {
    const raw = this.config.get<string>('EMAIL_FROM')?.trim();
    if (raw) {
      return raw;
    }
    return 'Gastos <onboarding@resend.dev>';
  }

  private appOriginForLinks(): string {
    const u = this.config.get<string>('FRONTEND_URL')?.trim();
    if (u) {
      return u.replace(/\/$/, '');
    }
    return 'http://localhost:4300';
  }

  /**
   * Correo de bienvenida tras registro: no bloquea el flujo HTTP si Resend falla.
   */
  async sendWelcomeEmail(to: string, displayName: string): Promise<void> {
    if (!this.client) {
      this.logger.debug('Omitido: RESEND_API_KEY vacío');
      return;
    }
    const safeName = displayName.trim() || 'Usuario';
    const html = `
      <p>Bienvenido a Gastos ${this.escapeHtml(safeName)},</p>
      <p>Lleva el control de tus gastos con facilidad.</p>
      <p>Una app hecha a la medida para ti.</p>
      <p>Si no fuiste tu que se registro, por favor contacta con soporte.</p>
    `;
    const { error } = await this.client.emails.send({
      from: this.resolveFromAddress(),
      to: [to],
      subject: 'Bienvenido a Gastos',
      html,
    });
    if (error) {
      this.logger.warn(`Resend welcome: ${error.message}`);
    }
  }

  /**
   * Correo de notificacion de deudas pagadas y que perfil pago esa deuda
   */
  async sendExpensePaidEmail(input: {
    to: string;
    profileName: string;
    expenseTitle: string;
    amountUsd: number;
    categoryName: string;
    paidByDisplayName: string;
  }): Promise<void> {
    if (!this.client) {
      this.logger.debug('Omitido: RESEND_API_KEY vacío');
      return;
    }
    const origin = this.appOriginForLinks();
    const html = `
    <p>Se marcó un gasto como pagado en <strong>${this.escapeHtml(input.profileName)}</strong>.</p>
    <p><strong>Pagado por:</strong> ${this.escapeHtml(input.paidByDisplayName)}</p>
    <p><strong>Gasto:</strong> ${this.escapeHtml(input.expenseTitle)}</p>
    <p><strong>Categoría:</strong> ${this.escapeHtml(input.categoryName)}</p>
    <p><strong>Monto (USD):</strong> $ ${input.amountUsd.toFixed(2)}</p>
    <p>Ver en la app: ${this.escapeHtml(origin)}</p>
    `;
    const { error } = await this.client.emails.send({
      from: this.resolveFromAddress(),
      to: [input.to],
      subject: 'Gasto marcado como pagado',
      html,
    });
    if (error) {
      this.logger.warn(`Resend paid: ${error.message}`);
    }
  }

  /**
   * Prueba manual desde el front autenticado: exige API key para fallar explícito en QA.
   */
  async sendTestEmailTo(to: string): Promise<void> {
    if (!this.client) {
      throw new BadRequestException(
        'Resend no está configurado: define RESEND_API_KEY en el backend',
      );
    }
    const { data, error } = await this.client.emails.send({
      from: this.resolveFromAddress(),
      to: [to],
      subject: 'Prueba de correo — Gastos',
      html: `<p>Si leés esto, Resend y el dominio verificado responden bien.</p>`,
    });
    if (error) {
      this.logger.warn(`Resend test: ${error.message}`);
      throw new BadGatewayException(
        'Resend rechazó el envío; revisá EMAIL_FROM y el dominio verificado',
      );
    }
    if (!data?.id) {
      throw new BadGatewayException('Resend no devolvió id de envío');
    }
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
