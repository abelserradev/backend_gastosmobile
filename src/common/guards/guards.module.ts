import { Global, Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { ProfileOwnerGuard } from './profile-owner.guard';
import { ProfileAccessGuard } from './profile-access.guard';
import { ProfileOwnershipService } from '../services/profile-ownership.service';
import { ProfileAccessService } from '../services/profile-access.service';

/** Guards compartidos disponibles en todos los módulos (APP_GUARD y @UseGuards). */
@Global()
@Module({
  providers: [
    ApiKeyGuard,
    ProfileOwnerGuard,
    ProfileAccessGuard,
    ProfileOwnershipService,
    ProfileAccessService,
  ],
  exports: [
    ApiKeyGuard,
    ProfileOwnerGuard,
    ProfileAccessGuard,
    ProfileOwnershipService,
    ProfileAccessService,
  ],
})
export class GuardsModule {}
