import { Injectable } from '@nestjs/common';
import type { ChatProfileContextBlock } from './dto/chat-message.dto';
import { ChatKnowledgeService } from './chat-knowledge.service';

@Injectable()
export class ChatFallbackService {
  constructor(private readonly knowledge: ChatKnowledgeService) {}

  /** Respuesta determinista cuando Ollama no está disponible. */
  construirRespuesta(
    mensaje: string,
    contexto?: ChatProfileContextBlock,
  ): string {
    const m = mensaje.toLowerCase();
    const perfil = contexto?.activeProfileName;
    const prefijo = perfil ? `En tu perfil "${perfil}": ` : '';

    if (
      contexto?.activeProfileType !== 'comercio' &&
      (m.includes('inventario') || m.includes('stock'))
    ) {
      return (
        'El inventario solo aplica a perfiles tipo **comercio**. ' +
        'Crea o abre un perfil comercio desde el menú Perfiles y entra a Inventario desde el lateral.'
      );
    }

    if (m.includes('inventario') || m.includes('stock') || m.includes('comercio')) {
      return (
        prefijo +
        'El inventario está disponible en perfiles tipo **comercio**. Ve al menú Inventario, crea productos y registra movimientos (compra, venta o ajuste). ' +
        'El stock no puede quedar negativo. Si tienes varias sucursales, usa transferencias entre ellas.'
      );
    }
    if (m.includes('ingreso') || m.includes('salario') || m.includes('mensual')) {
      return (
        'Para ingresos abre **Ingreso Mensual** en el menú lateral. Ahí registras entradas del mes (salario, ventas, etc.) con monto y descripción. ' +
        'Puedes tener varios ingresos en el mismo mes.'
      );
    }
    if (m.includes('telegram') || m.includes('vincular')) {
      return (
        'En la pantalla de Gastos busca el panel **Telegram**, pulsa "Conectar Telegram" y usa el código con /vincular en el bot. ' +
        'Después podrás registrar gastos e ingresos escribiendo mensajes naturales.'
      );
    }
    if (
      m.includes('factura') ||
      m.includes('ocr') ||
      m.includes('foto') ||
      m.includes('recibo')
    ) {
      return (
        'Al crear un gasto puedes **subir una foto** de factura o ticket. La app usa OCR para sugerir monto y datos; revísalos antes de guardar. ' +
        'Si la lectura falla, completa los campos manualmente.'
      );
    }
    if (m.includes('gasto') || m.includes('pago') || m.includes('categor')) {
      return (
        'En **Gastos** pulsa el botón para añadir: elige tipo, monto, categoría y mes. Marca como pagado cuando corresponda. ' +
        'Puedes filtrar por mes y ver gráficos del resumen.'
      );
    }
    if (m.includes('perfil') || m.includes('familiar') || m.includes('grupal')) {
      return (
        'Los **perfiles** separan contextos: familiar (personal), grupal (compartido) o comercio (con inventario). ' +
        'Cámbialos desde el menú Perfiles. Cada uno tiene su presupuesto y movimientos.'
      );
    }
    const sugerencias = this.knowledge
      .sugerenciasIniciales(contexto)
      .slice(0, 2)
      .join(' · ');
    return (
      `Puedo ayudarte con gastos, ingresos, inventario (comercio), OCR y Telegram en Spend$ave. ` +
      `Prueba preguntar: ${sugerencias}. (El asistente IA está temporalmente en modo básico.)`
    );
  }
}
