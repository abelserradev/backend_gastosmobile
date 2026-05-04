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

  /** SPA público: mismo origen que CORS y enlaces en otros correos. */
  buildPasswordResetUrl(rawToken: string): string {
    const origin = this.appOriginForLinks();
    const safe = encodeURIComponent(rawToken);
    return `${origin}/reset-password?token=${safe}`;
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
   * Enlace mágico de un solo uso; si Resend falla el caller debe invalidar el token en BD.
   */
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    if (!this.client) {
      throw new BadRequestException(
        'Resend no está configurado: define RESEND_API_KEY',
      );
    }
    const html = `
      <p>Recibimos una solicitud para restablecer tu contraseña en Gastos.</p>
      <p><a href="${this.escapeHtml(resetUrl)}">Elegí una nueva contraseña</a></p>
      <p>Si no fuiste vos, ignorá este mensaje.</p>
      <p style="color:#6b7280;font-size:12px;">El enlace caduca en una hora.</p>
    `;
    const { error } = await this.client.emails.send({
      from: this.resolveFromAddress(),
      to: [to],
      subject: 'Restablecer contraseña — Gastos',
      html,
    });
    if (error) {
      this.logger.warn(`Resend password reset: ${error.message}`);
      throw new BadGatewayException(
        'No se pudo enviar el correo; intentá de nuevo más tarde',
      );
    }
  }

  /**
   * Un solo envío para uno o N gastos (evita quemar cuota de Resend en pagos masivos).
   */
  async sendExpensesPaidSummaryEmail(input: {
    to: string;
    paidByDisplayName: string;
    items: {
      expenseTitle: string;
      categoryName: string;
      amountUsd: number;
      profileName: string;
    }[];
  }): Promise<void> {
    if (!this.client) {
      this.logger.debug('Omitido: RESEND_API_KEY vacío');
      return;
    }
    const origin = this.appOriginForLinks();
    const n = input.items.length;
    const totalUsd = input.items.reduce((s, it) => s + it.amountUsd, 0);
    const subject =
      n === 1
        ? 'Gasto marcado como pagado'
        : `${n} gastos marcados como pagados`;
    const rowsHtml = input.items
      .map(
        (it) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;">${this.escapeHtml(it.expenseTitle)}</td>
        <td style="padding:8px;border:1px solid #ddd;">${this.escapeHtml(it.categoryName)}</td>
        <td style="padding:8px;border:1px solid #ddd;">${this.escapeHtml(it.profileName)}</td>
        <td style="padding:8px;border:1px solid #ddd;text-align:right;">$ ${it.amountUsd.toFixed(2)}</td>
      </tr>`,
      )
      .join('');
    const intro =
      n === 1
        ? '<p>Se marcó <strong>un gasto</strong> como pagado en <strong>las deudas del mes actual</strong>.</p>'
        : `<p>Se marcaron <strong>${n} gastos</strong> como pagados en <strong>las deudas del mes actual</strong>.</p>`;
    const html = `
    ${intro}
    <p><strong>Pagado por:</strong> ${this.escapeHtml(input.paidByDisplayName)}</p>
    <table style="border-collapse:collapse;margin-top:12px;width:100%;max-width:560px;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Deuda</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Categoría</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Perfil</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:right;">USD</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p style="margin-top:12px;"><strong>Total USD:</strong> $ ${totalUsd.toFixed(2)}</p>
    <p>Ver en la app: ${this.escapeHtml(origin)}</p>
    `;
    const { error } = await this.client.emails.send({
      from: this.resolveFromAddress(),
      to: [input.to],
      subject,
      html,
    });
    if (error) {
      this.logger.warn(`Resend paid summary: ${error.message}`);
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
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  }
}
