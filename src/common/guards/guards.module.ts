import { Global, Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

/** Guards compartidos disponibles en todos los módulos (APP_GUARD y @UseGuards). */
@Global()
@Module({
  providers: [ApiKeyGuard],
  exports: [ApiKeyGuard],
})
export class GuardsModule {}
